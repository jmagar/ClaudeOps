import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { createId } from '@paralleldrive/cuid2';

import type {
  IExecutionOrchestrator,
  ExecutionOrchestratorConfig,
  ExecutionStrategy,
  ExecutionStrategyType,
  QueuedExecution,
  QueueStats,
  QueueOverflowError,
  FrameworkError
} from '../types/framework';

import type {
  AgentExecutionRequest,
  AgentExecutionResult
} from '../types/claude';

import { agentExecutor } from './agentExecutor';

/**
 * Execution Orchestrator - Manages execution scheduling, queuing, and strategy selection
 * Coordinates multiple agent executions using different strategies
 */
export class ExecutionOrchestrator extends EventEmitter implements IExecutionOrchestrator {
  private config: Required<ExecutionOrchestratorConfig>;
  private executionQueue: Map<string, QueuedExecution> = new Map();
  private strategies: Map<ExecutionStrategyType, ExecutionStrategy> = new Map();
  private currentStrategy: ExecutionStrategyType;
  private isProcessing: boolean = false;
  private isPaused: boolean = false;
  private isDraining: boolean = false;
  private isShuttingDown: boolean = false;
  private processingInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private queueStats: QueueStats;

  constructor(config: Partial<ExecutionOrchestratorConfig> = {}) {
    super();

    this.config = {
      executionStrategies: config.executionStrategies ?? [],
      defaultStrategy: config.defaultStrategy ?? 'sequential',
      concurrencyLimits: config.concurrencyLimits ?? {
        global: 10,
        perAgentType: {},
        perNode: 5
      },
      priorityQueues: config.priorityQueues ?? {
        high: 1000,
        normal: 100,
        low: 10
      },
      resourceAllocationStrategy: config.resourceAllocationStrategy ?? 'fair',
      enableLoadBalancing: config.enableLoadBalancing ?? true,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 30000
    };

    this.currentStrategy = this.config.defaultStrategy;
    this.initializeDefaultStrategies();
    this.initializeQueueStats();
    this.startProcessing();
    this.startHealthCheck();
  }

  /**
   * Schedule a single execution
   */
  async schedule(request: AgentExecutionRequest): Promise<string> {
    if (this.isShuttingDown) {
      throw new FrameworkError('Orchestrator is shutting down', 'ExecutionOrchestrator', 'schedule');
    }

    if (this.isDraining) {
      throw new FrameworkError('Orchestrator is draining', 'ExecutionOrchestrator', 'schedule');
    }

    const executionId = createId();
    const priority = this.calculatePriority(request);
    
    // Check queue capacity
    if (this.executionQueue.size >= this.getMaxQueueSize()) {
      throw new QueueOverflowError(
        'Execution queue is full',
        this.executionQueue.size,
        this.getMaxQueueSize()
      );
    }

    const queuedExecution: QueuedExecution = {
      id: executionId,
      request,
      priority,
      queuedAt: new Date(),
      estimatedStartTime: this.estimateStartTime(priority)
    };

    this.executionQueue.set(executionId, queuedExecution);
    this.updateQueueStats();

    this.emit('execution:queued', {
      executionId,
      queuePosition: this.getQueuePosition(executionId),
      priority,
      estimatedStartTime: queuedExecution.estimatedStartTime
    });

    await this.logExecution(`Queued execution ${executionId} for agent ${request.agentType}`, 'info');

    return executionId;
  }

  /**
   * Schedule multiple executions
   */
  async scheduleMany(requests: AgentExecutionRequest[]): Promise<string[]> {
    const executionIds: string[] = [];

    for (const request of requests) {
      try {
        const executionId = await this.schedule(request);
        executionIds.push(executionId);
      } catch (error) {
        // Continue scheduling other requests, but track the error
        console.error('Failed to schedule execution:', error);
      }
    }

    this.emit('batch:scheduled', {
      total: requests.length,
      successful: executionIds.length,
      failed: requests.length - executionIds.length,
      executionIds
    });

    return executionIds;
  }

