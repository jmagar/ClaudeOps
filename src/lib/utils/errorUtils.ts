import { ErrorCategory, EnhancedError } from '../types/claude';
import { logger } from '../logging/logger';

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error classification interface
 */
export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  requiresUserAction: boolean;
  autoRecoverable: boolean;
  resolution: string;
  tags: string[];
}

/**
 * System error categories with detailed classification
 */
export const ERROR_CLASSIFICATIONS: Record<string, ErrorClassification> = {
  // Network errors
  'ENOTFOUND': {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.HIGH,
    retryable: true,
    requiresUserAction: false,
    autoRecoverable: true,
    resolution: 'Check internet connectivity and DNS settings',
    tags: ['network', 'dns', 'connectivity']
  },
  'ECONNREFUSED': {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.HIGH,
    retryable: true,
    requiresUserAction: false,
    autoRecoverable: true,
    resolution: 'Service unavailable, will retry automatically',
    tags: ['network', 'connection', 'service-down']
  },
  'ETIMEDOUT': {
    category: ErrorCategory.TIMEOUT,
    severity: ErrorSeverity.MEDIUM,
    retryable: true,
    requiresUserAction: false,
    autoRecoverable: true,
    resolution: 'Operation timed out, retrying with exponential backoff',
    tags: ['timeout', 'network', 'performance']
  },

  // Authentication errors
  'UNAUTHORIZED': {
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.CRITICAL,
    retryable: false,
    requiresUserAction: true,
    autoRecoverable: false,
    resolution: 'Check Claude API key configuration and permissions',
    tags: ['auth', 'api-key', 'permissions']
  },
  'FORBIDDEN': {
    category: ErrorCategory.PERMISSION,
    severity: ErrorSeverity.HIGH,
    retryable: false,
    requiresUserAction: true,
    autoRecoverable: false,
    resolution: 'Insufficient permissions for requested operation',
    tags: ['permissions', 'access-denied', 'security']
  },

  // Rate limiting
  'RATE_LIMIT_EXCEEDED': {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    retryable: true,
    requiresUserAction: false,
    autoRecoverable: true,
    resolution: 'Rate limit exceeded, implementing exponential backoff',
    tags: ['rate-limit', 'throttling', 'api-limits']
  },

  // Budget and cost errors
  'BUDGET_EXCEEDED': {
    category: ErrorCategory.BUDGET,
    severity: ErrorSeverity.HIGH,
    retryable: false,
    requiresUserAction: true,
    autoRecoverable: false,
    resolution: 'Monthly budget limit reached, increase budget or optimize usage',
    tags: ['budget', 'cost-limit', 'finance']
  },

  // Validation errors
  'INVALID_INPUT': {
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    retryable: false,
    requiresUserAction: true,
    autoRecoverable: false,
    resolution: 'Invalid input parameters provided',
    tags: ['validation', 'input-error', 'parameters']
  },

  // System errors
  'EACCES': {
    category: ErrorCategory.PERMISSION,
    severity: ErrorSeverity.HIGH,
    retryable: false,
    requiresUserAction: true,
    autoRecoverable: false,
    resolution: 'File or directory permission denied',
    tags: ['permissions', 'filesystem', 'access']
  },
  'ENOENT': {
    category: ErrorCategory.CONFIGURATION,
    severity: ErrorSeverity.HIGH,
    retryable: false,
    requiresUserAction: true,
    autoRecoverable: false,
    resolution: 'Required file or directory not found',
    tags: ['filesystem', 'missing-file', 'configuration']
  },
  'EMFILE': {
    category: ErrorCategory.AGENT_EXECUTION,
    severity: ErrorSeverity.CRITICAL,
    retryable: true,
    requiresUserAction: false,
    autoRecoverable: true,
    resolution: 'Too many open files, cleaning up resources',
    tags: ['system-resources', 'file-handles', 'performance']
  },

  // Database errors
  'SQLITE_BUSY': {
    category: ErrorCategory.AGENT_EXECUTION,
    severity: ErrorSeverity.MEDIUM,
    retryable: true,
    requiresUserAction: false,
    autoRecoverable: true,
    resolution: 'Database locked, retrying operation',
    tags: ['database', 'sqlite', 'concurrency']
  },
  'SQLITE_CORRUPT': {
    category: ErrorCategory.AGENT_EXECUTION,
    severity: ErrorSeverity.CRITICAL,
    retryable: false,
    requiresUserAction: true,
    autoRecoverable: false,
    resolution: 'Database corruption detected, backup and recovery required',
    tags: ['database', 'corruption', 'data-integrity']
  }
};

/**
 * Pattern-based error classification rules
 */
