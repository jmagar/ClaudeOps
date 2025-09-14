import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import type {
  ExecutionContext,
  ExecutionStepConfig,
  ExecutionResult,
  ExecutionProgress,
  ProcessLifecycleState,
  ExecutionMetrics,
  CostTrackingData,
  LogEntry,
  IExecutionTracker,
  ExecutionTrackerConfig,
  ExecutionEvent,
  ExecutionEventListener
} from '../types/execution';
import type { ExecutionStatus } from '../types/database';
import { executionService } from './executionService';
import { costService } from './costService';
import { logStreamer } from './logStreamer';
import { processManager } from './processManager';
import { getWebSocketManager } from '../websocket/server';
import { createId } from '@paralleldrive/cuid2';

/**
 * Execution Tracker - Central service for tracking agent execution lifecycle
 * Integrates with database, WebSocket, logging, and cost tracking
 */
export class ExecutionTracker extends EventEmitter implements IExecutionTracker {
  readonly executionId: string;
  readonly startTime: Date;
  
  private _currentStatus: ExecutionStatus = 'pending';
  private _currentStepNumber: number = 0;
  private _steps: Map<number, ExecutionStepConfig> = new Map();
  private _stepStartTimes: Map<number, Date> = new Map();
  private _progress: ExecutionProgress;
  private _totalCost: number = 0;
  private _totalTokens: number = 0;
  private _logs: LogEntry[] = [];
  private _context: ExecutionContext;
  private _config: Required<ExecutionTrackerConfig>;
  private _lastActivity: Date;
  private _pausedAt?: Date;
  private _resumedAt?: Date;
  private _metrics: Partial<ExecutionMetrics> = {};
  
  // Timers and intervals
  private _progressUpdateInterval?: NodeJS.Timeout;
  private _budgetCheckInterval?: NodeJS.Timeout;
  private _resourceMonitorInterval?: NodeJS.Timeout;
  private _logFlushTimer?: NodeJS.Timeout;

  constructor(context: ExecutionContext, config: Partial<ExecutionTrackerConfig> = {}) {
    super();
    
    this.executionId = createId();
    this.startTime = new Date();
    this._lastActivity = new Date();
    this._context = context;
    
    this._config = {
      maxLogEntries: config.maxLogEntries ?? 10000,
      logFlushIntervalMs: config.logFlushIntervalMs ?? 5000,
      progressUpdateIntervalMs: config.progressUpdateIntervalMs ?? 1000,
      resourceMonitoringIntervalMs: config.resourceMonitoringIntervalMs ?? 5000,
      enableDetailedMetrics: config.enableDetailedMetrics ?? true,
      budgetCheckIntervalMs: config.budgetCheckIntervalMs ?? 10000
    };

    this._progress = {
      executionId: this.executionId,
      currentStep: 0,
      totalSteps: 0,
      progress: 0,
      lastActivity: this._lastActivity
    };

    // Initialize metrics
    this._metrics = {
      executionId: this.executionId,
      agentType: context.agentType,
      startTime: this.startTime,
      status: this._currentStatus,
      stepsCompleted: 0,
      totalSteps: 0,
      logsGenerated: 0,
      costIncurred: 0,
      tokensUsed: 0,
      errors: 0,
      warnings: 0
    };
  }

  // Public API implementation

  get currentStatus(): ExecutionStatus {
    return this._currentStatus;
  }

  get currentStepNumber(): number {
    return this._currentStepNumber;
  }

  get progress(): ExecutionProgress {
    return { ...this._progress };
  }

