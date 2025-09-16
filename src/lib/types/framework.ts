import type { EventEmitter } from 'events';
import type { 
  ExecutionContext,
  ExecutionResult,
  LogEntry,
  ProcessInfo,
  ProcessLifecycleState,
  CostTrackingData,
  ExecutionProgress,
  IExecutionTracker
} from './execution';
import type { 
  AgentExecutionRequest,
  AgentExecutionResult,
  Options,
  Query,
  NonNullableUsage
} from './claude';

// Resource allocation and management
export interface ResourceAllocation {
  executionId: string;
  cpuCores: number;
  memoryMB: number;
  diskSpaceMB: number;
  networkBandwidthMbps?: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  reservedUntil: Date;
}

export interface ResourceLimits {
  maxCpuCores: number;
  maxMemoryMB: number;
  maxDiskSpaceMB: number;
  maxConcurrentExecutions: number;
  maxExecutionTimeMs: number;
  maxCostUsd: number;
}

export interface SystemResources {
  totalCpuCores: number;
  availableCpuCores: number;
  totalMemoryMB: number;
  availableMemoryMB: number;
  totalDiskSpaceMB: number;
  availableDiskSpaceMB: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  diskUsagePercent: number;
  networkUsageMbps: number;
  loadAverage: number[];
}

// Agent execution framework types
export interface AgentExecutorConfig {
  maxConcurrentExecutions: number;
  defaultTimeoutMs: number;
  resourceLimits: ResourceLimits;
  enableMetrics: boolean;
  enableCostTracking: boolean;
  enableResourceMonitoring: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  retryAttempts: number;
  retryDelayMs: number;
}

export interface ExecutionOrchestratorConfig {
  executionStrategies: ExecutionStrategy[];
  defaultStrategy: ExecutionStrategyType;
  concurrencyLimits: {
    global: number;
    perAgentType: Record<string, number>;
    perNode: number;
  };
  priorityQueues: {
    high: number;
    normal: number;
    low: number;
  };
  resourceAllocationStrategy: 'fair' | 'priority' | 'greedy';
  enableLoadBalancing: boolean;
  healthCheckIntervalMs: number;
}

export type ExecutionStrategyType = 
  | 'sequential' 
  | 'parallel' 
  | 'hybrid' 
  | 'priority_queue'
  | 'resource_aware';

export interface ExecutionStrategy {
  type: ExecutionStrategyType;
  name: string;
  description: string;
  config: Record<string, any>;
  selector: (request: AgentExecutionRequest) => boolean;
  executor: (
    requests: AgentExecutionRequest[], 
    config: any
  ) => Promise<AgentExecutionResult[]>;
}

// Process pool management
export interface ProcessPoolConfig {
  minProcesses: number;
  maxProcesses: number;
  processIdleTimeoutMs: number;
  processStartupTimeoutMs: number;
  processShutdownTimeoutMs: number;
  processRecycleThreshold: number; // Number of executions before recycling
  healthCheckIntervalMs: number;
  enableProcessReuse: boolean;
  processEnvironment: Record<string, string>;
}

export interface ProcessPoolWorker {
  id: string;
  pid: number;
  state: 'idle' | 'busy' | 'starting' | 'stopping' | 'error';
  startTime: Date;
  lastUsed: Date;
  executionCount: number;
  currentExecutionId?: string;
  memoryUsage: number;
  cpuUsage: number;
  healthStatus: 'healthy' | 'warning' | 'error';
}

