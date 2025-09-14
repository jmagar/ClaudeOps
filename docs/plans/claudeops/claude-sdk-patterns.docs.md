# Claude Code TypeScript SDK Integration Patterns

## Overview

This document provides comprehensive research on Claude Code TypeScript SDK integration patterns for building robust AI agent execution systems. It covers initialization, cost tracking, orchestration patterns, error handling, and local process execution strategies.

## SDK Initialization and Configuration

### Basic Setup

```typescript
import { 
  query, 
  Options, 
  Query,
  NonNullableUsage,
  SDKResultMessage,
  tool,
  createSdkMcpServer,
  CanUseTool,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  ToolInput,
  ToolOutput,
  SDKUserMessage,
  HookEvent,
  HookCallbackMatcher,
  HookJSONOutput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  NotificationHookInput,
  CallToolResult
} from '@anthropic/claude-code-sdk';

// Basic configuration
const options: Options = {
  model: 'claude-3-5-sonnet-20241022',
  cwd: process.cwd(),
  permissionMode: 'acceptEdits',
  maxTurns: 10,
  maxThinkingTokens: 10000,
  executableArgs: ['--no-warnings'],
  env: process.env
};

// Initialize query
const result = query({
  prompt: 'Analyze system health',
  options
});
```

### Advanced Configuration Patterns

```typescript
// Environment-specific configuration
interface AgentConfig {
  baseOptions: Options;
  costThresholds: {
    warning: number;
    critical: number;
  };
  retryPolicy: {
    maxAttempts: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

class ClaudeSDKManager {
  private config: AgentConfig;
  
  constructor(config: AgentConfig) {
    this.config = config;
  }
  
  createQuery(prompt: string, overrides?: Partial<Options>) {
    return query({
      prompt,
      options: {
        ...this.config.baseOptions,
        ...overrides,
        hooks: {
          PreToolUse: [{
            matcher: '',
            hooks: [this.preToolUseHook.bind(this)]
          }],
          PostToolUse: [{
            matcher: '',
            hooks: [this.postToolUseHook.bind(this)]
          }],
          SessionEnd: [{
            matcher: '',
            hooks: [this.sessionEndHook.bind(this)]
          }]
        }
      }
    });
  }
}
```

### Configuration Factory Pattern

```typescript
export class SDKConfigFactory {
  static createForAgent(agentType: string): Options {
    const baseConfig: Options = {
      model: 'claude-3-5-sonnet-20241022',
      permissionMode: 'acceptEdits',
      cwd: process.cwd(),
      env: process.env
    };
    
    switch (agentType) {
      case 'system-health':
        return {
          ...baseConfig,
          allowedTools: ['Bash', 'Read', 'Grep', 'LS'],
          maxTurns: 15,
          appendSystemPrompt: 'You are a system health monitoring specialist.'
        };
        
      case 'docker-janitor':
        return {
          ...baseConfig,
          allowedTools: ['Bash', 'Read'],
          maxTurns: 10,
          appendSystemPrompt: 'You are a Docker cleanup specialist.'
        };
        
      case 'backup-validator':
        return {
          ...baseConfig,
          allowedTools: ['Bash', 'Read', 'LS'],
          maxTurns: 8,
          appendSystemPrompt: 'You are a backup validation expert.'
        };
        
      default:
        return baseConfig;
    }
  }
}
```

## Streaming Mode and Query Control

### Understanding Query Methods

The `Query` object returned by `query()` provides `interrupt()` and `setPermissionMode()` methods that are **only available when using streaming input mode** with `AsyncIterable<SDKUserMessage>`.

### Streaming Mode Setup

```typescript
import { SDKUserMessage } from '@anthropic/claude-code-sdk';

// Correct usage with streaming input
async function* createMessageStream(): AsyncGenerator<SDKUserMessage> {
  yield {
    type: 'user',
    session_id: 'session-123',
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'Initial prompt' }]
    },
    parent_tool_use_id: null
  };
  
  // Can yield more messages dynamically
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  yield {
    type: 'user', 
    session_id: 'session-123',
    message: {
      role: 'user',
      content: [{ type: 'text', text: 'Follow-up instruction' }]
    },
    parent_tool_use_id: null
  };
}

// Create query with streaming input
const streamingQuery = query({
  prompt: createMessageStream(),
  options: {
    model: 'claude-3-5-sonnet-20241022',
    permissionMode: 'acceptEdits'
  }
});

// Now these methods are available
await streamingQuery.interrupt();
await streamingQuery.setPermissionMode('bypassPermissions');
```

