import type {
  AgentError,
  ErrorContext,
  ErrorRecovery,
  LogCallback,
  BaseAgentOptions
} from './types';

/**
 * Sophisticated error handling with retry logic and recovery strategies
 */
export class ErrorHandler {
  private retryAttempts: Map<string, number> = new Map();
  private backoffDelays: Map<string, number> = new Map();
  private log: LogCallback;

  constructor(log?: LogCallback) {
    this.log = log || (() => {});
  }

  /**
   * Handle errors with appropriate recovery strategies
   */
  async handleError(
    error: AgentError,
    context: ErrorContext,
    options: Partial<BaseAgentOptions> = {}
  ): Promise<ErrorRecovery> {
    const errorKey = this.getErrorKey(error, context);
    const attempts = this.retryAttempts.get(errorKey) || 0;
    
    this.log(`🔧 Handling error: ${error.type}/${error.subtype} (attempt ${attempts + 1})`, 'debug');

    // Update attempt counter
    this.retryAttempts.set(errorKey, attempts + 1);

    // Route to specific error handler
    switch (error.type) {
      case 'sdk_error':
        return this.handleSDKError(error, context, attempts, options);
      
      case 'timeout':
        return this.handleTimeoutError(error, context, attempts, options);
      
      case 'permission_denied':
        return this.handlePermissionError(error, context, attempts, options);
      
      case 'cost_limit':
        return this.handleCostLimitError(error, context, attempts, options);
      
      case 'custom':
        return this.handleCustomError(error, context, attempts, options);
      
      default:
        return this.handleUnknownError(error, context, attempts, options);
    }
  }

  /**
   * Handle SDK-specific errors with detailed recovery strategies
   */
  private async handleSDKError(
    error: AgentError,
    context: ErrorContext,
    attempts: number,
    options: Partial<BaseAgentOptions>
  ): Promise<ErrorRecovery> {
    const maxRetries = this.getMaxRetries(error.subtype || 'default');
    
    switch (error.subtype) {
      case 'error_max_turns':
        if (attempts < 2) {
          const newMaxTurns = (options.maxTurns || 50) + (attempts + 1) * 25;
          this.log(`🔄 Increasing max turns to ${newMaxTurns} and retrying`, 'info');
          
          return {
            action: 'retry',
            retryDelay: 1000,
            newMaxTurns,
            message: `Increased turn limit to ${newMaxTurns} due to complexity`
          };
        }
        
        this.log('⚠️ Max turns limit reached multiple times, continuing with partial results', 'warn');
        return {
          action: 'continue',
          message: 'Investigation may be incomplete due to complexity'
        };

      case 'error_rate_limit':
        if (attempts < maxRetries) {
          const delay = this.calculateBackoffDelay('rate_limit', attempts);
          this.log(`⏳ Rate limited, waiting ${delay}ms before retry ${attempts + 1}/${maxRetries}`, 'warn');
          
          return {
            action: 'retry',
            retryDelay: delay,
            message: `Rate limited, retrying in ${delay}ms`
          };
        }
        
        this.log('❌ Rate limit retries exhausted', 'error');
        return {
          action: 'abort',
          message: 'Unable to proceed due to persistent rate limiting'
        };

      case 'error_permission_denied':
        if (attempts < 2) {
          this.log('🔒 Permission denied, trying with reduced scope', 'warn');
          
          return {
            action: 'reduce_scope',
            message: 'Continuing with limited tool access'
          };
        }
        
        return {
          action: 'abort',
          message: 'Insufficient permissions to complete investigation'
        };

      case 'error_prompt_limit':
        if (attempts < 2) {
          this.log('📏 Prompt too large, reducing scope and retrying', 'warn');
          
          return {
            action: 'reduce_scope',
            modifiedPrompt: this.reducePromptScope(context),
            message: 'Reduced investigation scope due to prompt size limits'
          };
        }
        
        return {
          action: 'abort',
          message: 'Unable to fit investigation within prompt limits'
        };

      case 'error_context_limit':
        this.log('📋 Context limit reached, investigation may be incomplete', 'warn');
        return {
          action: 'continue',
          message: 'Context limit reached, some details may be missing'
        };

      default:
        return this.handleGenericSDKError(error, context, attempts, maxRetries);
    }
  }