  /**
   * Cancel a scheduled or running execution
   */
  async cancel(executionId: string): Promise<boolean> {
    const queuedExecution = this.executionQueue.get(executionId);
    
    if (queuedExecution) {
      // Remove from queue
      this.executionQueue.delete(executionId);
      this.updateQueueStats();

      this.emit('execution:cancelled', {
        executionId,
        reason: 'Cancelled while queued'
      });

      await this.logExecution(`Cancelled queued execution ${executionId}`, 'info');
      return true;
    }

    // Try to cancel through agent executor (for running executions)
    const cancelled = await agentExecutor.cancel(executionId);
    
    if (cancelled) {
      await this.logExecution(`Cancelled running execution ${executionId}`, 'info');
    }

    return cancelled;
  }

  /**
   * Cancel multiple executions
   */
  async cancelMany(executionIds: string[]): Promise<boolean[]> {
    const results = await Promise.all(
      executionIds.map(id => this.cancel(id))
    );

    this.emit('batch:cancelled', {
      total: executionIds.length,
      successful: results.filter(r => r).length,
      failed: results.filter(r => !r).length,
      results
    });

    return results;
  }

  /**
   * Get current queue
   */
  getQueue(): QueuedExecution[] {
    return Array.from(this.executionQueue.values())
      .sort((a, b) => {
        // Sort by priority first, then by queue time
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.queuedAt.getTime() - b.queuedAt.getTime();
      });
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): QueueStats {
    return { ...this.queueStats };
  }

  /**
   * Set execution strategy
   */
  setStrategy(strategy: ExecutionStrategyType): void {
    if (!this.strategies.has(strategy)) {
      throw new FrameworkError(`Unknown strategy: ${strategy}`, 'ExecutionOrchestrator', 'setStrategy');
    }

    const previousStrategy = this.currentStrategy;
    this.currentStrategy = strategy;

    this.emit('strategy:changed', {
      from: previousStrategy,
      to: strategy,
      reason: 'Manual strategy change'
    });

    this.logExecution(`Strategy changed from ${previousStrategy} to ${strategy}`, 'info');
  }

  /**
   * Add execution strategy
   */
  addStrategy(strategy: ExecutionStrategy): void {
    this.strategies.set(strategy.type, strategy);
    
    this.emit('strategy:added', {
      strategyType: strategy.type,
      strategyName: strategy.name
    });

    this.logExecution(`Added strategy: ${strategy.type} (${strategy.name})`, 'info');
  }

  /**
   * Remove execution strategy
   */
  removeStrategy(strategyType: ExecutionStrategyType): void {
    if (this.currentStrategy === strategyType) {
      throw new FrameworkError('Cannot remove currently active strategy', 'ExecutionOrchestrator', 'removeStrategy');
    }

    if (this.strategies.delete(strategyType)) {
      this.emit('strategy:removed', { strategyType });
      this.logExecution(`Removed strategy: ${strategyType}`, 'info');
    }
  }

  /**
   * Pause orchestrator
   */
  async pause(): Promise<void> {
    this.isPaused = true;
    this.stopProcessing();

    this.emit('orchestrator:paused');
    await this.logExecution('Orchestrator paused', 'info');
  }

  /**
   * Resume orchestrator
   */
  async resume(): Promise<void> {
    this.isPaused = false;
    this.startProcessing();

    this.emit('orchestrator:resumed');
    await this.logExecution('Orchestrator resumed', 'info');
  }