### String Prompt Limitations

```typescript
// INCORRECT - Methods not available with string prompts
const stringQuery = query({
  prompt: 'Analyze system logs',
  options: { model: 'claude-3-5-sonnet-20241022' }
});

// These will throw runtime errors:
// await stringQuery.interrupt(); // Error: Method only available in streaming mode
// await stringQuery.setPermissionMode('plan'); // Error: Method only available in streaming mode
```

### Dynamic Control Pattern

```typescript
class InteractiveAgentController {
  private messageQueue: SDKUserMessage[] = [];
  private currentQuery: Query | null = null;
  
  async startInteractiveSession(): Promise<void> {
    const messageStream = this.createMessageStream();
    
    this.currentQuery = query({
      prompt: messageStream,
      options: {
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'default'
      }
    });
    
    // Process messages
    for await (const message of this.currentQuery) {
      if (message.type === 'assistant') {
        console.log('Assistant:', message.message.content);
      }
    }
  }
  
  async addMessage(text: string): Promise<void> {
    this.messageQueue.push({
      type: 'user',
      session_id: 'interactive-session',
      message: {
        role: 'user',
        content: [{ type: 'text', text }]
      },
      parent_tool_use_id: null
    });
  }
  
  async interrupt(): Promise<void> {
    if (this.currentQuery) {
      await this.currentQuery.interrupt();
    }
  }
  
  async changePermissionMode(mode: PermissionMode): Promise<void> {
    if (this.currentQuery) {
      await this.currentQuery.setPermissionMode(mode);
    }
  }
  
  private async* createMessageStream(): AsyncGenerator<SDKUserMessage> {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        yield message;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
```

## Cost Tracking Implementation

### Real-time Cost Monitoring

```typescript
interface CostTracker {
  totalCost: number;
  monthlyCost: number;
  executionCosts: Map<string, number>;
  tokenUsage: Map<string, NonNullableUsage>;
}

class CostMonitoringService {
  private costTracker: CostTracker = {
    totalCost: 0,
    monthlyCost: 0,
    executionCosts: new Map(),
    tokenUsage: new Map()
  };
  
  private listeners: Set<(cost: CostTracker) => void> = new Set();
  
  async trackExecution(executionId: string, queryResult: Query): Promise<void> {
    for await (const message of queryResult) {
      if (message.type === 'result') {
        const cost = message.total_cost_usd;
        const usage = message.usage;
        
        // Update tracking
        this.costTracker.totalCost += cost;
        this.costTracker.monthlyCost += cost;
        this.costTracker.executionCosts.set(executionId, cost);
        this.costTracker.tokenUsage.set(executionId, usage);
        
        // Notify listeners
        this.notifyListeners();
        
        // Store in database - only successful executions have duration available
        await this.persistCostData(executionId, cost, usage, message.duration_ms);
        
        break;
      }
    }
  }
  
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener({ ...this.costTracker });
      } catch (error) {
        console.error('Cost listener error:', error);
      }
    });
  }
  
  onCostUpdate(callback: (cost: CostTracker) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  private async persistCostData(
    executionId: string, 
    cost: number, 
    usage: NonNullableUsage, 
    duration: number
  ): Promise<void> {
    // Database persistence logic
    await db.insert(costMetrics).values({
      executionId,
      cost,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens,
      cacheReadTokens: usage.cache_read_input_tokens,
      duration,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Budget Management

```typescript
interface BudgetConfig {
  monthlyLimit: number;
  warningThreshold: number; // percentage of monthly limit
  criticalThreshold: number; // percentage of monthly limit
}

class BudgetManager {
  constructor(
    private config: BudgetConfig,
    private costTracker: CostMonitoringService
  ) {
    this.costTracker.onCostUpdate(this.checkBudgetThresholds.bind(this));
  }
  