  /**
   * Handle timeout errors with progressive strategy adjustment
   */
  private async handleTimeoutError(
    error: AgentError,
    context: ErrorContext,
    attempts: number,
    options: Partial<BaseAgentOptions>
  ): Promise<ErrorRecovery> {
    if (attempts < 2) {
      const newTimeout = (options.timeout_ms || 300000) * 1.5; // Increase by 50%
      this.log(`⏰ Timeout occurred, extending to ${newTimeout}ms and retrying`, 'warn');
      
      return {
        action: 'retry',
        retryDelay: 2000,
        message: `Extended timeout to ${newTimeout}ms due to complexity`
      };
    }
    
    this.log('⏰ Multiple timeouts, proceeding with partial results', 'warn');
    return {
      action: 'continue',
      message: 'Investigation incomplete due to timeout constraints'
    };
  }

  /**
   * Handle permission errors with fallback strategies
   */
  private async handlePermissionError(
    error: AgentError,
    context: ErrorContext,
    attempts: number,
    options: Partial<BaseAgentOptions>
  ): Promise<ErrorRecovery> {
    if (attempts === 0) {
      this.log('🔐 Permission error, trying alternative approach', 'warn');
      
      return {
        action: 'reduce_scope',
        message: 'Using alternative methods due to permission restrictions'
      };
    }
    
    return {
      action: 'abort',
      message: 'Unable to proceed due to permission restrictions'
    };
  }

  /**
   * Handle cost limit errors
   */
  private async handleCostLimitError(
    error: AgentError,
    context: ErrorContext,
    attempts: number,
    options: Partial<BaseAgentOptions>
  ): Promise<ErrorRecovery> {
    this.log(`💰 Cost limit of $${options.costLimit} reached`, 'warn');
    
    return {
      action: 'abort',
      message: `Investigation stopped due to cost limit ($${options.costLimit})`
    };
  }

  /**
   * Handle custom application errors
   */
  private async handleCustomError(
    error: AgentError,
    context: ErrorContext,
    attempts: number,
    options: Partial<BaseAgentOptions>
  ): Promise<ErrorRecovery> {
    const maxRetries = 2;
    
    if (attempts < maxRetries) {
      const delay = this.calculateBackoffDelay('custom', attempts);
      this.log(`🔄 Custom error, retrying in ${delay}ms (${attempts + 1}/${maxRetries})`, 'warn');
      
      return {
        action: 'retry',
        retryDelay: delay,
        message: `Retrying after custom error: ${error.message}`
      };
    }
    
    return {
      action: 'abort',
      message: `Custom error persists: ${error.message}`
    };
  }

  /**
   * Handle unknown error types
   */
  private async handleUnknownError(
    error: AgentError,
    context: ErrorContext,
    attempts: number,
    options: Partial<BaseAgentOptions>
  ): Promise<ErrorRecovery> {
    if (attempts === 0) {
      this.log(`❓ Unknown error type: ${error.type}, attempting recovery`, 'warn');
      
      return {
        action: 'retry',
        retryDelay: 3000,
        message: `Attempting recovery from unknown error: ${error.message}`
      };
    }
    
    return {
      action: 'abort',
      message: `Unknown error persists: ${error.message}`
    };
  }