export const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  classification: ErrorClassification;
}> = [
  {
    pattern: /rate.?limit/i,
    classification: ERROR_CLASSIFICATIONS['RATE_LIMIT_EXCEEDED']
  },
  {
    pattern: /timeout|timed.?out/i,
    classification: ERROR_CLASSIFICATIONS['ETIMEDOUT']
  },
  {
    pattern: /unauthorized|401/i,
    classification: ERROR_CLASSIFICATIONS['UNAUTHORIZED']
  },
  {
    pattern: /forbidden|403/i,
    classification: ERROR_CLASSIFICATIONS['FORBIDDEN']
  },
  {
    pattern: /budget|cost.?limit|quota.?exceeded/i,
    classification: ERROR_CLASSIFICATIONS['BUDGET_EXCEEDED']
  },
  {
    pattern: /validation|invalid|bad.?request|400/i,
    classification: ERROR_CLASSIFICATIONS['INVALID_INPUT']
  },
  {
    pattern: /connection.?refused|econnrefused/i,
    classification: ERROR_CLASSIFICATIONS['ECONNREFUSED']
  },
  {
    pattern: /not.?found|enotfound|404/i,
    classification: ERROR_CLASSIFICATIONS['ENOTFOUND']
  },
  {
    pattern: /permission.?denied|eacces/i,
    classification: ERROR_CLASSIFICATIONS['EACCES']
  },
  {
    pattern: /file.?not.?found|enoent/i,
    classification: ERROR_CLASSIFICATIONS['ENOENT']
  },
  {
    pattern: /too.?many.?open.?files|emfile/i,
    classification: ERROR_CLASSIFICATIONS['EMFILE']
  },
  {
    pattern: /database.?locked|sqlite.?busy/i,
    classification: ERROR_CLASSIFICATIONS['SQLITE_BUSY']
  },
  {
    pattern: /database.?corrupt|sqlite.?corrupt/i,
    classification: ERROR_CLASSIFICATIONS['SQLITE_CORRUPT']
  }
];

/**
 * Error fingerprinting for deduplication
 */
export interface ErrorFingerprint {
  hash: string;
  pattern: string;
  category: ErrorCategory;
  frequency: number;
  firstSeen: Date;
  lastSeen: Date;
}

/**
 * Error utility functions
 */
export class ErrorUtils {
  /**
   * Classify error based on message, code, and stack trace
   */
  static classifyError(error: Error): ErrorClassification {
    // Check for specific error codes first
    const errorCode = (error as any).code;
    if (errorCode && ERROR_CLASSIFICATIONS[errorCode]) {
      return ERROR_CLASSIFICATIONS[errorCode];
    }

    // Check message patterns
    const message = error.message.toLowerCase();
    for (const { pattern, classification } of ERROR_PATTERNS) {
      if (pattern.test(message)) {
        return classification;
      }
    }

    // Default classification
    return {
      category: ErrorCategory.AGENT_EXECUTION,
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      requiresUserAction: true,
      autoRecoverable: false,
      resolution: 'Check error details and system configuration',
      tags: ['unknown', 'general-error']
    };
  }

  /**
   * Create enhanced error with classification
   */
  static enhanceError(error: Error, context?: Record<string, any>): EnhancedError {
    const classification = this.classifyError(error);
    
    return {
      ...error,
      name: error.name,
      message: error.message,
      stack: error.stack,
      category: classification.category,
      retryable: classification.retryable,
      resolution: classification.resolution,
      context,
      classification,
      timestamp: new Date().toISOString(),
      fingerprint: this.generateFingerprint(error)
    };
  }

  /**
   * Generate error fingerprint for deduplication
   */
  static generateFingerprint(error: Error): string {
    const pattern = this.extractErrorPattern(error);
    const category = this.classifyError(error).category;
    const hash = this.simpleHash(pattern + category);
    return hash;
  }

  /**
   * Extract error pattern for fingerprinting
   */
  private static extractErrorPattern(error: Error): string {
    let pattern = error.message;
    
    // Remove dynamic values (numbers, paths, timestamps)
    pattern = pattern.replace(/\d+/g, '<NUM>');
    pattern = pattern.replace(/\/[^\s]+/g, '<PATH>');
    pattern = pattern.replace(/\b[A-Fa-f0-9]{8,}\b/g, '<HASH>');
    pattern = pattern.replace(/\d{4}-\d{2}-\d{2}/g, '<DATE>');
    pattern = pattern.replace(/\d{2}:\d{2}:\d{2}/g, '<TIME>');
    
    return pattern.toLowerCase().trim();
  }

  /**
   * Simple hash function for fingerprinting
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return '0';
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Check if error is recoverable through retry
   */
  static isRecoverable(error: Error | EnhancedError): boolean {
    const classification = this.classifyError(error);
    return classification.retryable && classification.autoRecoverable;
  }

  /**
   * Get recovery strategy for error
   */
  static getRecoveryStrategy(error: Error | EnhancedError): {
    strategy: 'retry' | 'user-action' | 'system-restart' | 'manual-intervention';
    maxAttempts?: number;
    backoffMs?: number;
    description: string;
  } {
    const classification = this.classifyError(error);
    
    if (classification.autoRecoverable && classification.retryable) {
      return {
        strategy: 'retry',
        maxAttempts: this.getMaxRetryAttempts(classification.severity),
        backoffMs: this.getBackoffDelay(classification.severity),
        description: classification.resolution
      };
    }
    
    if (classification.requiresUserAction) {
      return {
        strategy: 'user-action',
        description: classification.resolution
      };
    }
    
    if (classification.severity === ErrorSeverity.CRITICAL) {
      return {
        strategy: 'system-restart',
        description: 'Critical system error requires restart or manual intervention'
      };
    }
    
    return {
      strategy: 'manual-intervention',
      description: classification.resolution
    };
  }