  private checkBudgetThresholds(costs: CostTracker): void {
    const percentage = (costs.monthlyCost / this.config.monthlyLimit) * 100;
    
    if (percentage >= this.config.criticalThreshold) {
      this.triggerBudgetAlert('critical', costs.monthlyCost, percentage);
    } else if (percentage >= this.config.warningThreshold) {
      this.triggerBudgetAlert('warning', costs.monthlyCost, percentage);
    }
  }
  
  private triggerBudgetAlert(
    level: 'warning' | 'critical', 
    currentCost: number, 
    percentage: number
  ): void {
    const alert = {
      level,
      currentCost,
      budgetLimit: this.config.monthlyLimit,
      percentage,
      timestamp: new Date().toISOString()
    };
    
    // Emit alert event
    eventEmitter.emit('budget-alert', alert);
    
    // Log alert
    console.warn(`Budget ${level}: ${percentage.toFixed(1)}% of monthly limit used`);
  }
  
  canExecute(estimatedCost: number): boolean {
    const projectedTotal = this.costTracker.monthlyCost + estimatedCost;
    return projectedTotal <= this.config.monthlyLimit;
  }
}
```

## Agent Execution Orchestration

### Sequential Execution Pattern

```typescript
class SequentialAgentOrchestrator {
  constructor(
    private sdkManager: ClaudeSDKManager,
    private costTracker: CostMonitoringService
  ) {}
  
  async executeSequence(
    agents: Array<{ type: string; prompt: string }>,
    executionId: string
  ): Promise<SequentialResult> {
    const results: AgentResult[] = [];
    let aggregatedContext = '';
    
    for (const [index, agent] of agents.entries()) {
      try {
        // Pre-execution cost check
        if (!this.budgetManager.canExecute(0.10)) {
          throw new Error('Budget limit would be exceeded');
        }
        
        // Create context-aware prompt
        const contextualPrompt = this.buildContextualPrompt(
          agent.prompt,
          aggregatedContext,
          results
        );
        
        // Execute agent
        const query = this.sdkManager.createQuery(contextualPrompt, {
          ...SDKConfigFactory.createForAgent(agent.type),
          resume: index > 0 ? executionId : undefined
        });
        
        // Track execution
        const executionPromise = this.trackExecution(query, `${executionId}-${index}`);
        const result = await executionPromise;
        
        results.push(result);
        aggregatedContext += `\n${agent.type} result: ${result.summary}`;
        
      } catch (error) {
        // Handle execution error
        const errorResult = this.handleExecutionError(error, agent.type, index);
        results.push(errorResult);
        
        // Decide whether to continue sequence
        if (errorResult.critical) {
          break;
        }
      }
    }
    
    return {
      executionId,
      results,
      totalCost: results.reduce((sum, r) => sum + r.cost, 0),
      success: results.every(r => r.success),
      aggregatedSummary: this.generateAggregatedSummary(results)
    };
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
}
```

### Concurrent Execution Pattern

```typescript
class ConcurrentAgentOrchestrator {
  constructor(
    private sdkManager: ClaudeSDKManager,
    private costTracker: CostMonitoringService,
    private maxConcurrency: number = 3
  ) {}
  