  /**
   * Handle generic SDK errors not covered by specific cases
   */
  private handleGenericSDKError(
    error: AgentError,
    context: ErrorContext,
    attempts: number,
    maxRetries: number
  ): ErrorRecovery {
    if (attempts < maxRetries) {
      const delay = this.calculateBackoffDelay('sdk_generic', attempts);
      this.log(`🔄 Generic SDK error, retrying in ${delay}ms (${attempts + 1}/${maxRetries})`, 'warn');
      
      return {
        action: 'retry',
        retryDelay: delay,
        message: `SDK error recovery attempt ${attempts + 1}`
      };
    }
    
    return {
      action: 'abort',
      message: `SDK error persists: ${error.subtype || 'unknown'}`
    };
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(errorType: string, attempt: number): number {
    const baseDelay = this.getBaseDelay(errorType);
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const maxDelay = this.getMaxDelay(errorType);
    
    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    const delayWithJitter = exponentialDelay + jitter;
    
    // Cap at maximum delay
    return Math.min(delayWithJitter, maxDelay);
  }

  /**
   * Get base delay for different error types
   */
  private getBaseDelay(errorType: string): number {
    const delays: Record<string, number> = {
      'rate_limit': 5000,     // 5 seconds base for rate limits
      'custom': 2000,         // 2 seconds for custom errors
      'sdk_generic': 3000,    // 3 seconds for generic SDK errors
      'network': 1000,        // 1 second for network errors
      'default': 2000         // 2 seconds default
    };
    
    return delays[errorType] || delays.default;
  }

  /**
   * Get maximum delay for different error types
   */
  private getMaxDelay(errorType: string): number {
    const maxDelays: Record<string, number> = {
      'rate_limit': 60000,    // 1 minute max for rate limits
      'custom': 30000,        // 30 seconds for custom errors
      'sdk_generic': 45000,   // 45 seconds for generic SDK errors
      'network': 20000,       // 20 seconds for network errors
      'default': 30000        // 30 seconds default
    };
    
    return maxDelays[errorType] || maxDelays.default;
  }

  /**
   * Get maximum retry attempts for different error types
   */
  private getMaxRetries(errorType: string): number {
    const maxRetries: Record<string, number> = {
      'error_rate_limit': 5,     // Retry rate limits more aggressively
      'error_max_turns': 2,      // Limited retries for max turns
      'error_permission_denied': 1, // Single retry for permissions
      'error_prompt_limit': 2,   // Few retries for prompt limits
      'network': 3,              // Moderate retries for network
      'custom': 2,               // Conservative for custom errors
      'default': 2               // Conservative default
    };
    
    return maxRetries[errorType] || maxRetries.default;
  }

  /**
   * Create a unique key for tracking error attempts
   */
  private getErrorKey(error: AgentError, context: ErrorContext): string {
    return `${error.type}:${error.subtype || 'none'}:${context.agentType}:${context.executionId}`;
  }

  /**
   * Reduce prompt scope for prompt limit errors
   */
  private reducePromptScope(context: ErrorContext): string {
    // This would be implemented based on the specific prompt structure
    // For now, return a simplified version indicator
    return `REDUCED_SCOPE_${context.executionId}`;
  }

  /**
   * Check if an error is recoverable
   */
  isRecoverable(error: AgentError): boolean {
    const nonRecoverableTypes = ['cost_limit'];
    const nonRecoverableSubtypes = ['error_context_limit'];
    
    if (nonRecoverableTypes.includes(error.type)) {
      return false;
    }
    
    if (error.subtype && nonRecoverableSubtypes.includes(error.subtype)) {
      return false;
    }
    
    return true;
  }

  /**
   * Get error statistics
   */
  getErrorStats(): ErrorStats {
    const stats: ErrorStats = {
      totalErrors: this.retryAttempts.size,
      errorsByType: {},
      averageRetries: 0,
      mostCommonError: null
    };
    
    let totalRetries = 0;
    const errorCounts: Record<string, number> = {};
    
    for (const [errorKey, attempts] of this.retryAttempts) {
      const [type, subtype] = errorKey.split(':');
      const errorType = subtype !== 'none' ? `${type}:${subtype}` : type;
      
      errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
      totalRetries += attempts;
      
      if (!stats.errorsByType[type]) {
        stats.errorsByType[type] = 0;
      }
      stats.errorsByType[type]++;
    }
    
    if (stats.totalErrors > 0) {
      stats.averageRetries = totalRetries / stats.totalErrors;
      
      // Find most common error
      let maxCount = 0;
      for (const [errorType, count] of Object.entries(errorCounts)) {
        if (count > maxCount) {
          maxCount = count;
          stats.mostCommonError = errorType;
        }
      }
    }
    
    return stats;
  }

  /**
   * Reset error tracking
   */
  reset(): void {
    this.retryAttempts.clear();
    this.backoffDelays.clear();
    this.log('🔄 Error handler reset', 'debug');
  }
}

// Error statistics interface
interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<string, number>;
  averageRetries: number;
  mostCommonError: string | null;
}