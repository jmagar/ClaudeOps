import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { createId } from '@paralleldrive/cuid2';

import type {
  IAgentExecutor,
  AgentExecutorConfig,
  ExecutionFrameworkMetrics,
  TimeoutConfig,
  CancellationToken,
  ExecutionTimeoutError,
  FrameworkError,
  EnhancedExecutionContext
} from '../types/framework';

import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  Options,
  Query
} from '../types/claude';

import type {
  ExecutionProgress,
  ExecutionContext,
  IExecutionTracker
} from '../types/execution';

import { ExecutionTracker, executionManager } from '../services/executionTracker';
import { processManager } from '../services/processManager';
import { ClaudeSDKManager } from '../claude/sdkManager';
import { CostMonitoringService } from '../claude/costTracker';
import { ErrorHandler, RetryableExecutor } from '../claude/errorHandler';

/**
 * Agent Executor - Core component for executing individual agents
 * Handles process management, timeout handling, cancellation, and integration
 * with execution tracking and monitoring services
 */
export class AgentExecutor extends EventEmitter implements IAgentExecutor {
  private config: Required<AgentExecutorConfig>;
  private activeExecutions: Map<string, ExecutionState> = new Map();
  private metrics: ExecutionFrameworkMetrics;
  private isShuttingDown: boolean = false;
  private sdkManager: ClaudeSDKManager;
  private errorHandler: ErrorHandler;
  private retryExecutor: RetryableExecutor;

  constructor(config: Partial<AgentExecutorConfig> = {}) {
    super();

    this.config = {
      maxConcurrentExecutions: config.maxConcurrentExecutions ?? 10,
      defaultTimeoutMs: config.defaultTimeoutMs ?? 300000, // 5 minutes
      resourceLimits: config.resourceLimits ?? {
        maxCpuCores: 4,
        maxMemoryMB: 4096,
        maxDiskSpaceMB: 10240,
        maxConcurrentExecutions: 10,
        maxExecutionTimeMs: 600000, // 10 minutes
        maxCostUsd: 1.0
      },
      enableMetrics: config.enableMetrics ?? true,
      enableCostTracking: config.enableCostTracking ?? true,
      enableResourceMonitoring: config.enableResourceMonitoring ?? true,
      logLevel: config.logLevel ?? 'info',
      retryAttempts: config.retryAttempts ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000
    };

    this.initializeMetrics();
    this.setupEventHandlers();
    this.initializeServices();
  }