// Framework interfaces
export interface IAgentExecutor extends EventEmitter {
  execute(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
  executeMany(requests: AgentExecutionRequest[]): Promise<AgentExecutionResult[]>;
  cancel(executionId: string): Promise<boolean>;
  pause(executionId: string): Promise<boolean>;
  resume(executionId: string): Promise<boolean>;
  getExecutionStatus(executionId: string): Promise<ExecutionProgress | null>;
  getActiveExecutions(): string[];
  getMetrics(): ExecutionFrameworkMetrics;
  configure(config: Partial<AgentExecutorConfig>): void;
  cleanup(): Promise<void>;
}

export interface IExecutionOrchestrator extends EventEmitter {
  schedule(request: AgentExecutionRequest): Promise<string>;
  scheduleMany(requests: AgentExecutionRequest[]): Promise<string[]>;
  cancel(executionId: string): Promise<boolean>;
  cancelMany(executionIds: string[]): Promise<boolean[]>;
  getQueue(): QueuedExecution[];
  getQueueStats(): QueueStats;
  setStrategy(strategy: ExecutionStrategyType): void;
  addStrategy(strategy: ExecutionStrategy): void;
  removeStrategy(strategyType: ExecutionStrategyType): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  drain(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface IResourceManager extends EventEmitter {
  allocateResources(request: ResourceAllocationRequest): Promise<ResourceAllocation>;
  releaseResources(executionId: string): Promise<void>;
  getSystemResources(): Promise<SystemResources>;
  getResourceAllocations(): ResourceAllocation[];
  setResourceLimits(limits: Partial<ResourceLimits>): void;
  getResourceLimits(): ResourceLimits;
  checkResourceAvailability(request: ResourceAllocationRequest): Promise<boolean>;
  optimizeResourceAllocation(): Promise<void>;
  getResourceMetrics(): ResourceMetrics;
  cleanup(): Promise<void>;
}

export interface IProcessPool extends EventEmitter {
  getWorker(): Promise<ProcessPoolWorker>;
  releaseWorker(workerId: string): Promise<void>;
  getAvailableWorkers(): ProcessPoolWorker[];
  getBusyWorkers(): ProcessPoolWorker[];
  getWorkerCount(): number;
  getHealthStatus(): ProcessPoolHealth;
  scaleUp(count?: number): Promise<void>;
  scaleDown(count?: number): Promise<void>;
  recycleWorker(workerId: string): Promise<void>;
  cleanup(): Promise<void>;
}

// Supporting types
export interface QueuedExecution {
  id: string;
  request: AgentExecutionRequest;
  priority: number;
  queuedAt: Date;
  estimatedStartTime?: Date;
  dependencies?: string[];
  requiredResources?: ResourceAllocationRequest;
}

export interface QueueStats {
  totalQueued: number;
  highPriority: number;
  normalPriority: number;
  lowPriority: number;
  averageWaitTime: number;
  oldestQueuedAt?: Date;
  throughput: {
    lastHour: number;
    lastDay: number;
    total: number;
  };
}

export interface ResourceAllocationRequest {
  executionId: string;
  agentType: string;
  estimatedCpuCores: number;
  estimatedMemoryMB: number;
  estimatedDurationMs: number;
  priority: 'low' | 'normal' | 'high' | 'critical';
  requirements?: {
    minCpuCores?: number;
    minMemoryMB?: number;
    maxCpuCores?: number;
    maxMemoryMB?: number;
    preferredNode?: string;
    requiredCapabilities?: string[];
  };
}

export interface ResourceMetrics {
  currentAllocations: number;
  totalAllocatedCpu: number;
  totalAllocatedMemory: number;
  allocationEfficiency: number;
  resourceFragmentation: number;
  averageAllocationTime: number;
  peakResourceUsage: {
    cpu: number;
    memory: number;
    timestamp: Date;
  };
}

export interface ProcessPoolHealth {
  status: 'healthy' | 'degraded' | 'critical';
  activeWorkers: number;
  idleWorkers: number;
  errorWorkers: number;
  totalProcessedTasks: number;
  averageTaskTime: number;
  memoryPressure: number;
  cpuPressure: number;
  errors: Array<{
    workerId: string;
    error: string;
    timestamp: Date;
  }>;
}

export interface ExecutionFrameworkMetrics {
  totalExecutions: number;
  activeExecutions: number;
  completedExecutions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  averageExecutionTime: number;
  totalExecutionTime: number;
  costMetrics: {
    totalCost: number;
    averageCostPerExecution: number;
    costPerSecond: number;
  };
  resourceMetrics: ResourceMetrics;
  throughputMetrics: {
    executionsPerSecond: number;
    executionsPerMinute: number;
    executionsPerHour: number;
  };
  errorMetrics: {
    totalErrors: number;
    errorRate: number;
    commonErrors: Array<{
      error: string;
      count: number;
      percentage: number;
    }>;
  };
  performanceMetrics: {
    p50ExecutionTime: number;
    p95ExecutionTime: number;
    p99ExecutionTime: number;
    maxExecutionTime: number;
    minExecutionTime: number;
  };
}

// Timeout and cancellation
export interface TimeoutConfig {
  executionTimeoutMs: number;
  stepTimeoutMs?: number;
  gracePeriodMs: number;
  escalationTimeoutMs: number;
}

export interface CancellationToken {
  isCancelled: boolean;
  reason?: string;
  onCancelled: (callback: () => void) => void;
  throwIfCancelled(): void;
}

// Framework events
export type FrameworkEvent =
  | { type: 'execution:queued'; data: { executionId: string; queuePosition: number } }
  | { type: 'execution:dequeued'; data: { executionId: string; waitTime: number } }
  | { type: 'execution:resource:allocated'; data: { executionId: string; allocation: ResourceAllocation } }
  | { type: 'execution:resource:released'; data: { executionId: string; allocation: ResourceAllocation } }
  | { type: 'execution:timeout'; data: { executionId: string; timeoutType: 'execution' | 'step' | 'gracePeriod' } }
  | { type: 'worker:started'; data: { workerId: string; pid: number } }
  | { type: 'worker:stopped'; data: { workerId: string; reason: string } }
  | { type: 'worker:error'; data: { workerId: string; error: string } }
  | { type: 'worker:recycled'; data: { workerId: string; executionCount: number } }
  | { type: 'resource:pressure'; data: { resource: 'cpu' | 'memory' | 'disk'; level: number } }
  | { type: 'queue:backpressure'; data: { queueSize: number; threshold: number } }
  | { type: 'strategy:changed'; data: { from: ExecutionStrategyType; to: ExecutionStrategyType; reason: string } };

// Execution context enhancement
export interface EnhancedExecutionContext extends ExecutionContext {
  strategy?: ExecutionStrategyType;
  resourceAllocation?: ResourceAllocationRequest;
  timeoutConfig?: TimeoutConfig;
  cancellationToken?: CancellationToken;
  dependencies?: string[];
  retryConfig?: {
    maxAttempts: number;
    backoffMultiplier: number;
    retryableErrors: string[];
  };
}

// Integration types
export interface FrameworkIntegration {
  executionTracker: IExecutionTracker;
  processManager: any; // From existing services
  costService: any;    // From existing services
  logStreamer: any;    // From existing services
  webSocketManager: any; // From existing services
}

export interface FrameworkComponents {
  agentExecutor: IAgentExecutor;
  executionOrchestrator: IExecutionOrchestrator;
  resourceManager: IResourceManager;
  processPool: IProcessPool;
}

// Configuration validation
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

// Framework lifecycle
export interface FrameworkLifecycle {
  initialize(): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; details: any }>;
}

// Error types specific to framework
export class FrameworkError extends Error {
  constructor(
    message: string,
    public readonly component: string,
    public readonly operation: string,
    public readonly context?: any
  ) {
    super(message);
    this.name = 'FrameworkError';
  }
}

export class ResourceAllocationError extends FrameworkError {
  constructor(message: string, public readonly requiredResources: ResourceAllocationRequest) {
    super(message, 'ResourceManager', 'allocateResources', { requiredResources });
    this.name = 'ResourceAllocationError';
  }
}

export class ExecutionTimeoutError extends FrameworkError {
  constructor(
    message: string, 
    public readonly executionId: string,
    public readonly timeoutType: 'execution' | 'step' | 'gracePeriod'
  ) {
    super(message, 'AgentExecutor', 'execute', { executionId, timeoutType });
    this.name = 'ExecutionTimeoutError';
  }
}

export class ProcessPoolExhaustionError extends FrameworkError {
  constructor(message: string, public readonly currentWorkers: number, public readonly maxWorkers: number) {
    super(message, 'ProcessPool', 'getWorker', { currentWorkers, maxWorkers });
    this.name = 'ProcessPoolExhaustionError';
  }
}

export class QueueOverflowError extends FrameworkError {
  constructor(message: string, public readonly queueSize: number, public readonly maxQueueSize: number) {
    super(message, 'ExecutionOrchestrator', 'schedule', { queueSize, maxQueueSize });
    this.name = 'QueueOverflowError';
  }
}