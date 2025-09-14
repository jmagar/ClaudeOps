import { 
  ErrorCategory, 
  EnhancedError, 
  RetryConfig, 
  CircuitBreakerConfig 
} from '../types/claude';
import { logger, LogContext } from './logger';
import { ErrorUtils, ErrorSeverity } from '../utils/errorUtils';
import { RetryableExecutor, CircuitBreaker } from '../claude/errorHandler';
import EventEmitter from 'events';

/**
 * Error handling strategy configuration
 */
export interface ErrorHandlingConfig {
  enableAutoRetry: boolean;
  enableCircuitBreaker: boolean;
  enableErrorReporting: boolean;
  enableUserNotifications: boolean;
  retryConfig: RetryConfig;
  circuitBreakerConfig: CircuitBreakerConfig;
  errorThresholds: {
    [key in ErrorSeverity]: {
      maxOccurrencesPerHour: number;
      escalationLevel: 'log' | 'notify' | 'alert' | 'critical';
    };
  };
}

/**
 * Error context for handling operations
 */
export interface ErrorHandlingContext extends LogContext {
  operation: string;
  attemptNumber?: number;
  previousErrors?: Error[];
  userFacing?: boolean;
  suppressNotification?: boolean;
}

/**
 * Error recovery result
 */
export interface ErrorRecoveryResult {
  recovered: boolean;
  strategy: 'retry' | 'circuit-breaker' | 'fallback' | 'manual';
  attempts: number;
  finalError?: Error;
  recoveryTime?: number;
  fallbackUsed?: boolean;
}

/**
 * Error statistics for monitoring
 */
export interface ErrorStatistics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  recoveryRate: number;
  averageRecoveryTime: number;
  topErrors: Array<{
    fingerprint: string;
    count: number;
    message: string;
    category: ErrorCategory;
    lastOccurrence: Date;
  }>;
}

/**
 * Centralized error handler with recovery mechanisms
 */
export class CentralizedErrorHandler extends EventEmitter {
  private static instance: CentralizedErrorHandler;
  private config: ErrorHandlingConfig;
  private retryExecutor: RetryableExecutor;
  private circuitBreaker: CircuitBreaker;
  private errorCache: Map<string, { count: number; lastSeen: Date; errors: Error[] }>;
  private statistics: ErrorStatistics;

  constructor(config?: Partial<ErrorHandlingConfig>) {
    super();
    
    this.config = {
      enableAutoRetry: true,
      enableCircuitBreaker: true,
      enableErrorReporting: true,
      enableUserNotifications: true,
      retryConfig: {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
        retryableErrors: [
          'rate limit',
          'timeout',
          'network',
          'temporary',
          'busy',
          'unavailable',
          'overloaded',
          'ETIMEDOUT',
          'ECONNREFUSED',
          'ENOTFOUND'
        ]
      },
      circuitBreakerConfig: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringWindow: 300000
      },
      errorThresholds: {
        [ErrorSeverity.LOW]: {
          maxOccurrencesPerHour: 100,
          escalationLevel: 'log'
        },
        [ErrorSeverity.MEDIUM]: {
          maxOccurrencesPerHour: 50,
          escalationLevel: 'notify'
        },
        [ErrorSeverity.HIGH]: {
          maxOccurrencesPerHour: 10,
          escalationLevel: 'alert'
        },
        [ErrorSeverity.CRITICAL]: {
          maxOccurrencesPerHour: 5,
          escalationLevel: 'critical'
        }
      },
      ...config
    };

    this.retryExecutor = new RetryableExecutor(this.config.retryConfig);
    this.circuitBreaker = new CircuitBreaker(this.config.circuitBreakerConfig);
    this.errorCache = new Map();
    this.statistics = this.initializeStatistics();