  /**
   * Drain queue (complete existing but don't accept new)
   */
  async drain(): Promise<void> {
    this.isDraining = true;

    this.emit('orchestrator:draining', {
      remainingExecutions: this.executionQueue.size
    });

    await this.logExecution(`Starting drain with ${this.executionQueue.size} queued executions`, 'info');

    // Wait for queue to empty
    while (this.executionQueue.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.emit('orchestrator:drained');
    await this.logExecution('Orchestrator drain completed', 'info');
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log('ExecutionOrchestrator cleanup initiated...');
    
    this.isShuttingDown = true;
    this.stopProcessing();
    this.stopHealthCheck();

    // Cancel all queued executions
    const queuedIds = Array.from(this.executionQueue.keys());
    if (queuedIds.length > 0) {
      await this.cancelMany(queuedIds);
    }

    // Remove all listeners
    this.removeAllListeners();

    console.log('ExecutionOrchestrator cleanup completed');
  }

  // Private methods

  private initializeDefaultStrategies(): void {
    // Sequential strategy
    this.strategies.set('sequential', {
      type: 'sequential',
      name: 'Sequential Execution',
      description: 'Execute agents one after another',
      config: {},
      selector: () => true,
      executor: async (requests) => {
        const results: AgentExecutionResult[] = [];
        for (const request of requests) {
          const result = await agentExecutor.execute(request);
          results.push(result);
        }
        return results;
      }
    });

    // Parallel strategy
    this.strategies.set('parallel', {
      type: 'parallel',
      name: 'Parallel Execution',
      description: 'Execute agents concurrently',
      config: { maxConcurrency: this.config.concurrencyLimits.global },
      selector: () => true,
      executor: async (requests) => {
        const results = await Promise.allSettled(
          requests.map(request => agentExecutor.execute(request))
        );
        
        return results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            return {
              executionId: createId(),
              agentType: requests[index].agentType,
              status: 'failed' as const,
              result: '',
              cost: 0,
              duration: 0,
              usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
              logs: [],
              timestamp: new Date().toISOString(),
              error: result.reason.message
            };
          }
        });
      }
    });

    // Priority queue strategy
    this.strategies.set('priority_queue', {
      type: 'priority_queue',
      name: 'Priority Queue Execution',
      description: 'Execute agents based on priority',
      config: { priorityQueues: this.config.priorityQueues },
      selector: () => true,
      executor: async (requests) => {
        // Sort by priority and execute
        const sortedRequests = requests.sort((a, b) => {
          const priorityA = this.calculatePriority(a);
          const priorityB = this.calculatePriority(b);
          return priorityB - priorityA;
        });

        return this.strategies.get('sequential')!.executor(sortedRequests, {});
      }
    });

    // Add configured strategies
    this.config.executionStrategies.forEach(strategy => {
      this.strategies.set(strategy.type, strategy);
    });
  }

  private initializeQueueStats(): void {
    this.queueStats = {
      totalQueued: 0,
      highPriority: 0,
      normalPriority: 0,
      lowPriority: 0,
      averageWaitTime: 0,
      throughput: {
        lastHour: 0,
        lastDay: 0,
        total: 0
      }
    };
  }

  private startProcessing(): void {
    if (this.processingInterval) {
      return;
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(() => {
      if (!this.isPaused && !this.isShuttingDown) {
        this.processQueue().catch(error => {
          console.error('Queue processing error:', error);
        });
      }
    }, 1000);
  }

  private stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    this.isProcessing = false;
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('Health check error:', error);
      });
    }, this.config.healthCheckIntervalMs);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  private async processQueue(): Promise<void> {
    if (this.executionQueue.size === 0) {
      return;
    }

    // Check if we can execute more
    const activeExecutions = agentExecutor.getActiveExecutions();
    if (activeExecutions.length >= this.config.concurrencyLimits.global) {
      return;
    }

    // Get next batch to execute
    const batch = this.getNextBatch();
    if (batch.length === 0) {
      return;
    }

    // Execute batch using current strategy
    const strategy = this.strategies.get(this.currentStrategy);
    if (!strategy) {
      throw new FrameworkError(`Strategy not found: ${this.currentStrategy}`, 'ExecutionOrchestrator', 'processQueue');
    }

    try {
      // Remove from queue
      batch.forEach(execution => {
        this.executionQueue.delete(execution.id);
        
        this.emit('execution:dequeued', {
          executionId: execution.id,
          waitTime: Date.now() - execution.queuedAt.getTime()
        });
      });

      this.updateQueueStats();

      // Execute the batch
      const requests = batch.map(e => e.request);
      await strategy.executor(requests, strategy.config);

    } catch (error) {
      console.error('Batch execution error:', error);
      
      // Re-queue failed executions if not shutting down
      if (!this.isShuttingDown) {
        batch.forEach(execution => {
          this.executionQueue.set(execution.id, execution);
        });
        this.updateQueueStats();
      }
    }
  }

  private getNextBatch(): QueuedExecution[] {
    const availableSlots = this.config.concurrencyLimits.global - agentExecutor.getActiveExecutions().length;
    if (availableSlots <= 0) {
      return [];
    }

    // Get sorted queue
    const sortedQueue = this.getQueue();
    
    // Apply strategy-specific selection
    const strategy = this.strategies.get(this.currentStrategy);
    if (!strategy) {
      return [];
    }

    // For now, just take the top N by priority
    return sortedQueue.slice(0, Math.min(availableSlots, 3)); // Batch size of 3
  }

  private calculatePriority(request: AgentExecutionRequest): number {
    // Default priority calculation
    let priority = this.config.priorityQueues.normal;

    // Adjust based on agent type
    if (request.agentType === 'system-health') {
      priority = this.config.priorityQueues.high;
    }

    // Adjust based on estimated cost (lower cost = higher priority for resource efficiency)
    if (request.estimatedCost < 0.01) {
      priority += 100;
    } else if (request.estimatedCost > 0.1) {
      priority -= 100;
    }

    return Math.max(0, priority);
  }

  private getQueuePosition(executionId: string): number {
    const sortedQueue = this.getQueue();
    return sortedQueue.findIndex(e => e.id === executionId) + 1;
  }

  private estimateStartTime(priority: number): Date {
    const queueSize = this.executionQueue.size;
    const avgExecutionTime = 60000; // 1 minute default
    const estimatedWaitMs = (queueSize * avgExecutionTime) / this.config.concurrencyLimits.global;
    
    // Higher priority executions start sooner
    const priorityFactor = priority / this.config.priorityQueues.high;
    const adjustedWaitMs = estimatedWaitMs / Math.max(priorityFactor, 0.1);
    
    return new Date(Date.now() + adjustedWaitMs);
  }

  private getMaxQueueSize(): number {
    return this.config.concurrencyLimits.global * 50; // 50x the concurrent limit
  }

  private updateQueueStats(): void {
    let highPriority = 0;
    let normalPriority = 0;
    let lowPriority = 0;
    let totalWaitTime = 0;
    let oldestQueuedAt: Date | undefined;

    const now = Date.now();

    for (const execution of this.executionQueue.values()) {
      const waitTime = now - execution.queuedAt.getTime();
      totalWaitTime += waitTime;

      if (!oldestQueuedAt || execution.queuedAt < oldestQueuedAt) {
        oldestQueuedAt = execution.queuedAt;
      }

      if (execution.priority >= this.config.priorityQueues.high) {
        highPriority++;
      } else if (execution.priority >= this.config.priorityQueues.normal) {
        normalPriority++;
      } else {
        lowPriority++;
      }
    }

    this.queueStats = {
      totalQueued: this.executionQueue.size,
      highPriority,
      normalPriority,
      lowPriority,
      averageWaitTime: this.executionQueue.size > 0 ? totalWaitTime / this.executionQueue.size : 0,
      oldestQueuedAt,
      throughput: {
        ...this.queueStats.throughput, // Keep existing throughput data
        total: this.queueStats.throughput.total
      }
    };
  }

  private async performHealthCheck(): Promise<void> {
    const queueSize = this.executionQueue.size;
    const maxQueueSize = this.getMaxQueueSize();
    
    // Check for queue backpressure
    if (queueSize > maxQueueSize * 0.8) {
      this.emit('queue:backpressure', {
        queueSize,
        threshold: maxQueueSize * 0.8
      });
    }

    // Check for stalled queue
    const oldestExecution = this.queueStats.oldestQueuedAt;
    if (oldestExecution && Date.now() - oldestExecution.getTime() > 300000) { // 5 minutes
      this.emit('queue:stalled', {
        oldestAge: Date.now() - oldestExecution.getTime(),
        queueSize
      });
    }

    // Emit health status
    this.emit('orchestrator:health', {
      status: queueSize < maxQueueSize * 0.9 ? 'healthy' : 'degraded',
      queueSize,
      maxQueueSize,
      activeExecutions: agentExecutor.getActiveExecutions().length,
      maxConcurrentExecutions: this.config.concurrencyLimits.global
    });
  }

  private async logExecution(message: string, level: 'info' | 'warn' | 'error'): Promise<void> {
    // In a real implementation, this would log to the execution tracking system
    console.log(`[ExecutionOrchestrator] ${level.toUpperCase()}: ${message}`);
  }
}

// Export singleton instance
export const executionOrchestrator = new ExecutionOrchestrator();