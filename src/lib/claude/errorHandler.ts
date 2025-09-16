import { 
  ErrorCategory, 
  EnhancedError, 
  ExecutionError, 
  CircuitBreakerConfig, 
  CircuitBreakerState,
  RetryConfig 
} from '../types/claude';
import { dbConnection } from '../db/connection';
import { executionSteps } from '../db/schema';
import { sql } from 'drizzle-orm';

/**
 * Circuit Breaker implementation for fault tolerance
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.config.resetTimeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successCount++;

    if (this.state === 'HALF_OPEN' && this.successCount >= 3) {
      this.state = 'CLOSED';
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getMetrics() {
    return {
      state: this.state,
      failures: this.failures,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Retry executor with exponential backoff
 */
export class RetryableExecutor {
  constructor(private config: RetryConfig) {}

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error = new Error('No attempts made');
    let delay = this.config.initialDelay;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!this.isRetryableError(error as Error)) {
          throw error;
        }

        // Don't wait after the last attempt
        if (attempt === this.config.maxAttempts) {
          break;
        }

        console.warn(
          `${context} failed (attempt ${attempt}/${this.config.maxAttempts}): ${(error as Error).message}. Retrying in ${delay}ms`
        );

        await this.sleep(delay);
        delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelay);
      }
    }

    throw new Error(
      `${context} failed after ${this.config.maxAttempts} attempts. Last error: ${lastError.message}`
    );
  }

  private isRetryableError(error: Error): boolean {
    return this.config.retryableErrors.some(retryableError =>
      error.message.toLowerCase().includes(retryableError.toLowerCase()) ||
      error.name.toLowerCase().includes(retryableError.toLowerCase())
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Comprehensive error handling and categorization
 */
export class ErrorHandler {
  /**
   * Categorize and enhance errors with context
   */
  static categorizeError(error: Error): EnhancedError {
    const message = error.message.toLowerCase();

    if (message.includes('rate limit') || message.includes('429')) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        category: ErrorCategory.NETWORK,
        retryable: true,
        resolution: 'Wait and retry with exponential backoff'
      };
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        category: ErrorCategory.AUTHENTICATION,
        retryable: false,
        resolution: 'Check Claude API key configuration'
      };
    }

    if (message.includes('permission') || message.includes('403')) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        category: ErrorCategory.PERMISSION,
        retryable: false,
        resolution: 'Verify file permissions and tool access'
      };
    }

    if (message.includes('timeout') || message.includes('etimedout')) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        category: ErrorCategory.TIMEOUT,
        retryable: true,
        resolution: 'Increase timeout or optimize operation'
      };
    }

    if (message.includes('budget') || message.includes('cost limit')) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        category: ErrorCategory.BUDGET,
        retryable: false,
        resolution: 'Increase budget limit or optimize agent efficiency'
      };
    }

    if (message.includes('validation') || message.includes('invalid')) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        category: ErrorCategory.VALIDATION,
        retryable: false,
        resolution: 'Check input parameters and configuration'
      };
    }

    if (message.includes('command not found') || message.includes('cli')) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        category: ErrorCategory.CLI,
        retryable: false,
        resolution: 'Verify required tools and system setup'
      };
    }

    if (message.includes('config') || message.includes('configuration')) {
      return {
        ...error,
        name: error.name,
        message: error.message,
        category: ErrorCategory.CONFIGURATION,
        retryable: false,
        resolution: 'Review and correct configuration settings'
      };
    }

    // Default categorization
    return {
      ...error,
      name: error.name,
      message: error.message,
      category: ErrorCategory.AGENT_EXECUTION,
      retryable: false,
      resolution: 'Check agent configuration and prompt validity'
    };
  }

  /**
   * Handle and log errors with structured data
   */
  static async handleError(
    error: Error,
    context: { executionId: string; agentType: string; step?: string }
  ): Promise<EnhancedError> {
    const enhancedError = this.categorizeError(error);

    // Log structured error
    const errorLog = {
      executionId: context.executionId,
      agentType: context.agentType,
      step: context.step,
      category: enhancedError.category,
      message: enhancedError.message,
      retryable: enhancedError.retryable,
      resolution: enhancedError.resolution,
      stack: enhancedError.stack,
      timestamp: new Date().toISOString()
    };

    console.error('Agent execution error:', errorLog);

    // Store error in database
    try {
      await this.persistError(errorLog);
    } catch (dbError) {
      console.error('Failed to persist error to database:', dbError);
    }

    return enhancedError;
  }

  /**
   * Persist error details to database
   */
  private static async persistError(errorLog: {
    executionId: string;
    agentType: string;
    step?: string;
    category: ErrorCategory;
    message: string;
    retryable: boolean;
    resolution?: string;
    stack?: string;
    timestamp: string;
  }): Promise<void> {
    try {
      const db = dbConnection.getDb();

      await db
        .insert(executionSteps)
        .values({
          executionId: errorLog.executionId,
          stepNumber: -1, // Use -1 to indicate error step
          stepName: 'error',
          stepType: 'error',
          status: 'failed',
          startedAt: errorLog.timestamp,
          completedAt: errorLog.timestamp,
          output: JSON.stringify({
            category: errorLog.category,
            message: errorLog.message,
            retryable: errorLog.retryable,
            resolution: errorLog.resolution,
            stack: errorLog.stack
          }),
          metadata: JSON.stringify({
            agentType: errorLog.agentType,
            step: errorLog.step
          })
        })
        .run();
    } catch (error) {
      console.error('Database error persistence failed:', error);
      throw error;
    }
  }

  /**
   * Get error statistics for monitoring
   */
  static async getErrorStatistics(days: number = 7): Promise<{
    total: number;
    byCategory: Record<ErrorCategory, number>;
    byAgentType: Record<string, number>;
    retryableCount: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  }> {
    try {
      const db = dbConnection.getDb();
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const errorSteps = await db
        .select()
        .from(executionSteps)
        .where(
          sql`step_type = 'error' AND started_at >= ${sinceDate.toISOString()}`
        )
        .all();

      const total = errorSteps.length;
      const byCategory: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;
      const byAgentType: Record<string, number> = {};
      let retryableCount = 0;

      errorSteps.forEach((step: any) => {
        try {
          const output = JSON.parse(step.output || '{}');
          const metadata = JSON.parse(step.metadata || '{}');

          const category = output.category as ErrorCategory;
          const agentType = metadata.agentType as string;

          if (category) {
            byCategory[category] = (byCategory[category] || 0) + 1;
          }

          if (agentType) {
            byAgentType[agentType] = (byAgentType[agentType] || 0) + 1;
          }

          if (output.retryable) {
            retryableCount++;
          }
        } catch (parseError) {
          console.warn('Failed to parse error step data:', parseError);
        }
      });

      // Simple trend analysis (compare first half vs second half)
      const midpoint = Math.floor(errorSteps.length / 2);
      const firstHalf = errorSteps.slice(0, midpoint).length;
      const secondHalf = errorSteps.slice(midpoint).length;
      
      let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (secondHalf > firstHalf * 1.2) {
        trend = 'increasing';
      } else if (secondHalf < firstHalf * 0.8) {
        trend = 'decreasing';
      }

      return {
        total,
        byCategory,
        byAgentType,
        retryableCount,
        trend
      };
    } catch (error) {
      console.error('Failed to get error statistics:', error);
      return {
        total: 0,
        byCategory: {} as Record<ErrorCategory, number>,
        byAgentType: {},
        retryableCount: 0,
        trend: 'stable'
      };
    }
  }

  /**
   * Create default retry configuration
   */
  static createDefaultRetryConfig(): RetryConfig {
    return {
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
        'overloaded'
      ]
    };
  }

  /**
   * Create default circuit breaker configuration
   */
  static createDefaultCircuitBreakerConfig(): CircuitBreakerConfig {
    return {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringWindow: 300000 // 5 minutes
    };
  }

  /**
   * Check if error should trigger circuit breaker
   */
  static shouldTriggerCircuitBreaker(error: EnhancedError): boolean {
    return error.category === ErrorCategory.NETWORK ||
           error.category === ErrorCategory.TIMEOUT ||
           error.category === ErrorCategory.AUTHENTICATION;
  }

  /**
   * Get recovery suggestions based on error category
   */
  static getRecoverySuggestions(error: EnhancedError): string[] {
    const suggestions: string[] = [];

    switch (error.category) {
      case ErrorCategory.NETWORK:
        suggestions.push(
          'Check internet connectivity',
          'Verify API endpoint accessibility',
          'Consider using retry with exponential backoff'
        );
        break;

      case ErrorCategory.AUTHENTICATION:
        suggestions.push(
          'Verify Claude API key is correctly configured',
          'Check API key permissions and quotas',
          'Regenerate API key if necessary'
        );
        break;

      case ErrorCategory.PERMISSION:
        suggestions.push(
          'Check file and directory permissions',
          'Verify user has necessary access rights',
          'Review security policies and restrictions'
        );
        break;

      case ErrorCategory.TIMEOUT:
        suggestions.push(
          'Increase operation timeout',
          'Optimize complex operations',
          'Consider breaking task into smaller parts'
        );
        break;

      case ErrorCategory.BUDGET:
        suggestions.push(
          'Increase monthly budget limit',
          'Optimize agent prompts to reduce costs',
          'Consider scheduling execution for off-peak hours'
        );
        break;

      case ErrorCategory.CONFIGURATION:
        suggestions.push(
          'Review configuration files',
          'Validate environment variables',
          'Check system dependencies'
        );
        break;

      default:
        suggestions.push(
          'Review error details and stack trace',
          'Check agent configuration',
          'Validate input parameters'
        );
        break;
    }

    if (error.resolution) {
      suggestions.unshift(error.resolution);
    }

    return suggestions;
  }
}