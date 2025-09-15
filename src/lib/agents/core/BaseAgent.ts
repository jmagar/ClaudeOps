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
  ProgressCallback
} from './types';

/**
 * Abstract base class for all Claude Code SDK agents
 * Provides common functionality: streaming, hooks, error handling, session management, etc.
 */
export abstract class BaseAgent<TOptions extends BaseAgentOptions = BaseAgentOptions> 
  implements IBaseAgent<TOptions> {
  
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
    const executionId = createId();
    const startTime = Date.now();
    const logs: string[] = [];
    
    // Set up logging
    const log = this.createLogger(logs, options.onLog);
    
    // Set up abort controller for timeout
    const abortController = options.abortController || new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;
    
    if (options.timeout_ms) {
      timeoutId = setTimeout(() => {
        log('⏰ Execution timeout reached, aborting...', 'warn');
        abortController.abort();
      }, options.timeout_ms);
    }

    try {
      log(`🚀 Starting ${this.getAgentType()} agent execution...`);
      log(`📋 Execution ID: ${executionId}`, 'debug');

      // Progress tracking
      const progress: ProgressUpdate = {
        stage: 'starting',
        message: 'Initializing agent execution',
        currentTurn: 0,
        maxTurns: options.maxTurns || 50,
        toolsUsed: [],
        cost: 0
      };
      
      this.reportProgress(progress, options.onProgress);

      // Build prompt
      const prompt = this.buildPrompt(options);
      log('📝 Built investigation prompt', 'debug');

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
      this.reportProgress(progress, options.onProgress);

      // Configure Claude query with proper SDK options
      const sdkOptions: Options = {
        maxTurns: options.maxTurns || 50,
        permissionMode: options.permissionMode || this.getPermissionMode(),
        allowedTools: this.getAllowedTools(),
        customSystemPrompt: this.getSystemPrompt(),
        includePartialMessages: options.includePartialMessages || true,
        abortController,
        ...(options.hooks?.preToolUse && {
          hooks: {
            PreToolUse: [{
              hooks: options.hooks.preToolUse
            }]
          }
        }),
        ...(options.hooks?.postToolUse && {
          hooks: {
            PostToolUse: [{
              hooks: options.hooks.postToolUse
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
          progress,
          onProgress: options.onProgress,
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
            this.reportProgress(progress, options.onProgress);
            
            log('✅ Claude investigation completed successfully');
          } else {
            // Handle specific error types
            const error = await this.handleSDKError(message.subtype, {
              executionId,
              agentType: this.getAgentType(),
              currentTurn: progress.currentTurn || 0,
              totalCost,
              timeElapsed: Date.now() - startTime,
              lastTool: progress.toolsUsed?.slice(-1)[0]
            }, options);

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

      const duration = Date.now() - startTime;
      log(`⏱️ Analysis completed in ${(duration / 1000).toFixed(1)}s`);
      log(`💰 Total cost: $${totalCost.toFixed(4)}`);

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
        sessionId: options.sessionId
      };

      if (options.hooks?.onComplete) {
        await options.hooks.onComplete(finalResult);
      }

      return finalResult;

    } catch (error) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      log(`❌ ERROR: ${errorMessage}`, 'error');

      // Handle error through hook if provided
      if (options.hooks?.onError) {
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
          timeElapsed: duration
        };

        const recovery = await options.hooks.onError(agentError, errorContext);
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
        sessionId: options.sessionId
      };
    }
  }

  /**
   * Process individual messages from Claude with type safety
   */
  private async processMessage(
    message: SDKMessage,
    context: {
      log: LogCallback;
      progress: ProgressUpdate;
      onProgress?: ProgressCallback;
      totalCost: number;
      totalUsage: any;
      result: string;
      executionId: string;
    }
  ): Promise<void> {
    const { log, progress, onProgress } = context;

    if (message.type === 'assistant') {
      const assistantMessage = message as SDKAssistantMessage;
      const content = assistantMessage.message.content;
      
      // Handle both array and string content types
      if (Array.isArray(content)) {
        content.forEach(block => {
          if (block.type === 'tool_use') {
            log(`🔧 Running: ${block.name} - ${JSON.stringify(block.input)}`, 'debug');
            progress.toolsUsed = progress.toolsUsed || [];
            if (!progress.toolsUsed.includes(block.name)) {
              progress.toolsUsed.push(block.name);
            }
            progress.currentTurn = (progress.currentTurn || 0) + 1;
            progress.message = `Executing ${block.name}`;
            this.reportProgress(progress, onProgress);
          } else if (block.type === 'text' && block.text.trim()) {
            const preview = block.text.length > 500 ? block.text.substring(0, 500) + '...' : block.text;
            log(`💭 Claude: ${preview}`);
            
            // Update progress with Claude's thinking
            progress.message = `Claude analyzing: ${preview.substring(0, 50)}...`;
            this.reportProgress(progress, onProgress);
          }
        });
        
        // Extract final result text
        const textBlock = content.find(block => block.type === 'text');
        if (textBlock && 'text' in textBlock) {
          context.result = textBlock.text;
        }
      } else if (typeof content === 'string') {
        context.result = content;
        const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
        log(`💭 Claude: ${preview}`);
        progress.message = `Claude response: ${preview.substring(0, 50)}...`;
        this.reportProgress(progress, onProgress);
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
            const preview = contentStr?.substring(0, 200) + 
              (contentStr && contentStr.length > 200 ? '...' : '');
            log(`📊 Tool result: ${preview || 'No output'}`);
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
    options: TOptions
  ): Promise<ErrorRecovery> {
    const { log } = this.createLogger([], options.onLog);
    
    switch (errorSubtype) {
      case 'error_max_turns':
        log('⚠️ Maximum turns reached, investigation may be incomplete', 'warn');
        return {
          action: 'increase_turns',
          newMaxTurns: (options.maxTurns || 50) + 20,
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
   * Create a logger function with consistent formatting
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