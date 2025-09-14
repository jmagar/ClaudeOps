// import { query, Query, SDKUserMessage } from '@anthropic/claude-code-sdk';
type Query = Record<string, any>; // Placeholder type
type SDKUserMessage = Record<string, any>; // Placeholder type
const query = {} as any; // Placeholder function
import { 
  AgentExecutionRequest, 
  AgentExecutionResult, 
  SequentialResult, 
  ConcurrentResult,
  AgentResult,
  StreamingController,
  ProcessResult,
  ExecutionEvent,
  AgentType
} from '../types/claude';
import { SDKConfigFactory } from './configFactory';
import { CostMonitoringService, BudgetManager } from './costTracker';
import { ErrorHandler, RetryableExecutor, CircuitBreaker } from './errorHandler';
import { dbConnection } from '../db/connection';
import { executions, executionSteps } from '../db/schema';
import { eq } from 'drizzle-orm';
import { EventEmitter } from 'events';

/**
 * Main execution wrapper that orchestrates agent execution
 */
export class AgentExecutionWrapper {
  private eventEmitter = new EventEmitter();

  constructor(
    private costTracker: CostMonitoringService,
    private budgetManager: BudgetManager,
    private retryExecutor: RetryableExecutor,
    private circuitBreaker: CircuitBreaker
  ) {}

  /**
   * Execute a single agent with comprehensive error handling and monitoring
   */
  async executeAgent(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();

    // Create execution record
    await this.createExecutionRecord(executionId, request);

    try {
      // Pre-execution checks
      const canExecute = await this.budgetManager.canExecute(request.estimatedCost);
      if (!canExecute) {
        throw new Error('Budget limit would be exceeded');
      }

      // Emit execution started event
      this.emitExecutionEvent('started', executionId, { request });

      // Execute through circuit breaker and retry logic
      const result = await this.circuitBreaker.execute(() =>
        this.retryExecutor.executeWithRetry(() =>
          this.executeAgentInternal(executionId, request),
          `agent-${request.agentType}`
        )
      );

      // Update execution record with success
      await this.updateExecutionRecord(executionId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: result.result,
        cost: result.cost,
        duration: result.duration
      });

      // Emit completion event
      this.emitExecutionEvent('completed', executionId, result);

      return result;

    } catch (error) {
      const enhancedError = await ErrorHandler.handleError(error as Error, {
        executionId,
        agentType: request.agentType
      });

      // Update execution record with failure
      await this.updateExecutionRecord(executionId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        result: enhancedError.message
      });

      // Emit failure event
      this.emitExecutionEvent('failed', executionId, { 
        error: enhancedError.message,
        category: enhancedError.category
      });