  /**
   * Start the execution tracking
   */
  async start(): Promise<string> {
    try {
      // Create execution record in database
      const result = await executionService.createExecution({
        agentType: this._context.agentType,
        status: 'pending',
        nodeId: this._context.nodeId || 'localhost',
        triggeredBy: this._context.triggeredBy || 'manual',
        executionContext: JSON.stringify({
          config: this._context.config,
          metadata: this._context.metadata,
          budgetLimits: this._context.budgetLimits
        }),
        startedAt: this.startTime.toISOString()
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to create execution record');
      }

      // Update status to running
      await this.updateStatus('running');

      // Start log streaming for this execution
      await logStreamer.startStream(this.executionId, {
        executionId: this.executionId,
        follow: true
      });

      // Start periodic updates if configured
      this.startPeriodicUpdates();

      // Notify WebSocket clients
      this.notifyWebSocketClients('execution:started', {
        executionId: this.executionId,
        agentType: this._context.agentType
      });

      await this.addLog('Execution started', 'info', 'system');
      
      this.emit('execution:started', {
        executionId: this.executionId,
        agentType: this._context.agentType,
        startTime: this.startTime
      });

      return this.executionId;

    } catch (error) {
      await this.fail(error instanceof Error ? error.message : 'Failed to start execution');
      throw error;
    }
  }

  /**
   * Add a step to the execution
   */
  async addStep(step: ExecutionStepConfig): Promise<void> {
    try {
      const stepNumber = this._steps.size + 1;
      this._steps.set(stepNumber, step);

      // Create step record in database
      const result = await executionService.addExecutionStep({
        executionId: this.executionId,
        stepNumber,
        stepName: step.name,
        stepType: step.type || 'command',
        status: 'pending',
        metadata: step.metadata
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to add execution step');
      }

      // Update progress
      this._progress.totalSteps = this._steps.size;
      this.updateProgressPercentage();

      await this.addLog(`Added step ${stepNumber}: ${step.name}`, 'info', 'system', {
        stepNumber,
        stepType: step.type
      });

      this.emit('execution:step:added', {
        executionId: this.executionId,
        stepNumber,
        stepName: step.name,
        stepType: step.type
      });

    } catch (error) {
      await this.addLog(`Failed to add step: ${error}`, 'error', 'system');
      throw error;
    }
  }

  /**
   * Start executing a step
   */
  async startStep(stepNumber: number): Promise<void> {
    try {
      const step = this._steps.get(stepNumber);
      if (!step) {
        throw new Error(`Step ${stepNumber} not found`);
      }

      this._currentStepNumber = stepNumber;
      this._progress.currentStep = stepNumber;
      this._progress.currentStepName = step.name;
      this._stepStartTimes.set(stepNumber, new Date());

      // Update step status in database
      const stepResult = await executionService.getExecutionSteps(this.executionId);
      if (stepResult.success && stepResult.data) {
        const stepRecord = stepResult.data.find(s => s.stepNumber === stepNumber);
        if (stepRecord) {
          await executionService.updateExecutionStep(stepRecord.id, {
            status: 'running',
            startedAt: new Date().toISOString()
          });
        }
      }

      await this.addLog(`Starting step ${stepNumber}: ${step.name}`, 'info', 'agent', {
        stepNumber,
        stepName: step.name
      });

      this.notifyWebSocketClients('execution:step:started', {
        executionId: this.executionId,
        stepNumber,
        stepName: step.name
      });

      this.emit('execution:step:started', {
        executionId: this.executionId,
        stepNumber,
        stepName: step.name,
        step
      });

    } catch (error) {
      await this.addLog(`Failed to start step ${stepNumber}: ${error}`, 'error', 'system');
      throw error;
    }
  }

  /**
   * Complete a step
   */
  async completeStep(
    stepNumber: number, 
    result: { output?: string; error?: string; metadata?: any }
  ): Promise<void> {
    try {
      const step = this._steps.get(stepNumber);
      if (!step) {
        throw new Error(`Step ${stepNumber} not found`);
      }

      const completedAt = new Date();
      const startTime = this._stepStartTimes.get(stepNumber);
      const durationMs = startTime ? completedAt.getTime() - startTime.getTime() : undefined;

      const success = !result.error;
      const status = success ? 'completed' : 'failed';

      // Update step status in database
      const stepResult = await executionService.getExecutionSteps(this.executionId);
      if (stepResult.success && stepResult.data) {
        const stepRecord = stepResult.data.find(s => s.stepNumber === stepNumber);
        if (stepRecord) {
          await executionService.updateExecutionStep(stepRecord.id, {
            status: status as any,
            completedAt: completedAt.toISOString(),
            durationMs,
            output: result.output,
            errorMessage: result.error
          });
        }
      }

      // Update metrics
      this._metrics.stepsCompleted = (this._metrics.stepsCompleted || 0) + 1;
      if (!success) {
        this._metrics.errors = (this._metrics.errors || 0) + 1;
      }

      // Update progress
      this.updateProgressPercentage();

      const logLevel = success ? 'info' : 'error';
      const logMessage = success 
        ? `Completed step ${stepNumber}: ${step.name}`
        : `Failed step ${stepNumber}: ${step.name} - ${result.error}`;

      await this.addLog(logMessage, logLevel, 'agent', {
        stepNumber,
        stepName: step.name,
        success,
        output: result.output,
        error: result.error,
        durationMs
      });

      this.notifyWebSocketClients('execution:step:completed', {
        executionId: this.executionId,
        stepNumber,
        success,
        output: result.output,
        error: result.error,
        durationMs
      });

      this.emit('execution:step:completed', {
        executionId: this.executionId,
        stepNumber,
        success,
        result,
        durationMs
      });

    } catch (error) {
      await this.addLog(`Failed to complete step ${stepNumber}: ${error}`, 'error', 'system');
      throw error;
    }
  }

  /**
   * Skip a step
   */
  async skipStep(stepNumber: number, reason?: string): Promise<void> {
    try {
      const step = this._steps.get(stepNumber);
      if (!step) {
        throw new Error(`Step ${stepNumber} not found`);
      }

      // Update step status in database
      const stepResult = await executionService.getExecutionSteps(this.executionId);
      if (stepResult.success && stepResult.data) {
        const stepRecord = stepResult.data.find(s => s.stepNumber === stepNumber);
        if (stepRecord) {
          await executionService.updateExecutionStep(stepRecord.id, {
            status: 'skipped',
            completedAt: new Date().toISOString(),
            errorMessage: reason || 'Step skipped'
          });
        }
      }

      await this.addLog(`Skipped step ${stepNumber}: ${step.name}${reason ? ` - ${reason}` : ''}`, 'warn', 'system', {
        stepNumber,
        stepName: step.name,
        reason
      });

      this.emit('execution:step:skipped', {
        executionId: this.executionId,
        stepNumber,
        reason
      });

    } catch (error) {
      await this.addLog(`Failed to skip step ${stepNumber}: ${error}`, 'error', 'system');
      throw error;
    }
  }

  /**
   * Add a log entry
   */
  async addLog(
    message: string, 
    level: LogEntry['level'] = 'info', 
    source: LogEntry['source'] = 'agent',
    metadata?: any
  ): Promise<void> {
    try {
      const logEntry: LogEntry = {
        id: createId(),
        executionId: this.executionId,
        stepNumber: this._currentStepNumber > 0 ? this._currentStepNumber : undefined,
        level,
        message,
        timestamp: new Date().toISOString(),
        source,
        metadata
      };

      // Add to local collection (for quick access)
      this._logs.push(logEntry);

      // Trim logs if we exceed the limit
      if (this._logs.length > this._config.maxLogEntries) {
        this._logs = this._logs.slice(-this._config.maxLogEntries);
      }

      // Add to log streamer (which handles WebSocket streaming)
      await logStreamer.addLogEntry(logEntry);

      // Update metrics
      this._metrics.logsGenerated = (this._metrics.logsGenerated || 0) + 1;
      if (level === 'error') {
        this._metrics.errors = (this._metrics.errors || 0) + 1;
      } else if (level === 'warn') {
        this._metrics.warnings = (this._metrics.warnings || 0) + 1;
      }

      // Update last activity
      this._lastActivity = new Date();

      this.emit('execution:log', logEntry);

    } catch (error) {
      console.error('Failed to add log entry:', error);
      // Don't throw here to avoid recursive errors
    }
  }

  /**
   * Record cost information
   */
  async recordCost(costData: Omit<CostTrackingData, 'executionId' | 'timestamp'>): Promise<void> {
    try {
      const fullCostData: CostTrackingData = {
        ...costData,
        executionId: this.executionId,
        timestamp: new Date()
      };

      // Record in cost service
      const result = await costService.recordCost({
        executionId: this.executionId,
        modelUsed: costData.modelUsed,
        inputTokens: costData.inputTokens,
        outputTokens: costData.outputTokens,
        inputCostUsd: costData.inputCostUsd,
        outputCostUsd: costData.outputCostUsd,
        totalCostUsd: costData.totalCostUsd,
        requestId: costData.requestId,
        responseTime: costData.responseTime,
        cacheHit: costData.cacheHit
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to record cost');
      }

      // Update local tracking
      this._totalCost += costData.totalCostUsd;
      this._totalTokens += (costData.inputTokens + costData.outputTokens);

      // Update metrics
      this._metrics.costIncurred = this._totalCost;
      this._metrics.tokensUsed = this._totalTokens;

      // Check budget limits
      await this.checkBudgetLimits();

      // Notify WebSocket clients
      this.notifyWebSocketClients('execution:cost:updated', {
        executionId: this.executionId,
        ...fullCostData
      });

      await this.addLog(
        `Cost recorded: $${costData.totalCostUsd.toFixed(6)} (${costData.inputTokens + costData.outputTokens} tokens)`,
        'info',
        'system',
        {
          cost: costData.totalCostUsd,
          tokens: costData.inputTokens + costData.outputTokens,
          model: costData.modelUsed
        }
      );

      this.emit('execution:cost:recorded', fullCostData);

    } catch (error) {
      await this.addLog(`Failed to record cost: ${error}`, 'error', 'system');
      throw error;
    }
  }

  /**
   * Update execution progress
   */
  async updateProgress(progress: number, estimatedRemainingMs?: number): Promise<void> {
    try {
      this._progress.progress = Math.max(0, Math.min(100, progress));
      this._progress.estimatedRemainingMs = estimatedRemainingMs;
      this._progress.lastActivity = new Date();

      // Notify WebSocket clients
      this.notifyWebSocketClients('execution:progress', this._progress);

      this.emit('execution:progress', this._progress);

    } catch (error) {
      console.error('Failed to update progress:', error);
    }
  }

  /**
   * Complete the execution successfully
   */
  async complete(result: ExecutionResult): Promise<void> {
    try {
      this.stopPeriodicUpdates();

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - this.startTime.getTime();

      // Update execution status in database
      const updateResult = await executionService.updateExecution(this.executionId, {
        status: 'completed',
        completedAt: completedAt.toISOString(),
        durationMs,
        resultSummary: this.generateResultSummary(result),
        costUsd: this._totalCost,
        tokensUsed: this._totalTokens,
        aiAnalysis: result.aiAnalysis,
        logs: this._logs
      });

      if (!updateResult.success) {
        console.error('Failed to update execution record:', updateResult.error);
      }

      // Update metrics
      this._metrics.endTime = completedAt;
      this._metrics.duration = durationMs;
      this._metrics.status = 'completed';

      // Stop log streaming
      await logStreamer.stopStream(this.executionId);

      // Notify WebSocket clients
      this.notifyWebSocketClients('execution:completed', {
        executionId: this.executionId,
        success: true,
        result,
        durationMs,
        totalCost: this._totalCost
      });

      await this.addLog(`Execution completed successfully (${durationMs}ms, $${this._totalCost.toFixed(6)})`, 'info', 'system', {
        durationMs,
        totalCost: this._totalCost,
        totalTokens: this._totalTokens,
        stepsCompleted: this._metrics.stepsCompleted
      });

      this.emit('execution:completed', {
        executionId: this.executionId,
        result,
        metrics: this.getMetrics(),
        durationMs
      });

      // Clean up after a delay
      setTimeout(() => this.cleanup(), 30000); // 30 seconds

    } catch (error) {
      console.error('Error during execution completion:', error);
      await this.fail(`Completion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fail the execution
   */
  async fail(error: string, exitCode: number = 1): Promise<void> {
    try {
      this.stopPeriodicUpdates();

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - this.startTime.getTime();

      // Update execution status in database
      const updateResult = await executionService.updateExecution(this.executionId, {
        status: 'failed',
        completedAt: completedAt.toISOString(),
        durationMs,
        errorMessage: error,
        exitCode,
        costUsd: this._totalCost,
        tokensUsed: this._totalTokens,
        logs: this._logs
      });

      if (!updateResult.success) {
        console.error('Failed to update execution record:', updateResult.error);
      }

      // Update metrics
      this._metrics.endTime = completedAt;
      this._metrics.duration = durationMs;
      this._metrics.status = 'failed';
      this._metrics.errors = (this._metrics.errors || 0) + 1;

      // Stop log streaming
      await logStreamer.stopStream(this.executionId);

      // Notify WebSocket clients
      this.notifyWebSocketClients('execution:failed', {
        executionId: this.executionId,
        error,
        exitCode,
        durationMs
      });

      await this.addLog(`Execution failed: ${error}`, 'error', 'system', {
        durationMs,
        exitCode,
        totalCost: this._totalCost
      });

      this.emit('execution:failed', {
        executionId: this.executionId,
        error,
        exitCode,
        metrics: this.getMetrics(),
        durationMs
      });

      // Clean up after a delay
      setTimeout(() => this.cleanup(), 30000); // 30 seconds

    } catch (cleanupError) {
      console.error('Error during execution failure handling:', cleanupError);
    }
  }

  /**
   * Cancel the execution
   */
  async cancel(reason?: string): Promise<void> {
    try {
      this.stopPeriodicUpdates();

      const cancelledAt = new Date();
      const durationMs = cancelledAt.getTime() - this.startTime.getTime();

      // Cancel execution in database
      const cancelResult = await executionService.cancelExecution(this.executionId, reason);
      if (!cancelResult.success) {
        console.error('Failed to cancel execution record:', cancelResult.error);
      }

      // Update metrics
      this._metrics.endTime = cancelledAt;
      this._metrics.duration = durationMs;
      this._metrics.status = 'cancelled';

      // Stop log streaming
      await logStreamer.stopStream(this.executionId);

      // Kill any associated processes
      const processInfo = processManager.getProcessInfo(this.executionId);
      if (processInfo) {
        await processManager.killProcess(this.executionId);
      }

      // Notify WebSocket clients
      this.notifyWebSocketClients('execution:cancelled', {
        executionId: this.executionId,
        reason: reason || 'Cancelled by user'
      });

      await this.addLog(`Execution cancelled${reason ? `: ${reason}` : ''}`, 'warn', 'system', {
        durationMs,
        reason
      });

      this.emit('execution:cancelled', {
        executionId: this.executionId,
        reason,
        durationMs
      });

      // Clean up immediately
      await this.cleanup();

    } catch (error) {
      console.error('Error during execution cancellation:', error);
    }
  }

  /**
   * Pause the execution
   */
  async pause(): Promise<void> {
    if (this._currentStatus !== 'running') {
      throw new Error('Can only pause running executions');
    }

    this._pausedAt = new Date();
    await this.updateStatus('pending'); // Use pending as paused state
    
    await this.addLog('Execution paused', 'info', 'system');
    this.emit('execution:paused', { executionId: this.executionId });
  }

  /**
   * Resume the execution
   */
  async resume(): Promise<void> {
    if (this._currentStatus !== 'pending' || !this._pausedAt) {
      throw new Error('Can only resume paused executions');
    }

    this._resumedAt = new Date();
    await this.updateStatus('running');
    
    await this.addLog('Execution resumed', 'info', 'system');
    this.emit('execution:resumed', { executionId: this.executionId });
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ExecutionMetrics {
    const duration = this.getDuration();
    
    return {
      ...this._metrics,
      duration,
      status: this._currentStatus,
      stepsCompleted: this._metrics.stepsCompleted || 0,
      totalSteps: this._steps.size,
      logsGenerated: this._logs.length,
      costIncurred: this._totalCost,
      tokensUsed: this._totalTokens
    } as ExecutionMetrics;
  }

  /**
   * Get execution duration in milliseconds
   */
  getDuration(): number {
    const endTime = this._metrics.endTime || new Date();
    return endTime.getTime() - this.startTime.getTime();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log(`Cleaning up execution tracker ${this.executionId}`);

    this.stopPeriodicUpdates();

    // Stop log streaming
    try {
      await logStreamer.stopStream(this.executionId);
    } catch (error) {
      console.warn('Error stopping log stream:', error);
    }

    // Remove all listeners
    this.removeAllListeners();

    console.log(`Execution tracker ${this.executionId} cleaned up`);
  }

  // Private methods

  private async updateStatus(status: ExecutionStatus): Promise<void> {
    this._currentStatus = status;
    this._lastActivity = new Date();
    
    // Update database
    const result = await executionService.updateExecution(this.executionId, {
      status,
      updatedAt: new Date().toISOString()
    });

    if (!result.success) {
      console.warn(`Failed to update execution status: ${result.error}`);
    }
  }

  private updateProgressPercentage(): void {
    if (this._steps.size === 0) {
      this._progress.progress = 0;
      return;
    }

    const completed = this._metrics.stepsCompleted || 0;
    this._progress.progress = (completed / this._steps.size) * 100;
  }

  private generateResultSummary(result: ExecutionResult): string {
    const parts = [];
    
    if (result.success) {
      parts.push('Success');
    } else {
      parts.push(`Failed: ${result.error}`);
    }

    if (result.costData) {
      parts.push(`$${result.costData.totalCostUsd.toFixed(6)}`);
      parts.push(`${result.costData.tokensUsed} tokens`);
    }

    if (this._steps.size > 0) {
      parts.push(`${this._metrics.stepsCompleted}/${this._steps.size} steps`);
    }

    return parts.join(' | ');
  }

  private startPeriodicUpdates(): void {
    // Progress updates
    if (this._config.progressUpdateIntervalMs > 0) {
      this._progressUpdateInterval = setInterval(() => {
        if (this._currentStatus === 'running') {
          this.notifyWebSocketClients('execution:progress', this._progress);
        }
      }, this._config.progressUpdateIntervalMs);
    }

    // Budget checks
    if (this._config.budgetCheckIntervalMs > 0 && this._context.budgetLimits) {
      this._budgetCheckInterval = setInterval(() => {
        this.checkBudgetLimits().catch(error => {
          console.error('Budget check failed:', error);
        });
      }, this._config.budgetCheckIntervalMs);
    }

    // Resource monitoring
    if (this._config.resourceMonitoringIntervalMs > 0 && this._config.enableDetailedMetrics) {
      this._resourceMonitorInterval = setInterval(() => {
        this.updateResourceMetrics().catch(error => {
          console.error('Resource monitoring failed:', error);
        });
      }, this._config.resourceMonitoringIntervalMs);
    }
  }

  private stopPeriodicUpdates(): void {
    if (this._progressUpdateInterval) {
      clearInterval(this._progressUpdateInterval);
      this._progressUpdateInterval = undefined;
    }

    if (this._budgetCheckInterval) {
      clearInterval(this._budgetCheckInterval);
      this._budgetCheckInterval = undefined;
    }

    if (this._resourceMonitorInterval) {
      clearInterval(this._resourceMonitorInterval);
      this._resourceMonitorInterval = undefined;
    }

    if (this._logFlushTimer) {
      clearTimeout(this._logFlushTimer);
      this._logFlushTimer = undefined;
    }
  }

  private async checkBudgetLimits(): Promise<void> {
    const limits = this._context.budgetLimits;
    if (!limits) return;

    const exceeded = [];

    if (limits.maxCostUsd && this._totalCost >= limits.maxCostUsd) {
      exceeded.push(`cost ($${this._totalCost.toFixed(6)} >= $${limits.maxCostUsd})`);
    }

    if (limits.maxTokens && this._totalTokens >= limits.maxTokens) {
      exceeded.push(`tokens (${this._totalTokens} >= ${limits.maxTokens})`);
    }

    if (limits.maxDurationMs) {
      const duration = this.getDuration();
      if (duration >= limits.maxDurationMs) {
        exceeded.push(`duration (${duration}ms >= ${limits.maxDurationMs}ms)`);
      }
    }

    if (exceeded.length > 0) {
      const message = `Budget limit exceeded: ${exceeded.join(', ')}`;
      await this.addLog(message, 'error', 'system');
      await this.fail(`Budget limit exceeded: ${exceeded.join(', ')}`);
    }
  }

  private async updateResourceMetrics(): Promise<void> {
    // This would integrate with system monitoring
    // For now, just update timestamp
    this._progress.lastActivity = new Date();
  }

  private notifyWebSocketClients(type: string, data: any): void {
    const wsManager = getWebSocketManager();
    if (wsManager) {
      try {
        wsManager.broadcastSystemStatus('healthy', data);
      } catch (error) {
        console.warn('Failed to notify WebSocket clients:', error);
      }
    }
  }
}

/**
 * Execution Manager - Manages multiple concurrent executions
 */
export class ExecutionManager extends EventEmitter {
  private activeExecutions: Map<string, ExecutionTracker> = new Map();
  private maxConcurrentExecutions: number = 10;

  /**
   * Start a new execution
   */
  async startExecution(
    context: ExecutionContext, 
    config?: Partial<ExecutionTrackerConfig>
  ): Promise<ExecutionTracker> {
    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.maxConcurrentExecutions) {
      throw new Error(`Maximum concurrent executions reached (${this.maxConcurrentExecutions})`);
    }

    const tracker = new ExecutionTracker(context, config);
    
    // Forward all events
    tracker.on('execution:started', (event) => this.emit('execution:started', event));
    tracker.on('execution:completed', (event) => this.emit('execution:completed', event));
    tracker.on('execution:failed', (event) => this.emit('execution:failed', event));
    tracker.on('execution:cancelled', (event) => this.emit('execution:cancelled', event));
    tracker.on('execution:log', (event) => this.emit('execution:log', event));

    // Clean up when execution ends
    const cleanup = () => {
      this.activeExecutions.delete(tracker.executionId);
    };
    
    tracker.once('execution:completed', cleanup);
    tracker.once('execution:failed', cleanup);
    tracker.once('execution:cancelled', cleanup);

    // Start the execution
    await tracker.start();
    
    this.activeExecutions.set(tracker.executionId, tracker);
    
    return tracker;
  }

  /**
   * Get active executions
   */
  getActiveExecutions(): ExecutionTracker[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Get specific execution
   */
  getExecution(executionId: string): ExecutionTracker | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * Cancel execution
   */
  async cancelExecution(executionId: string, reason?: string): Promise<void> {
    const tracker = this.activeExecutions.get(executionId);
    if (tracker) {
      await tracker.cancel(reason);
    }
  }

  /**
   * Get execution count
   */
  getExecutionCount(): number {
    return this.activeExecutions.size;
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    active: number;
    maxConcurrent: number;
    byStatus: Record<ExecutionStatus, number>;
    byAgentType: Record<string, number>;
  } {
    const stats = {
      active: this.activeExecutions.size,
      maxConcurrent: this.maxConcurrentExecutions,
      byStatus: {} as Record<ExecutionStatus, number>,
      byAgentType: {} as Record<string, number>
    };

    for (const tracker of Array.from(this.activeExecutions.values())) {
      // Count by status
      const status = tracker.currentStatus;
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // Count by agent type  
      const agentType = tracker['_context'].agentType;
      stats.byAgentType[agentType] = (stats.byAgentType[agentType] || 0) + 1;
    }

    return stats;
  }

  /**
   * Set maximum concurrent executions
   */
  setMaxConcurrentExecutions(max: number): void {
    this.maxConcurrentExecutions = Math.max(1, max);
  }

  /**
   * Cleanup all executions
   */
  async cleanup(): Promise<void> {
    console.log('ExecutionManager cleaning up...');
    
    const cleanupPromises = Array.from(this.activeExecutions.values()).map(
      tracker => tracker.cleanup()
    );
    
    await Promise.allSettled(cleanupPromises);
    this.activeExecutions.clear();
    this.removeAllListeners();
    
    console.log('ExecutionManager cleanup complete');
  }
}

// Export singleton instance
export const executionManager = new ExecutionManager();