    // Set up periodic cleanup
    setInterval(() => this.cleanupErrorCache(), 60000); // Every minute
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ErrorHandlingConfig>): CentralizedErrorHandler {
    if (!CentralizedErrorHandler.instance) {
      CentralizedErrorHandler.instance = new CentralizedErrorHandler(config);
    }
    return CentralizedErrorHandler.instance;
  }

  /**
   * Handle error with automatic recovery attempts
   */
  async handleError(
    error: Error,
    context: ErrorHandlingContext
  ): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();
    const enhanced = ErrorUtils.enhanceError(error, context);
    
    // Log the error
    this.logError(enhanced, context);
    
    // Update statistics
    this.updateStatistics(enhanced);
    
    // Cache error for deduplication
    this.cacheError(enhanced);
    
    // Check if error should trigger user notification
    if (!context.suppressNotification && this.shouldNotifyUser(enhanced)) {
      this.emitErrorNotification(enhanced, context);
    }
    
    // Determine recovery strategy
    const recoveryStrategy = ErrorUtils.getRecoveryStrategy(enhanced);
    
    try {
      switch (recoveryStrategy.strategy) {
        case 'retry':
          return await this.executeWithRetry(error, context, recoveryStrategy);
          
        case 'user-action':
          return this.requireUserAction(enhanced, context);
          
        case 'system-restart':
          return this.triggerSystemRestart(enhanced, context);
          
        default:
          return this.requireManualIntervention(enhanced, context);
      }
    } catch (finalError) {
      const recoveryTime = Date.now() - startTime;
      
      return {
        recovered: false,
        strategy: recoveryStrategy.strategy as any,
        attempts: context.attemptNumber || 1,
        finalError: finalError as Error,
        recoveryTime
      };
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    originalError: Error,
    context: ErrorHandlingContext,
    strategy: { maxAttempts?: number; backoffMs?: number }
  ): Promise<ErrorRecoveryResult> {
    const startTime = Date.now();
    let attempts = 0;
    
    if (!this.config.enableAutoRetry) {
      return {
        recovered: false,
        strategy: 'retry',
        attempts: 1,
        finalError: originalError
      };
    }

    // If this is already a retry attempt, don't retry again
    if (context.attemptNumber && context.attemptNumber > 1) {
      return {
        recovered: false,
        strategy: 'retry',
        attempts: context.attemptNumber,
        finalError: originalError
      };
    }

    const maxAttempts = strategy.maxAttempts || this.config.retryConfig.maxAttempts;
    
    logger.info('Starting error recovery with retry strategy', {
      ...context,
      maxAttempts,
      originalError: originalError.message
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      
      if (attempt > 1) {
        const delay = this.calculateBackoffDelay(attempt, strategy.backoffMs);
        logger.debug('Waiting before retry attempt', {
          ...context,
          attempt,
          delayMs: delay
        });
        await this.sleep(delay);
      }
      
      // Circuit breaker check
      if (this.config.enableCircuitBreaker && this.circuitBreaker.getState() === 'OPEN') {
        logger.warn('Circuit breaker is open, aborting retry', { ...context, attempt });
        break;
      }
      
      // Emit retry attempt event
      this.emit('retryAttempt', {
        error: originalError,
        context,
        attempt,
        maxAttempts
      });
      
      logger.info('Executing retry attempt', { ...context, attempt, maxAttempts });
      
      // For recovery purposes, we indicate success if we've made it through the retry logic
      // The actual operation retry would be handled by the caller
      if (attempt === maxAttempts) {
        const recoveryTime = Date.now() - startTime;
        
        return {
          recovered: false,
          strategy: 'retry',
          attempts,
          finalError: originalError,
          recoveryTime
        };
      }
    }
    
    const recoveryTime = Date.now() - startTime;
    
    return {
      recovered: false,
      strategy: 'retry',
      attempts,
      finalError: originalError,
      recoveryTime
    };
  }

  /**
   * Handle errors requiring user action
   */
  private requireUserAction(
    error: EnhancedError,
    context: ErrorHandlingContext
  ): ErrorRecoveryResult {
    const userError = ErrorUtils.formatForUser(error);
    
    logger.warn('Error requires user action', {
      ...context,
      category: error.category,
      suggestions: userError.suggestions
    });
    
    // Emit user action required event
    this.emit('userActionRequired', {
      error,
      context,
      userError
    });
    
    return {
      recovered: false,
      strategy: 'manual',
      attempts: 1,
      finalError: error
    };
  }

  /**
   * Handle critical errors requiring system restart
   */
  private triggerSystemRestart(
    error: EnhancedError,
    context: ErrorHandlingContext
  ): ErrorRecoveryResult {
    logger.error('Critical error detected, system restart may be required', error, {
      ...context,
      category: error.category
    });
    
    // Emit critical error event
    this.emit('criticalError', {
      error,
      context,
      requiresRestart: true
    });
    
    return {
      recovered: false,
      strategy: 'manual',
      attempts: 1,
      finalError: error
    };
  }

  /**
   * Handle errors requiring manual intervention
   */
  private requireManualIntervention(
    error: EnhancedError,
    context: ErrorHandlingContext
  ): ErrorRecoveryResult {
    logger.error('Error requires manual intervention', error, {
      ...context,
      category: error.category
    });
    
    // Emit manual intervention required event
    this.emit('manualInterventionRequired', {
      error,
      context
    });
    
    return {
      recovered: false,
      strategy: 'manual',
      attempts: 1,
      finalError: error
    };
  }

  /**
   * Log error with structured information
   */
  private logError(error: EnhancedError, context: ErrorHandlingContext): void {
    const classification = error.classification || ErrorUtils.classifyError(error);
    
    ErrorUtils.logError(error, {
      ...context,
      category: classification.category,
      severity: classification.severity,
      retryable: classification.retryable
    });
  }

  /**
   * Update error statistics
   */
  private updateStatistics(error: EnhancedError): void {
    const classification = error.classification || ErrorUtils.classifyError(error);
    
    this.statistics.totalErrors++;
    this.statistics.errorsByCategory[classification.category] = 
      (this.statistics.errorsByCategory[classification.category] || 0) + 1;
    this.statistics.errorsBySeverity[classification.severity] = 
      (this.statistics.errorsBySeverity[classification.severity] || 0) + 1;
    
    // Update top errors
    const fingerprint = error.fingerprint || ErrorUtils.generateFingerprint(error);
    const existingError = this.statistics.topErrors.find(e => e.fingerprint === fingerprint);
    
    if (existingError) {
      existingError.count++;
      existingError.lastOccurrence = new Date();
    } else {
      this.statistics.topErrors.push({
        fingerprint,
        count: 1,
        message: error.message,
        category: classification.category,
        lastOccurrence: new Date()
      });
    }
    
    // Keep only top 10 errors by count
    this.statistics.topErrors.sort((a, b) => b.count - a.count);
    this.statistics.topErrors = this.statistics.topErrors.slice(0, 10);
  }

  /**
   * Cache error for deduplication and analysis
   */
  private cacheError(error: EnhancedError): void {
    const fingerprint = error.fingerprint || ErrorUtils.generateFingerprint(error);
    const cached = this.errorCache.get(fingerprint);
    
    if (cached) {
      cached.count++;
      cached.lastSeen = new Date();
      cached.errors.push(error);
      
      // Keep only last 10 errors of same type
      if (cached.errors.length > 10) {
        cached.errors = cached.errors.slice(-10);
      }
    } else {
      this.errorCache.set(fingerprint, {
        count: 1,
        lastSeen: new Date(),
        errors: [error]
      });
    }
  }

  /**
   * Check if error should trigger user notification
   */
  private shouldNotifyUser(error: EnhancedError): boolean {
    if (!this.config.enableUserNotifications) {
      return false;
    }
    
    const classification = error.classification || ErrorUtils.classifyError(error);
    const threshold = this.config.errorThresholds[classification.severity];
    
    // Check if we've exceeded the error threshold
    const fingerprint = error.fingerprint || ErrorUtils.generateFingerprint(error);
    const cached = this.errorCache.get(fingerprint);
    
    if (cached) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = cached.errors.filter(e => 
        new Date(e.timestamp || Date.now()) > hourAgo
      ).length;
      
      return recentCount <= threshold.maxOccurrencesPerHour;
    }
    
    return true;
  }

  /**
   * Emit error notification event
   */
  private emitErrorNotification(error: EnhancedError, context: ErrorHandlingContext): void {
    const userError = ErrorUtils.formatForUser(error);
    
    this.emit('errorNotification', {
      error,
      context,
      userError,
      timestamp: new Date()
    });
  }

  /**
   * Calculate backoff delay for retry attempts
   */
  private calculateBackoffDelay(attempt: number, baseDelay?: number): number {
    const base = baseDelay || this.config.retryConfig.initialDelay;
    const multiplier = this.config.retryConfig.backoffMultiplier;
    const maxDelay = this.config.retryConfig.maxDelay;
    
    const delay = base * Math.pow(multiplier, attempt - 1);
    return Math.min(delay, maxDelay);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup old error cache entries
   */
  private cleanupErrorCache(): void {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [fingerprint, cached] of this.errorCache.entries()) {
      if (cached.lastSeen < hourAgo) {
        this.errorCache.delete(fingerprint);
      }
    }
  }

  /**
   * Initialize statistics structure
   */
  private initializeStatistics(): ErrorStatistics {
    return {
      totalErrors: 0,
      errorsByCategory: {} as Record<ErrorCategory, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recoveryRate: 0,
      averageRecoveryTime: 0,
      topErrors: []
    };
  }

  /**
   * Get current error statistics
   */
  getStatistics(): ErrorStatistics {
    return { ...this.statistics };
  }

  /**
   * Get cached error information
   */
  getCachedErrors(): Array<{
    fingerprint: string;
    count: number;
    lastSeen: Date;
    sample: Error;
  }> {
    return Array.from(this.errorCache.entries()).map(([fingerprint, cached]) => ({
      fingerprint,
      count: cached.count,
      lastSeen: cached.lastSeen,
      sample: cached.errors[cached.errors.length - 1]
    }));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ErrorHandlingConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update retry executor if retry config changed
    if (config.retryConfig) {
      this.retryExecutor = new RetryableExecutor(this.config.retryConfig);
    }
    
    // Update circuit breaker if config changed
    if (config.circuitBreakerConfig) {
      this.circuitBreaker = new CircuitBreaker(this.config.circuitBreakerConfig);
    }
    
    logger.info('Error handler configuration updated', { config });
  }

  /**
   * Reset error statistics
   */
  resetStatistics(): void {
    this.statistics = this.initializeStatistics();
    this.errorCache.clear();
    
    logger.info('Error statistics reset');
  }

  /**
   * Check system health based on error patterns
   */
  checkSystemHealth(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check error rate
    const recentErrors = this.statistics.totalErrors;
    if (recentErrors > 100) {
      issues.push(`High error rate: ${recentErrors} errors recently`);
      recommendations.push('Review error logs and identify root causes');
    }
    
    // Check for critical errors
    const criticalErrors = this.statistics.errorsBySeverity[ErrorSeverity.CRITICAL] || 0;
    if (criticalErrors > 0) {
      issues.push(`${criticalErrors} critical errors detected`);
      recommendations.push('Address critical errors immediately');
    }
    
    // Check circuit breaker state
    if (this.circuitBreaker.getState() === 'OPEN') {
      issues.push('Circuit breaker is open due to repeated failures');
      recommendations.push('Wait for circuit breaker reset or investigate underlying issues');
    }
    
    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalErrors > 0 || this.circuitBreaker.getState() === 'OPEN') {
      status = 'critical';
    } else if (issues.length > 0) {
      status = 'warning';
    }
    
    return { status, issues, recommendations };
  }
}

// Default error handler instance
export const errorHandler = CentralizedErrorHandler.getInstance();