  async executeConcurrent(
    agents: Array<{ type: string; prompt: string }>,
    executionId: string
  ): Promise<ConcurrentResult> {
    // Semaphore pattern for concurrency control
    const semaphore = new Semaphore(this.maxConcurrency);
    
    const executionPromises = agents.map(async (agent, index) => {
      await semaphore.acquire();
      
      try {
        const subExecutionId = `${executionId}-concurrent-${index}`;
        
        const query = this.sdkManager.createQuery(agent.prompt, {
          ...SDKConfigFactory.createForAgent(agent.type),
          abortController: new AbortController()
        });
        
        return await this.trackExecution(query, subExecutionId);
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
  
  private async withTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), timeoutMs);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }
}

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
```

### Circuit Breaker Pattern

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
}

class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
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
}
```

## Error Handling Patterns

### Exponential Backoff Retry Logic

```typescript
interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

class RetryableExecutor {
  constructor(private config: RetryConfig) {}
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string = 'operation'
  ): Promise<T> {
    let lastError: Error;
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
          `${context} failed (attempt ${attempt}/${this.config.maxAttempts}): ${error.message}. Retrying in ${delay}ms`
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

// Usage with Claude SDK
const retryableExecutor = new RetryableExecutor({
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: ['rate limit', 'timeout', 'network', 'temporary']
});

class RobustAgentExecutor {
  async executeAgent(prompt: string, options: Options): Promise<AgentResult> {
    return await retryableExecutor.executeWithRetry(async () => {
      const query = this.sdkManager.createQuery(prompt, options);
      return await this.processQueryResult(query);
    }, 'agent-execution');
  }
}
```

### Structured Error Handling

```typescript
enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  CLI = 'cli',
  CONFIGURATION = 'configuration',
  BUDGET = 'budget',
  AGENT_EXECUTION = 'agent_execution'
}

interface EnhancedError extends Error {
  category: ErrorCategory;
  retryable: boolean;
  resolution?: string;
  context?: Record<string, any>;
}

class ErrorHandler {
  static categorizeError(error: Error): EnhancedError {
    const message = error.message.toLowerCase();
    
    if (message.includes('rate limit') || message.includes('429')) {
      return {
        ...error,
        category: ErrorCategory.NETWORK,
        retryable: true,
        resolution: 'Wait and retry with exponential backoff'
      };
    }
    
    if (message.includes('unauthorized') || message.includes('401')) {
      return {
        ...error,
        category: ErrorCategory.AUTHENTICATION,
        retryable: false,
        resolution: 'Check Claude API key configuration'
      };
    }
    
    if (message.includes('permission') || message.includes('403')) {
      return {
        ...error,
        category: ErrorCategory.PERMISSION,
        retryable: false,
        resolution: 'Verify file permissions and tool access'
      };
    }
    
    if (message.includes('timeout')) {
      return {
        ...error,
        category: ErrorCategory.TIMEOUT,
        retryable: true,
        resolution: 'Increase timeout or optimize operation'
      };
    }
    
    if (message.includes('budget') || message.includes('cost limit')) {
      return {
        ...error,
        category: ErrorCategory.BUDGET,
        retryable: false,
        resolution: 'Increase budget limit or optimize agent efficiency'
      };
    }
    
    return {
      ...error,
      category: ErrorCategory.AGENT_EXECUTION,
      retryable: false,
      resolution: 'Check agent configuration and prompt validity'
    };
  }
  
  static async handleError(
    error: Error,
    context: { executionId: string; agentType: string }
  ): Promise<void> {
    const enhancedError = this.categorizeError(error);
    
    // Log structured error
    console.error('Agent execution error:', {
      executionId: context.executionId,
      agentType: context.agentType,
      category: enhancedError.category,
      message: enhancedError.message,
      retryable: enhancedError.retryable,
      resolution: enhancedError.resolution,
      stack: enhancedError.stack
    });
    
    // Store error in database
    await db.insert(executionErrors).values({
      executionId: context.executionId,
      agentType: context.agentType,
      category: enhancedError.category,
      message: enhancedError.message,
      retryable: enhancedError.retryable,
      resolution: enhancedError.resolution,
      timestamp: new Date().toISOString()
    });
    
    // Emit error event for real-time monitoring
    eventEmitter.emit('agent-error', {
      ...context,
      error: enhancedError
    });
  }
}
```

## Integration with Local Process Execution

### Process Manager

```typescript
interface ProcessConfig {
  timeout: number;
  maxMemory: number;
  workingDirectory: string;
  environment: Record<string, string>;
}

class LocalProcessManager {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  
  async executeAgent(
    agentScript: string,
    executionId: string,
    config: ProcessConfig
  ): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const process = spawn('node', [agentScript], {
        cwd: config.workingDirectory,
        env: { ...process.env, ...config.environment },
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      this.activeProcesses.set(executionId, process);
      
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
        this.emitProcessOutput(executionId, 'stdout', data.toString());
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
        this.emitProcessOutput(executionId, 'stderr', data.toString());
      });
      
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Process timeout after ${config.timeout}ms`));
      }, config.timeout);
      
      process.on('exit', (code, signal) => {
        clearTimeout(timeout);
        this.activeProcesses.delete(executionId);
        
        if (code === 0) {
          resolve({
            executionId,
            exitCode: code,
            stdout,
            stderr,
            duration: Date.now() - startTime
          });
        } else {
          reject(new Error(`Process exited with code ${code}, signal: ${signal}`));
        }
      });
    });
  }
  
  private emitProcessOutput(
    executionId: string, 
    stream: 'stdout' | 'stderr', 
    data: string
  ): void {
    eventEmitter.emit('process-output', {
      executionId,
      stream,
      data,
      timestamp: new Date().toISOString()
    });
  }
  
  killProcess(executionId: string): boolean {
    const process = this.activeProcesses.get(executionId);
    if (process) {
      process.kill('SIGTERM');
      this.activeProcesses.delete(executionId);
      return true;
    }
    return false;
  }
}
```

### Resource Monitoring

```typescript
interface ResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskIO: number;
  networkIO: number;
}