  /**
   * Get max retry attempts based on severity
   */
  private static getMaxRetryAttempts(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.LOW: return 5;
      case ErrorSeverity.MEDIUM: return 3;
      case ErrorSeverity.HIGH: return 2;
      case ErrorSeverity.CRITICAL: return 1;
      default: return 3;
    }
  }

  /**
   * Get backoff delay based on severity
   */
  private static getBackoffDelay(severity: ErrorSeverity): number {
    switch (severity) {
      case ErrorSeverity.LOW: return 1000; // 1 second
      case ErrorSeverity.MEDIUM: return 2000; // 2 seconds
      case ErrorSeverity.HIGH: return 5000; // 5 seconds
      case ErrorSeverity.CRITICAL: return 10000; // 10 seconds
      default: return 2000;
    }
  }

  /**
   * Format error for user display
   */
  static formatForUser(error: Error | EnhancedError): {
    title: string;
    message: string;
    severity: ErrorSeverity;
    actionRequired: boolean;
    suggestions: string[];
  } {
    const classification = this.classifyError(error);
    const enhanced = error as EnhancedError;
    
    return {
      title: this.getCategoryDisplayName(classification.category),
      message: error.message,
      severity: classification.severity,
      actionRequired: classification.requiresUserAction,
      suggestions: this.getActionableSuggestions(classification, enhanced)
    };
  }

  /**
   * Get user-friendly category names
   */
  private static getCategoryDisplayName(category: ErrorCategory): string {
    const displayNames: Record<ErrorCategory, string> = {
      [ErrorCategory.NETWORK]: 'Network Error',
      [ErrorCategory.AUTHENTICATION]: 'Authentication Error',
      [ErrorCategory.PERMISSION]: 'Permission Error',
      [ErrorCategory.TIMEOUT]: 'Timeout Error',
      [ErrorCategory.VALIDATION]: 'Validation Error',
      [ErrorCategory.CLI]: 'Command Error',
      [ErrorCategory.CONFIGURATION]: 'Configuration Error',
      [ErrorCategory.BUDGET]: 'Budget Limit Error',
      [ErrorCategory.AGENT_EXECUTION]: 'Execution Error'
    };
    
    return displayNames[category] || 'System Error';
  }

  /**
   * Get actionable suggestions for error resolution
   */
  private static getActionableSuggestions(
    classification: ErrorClassification,
    error?: EnhancedError
  ): string[] {
    const suggestions = [classification.resolution];
    
    // Add category-specific suggestions
    switch (classification.category) {
      case ErrorCategory.NETWORK:
        suggestions.push(
          'Check your internet connection',
          'Verify firewall settings',
          'Try again in a few moments'
        );
        break;
        
      case ErrorCategory.AUTHENTICATION:
        suggestions.push(
          'Verify your Claude API key in settings',
          'Check API key permissions and quotas',
          'Regenerate API key if necessary'
        );
        break;
        
      case ErrorCategory.BUDGET:
        suggestions.push(
          'Review current month spending in cost dashboard',
          'Increase budget limit in settings',
          'Optimize agent efficiency to reduce costs'
        );
        break;
        
      case ErrorCategory.CONFIGURATION:
        suggestions.push(
          'Check application configuration files',
          'Verify environment variables',
          'Review system dependencies'
        );
        break;
    }
    
    // Add retry suggestion if retryable
    if (classification.retryable && classification.autoRecoverable) {
      suggestions.push('This error will be automatically retried');
    }
    
    return suggestions;
  }

  /**
   * Log error with structured information
   */
  static logError(
    error: Error | EnhancedError,
    context?: {
      executionId?: string;
      agentType?: string;
      operation?: string;
      step?: string;
      component?: string;
    }
  ): void {
    const enhanced = error as EnhancedError;
    const classification = enhanced.classification || this.classifyError(error);
    
    logger.error('Error occurred', error, {
      ...context,
      category: classification.category,
      severity: classification.severity,
      retryable: classification.retryable,
      resolution: classification.resolution,
      fingerprint: enhanced.fingerprint || this.generateFingerprint(error),
      tags: classification.tags
    });
  }

  /**
   * Check if errors are similar (same fingerprint)
   */
  static areSimilar(error1: Error, error2: Error): boolean {
    const fp1 = this.generateFingerprint(error1);
    const fp2 = this.generateFingerprint(error2);
    return fp1 === fp2;
  }

  /**
   * Create sanitized error for API responses (no sensitive data)
   */
  static sanitizeForAPI(error: Error | EnhancedError): {
    message: string;
    category: ErrorCategory;
    retryable: boolean;
    resolution?: string;
    timestamp: string;
  } {
    const classification = this.classifyError(error);
    
    return {
      message: error.message,
      category: classification.category,
      retryable: classification.retryable,
      resolution: classification.resolution,
      timestamp: new Date().toISOString()
    };
  }
}