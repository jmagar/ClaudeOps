import { query } from '@anthropic-ai/claude-code';
import { createId } from '@paralleldrive/cuid2';
import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  Options,
  PermissionMode,
  HookCallback
} from '@anthropic-ai/claude-code';

import {
  BaseAgentOptions,
  BaseAgentResult,
  IBaseAgent,
  AgentConfig,
  AgentError,
  ErrorContext,
  ErrorRecovery,
  ProgressUpdate,
  StreamUpdate,
  SessionState,
  LogCallback,
  ProgressCallback,
  ClaudeActionType,
  StructuredLogEntry,
  ActionContext
} from './types';

/**
 * Abstract base class for all Claude Code SDK agents
 * Provides common functionality: streaming, hooks, error handling, session management, etc.
 */
export abstract class BaseAgent<TOptions extends BaseAgentOptions = BaseAgentOptions> 
  implements IBaseAgent<TOptions> {
  
  // Enhanced logging tracking
  private actionHistory: ActionContext[] = [];
  private currentAction: ActionContext | null = null;
  private structuredLogs: StructuredLogEntry[] = [];
  private pendingToolActions: Map<string, string> = new Map(); // tool_call_id -> actionId
  
  // Abstract methods that each agent must implement
  abstract buildPrompt(options: TOptions): string;
  abstract getSystemPrompt(): string;
  abstract getAgentType(): string;
  abstract getAllowedTools(): string[];
  abstract getConfig(): AgentConfig;

  // Default permission mode - agents can override
  getPermissionMode(): PermissionMode {
    return 'acceptEdits';
  }

  /**
   * Main execution method with all SDK functionality
   */
  async execute(options: TOptions = {} as TOptions): Promise<BaseAgentResult> {
    // Merge with factory default options if they exist
    const factoryDefaults = (this as any)._factoryDefaultOptions || {};
    const mergedOptions = {
      ...factoryDefaults,
      ...options
    } as TOptions;
    const executionId = createId();
    const startTime = Date.now();
    const logs: string[] = [];
    
    // Set up enhanced logging with backward compatibility defaults
    const enhancedOptions = {
      loggingLevel: 'detailed' as const,
      enableActionClassification: true,
      enablePerformanceTiming: true,
      enableStructuredLogs: true,
      ...mergedOptions
    };
    
    const { log, logStructured, startAction, endAction } = this.createEnhancedLogger(logs, enhancedOptions, executionId);
    
    // Initialize execution with action tracking
    const initActionId = startAction('initialization');
    
    // Set up abort controller for timeout
    const abortController = mergedOptions.abortController || new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;
    
    if (mergedOptions.timeout_ms) {
      timeoutId = setTimeout(() => {
        log('⏰ Execution timeout reached, aborting...', 'warn');
        abortController.abort();
      }, mergedOptions.timeout_ms);
    }

    try {
      log(`🔍 Starting ${this.getAgentType()} agent...`);
      log(`📋 Execution ID: ${executionId}`);

      // Progress tracking
      const progress: ProgressUpdate = {
        stage: 'starting',
        message: 'Initializing agent execution',
        currentTurn: 0,
        maxTurns: mergedOptions.maxTurns || 50,
        toolsUsed: [],
        cost: 0
      };
      
      this.reportProgress(progress, mergedOptions.onProgress);

      // Build prompt
      const prompt = this.buildPrompt(mergedOptions);
      log('📝 Built investigation prompt');

      // Initialize result tracking
      let result = '';
      let totalCost = 0;
      let totalUsage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0
      };

      progress.stage = 'investigating';
      progress.message = 'Launching Claude investigation';
      this.reportProgress(progress, mergedOptions.onProgress);

      // Configure Claude query with proper SDK options
      const sdkOptions: Options = {
        maxTurns: mergedOptions.maxTurns || 50,
        permissionMode: mergedOptions.permissionMode || this.getPermissionMode(),
        allowedTools: this.getAllowedTools(),
        customSystemPrompt: this.getSystemPrompt(),
        includePartialMessages: mergedOptions.includePartialMessages || true,
        abortController,
        ...(mergedOptions.hooks?.preToolUse && {
          hooks: {
            PreToolUse: [{
              hooks: mergedOptions.hooks.preToolUse
            }]
          }
        }),
        ...(mergedOptions.hooks?.postToolUse && {
          hooks: {
            PostToolUse: [{
              hooks: mergedOptions.hooks.postToolUse
            }]
          }
        })
      };

      const claudeQuery = query({
        prompt,
        options: sdkOptions
      });

      // Process messages with full streaming support
      for await (const message of claudeQuery) {
        // Check if aborted
        if (abortController.signal.aborted) {
          throw new Error('Execution was aborted due to timeout or cancellation');
        }

        await this.processMessage(message, {
          log,
          logStructured,
          startAction,
          endAction,
          progress,
          onProgress: mergedOptions.onProgress,
          totalCost,
          totalUsage,
          result,
          executionId
        });

        if (message.type === 'result') {
          if (message.subtype === 'success') {
            totalCost = message.total_cost_usd;
            totalUsage = {
              input_tokens: message.usage.input_tokens || 0,
              output_tokens: message.usage.output_tokens || 0,
              cache_creation_tokens: message.usage.cache_creation_input_tokens || 0,
              cache_read_tokens: message.usage.cache_read_input_tokens || 0
            };
            
            progress.stage = 'completing';
            progress.message = 'Claude investigation completed successfully';
            progress.cost = totalCost;
            this.reportProgress(progress, mergedOptions.onProgress);
            
            log('\n✅ Investigation completed successfully');
          } else {
            // Handle specific error types with enhanced context
            const errorActionId = startAction('error_handling');
            
            const error = await this.handleSDKError(message.subtype, {
              executionId,
              agentType: this.getAgentType(),
              currentTurn: progress.currentTurn || 0,
              totalCost,
              timeElapsed: Date.now() - startTime,
              lastTool: progress.toolsUsed?.slice(-1)[0],
              // Enhanced error context
              actionHistory: this.actionHistory,
              currentContext: {
                message: progress.message,
                stage: progress.stage,
                toolsUsed: progress.toolsUsed,
                cost: totalCost
              },
              recoverySuggestions: this.generateRecoverySuggestions(message.subtype),
              relatedActions: this.actionHistory.slice(-5).map(a => a.actionId)
            }, mergedOptions);
            
            endAction(errorActionId, null, `SDK Error: ${message.subtype}`);
            
            logStructured({
              actionType: 'error_handling',
              level: 'error',
              message: `SDK Error handled: ${message.subtype}`,
              error: error.message,
              context: {
                subtype: message.subtype,
                recovery: error.action,
                actionHistory: this.actionHistory.length
              }
            });

            if (error.action === 'abort') {
              throw new Error(`Investigation failed: ${message.subtype} - ${error.message}`);
            }
            // Other recovery actions could be implemented here
          }
          break;
        }
      }

      // Clear timeout if execution completed normally
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Complete initialization and mark completion
      endAction(initActionId);
      const completionActionId = startAction('completion');

      const duration = Date.now() - startTime;
      log(`\n⏱️ Analysis completed in ${(duration / 1000).toFixed(1)}s`);
      log(`💰 Total cost: $${totalCost.toFixed(4)}`);
      
      endAction(completionActionId, `Execution completed successfully - Duration: ${duration}ms, Cost: $${totalCost.toFixed(4)}`);

      // Calculate performance metrics
      const performanceMetrics = this.calculatePerformanceMetrics();
      
      // Call completion hook if provided
      const finalResult: BaseAgentResult = {
        executionId,
        agentType: this.getAgentType(),
        status: 'completed',
        result,
        cost: totalCost,
        duration,
        usage: totalUsage,
        logs,
        timestamp: new Date().toISOString(),
        summary: `${this.getAgentType()} investigation completed - Cost: $${totalCost.toFixed(4)}`,
        sessionId: mergedOptions.sessionId,
        // Enhanced logging data
        structuredLogs: enhancedOptions.enableStructuredLogs ? this.structuredLogs : undefined,
        actionHistory: enhancedOptions.enableActionClassification ? this.actionHistory : undefined,
        performanceMetrics: enhancedOptions.enablePerformanceTiming ? performanceMetrics : undefined
      };

      if (mergedOptions.hooks?.onComplete) {
        await mergedOptions.hooks.onComplete(finalResult);
      }

      return finalResult;

    } catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Log error with enhanced context
      const errorActionId = startAction('error_handling');
      log(`❌ ERROR: ${errorMessage}`, 'error');
      
      logStructured({
        actionType: 'error_handling',
        level: 'error',
        message: `Execution failed: ${errorMessage}`,
        error: errorMessage,
        context: {
          duration,
          actionHistory: this.actionHistory.length,
          isTimeout: abortController.signal.aborted,
          errorStack: error instanceof Error ? error.stack : undefined
        }
      });
      
      endAction(errorActionId, null, errorMessage);

      // Handle error through hook if provided
      if (mergedOptions.hooks?.onError) {
        const agentError: AgentError = {
          type: abortController.signal.aborted ? 'timeout' : 'custom',
          message: errorMessage,
          originalError: error instanceof Error ? error : undefined
        };

        const errorContext: ErrorContext = {
          executionId,
          agentType: this.getAgentType(),
          currentTurn: 0,
          totalCost: 0,
          timeElapsed: duration,
          // Enhanced error context
          actionHistory: this.actionHistory,
          currentContext: {
            errorMessage,
            aborted: abortController.signal.aborted,
            duration
          },
          recoverySuggestions: this.generateRecoverySuggestions('execution_error'),
          errorStack: error instanceof Error ? error.stack : undefined,
          relatedActions: this.actionHistory.slice(-3).map(a => a.actionId)
        };

        const recovery = await mergedOptions.hooks.onError(agentError, errorContext);
        if (recovery.action === 'retry') {
          log(`🔄 Retrying execution after ${recovery.retryDelay || 0}ms...`);
          if (recovery.retryDelay) {
            await new Promise(resolve => setTimeout(resolve, recovery.retryDelay));
          }
          // Could implement retry logic here
        }
      }
      
      return {
        executionId,
        agentType: this.getAgentType(),
        status: abortController.signal.aborted ? 'timeout' : 'failed',
        result: JSON.stringify({ error: errorMessage, logs }, null, 2),
        cost: 0,
        duration,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_tokens: 0,
          cache_read_tokens: 0
        },
        logs,
        timestamp: new Date().toISOString(),
        error: errorMessage,
        sessionId: mergedOptions.sessionId
      };
    }
  }

  /**
   * Process individual messages from Claude with enhanced logging and action tracking
   */
  private async processMessage(
    message: SDKMessage,
    context: {
      log: LogCallback;
      logStructured: (entry: Partial<StructuredLogEntry>) => void;
      startAction: (actionType: ClaudeActionType, toolName?: string, toolInput?: Record<string, any>) => string;
      endAction: (actionId: string, result?: any, error?: string) => void;
      progress: ProgressUpdate;
      onProgress?: ProgressCallback;
      totalCost: number;
      totalUsage: any;
      result: string;
      executionId: string;
    }
  ): Promise<void> {
    const { log, logStructured, startAction, endAction, progress, onProgress } = context;

    if (message.type === 'assistant') {
      const assistantMessage = message as SDKAssistantMessage;
      const content = assistantMessage.message.content;
      
      // Handle both array and string content types
      if (Array.isArray(content)) {
        content.forEach(block => {
          if (block.type === 'tool_use') {
            // Start tool use action with timing and classification
            const actionId = startAction('tool_use', block.name, block.input as Record<string, any>);
            
            log(`🔧 ${block.name}: ${JSON.stringify(block.input)}`);
            progress.toolsUsed = progress.toolsUsed || [];
            if (!progress.toolsUsed.includes(block.name)) {
              progress.toolsUsed.push(block.name);
            }
            progress.currentTurn = (progress.currentTurn || 0) + 1;
            progress.message = `Executing ${block.name}`;
            this.reportProgress(progress, onProgress);
            
            // Track tool action for result correlation
            if ('id' in block && typeof block.id === 'string') {
              this.pendingToolActions.set(block.id, actionId);
            }
          } else if (block.type === 'text' && block.text.trim()) {
            // Start reasoning action
            const actionId = startAction('reasoning');
            
            log(`\n💭 ${block.text}`);
            
            // Update progress with Claude's thinking (keep short preview for progress)
            const progressPreview = block.text.length > 50 ? block.text.substring(0, 50) + '...' : block.text;
            progress.message = `Claude analyzing: ${progressPreview}`;
            this.reportProgress(progress, onProgress);
            
            // End reasoning action immediately (synchronous)
            endAction(actionId, block.text);
          }
        });
        
        // Extract final result text
        const textBlock = content.find(block => block.type === 'text');
        if (textBlock && 'text' in textBlock) {
          context.result = textBlock.text;
        }
      } else if (typeof content === 'string' && content) {
        // Start response generation action
        const actionId = startAction('response_generation');
        
        const stringContent = content as string;
        context.result = stringContent;
        log(`\n💭 ${stringContent}`);
        const progressPreview = stringContent.length > 50 ? stringContent.substring(0, 50) + '...' : stringContent;
        progress.message = `Claude response: ${progressPreview}`;
        this.reportProgress(progress, onProgress);
        
        // End response generation action
        endAction(actionId, stringContent);
      }

    } else if (message.type === 'user') {
      const userMessage = message as SDKUserMessage;
      const content = userMessage.message.content;
      
      if (Array.isArray(content)) {
        content.forEach(block => {
          if (block.type === 'tool_result') {
            const contentStr = typeof block.content === 'string' 
              ? block.content 
              : JSON.stringify(block.content);
            log(`✓ ${contentStr || 'No output'}`);
            
            // Find the corresponding tool action using tool_call_id
            let actionId: string | undefined;
            if ('tool_call_id' in block && typeof block.tool_call_id === 'string') {
              actionId = this.pendingToolActions.get(block.tool_call_id);
              if (actionId) {
                this.pendingToolActions.delete(block.tool_call_id);
              }
            }
            
            // Fallback: find the most recent uncompleted tool action
            if (!actionId) {
              const recentToolAction = this.actionHistory
                .filter(a => a.actionType === 'tool_use')
                .slice(-1)[0];
              actionId = recentToolAction?.actionId;
            }
            
            if (actionId) {
              const isError = block.is_error || false;
              endAction(actionId, contentStr, isError ? contentStr : undefined);
            }
          }
        });
      }
    }
  }

  /**
   * Handle specific SDK error types with recovery strategies
   */
  private async handleSDKError(
    errorSubtype: string,
    context: ErrorContext,
    mergedOptions: TOptions
  ): Promise<ErrorRecovery> {
    const log = this.createLogger([], mergedOptions.onLog);
    
    switch (errorSubtype) {
      case 'error_max_turns':
        log('⚠️ Maximum turns reached, investigation may be incomplete', 'warn');
        return {
          action: 'increase_turns',
          newMaxTurns: (mergedOptions.maxTurns || 50) + 20,
          message: 'Increased turn limit and retrying'
        };

      case 'error_during_execution':
        log('⚠️ Error during execution, investigating cause', 'warn');
        return {
          action: 'continue',
          message: 'Continuing with partial results after execution error'
        };

      default:
        log(`❌ Unhandled SDK error: ${errorSubtype}`, 'error');
        return {
          action: 'abort',
          message: `Unhandled error: ${errorSubtype}`
        };
    }
  }

  /**
   * Create a logger function with consistent formatting (legacy fallback)
   */
  private createLogger(logs: string[], onLog?: LogCallback): LogCallback {
    return (message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info') => {
      const logMessage = `[${new Date().toISOString()}] ${message}`;
      logs.push(logMessage);
      
      if (onLog) {
        onLog(logMessage, level);
      }
    };
  }

  /**
   * Report progress updates
   */
  private reportProgress(progress: ProgressUpdate, onProgress?: ProgressCallback): void {
    if (onProgress) {
      onProgress({ ...progress });
    }
  }

  /**
   * Create enhanced logger with action classification and structured logging
   */
  private createEnhancedLogger(
    logs: string[], 
    options: TOptions, 
    executionId: string
  ): {
    log: LogCallback;
    logStructured: (entry: Partial<StructuredLogEntry>) => void;
    startAction: (actionType: ClaudeActionType, toolName?: string, toolInput?: Record<string, any>) => string;
    endAction: (actionId: string, result?: any, error?: string) => void;
  } {
    const loggingLevel = options.loggingLevel || 'detailed';
    const enableStructured = options.enableStructuredLogs !== false;
    const enableTiming = options.enablePerformanceTiming !== false;
    const enableClassification = options.enableActionClassification !== false;

    const logStructured = (entry: Partial<StructuredLogEntry>) => {
      if (!enableStructured) return;
      
      const structuredEntry: StructuredLogEntry = {
        timestamp: new Date().toISOString(),
        level: entry.level || 'info',
        executionId,
        agentType: this.getAgentType(),
        message: entry.message || '',
        ...entry
      };
      
      this.structuredLogs.push(structuredEntry);
      
      if (loggingLevel === 'debug') {
        const formattedEntry = this.formatStructuredLog(structuredEntry);
        logs.push(formattedEntry);
        if (options.onLog) {
          options.onLog(formattedEntry, entry.level);
        }
      }
    };

    const startAction = (
      actionType: ClaudeActionType, 
      toolName?: string, 
      toolInput?: Record<string, any>
    ): string => {
      if (!enableClassification) return createId();
      
      const actionId = createId();
      const startTime = Date.now();
      
      const actionContext: ActionContext = {
        actionId,
        actionType,
        startTime,
        toolName,
        toolInput,
        parentActionId: this.currentAction?.actionId
      };
      
      this.actionHistory.push(actionContext);
      this.currentAction = actionContext;
      
      logStructured({
        actionType,
        actionId,
        toolName,
        toolInput,
        message: `Started ${actionType}${toolName ? ` (${toolName})` : ''}`,
        level: 'info'
      });
      
      return actionId;
    };

    const endAction = (actionId: string, result?: any, error?: string) => {
      if (!enableClassification) return;
      
      const action = this.actionHistory.find(a => a.actionId === actionId);
      if (!action) return;
      
      const endTime = Date.now();
      const duration = endTime - action.startTime;
      
      logStructured({
        actionType: action.actionType,
        actionId,
        toolName: action.toolName,
        message: `Completed ${action.actionType}${action.toolName ? ` (${action.toolName})` : ''}`,
        duration,
        toolOutput: typeof result === 'string' ? result : JSON.stringify(result),
        error,
        level: error ? 'error' : 'info',
        performance: enableTiming ? {
          startTime: action.startTime,
          endTime,
          duration
        } : undefined
      });
      
      // Reset current action if this was the current one
      if (this.currentAction?.actionId === actionId) {
        this.currentAction = null;
      }
    };

    const log: LogCallback = (message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info') => {
      // Apply logging level filtering
      if (loggingLevel === 'basic' && level === 'debug') return;
      if (loggingLevel === 'basic' && !['error', 'warn'].includes(level)) {
        // In basic mode, only show errors, warnings, and key messages
        const isKeyMessage = message.includes('✅') || message.includes('❌') || 
                            message.includes('🔍') || message.includes('⏱️') ||
                            message.includes('💰');
        if (!isKeyMessage) return;
      }
      
      const logMessage = `[${new Date().toISOString()}] ${message}`;
      logs.push(logMessage);
      
      // Log as structured entry if enabled
      logStructured({
        message,
        level,
        actionType: this.currentAction?.actionType,
        actionId: this.currentAction?.actionId
      });
      
      if (options.onLog) {
        options.onLog(logMessage, level);
      }
    };

    return { log, logStructured, startAction, endAction };
  }

  /**
   * Format structured log entry for human reading
   */
  private formatStructuredLog(entry: StructuredLogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.actionType ? `[${entry.actionType}]` : '',
      entry.actionId ? `[${entry.actionId.slice(-8)}]` : '',
      entry.toolName ? `[${entry.toolName}]` : '',
      entry.message
    ].filter(Boolean);
    
    let formatted = parts.join(' ');
    
    if (entry.duration) {
      formatted += ` (${entry.duration}ms)`;
    }
    
    if (entry.error) {
      formatted += ` ERROR: ${entry.error}`;
    }
    
    return formatted;
  }

  /**
   * Generate recovery suggestions based on error type
   */
  private generateRecoverySuggestions(errorType: string): string[] {
    const suggestions: string[] = [];
    
    switch (errorType) {
      case 'error_max_turns':
        suggestions.push('Increase maxTurns limit in agent options');
        suggestions.push('Review prompt complexity and reduce scope');
        suggestions.push('Check if agent is stuck in a loop');
        break;
      case 'error_during_execution':
        suggestions.push('Check tool permissions and availability');
        suggestions.push('Verify system resources and connectivity');
        suggestions.push('Review recent tool outputs for errors');
        break;
      case 'execution_error':
        suggestions.push('Check network connectivity and permissions');
        suggestions.push('Verify Claude SDK configuration');
        suggestions.push('Review system resources and memory');
        break;
      case 'timeout':
        suggestions.push('Increase timeout_ms in agent options');
        suggestions.push('Optimize prompt for faster execution');
        suggestions.push('Check system performance and load');
        break;
      default:
        suggestions.push('Check agent logs for detailed error information');
        suggestions.push('Verify agent configuration and permissions');
        suggestions.push('Consider retrying with different parameters');
    }
    
    return suggestions;
  }

  /**
   * Get structured logs for debugging and analysis
   */
  public getStructuredLogs(): StructuredLogEntry[] {
    return [...this.structuredLogs];
  }

  /**
   * Get action history for debugging and analysis
   */
  public getActionHistory(): ActionContext[] {
    return [...this.actionHistory];
  }

  /**
   * Calculate performance metrics from action history
   */
  private calculatePerformanceMetrics(): {
    totalActions: number;
    toolExecutions: number;
    averageActionDuration?: number;
    slowestAction?: { actionId: string; duration: number; actionType: ClaudeActionType };
  } {
    const completedActions = this.structuredLogs.filter(log => 
      log.performance && log.performance.duration > 0
    );
    
    const toolExecutions = completedActions.filter(log => 
      log.actionType === 'tool_use'
    ).length;
    
    if (completedActions.length === 0) {
      return {
        totalActions: this.actionHistory.length,
        toolExecutions
      };
    }
    
    const durations = completedActions.map(log => log.performance!.duration);
    const averageActionDuration = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    
    const slowestLog = completedActions.reduce((slowest, current) => 
      (current.performance!.duration > (slowest.performance?.duration || 0)) ? current : slowest
    );
    
    return {
      totalActions: this.actionHistory.length,
      toolExecutions,
      averageActionDuration: Math.round(averageActionDuration),
      slowestAction: {
        actionId: slowestLog.actionId || 'unknown',
        duration: slowestLog.performance!.duration,
        actionType: slowestLog.actionType || 'tool_use'
      }
    };
  }

  /**
   * Get agent capabilities and metadata
   */
  abstract getCapabilities(): Record<string, any>;

  /**
   * Override this method for custom error handling per agent
   */
  protected async handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery> {
    // Default implementation - agents can override
    return {
      action: 'abort',
      message: `Agent-specific error: ${error.message}`
    };
  }

  /**
   * Override this method for custom session state management
   */
  protected async saveSessionState(state: Partial<any>): Promise<void> {
    // Default implementation - agents can override
    // Could save to file, database, etc.
  }

  /**
   * Override this method for custom session restoration
   */
  protected async restoreSessionState(sessionId: string): Promise<any> {
    // Default implementation - agents can override
    return null;
  }
}