class ResourceMonitor {
  private monitoring: Map<string, NodeJS.Timeout> = new Map();
  
  startMonitoring(executionId: string, pid: number): void {
    const interval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics(pid);
        
        eventEmitter.emit('resource-metrics', {
          executionId,
          metrics,
          timestamp: new Date().toISOString()
        });
        
        // Check resource limits
        this.checkResourceLimits(executionId, metrics);
        
      } catch (error) {
        console.error(`Resource monitoring error for ${executionId}:`, error);
        this.stopMonitoring(executionId);
      }
    }, 5000); // Monitor every 5 seconds
    
    this.monitoring.set(executionId, interval);
  }
  
  private async collectMetrics(pid: number): Promise<ResourceMetrics> {
    // Use pidusage or similar library to collect process metrics
    const usage = await pidusage(pid);
    
    return {
      cpuUsage: usage.cpu,
      memoryUsage: usage.memory,
      diskIO: usage.io || 0,
      networkIO: 0 // Would need additional monitoring
    };
  }
  
  private checkResourceLimits(
    executionId: string, 
    metrics: ResourceMetrics
  ): void {
    const limits = {
      maxMemory: 1024 * 1024 * 1024, // 1GB
      maxCpu: 80 // 80%
    };
    
    if (metrics.memoryUsage > limits.maxMemory) {
      eventEmitter.emit('resource-limit-exceeded', {
        executionId,
        resource: 'memory',
        current: metrics.memoryUsage,
        limit: limits.maxMemory
      });
    }
    
    if (metrics.cpuUsage > limits.maxCpu) {
      eventEmitter.emit('resource-limit-exceeded', {
        executionId,
        resource: 'cpu',
        current: metrics.cpuUsage,
        limit: limits.maxCpu
      });
    }
  }
  
  stopMonitoring(executionId: string): void {
    const interval = this.monitoring.get(executionId);
    if (interval) {
      clearInterval(interval);
      this.monitoring.delete(executionId);
    }
  }
}
```

## Complete Integration Example

```typescript
class AgentRunnerService {
  constructor(
    private sdkManager: ClaudeSDKManager,
    private costTracker: CostMonitoringService,
    private budgetManager: BudgetManager,
    private processManager: LocalProcessManager,
    private resourceMonitor: ResourceMonitor,
    private retryExecutor: RetryableExecutor,
    private circuitBreaker: CircuitBreaker
  ) {}
  