  /**
   * Execute a single agent
   */
  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (this.isShuttingDown) {
      throw new FrameworkError('Agent executor is shutting down', 'AgentExecutor', 'execute');
    }

    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      throw new FrameworkError(
        `Maximum concurrent executions reached (${this.config.maxConcurrentExecutions})`,
        'AgentExecutor',
        'execute'
      );
    }

    const executionId = createId();
    const startTime = performance.now();
    
    try {
      // Validate request
      this.validateRequest(request);

      // Create cancellation token
      const cancellationToken = this.createCancellationToken();
      
      // Create enhanced execution context
      const context: EnhancedExecutionContext = {
        agentType: request.agentType,
        nodeId: 'localhost',
        triggeredBy: 'manual',
        config: {},
        cancellationToken,
        timeoutConfig: {
          executionTimeoutMs: this.config.defaultTimeoutMs,
          gracePeriodMs: 30000,
          escalationTimeoutMs: 10000
        },
        budgetLimits: {
          maxCostUsd: request.estimatedCost * 2, // 2x buffer
          maxDurationMs: this.config.defaultTimeoutMs
        }
      };

      // Create execution tracker
      const tracker = await executionManager.startExecution(context);
      
      // Create execution state
      const executionState: ExecutionState = {
        executionId,
        request,
        tracker,
        startTime: new Date(),
        status: 'running',
        cancellationToken
      };

      this.activeExecutions.set(executionId, executionState);

      // Emit execution started event
      this.emit('execution:started', {
        executionId,
        agentType: request.agentType,
        request
      });

      // Execute with timeout and cancellation support
      const result = await this.executeWithTimeout(
        executionState,
        context.timeoutConfig!
      );

      // Update metrics
      this.updateMetricsOnSuccess(startTime);

      return result;

    } catch (error) {
      // Update metrics
      this.updateMetricsOnError(startTime, error);

      // Handle and categorize error
      const enhancedError = this.errorHandler.categorizeError(error as Error);
      
      // Emit execution failed event
      this.emit('execution:failed', {
        executionId,
        error: enhancedError,
        request
      });

      throw enhancedError;

    } finally {
      // Clean up execution state
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Execute multiple agents (sequential by default)
   */
  async executeMany(requests: AgentExecutionRequest[]): Promise<AgentExecutionResult[]> {
    const results: AgentExecutionResult[] = [];
    const errors: Array<{ index: number; error: Error }> = [];

    for (let i = 0; i < requests.length; i++) {
      try {
        const result = await this.execute(requests[i]);
        results[i] = result;
      } catch (error) {
        errors.push({ index: i, error: error as Error });
        results[i] = this.createErrorResult(requests[i], error as Error);
      }
    }

    // Emit batch completion event
    this.emit('batch:completed', {
      total: requests.length,
      successful: results.filter(r => r.status === 'completed').length,
      failed: errors.length,
      results,
      errors
    });

    return results;
  }

  /**
   * Cancel an execution
   */
  async cancel(executionId: string): Promise<boolean> {
    const executionState = this.activeExecutions.get(executionId);
    
    if (!executionState) {
      return false;
    }

    try {
      // Signal cancellation
      executionState.cancellationToken.cancel('User requested cancellation');
      
      // Cancel through tracker
      await executionState.tracker.cancel('User requested cancellation');

      // Kill any associated processes
      await processManager.killProcess(executionId);

      this.emit('execution:cancelled', {
        executionId,
        reason: 'User requested cancellation'
      });

      return true;

    } catch (error) {
      console.error(`Failed to cancel execution ${executionId}:`, error);
      return false;
    }
  }

  /**
   * Pause an execution
   */
  async pause(executionId: string): Promise<boolean> {
    const executionState = this.activeExecutions.get(executionId);
    
    if (!executionState) {
      return false;
    }

    try {
      await executionState.tracker.pause();
      executionState.status = 'paused';

      this.emit('execution:paused', { executionId });
      return true;

    } catch (error) {
      console.error(`Failed to pause execution ${executionId}:`, error);
      return false;
    }
  }

  /**
   * Resume an execution
   */
  async resume(executionId: string): Promise<boolean> {
    const executionState = this.activeExecutions.get(executionId);
    
    if (!executionState || executionState.status !== 'paused') {
      return false;
    }

    try {
      await executionState.tracker.resume();
      executionState.status = 'running';

      this.emit('execution:resumed', { executionId });
      return true;

    } catch (error) {
      console.error(`Failed to resume execution ${executionId}:`, error);
      return false;
    }
  }

  /**
   * Get execution status
   */
  async getExecutionStatus(executionId: string): Promise<ExecutionProgress | null> {
    const executionState = this.activeExecutions.get(executionId);
    
    if (!executionState) {
      return null;
    }

    return executionState.tracker.progress;
  }

  /**
   * Get active execution IDs
   */
  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ExecutionFrameworkMetrics {
    return { ...this.metrics };
  }

  /**
   * Configure the executor
   */
  configure(config: Partial<AgentExecutorConfig>): void {
    Object.assign(this.config, config);
    
    this.emit('configuration:updated', {
      previousConfig: { ...this.config },
      newConfig: config
    });
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log('AgentExecutor cleanup initiated...');
    
    this.isShuttingDown = true;

    // Cancel all active executions
    const cancelPromises = Array.from(this.activeExecutions.keys())
      .map(id => this.cancel(id));
    
    await Promise.allSettled(cancelPromises);

    // Wait for all executions to complete
    let attempts = 0;
    while (this.activeExecutions.size > 0 && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (this.activeExecutions.size > 0) {
      console.warn(`${this.activeExecutions.size} executions still active after cleanup timeout`);
    }

    // Remove all listeners
    this.removeAllListeners();

    console.log('AgentExecutor cleanup completed');
  }

  // Private methods

  private initializeServices(): void {
    this.sdkManager = new ClaudeSDKManager();
    this.errorHandler = new ErrorHandler();
    this.retryExecutor = new RetryableExecutor({
      maxAttempts: this.config.retryAttempts,
      initialDelay: this.config.retryDelayMs,
      maxDelay: this.config.retryDelayMs * 10,
      backoffMultiplier: 2,
      retryableErrors: ['rate limit', 'timeout', 'network', 'temporary']
    });
  }

  private async executeWithTimeout(
    executionState: ExecutionState,
    timeoutConfig: TimeoutConfig
  ): Promise<AgentExecutionResult> {
    const { executionId, request, tracker, cancellationToken } = executionState;

    return new Promise(async (resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        const timeoutError = new ExecutionTimeoutError(
          `Execution timed out after ${timeoutConfig.executionTimeoutMs}ms`,
          executionId,
          'execution'
        );
        reject(timeoutError);
      }, timeoutConfig.executionTimeoutMs);

      // Set up cancellation handler
      cancellationToken.onCancelled(() => {
        clearTimeout(timeoutHandle);
        reject(new FrameworkError('Execution was cancelled', 'AgentExecutor', 'execute', { executionId }));
      });

      try {
        // Execute the agent using SDK
        const result = await this.executeAgent(request, tracker, cancellationToken);
        
        clearTimeout(timeoutHandle);
        resolve(result);

      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  private async executeAgent(
    request: AgentExecutionRequest,
    tracker: IExecutionTracker,
    cancellationToken: CancellationToken
  ): Promise<AgentExecutionResult> {
    const startTime = performance.now();
    
    try {
      // Add initial step
      await tracker.addStep({
        name: 'Initialize Agent Execution',
        type: 'initialization'
      });

      await tracker.startStep(1);

      // Check cancellation before starting
      cancellationToken.throwIfCancelled();

      // Create SDK options
      const options: Options = {
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'acceptEdits',
        maxTurns: 10,
        ...request.overrides
      };

      // Set working directory if specified
      if (request.workingDirectory) {
        options.cwd = request.workingDirectory;
      }

      await tracker.completeStep(1, {
        output: 'Agent execution initialized'
      });

      // Add execution step
      await tracker.addStep({
        name: 'Execute Agent',
        type: 'analysis'
      });

      await tracker.startStep(2);

      // Execute with retry logic if enabled
      const queryResult = this.config.retryAttempts > 0 
        ? await this.retryExecutor.executeWithRetry(
            () => this.createAndProcessQuery(request.prompt, options, tracker, cancellationToken),
            `agent-execution-${request.agentType}`
          )
        : await this.createAndProcessQuery(request.prompt, options, tracker, cancellationToken);

      await tracker.completeStep(2, {
        output: 'Agent execution completed successfully'
      });

      // Create result
      const endTime = performance.now();
      const duration = endTime - startTime;

      const result: AgentExecutionResult = {
        executionId: tracker.executionId,
        agentType: request.agentType,
        status: 'completed',
        result: queryResult.result,
        cost: queryResult.cost,
        duration,
        usage: queryResult.usage,
        logs: queryResult.logs,
        timestamp: new Date().toISOString()
      };

      // Complete the execution
      await tracker.complete({
        success: true,
        output: queryResult.result,
        costData: queryResult.costData
      });

      return result;

    } catch (error) {
      // Handle execution failure
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await tracker.fail(errorMessage);

      // Create error result
      const endTime = performance.now();
      const duration = endTime - startTime;

      return {
        executionId: tracker.executionId,
        agentType: request.agentType,
        status: 'failed',
        result: '',
        cost: 0,
        duration,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        logs: [],
        timestamp: new Date().toISOString(),
        error: errorMessage
      };
    }
  }

  private async createAndProcessQuery(
    prompt: string,
    options: Options,
    tracker: IExecutionTracker,
    cancellationToken: CancellationToken
  ): Promise<{
    result: string;
    cost: number;
    usage: any;
    logs: string[];
    costData: any;
  }> {
    // Create the query
    const query = this.sdkManager.createQuery(prompt, request.agentType, options);
    
    const logs: string[] = [];
    let result = '';
    let cost = 0;
    let usage: any = null;
    let costData: any = null;

    // Process query results
    for await (const message of query) {
      // Check for cancellation
      cancellationToken.throwIfCancelled();

      switch (message.type) {
        case 'assistant':
          const content = message.message.content[0];
          if (content.type === 'text') {
            result += content.text;
            await tracker.addLog(`Assistant: ${content.text.substring(0, 200)}...`, 'info', 'claude');
          }
          break;

        case 'result':
          if (message.subtype === 'success') {
            cost = message.total_cost_usd;
            usage = message.usage;
            
            costData = {
              totalCostUsd: cost,
              tokensUsed: usage.input_tokens + usage.output_tokens,
              model: options.model || 'claude-3-5-sonnet-20241022',
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              cacheHits: usage.cache_read_input_tokens || 0
            };

            // Record cost
            if (this.config.enableCostTracking) {
              await tracker.recordCost({
                modelUsed: options.model || 'claude-3-5-sonnet-20241022',
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
                inputCostUsd: cost * (usage.input_tokens / (usage.input_tokens + usage.output_tokens)),
                outputCostUsd: cost * (usage.output_tokens / (usage.input_tokens + usage.output_tokens)),
                totalCostUsd: cost
              });
            }

            result = message.result;
            
          } else {
            throw new FrameworkError(
              `Agent execution failed: ${message.subtype}`,
              'AgentExecutor',
              'executeAgent'
            );
          }
          break;

        case 'stream_event':
          logs.push(`Stream event: ${JSON.stringify(message.event)}`);
          break;
      }
    }

    return { result, cost, usage, logs, costData };
  }

  private validateRequest(request: AgentExecutionRequest): void {
    if (!request.agentType) {
      throw new FrameworkError('Agent type is required', 'AgentExecutor', 'validateRequest');
    }

    if (!request.prompt || request.prompt.trim().length === 0) {
      throw new FrameworkError('Prompt is required', 'AgentExecutor', 'validateRequest');
    }

    if (request.estimatedCost > this.config.resourceLimits.maxCostUsd) {
      throw new FrameworkError(
        `Estimated cost exceeds limit: ${request.estimatedCost} > ${this.config.resourceLimits.maxCostUsd}`,
        'AgentExecutor',
        'validateRequest'
      );
    }
  }

  private createCancellationToken(): CancellationToken {
    let cancelled = false;
    let reason: string | undefined;
    const callbacks: Array<() => void> = [];

    return {
      get isCancelled() { return cancelled; },
      get reason() { return reason; },
      
      cancel(cancelReason?: string) {
        cancelled = true;
        reason = cancelReason;
        callbacks.forEach(callback => {
          try {
            callback();
          } catch (error) {
            console.error('Error in cancellation callback:', error);
          }
        });
      },

      onCancelled(callback: () => void) {
        if (cancelled) {
          callback();
        } else {
          callbacks.push(callback);
        }
      },

      throwIfCancelled() {
        if (cancelled) {
          throw new FrameworkError(`Operation was cancelled${reason ? `: ${reason}` : ''}`, 'AgentExecutor', 'execute');
        }
      }
    };
  }

  private createErrorResult(request: AgentExecutionRequest, error: Error): AgentExecutionResult {
    return {
      executionId: createId(),
      agentType: request.agentType,
      status: 'failed',
      result: '',
      cost: 0,
      duration: 0,
      usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      logs: [],
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }

  private initializeMetrics(): void {
    this.metrics = {
      totalExecutions: 0,
      activeExecutions: 0,
      completedExecutions: 0,
      failedExecutions: 0,
      cancelledExecutions: 0,
      averageExecutionTime: 0,
      totalExecutionTime: 0,
      costMetrics: {
        totalCost: 0,
        averageCostPerExecution: 0,
        costPerSecond: 0
      },
      resourceMetrics: {
        currentAllocations: 0,
        totalAllocatedCpu: 0,
        totalAllocatedMemory: 0,
        allocationEfficiency: 0,
        resourceFragmentation: 0,
        averageAllocationTime: 0,
        peakResourceUsage: {
          cpu: 0,
          memory: 0,
          timestamp: new Date()
        }
      },
      throughputMetrics: {
        executionsPerSecond: 0,
        executionsPerMinute: 0,
        executionsPerHour: 0
      },
      errorMetrics: {
        totalErrors: 0,
        errorRate: 0,
        commonErrors: []
      },
      performanceMetrics: {
        p50ExecutionTime: 0,
        p95ExecutionTime: 0,
        p99ExecutionTime: 0,
        maxExecutionTime: 0,
        minExecutionTime: 0
      }
    };
  }

  private setupEventHandlers(): void {
    // Update active execution count when executions start/end
    this.on('execution:started', () => {
      this.metrics.activeExecutions = this.activeExecutions.size;
    });

    this.on('execution:completed', () => {
      this.metrics.activeExecutions = this.activeExecutions.size;
    });

    this.on('execution:failed', () => {
      this.metrics.activeExecutions = this.activeExecutions.size;
    });

    this.on('execution:cancelled', () => {
      this.metrics.activeExecutions = this.activeExecutions.size;
    });
  }

  private updateMetricsOnSuccess(startTime: number): void {
    const duration = performance.now() - startTime;
    
    this.metrics.totalExecutions++;
    this.metrics.completedExecutions++;
    this.metrics.totalExecutionTime += duration;
    this.metrics.averageExecutionTime = this.metrics.totalExecutionTime / this.metrics.totalExecutions;
    
    // Update performance metrics
    if (this.metrics.performanceMetrics.minExecutionTime === 0 || duration < this.metrics.performanceMetrics.minExecutionTime) {
      this.metrics.performanceMetrics.minExecutionTime = duration;
    }
    
    if (duration > this.metrics.performanceMetrics.maxExecutionTime) {
      this.metrics.performanceMetrics.maxExecutionTime = duration;
    }
  }

  private updateMetricsOnError(startTime: number, error: Error): void {
    const duration = performance.now() - startTime;
    
    this.metrics.totalExecutions++;
    this.metrics.failedExecutions++;
    this.metrics.totalExecutionTime += duration;
    this.metrics.averageExecutionTime = this.metrics.totalExecutionTime / this.metrics.totalExecutions;
    
    // Update error metrics
    this.metrics.errorMetrics.totalErrors++;
    this.metrics.errorMetrics.errorRate = this.metrics.errorMetrics.totalErrors / this.metrics.totalExecutions;
    
    // Track common errors
    const errorType = error.constructor.name;
    const existingError = this.metrics.errorMetrics.commonErrors.find(e => e.error === errorType);
    
    if (existingError) {
      existingError.count++;
      existingError.percentage = (existingError.count / this.metrics.errorMetrics.totalErrors) * 100;
    } else {
      this.metrics.errorMetrics.commonErrors.push({
        error: errorType,
        count: 1,
        percentage: (1 / this.metrics.errorMetrics.totalErrors) * 100
      });
    }
    
    // Sort by count and keep top 10
    this.metrics.errorMetrics.commonErrors.sort((a, b) => b.count - a.count);
    this.metrics.errorMetrics.commonErrors = this.metrics.errorMetrics.commonErrors.slice(0, 10);
  }
}

// Execution state interface
interface ExecutionState {
  executionId: string;
  request: AgentExecutionRequest;
  tracker: IExecutionTracker;
  startTime: Date;
  status: 'running' | 'paused' | 'cancelling';
  cancellationToken: CancellationToken;
}

// Extension to CancellationToken interface to include cancel method
interface CancellationToken {
  isCancelled: boolean;
  reason?: string;
  cancel(reason?: string): void;
  onCancelled: (callback: () => void) => void;
  throwIfCancelled(): void;
}

// Export singleton instance
export const agentExecutor = new AgentExecutor();