      // Re-throw the enhanced error
      throw enhancedError;
    }
  }

  /**
   * Internal agent execution logic
   */
  private async executeAgentInternal(
    executionId: string,
    request: AgentExecutionRequest
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();

    // Create SDK configuration
    const config = SDKConfigFactory.createForAgent(request.agentType, {
      ...request.overrides,
      cwd: request.workingDirectory || process.cwd()
    });

    // Create query
    const queryInstance = query({
      prompt: request.prompt,
      options: config
    });

    // Track cost in parallel
    const costTrackingPromise = this.costTracker.trackExecution(executionId, queryInstance);

    // Process results
    const logs: string[] = [];
    let finalResult = '';
    let finalStatus: 'completed' | 'failed' = 'completed';
    let usage: any;
    let cost = 0;
    let duration = 0;

    try {
      let stepNumber = 1;
      
      for await (const message of queryInstance) {
        switch (message.type) {
          case 'assistant':
            const content = message.message.content[0];
            if (content.type === 'text') {
              finalResult += content.text + '\n';
              logs.push(`Assistant: ${content.text}`);
              
              // Store step
              await this.createExecutionStep(executionId, stepNumber++, 'assistant_message', {
                content: content.text
              });
            }
            
            // Emit progress event
            this.emitExecutionEvent('progress', executionId, {
              step: stepNumber - 1,
              type: 'assistant_message'
            });
            break;

          case 'result':
            // Handle different result subtypes
            if (message.subtype === 'success') {
              finalResult = message.result;
              finalStatus = 'completed';
            } else {
              // Handle error subtypes: 'error_max_turns' | 'error_during_execution'
              finalResult = `Execution failed: ${message.subtype}`;
              finalStatus = 'failed';
            }

            cost = message.total_cost_usd;
            duration = message.duration_ms || Date.now() - startTime;
            usage = message.usage;

            // Store final step
            await this.createExecutionStep(executionId, stepNumber, 'result', {
              subtype: message.subtype,
              cost,
              duration,
              usage
            });

            break;

          case 'stream_event':
            // Handle streaming events
            logs.push(`Stream: ${JSON.stringify(message.event)}`);
            
            // Emit log event
            this.emitExecutionEvent('log', executionId, {
              message: JSON.stringify(message.event)
            });
            break;

          default:
            logs.push(`Unknown message type: ${message.type}`);
        }
      }

      // Wait for cost tracking to complete
      await costTrackingPromise;

      const result: AgentExecutionResult = {
        executionId,
        agentType: request.agentType,
        status: finalStatus,
        result: finalResult.trim(),
        cost,
        duration,
        usage,
        logs,
        timestamp: new Date().toISOString()
      };

      if (finalStatus === 'failed') {
        result.error = finalResult;
      }

      return result;

    } catch (processingError) {
      // If there's an error during message processing, still try to get cost data
      try {
        await costTrackingPromise;
      } catch (costError) {
        console.warn('Cost tracking failed:', costError);
      }

      throw processingError;
    }
  }

  /**
   * Execute multiple agents sequentially with context passing
   */
  async executeSequential(
    agents: Array<{ type: string; prompt: string }>,
    executionId?: string
  ): Promise<SequentialResult> {
    const mainExecutionId = executionId || this.generateExecutionId();
    const results: AgentResult[] = [];
    let aggregatedContext = '';

    for (let index = 0; index < agents.length; index++) {
      const agent = agents[index];
      try {
        // Pre-execution budget check
        const estimatedCost = SDKConfigFactory.getEstimatedCost(agent.type as AgentType);
        const canExecute = await this.budgetManager.canExecute(estimatedCost);
        
        if (!canExecute) {
          throw new Error('Budget limit would be exceeded');
        }

        // Create context-aware prompt
        const contextualPrompt = this.buildContextualPrompt(
          agent.prompt,
          aggregatedContext,
          results
        );

        // Execute agent
        const request: AgentExecutionRequest = {
          agentType: agent.type,
          prompt: contextualPrompt,
          estimatedCost
        };

        const result = await this.executeAgent(request);
        
        const agentResult: AgentResult = {
          executionId: result.executionId,
          agentType: result.agentType,
          success: result.status === 'completed',
          cost: result.cost,
          duration: result.duration,
          summary: this.extractSummary(result.result),
          critical: false, // Could be determined by result analysis
          error: result.error
        };

        results.push(agentResult);
        aggregatedContext += `\n${agent.type} result: ${agentResult.summary}`;

      } catch (error) {
        // Handle execution error
        const errorResult: AgentResult = {
          executionId: `${mainExecutionId}-${index}-error`,
          agentType: agent.type,
          success: false,
          cost: 0,
          duration: 0,
          summary: (error as Error).message,
          critical: this.isErrorCritical(error as Error),
          error: (error as Error).message
        };

        results.push(errorResult);

        // Decide whether to continue sequence
        if (errorResult.critical) {
          break;
        }
      }
    }

    return {
      executionId: mainExecutionId,
      results,
      totalCost: results.reduce((sum, r) => sum + r.cost, 0),
      success: results.every(r => r.success),
      aggregatedSummary: this.generateAggregatedSummary(results)
    };
  }

  /**
   * Execute multiple agents concurrently with resource limits
   */
  async executeConcurrent(
    agents: Array<{ type: string; prompt: string }>,
    maxConcurrency: number = 3
  ): Promise<ConcurrentResult> {
    const executionId = this.generateExecutionId();
    
    // Semaphore pattern for concurrency control
    const semaphore = new Semaphore(maxConcurrency);

    const executionPromises = agents.map(async (agent, index) => {
      await semaphore.acquire();

      try {
        const subExecutionId = `${executionId}-concurrent-${index}`;
        const estimatedCost = SDKConfigFactory.getEstimatedCost(agent.type as AgentType);

        const request: AgentExecutionRequest = {
          agentType: agent.type,
          prompt: agent.prompt,
          estimatedCost
        };

        const result = await this.executeAgent(request);
        
        return {
          executionId: result.executionId,
          agentType: result.agentType,
          success: result.status === 'completed',
          cost: result.cost,
          duration: result.duration,
          summary: this.extractSummary(result.result),
          critical: false,
          error: result.error
        } as AgentResult;

      } finally {
        semaphore.release();
      }
    });

    // Wait for all executions with timeout
    const results = await Promise.allSettled(
      executionPromises.map(p => 
        this.withTimeout(p, 300000) // 5 minute timeout
      )
    );

    return this.aggregateConcurrentResults(results, executionId);
  }

  /**
   * Create streaming execution controller
   */
  createStreamingController(agentType: string): StreamingController {
    const messageQueue: SDKUserMessage[] = [];
    let currentQuery: Query | null = null;
    let sessionId = this.generateExecutionId();

    const controller: StreamingController = {
      async interrupt(): Promise<void> {
        if (currentQuery) {
          await currentQuery.interrupt();
        }
      },

      async setPermissionMode(mode) {
        if (currentQuery) {
          await currentQuery.setPermissionMode(mode);
        }
      },

      async addMessage(text: string): Promise<void> {
        messageQueue.push({
          type: 'user',
          session_id: sessionId,
          message: {
            role: 'user',
            content: [{ type: 'text', text }]
          },
          parent_tool_use_id: null
        });

        // If no active query, start one
        if (!currentQuery) {
          const config = SDKConfigFactory.createStreamingConfig(agentType as AgentType);
          // Note: Streaming implementation would require proper async generator setup
          // For now, this is a placeholder for the streaming functionality
        }
      }
    };

    return controller;
  }

  /**
   * Subscribe to execution events
   */
  onExecutionEvent(
    event: 'started' | 'progress' | 'completed' | 'failed' | 'log',
    callback: (data: ExecutionEvent) => void
  ): () => void {
    this.eventEmitter.on(event, callback);
    return () => this.eventEmitter.off(event, callback);
  }

  // Private helper methods

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async createExecutionRecord(
    executionId: string,
    request: AgentExecutionRequest
  ): Promise<void> {
    try {
      const db = dbConnection.getDb();
      
      await db
        .insert(executions)
        .values({
          id: executionId,
          agentType: request.agentType,
          status: 'running',
          startedAt: new Date().toISOString(),
          triggeredBy: 'manual'
        })
        .run();
    } catch (error) {
      console.error('Failed to create execution record:', error);
      throw error;
    }
  }

  private async updateExecutionRecord(
    executionId: string,
    updates: {
      status?: string;
      completedAt?: string;
      result?: string;
      cost?: number;
      duration?: number;
    }
  ): Promise<void> {
    try {
      const db = dbConnection.getDb();
      
      await db
        .update(executions)
        .set({
          status: updates.status,
          completedAt: updates.completedAt,
          resultSummary: updates.result,
          costUsd: updates.cost,
          durationMs: updates.duration,
          updatedAt: new Date().toISOString()
        })
        .where(eq(executions.id, executionId))
        .run();
    } catch (error) {
      console.error('Failed to update execution record:', error);
      throw error;
    }
  }

  private async createExecutionStep(
    executionId: string,
    stepNumber: number,
    stepType: string,
    data: any
  ): Promise<void> {
    try {
      const db = dbConnection.getDb();
      
      await db
        .insert(executionSteps)
        .values({
          executionId,
          stepNumber,
          stepName: stepType,
          stepType,
          status: 'completed',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          output: JSON.stringify(data)
        })
        .run();
    } catch (error) {
      console.error('Failed to create execution step:', error);
      // Don't throw here - step logging is not critical
    }
  }

  private emitExecutionEvent(
    type: 'started' | 'progress' | 'completed' | 'failed' | 'log',
    executionId: string,
    data: any
  ): void {
    const event: ExecutionEvent = {
      type,
      executionId,
      timestamp: new Date().toISOString(),
      data
    };

    this.eventEmitter.emit(type, event);
  }

  private buildContextualPrompt(
    basePrompt: string,
    context: string,
    previousResults: AgentResult[]
  ): string {
    if (previousResults.length === 0) {
      return basePrompt;
    }

    return `
Previous agent outputs:
${context}

Current task: ${basePrompt}

Please consider the previous outputs when performing this task and build upon any relevant findings.
`;
  }

  private extractSummary(result: string): string {
    // Extract first paragraph or truncate to reasonable length
    const lines = result.split('\n').filter(line => line.trim());
    const summary = lines[0] || result;
    
    return summary.length > 200 ? summary.substring(0, 200) + '...' : summary;
  }

  private isErrorCritical(error: Error): boolean {
    const criticalKeywords = ['authentication', 'permission', 'budget', 'fatal'];
    return criticalKeywords.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }

  private generateAggregatedSummary(results: AgentResult[]): string {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    let summary = `Executed ${results.length} agents: ${successful.length} successful, ${failed.length} failed.\n`;
    
    if (successful.length > 0) {
      summary += `\nSuccessful executions:\n`;
      successful.forEach(r => {
        summary += `- ${r.agentType}: ${r.summary}\n`;
      });
    }
    
    if (failed.length > 0) {
      summary += `\nFailed executions:\n`;
      failed.forEach(r => {
        summary += `- ${r.agentType}: ${r.error}\n`;
      });
    }
    
    return summary;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private aggregateConcurrentResults(
    results: PromiseSettledResult<AgentResult>[],
    executionId: string
  ): ConcurrentResult {
    let successCount = 0;
    let failureCount = 0;
    let totalCost = 0;

    const processedResults = results.map(result => {
      if (result.status === 'fulfilled') {
        successCount++;
        totalCost += result.value.cost;
        return {
          status: 'fulfilled' as const,
          value: result.value
        };
      } else {
        failureCount++;
        return {
          status: 'rejected' as const,
          reason: result.reason
        };
      }
    });

    return {
      executionId,
      results: processedResults,
      totalCost,
      successCount,
      failureCount
    };
  }

  private async* createMessageStream(
    messageQueue: SDKUserMessage[]
  ): AsyncGenerator<SDKUserMessage> {
    while (messageQueue.length > 0) {
      const message = messageQueue.shift();
      if (message) {
        yield message;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async processStreamingMessages(
    queryInstance: Query,
    sessionId: string
  ): Promise<void> {
    try {
      for await (const message of queryInstance) {
        this.emitExecutionEvent('log', sessionId, {
          type: message.type,
          content: message
        });
      }
    } catch (error) {
      this.emitExecutionEvent('failed', sessionId, { error: (error as Error).message });
    }
  }
}

/**
 * Semaphore implementation for concurrency control
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}