  async executeAgent(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Pre-execution checks
      if (!this.budgetManager.canExecute(request.estimatedCost)) {
        throw new Error('Budget limit would be exceeded');
      }
      
      // Execute through circuit breaker and retry logic
      const result = await this.circuitBreaker.execute(() =>
        this.retryExecutor.executeWithRetry(() =>
          this.executeAgentInternal(executionId, request),
          `agent-${request.agentType}`
        )
      );
      
      return result;
      
    } catch (error) {
      await ErrorHandler.handleError(error as Error, {
        executionId,
        agentType: request.agentType
      });
      
      throw error;
    }
  }
  
  private async executeAgentInternal(
    executionId: string,
    request: AgentExecutionRequest
  ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    
    // Create SDK query
    const query = this.sdkManager.createQuery(request.prompt, {
      ...SDKConfigFactory.createForAgent(request.agentType),
      cwd: request.workingDirectory || process.cwd()
    });
    
    // Track cost
    const costTrackingPromise = this.costTracker.trackExecution(executionId, query);
    
    // Process results
    const results: string[] = [];
    const logs: string[] = [];
    
    for await (const message of query) {
      switch (message.type) {
        case 'assistant':
          const content = message.message.content[0];
          if (content.type === 'text') {
            results.push(content.text);
          }
          break;
          
        case 'result':
          // Handle different result subtypes
          let result: string;
          let status: 'completed' | 'failed';
          
          if (message.subtype === 'success') {
            result = message.result;
            status = 'completed';
          } else {
            // Handle error subtypes: 'error_max_turns' | 'error_during_execution'
            result = `Execution failed: ${message.subtype}`;
            status = 'failed';
          }
          
          const finalResult: AgentExecutionResult = {
            executionId,
            agentType: request.agentType,
            status,
            result,
            cost: message.total_cost_usd,
            duration: message.duration_ms,
            usage: message.usage,
            logs,
            timestamp: new Date().toISOString()
          };
          
          // Wait for cost tracking to complete
          await costTrackingPromise;
          
          return finalResult;
          
        case 'stream_event':
          // Handle streaming events if needed
          logs.push(`Stream: ${JSON.stringify(message.event)}`);
          break;
      }
    }
    
    throw new Error('Agent execution completed without result message');
  }
}

// Usage example
const agentRunner = new AgentRunnerService(
  sdkManager,
  costTracker,
  budgetManager,
  processManager,
  resourceMonitor,
  retryExecutor,
  circuitBreaker
);

const result = await agentRunner.executeAgent({
  agentType: 'system-health',
  prompt: 'Analyze system health and provide recommendations',
  estimatedCost: 0.05,
  workingDirectory: '/opt/monitoring'
});
```

## Advanced SDK Features

### MCP Server Integration

Create custom MCP servers to extend Claude's capabilities:

```typescript
import { createSdkMcpServer, tool, CallToolResult } from '@anthropic/claude-code-sdk';
import { z } from 'zod';

// Define custom tools
const databaseQueryTool = tool(
  'database_query',
  'Execute database queries and return results',
  {
    query: z.string().describe('SQL query to execute'),
    database: z.string().describe('Target database name')
  },
  async (args): Promise<CallToolResult> => {
    try {
      const result = await executeQuery(args.database, args.query);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text', 
          text: `Query failed: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

const systemMetricsTool = tool(
  'system_metrics',
  'Retrieve system performance metrics',
  {
    metric_type: z.enum(['cpu', 'memory', 'disk', 'network']),
    duration: z.number().optional().describe('Time range in minutes')
  },
  async (args): Promise<CallToolResult> => {
    const metrics = await collectMetrics(args.metric_type, args.duration);
    return {
      content: [{
        type: 'text',
        text: `${args.metric_type} metrics: ${JSON.stringify(metrics)}`
      }]
    };
  }
);

// Create MCP server
const customMcpServer = createSdkMcpServer({
  name: 'homelab-tools',
  version: '1.0.0',
  tools: [databaseQueryTool, systemMetricsTool]
});

// Use in query configuration
const query = query({
  prompt: 'Check database performance and system metrics',
  options: {
    mcpServers: {
      'homelab-tools': customMcpServer
    }
  }
});
```

### Permission Callbacks

Implement custom permission control for fine-grained access:

```typescript
const customPermissionHandler: CanUseTool = async (
  toolName: string,
  input: ToolInput,
  options: { signal: AbortSignal; suggestions?: PermissionUpdate[] }
): Promise<PermissionResult> => {
  
  // Block dangerous operations
  if (toolName === 'Bash' && typeof input === 'object' && 'command' in input) {
    const command = input.command as string;
    
    if (command.includes('rm -rf') || command.includes('sudo')) {
      return {
        behavior: 'deny',
        message: 'Dangerous command blocked for safety',
        interrupt: false
      };
    }
    
    // Require confirmation for system modifications
    if (command.startsWith('systemctl') || command.includes('iptables')) {
      const confirmation = await promptUser(
        `Allow system modification: ${command}?`
      );
      
      if (!confirmation) {
        return {
          behavior: 'deny',
          message: 'System modification denied by user'
        };
      }
    }
  }
  
  // Allow file operations in specific directories
  if (toolName === 'Edit' && typeof input === 'object' && 'file_path' in input) {
    const filePath = input.file_path as string;
    const allowedPaths = ['/opt/homelab/', '/var/log/', '/tmp/'];
    
    if (!allowedPaths.some(path => filePath.startsWith(path))) {
      return {
        behavior: 'deny',
        message: `File operations only allowed in: ${allowedPaths.join(', ')}`
      };
    }
  }
  
  return {
    behavior: 'allow',
    updatedInput: input
  };
};

// Use custom permission handler
const secureQuery = query({
  prompt: 'Perform system maintenance tasks',
  options: {
    canUseTool: customPermissionHandler,
    permissionMode: 'default'
  }
});
```

### Session Management and Resumption

Implement persistent sessions for long-running operations:

```typescript
class PersistentAgentSession {
  private sessionStore: Map<string, SessionData> = new Map();
  
  async createSession(agentType: string): Promise<string> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2)}`;
    
    const sessionData: SessionData = {
      id: sessionId,
      agentType,
      created: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      context: {},
      cost: 0
    };
    
    this.sessionStore.set(sessionId, sessionData);
    await this.persistSession(sessionData);
    
    return sessionId;
  }
  
  async resumeSession(sessionId: string, prompt: string): Promise<Query> {
    const sessionData = this.sessionStore.get(sessionId) || await this.loadSession(sessionId);
    
    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Update last activity
    sessionData.lastActivity = new Date().toISOString();
    
    return query({
      prompt,
      options: {
        resume: sessionId,
        ...SDKConfigFactory.createForAgent(sessionData.agentType),
        hooks: {
          SessionEnd: [{
            matcher: '',
            hooks: [this.sessionEndHook.bind(this, sessionId)]
          }]
        }
      }
    });
  }
  
  private async sessionEndHook(
    sessionId: string,
    input: SessionEndHookInput
  ): Promise<HookJSONOutput> {
    const sessionData = this.sessionStore.get(sessionId);
    if (sessionData) {
      sessionData.lastActivity = new Date().toISOString();
      await this.persistSession(sessionData);
    }
    
    return { continue: true };
  }
  
  async getSessionHistory(sessionId: string): Promise<SessionData | null> {
    return this.sessionStore.get(sessionId) || await this.loadSession(sessionId);
  }
  
  private async persistSession(sessionData: SessionData): Promise<void> {
    // Store in database or file system
    await db.upsert('agent_sessions', sessionData);
  }
  
  private async loadSession(sessionId: string): Promise<SessionData | null> {
    return await db.findById('agent_sessions', sessionId);
  }
}

interface SessionData {
  id: string;
  agentType: string;
  created: string;
  lastActivity: string;
  context: Record<string, any>;
  cost: number;
}

// Usage example
const sessionManager = new PersistentAgentSession();

// Create new session
const sessionId = await sessionManager.createSession('system-health');

// Use session
let query = await sessionManager.resumeSession(sessionId, 'Check system status');

// Later, resume same session
query = await sessionManager.resumeSession(sessionId, 'Update system packages');
```

### Hook-Based Event Handling

Implement comprehensive event handling with hooks:

```typescript
class ComprehensiveHookHandler {
  private metrics: Map<string, any> = new Map();
  private notifications: Array<NotificationEvent> = [];
  
  createHooksConfiguration(): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
    return {
      PreToolUse: [{
        matcher: '',
        hooks: [this.preToolUseHook.bind(this)]
      }],
      PostToolUse: [{
        matcher: '',
        hooks: [this.postToolUseHook.bind(this)]
      }],
      SessionStart: [{
        matcher: '',
        hooks: [this.sessionStartHook.bind(this)]
      }],
      SessionEnd: [{
        matcher: '',
        hooks: [this.sessionEndHook.bind(this)]
      }],
      Notification: [{
        matcher: '',
        hooks: [this.notificationHook.bind(this)]
      }]
    };
  }
  
  private async preToolUseHook(
    input: PreToolUseHookInput,
    toolUseId: string | undefined,
    options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> {
    // Log tool usage
    console.log(`Starting tool: ${input.tool_name}`);
    
    // Record start time for performance tracking
    this.metrics.set(`tool_start_${toolUseId}`, Date.now());
    
    // Check resource limits
    if (input.tool_name === 'Bash' && await this.isSystemOverloaded()) {
      return {
        continue: false,
        stopReason: 'System overloaded, delaying execution',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: 'System resources exhausted'
        }
      };
    }
    
    return { continue: true };
  }
  
  private async postToolUseHook(
    input: PostToolUseHookInput,
    toolUseId: string | undefined,
    options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> {
    // Calculate execution time
    const startTime = this.metrics.get(`tool_start_${toolUseId}`);
    if (startTime) {
      const duration = Date.now() - startTime;
      console.log(`Tool ${input.tool_name} completed in ${duration}ms`);
      
      // Store performance metrics
      this.recordToolMetrics(input.tool_name, duration, input.tool_response);
    }
    
    return { continue: true };
  }
  
  private async sessionStartHook(
    input: SessionStartHookInput
  ): Promise<HookJSONOutput> {
    console.log(`Session started: ${input.session_id} (${input.source})`);
    
    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: `Session initialized in ${input.cwd}`
      }
    };
  }
  
  private async sessionEndHook(
    input: SessionEndHookInput
  ): Promise<HookJSONOutput> {
    console.log(`Session ended: ${input.session_id} (${input.reason})`);
    
    // Generate session summary
    await this.generateSessionSummary(input.session_id);
    
    return { continue: true };
  }
  
  private async notificationHook(
    input: NotificationHookInput
  ): Promise<HookJSONOutput> {
    this.notifications.push({
      timestamp: new Date().toISOString(),
      title: input.title,
      message: input.message,
      sessionId: input.session_id
    });
    
    // Send to external notification system
    await this.sendNotification(input.title, input.message);
    
    return { continue: true };
  }
  
  private async isSystemOverloaded(): Promise<boolean> {
    // Check system resources
    const usage = await this.getSystemUsage();
    return usage.cpu > 90 || usage.memory > 85;
  }
  
  private recordToolMetrics(
    toolName: string,
    duration: number,
    response: ToolOutput
  ): void {
    const key = `tool_metrics_${toolName}`;
    const existing = this.metrics.get(key) || { count: 0, totalDuration: 0 };
    
    this.metrics.set(key, {
      count: existing.count + 1,
      totalDuration: existing.totalDuration + duration,
      averageDuration: (existing.totalDuration + duration) / (existing.count + 1)
    });
  }
  
  private async generateSessionSummary(sessionId: string): Promise<void> {
    // Implementation for session summary generation
  }
  
  private async sendNotification(title?: string, message?: string): Promise<void> {
    // Implementation for external notifications
  }
  
  private async getSystemUsage(): Promise<{ cpu: number; memory: number }> {
    // Implementation for system resource monitoring
    return { cpu: 45, memory: 60 }; // Mock values
  }
}

interface NotificationEvent {
  timestamp: string;
  title?: string;
  message: string;
  sessionId: string;
}
```

## Best Practices Summary

### 1. Configuration Management
- Use factory patterns for agent-specific configurations
- Implement environment-specific settings
- Centralize SDK option management

### 2. Cost Control
- Implement real-time cost tracking
- Set budget limits and alerts
- Monitor token usage patterns
- Provide cost estimation before execution

### 3. Error Handling
- Categorize errors for appropriate responses
- Implement exponential backoff retry logic
- Use circuit breakers for stability
- Provide actionable error resolutions

### 4. Process Management
- Monitor resource usage during execution
- Implement proper cleanup procedures
- Use timeouts and cancellation
- Track execution lifecycles

### 5. Scalability Patterns
- Use semaphores for concurrency control
- Implement queue management
- Design for horizontal scaling
- Monitor system health metrics

This comprehensive pattern collection provides the foundation for building robust, cost-effective, and scalable AI agent execution systems using the Claude Code TypeScript SDK.