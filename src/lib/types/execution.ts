import type { Execution, ExecutionStep, ExecutionStatus } from './database';

// Execution Context Interface
export interface ExecutionContext {
  agentType: string;
  nodeId?: string;
  triggeredBy?: 'manual' | 'schedule' | 'webhook';
  config?: Record<string, any>;
  metadata?: Record<string, any>;
  budgetLimits?: {
    maxCostUsd?: number;
    maxDurationMs?: number;
    maxTokens?: number;
  };
}

// Execution Step Interface for tracking
export interface ExecutionStepConfig {
  name: string;
  type?: 'command' | 'analysis' | 'cleanup' | 'validation' | 'initialization';
  metadata?: Record<string, any>;
  expectedDurationMs?: number;
  optional?: boolean;
}

// Log Entry Interface
export interface LogEntry {
  id: string;
  executionId: string;
  stepNumber?: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
  source?: 'agent' | 'system' | 'claude' | 'user';
  metadata?: Record<string, any>;
}

// Execution Result Interface
export interface ExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  aiAnalysis?: any;
  costData?: {
    totalCostUsd: number;
    tokensUsed: number;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheHits?: number;
  };
  metrics?: {
    peakMemoryMB?: number;
    cpuTimeMs?: number;
    networkRequests?: number;
  };
}

// Process Lifecycle States
export type ProcessLifecycleState = 
  | 'initializing'
  | 'starting'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'resuming'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'completed';

// Process Information
export interface ProcessInfo {
  pid?: number;
  startTime: Date;
  executionId: string;
  agentType: string;
  state: ProcessLifecycleState;
  resourceUsage?: {
    memoryMB: number;
    cpuPercent: number;
    uptime: number;
  };
  exitCode?: number;
  signal?: string;
}

// Execution Progress Information
export interface ExecutionProgress {
  executionId: string;
  currentStep: number;
  totalSteps: number;
  progress: number; // 0-100 percentage
  estimatedRemainingMs?: number;
  currentStepName?: string;
  lastActivity: Date;
}

// Cost Tracking Data
export interface CostTrackingData {
  executionId: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  requestId?: string;
  responseTime?: number;
  cacheHit?: boolean;
  timestamp: Date;
}

// Execution Event Types
export type ExecutionEvent = 
  | { type: 'execution:started'; data: { executionId: string; agentType: string } }
  | { type: 'execution:progress'; data: ExecutionProgress }
  | { type: 'execution:step:started'; data: { executionId: string; stepNumber: number; stepName: string } }
  | { type: 'execution:step:completed'; data: { executionId: string; stepNumber: number; success: boolean; output?: string; error?: string } }
  | { type: 'execution:log'; data: LogEntry }
  | { type: 'execution:cost:updated'; data: CostTrackingData }
  | { type: 'execution:completed'; data: { executionId: string; success: boolean; result: ExecutionResult } }
  | { type: 'execution:failed'; data: { executionId: string; error: string; exitCode?: number } }
  | { type: 'execution:cancelled'; data: { executionId: string; reason?: string } }
  | { type: 'process:state:changed'; data: { executionId: string; state: ProcessLifecycleState; processInfo: ProcessInfo } };

// Execution Tracker Configuration
export interface ExecutionTrackerConfig {
  maxLogEntries?: number;
  logFlushIntervalMs?: number;
  progressUpdateIntervalMs?: number;
  resourceMonitoringIntervalMs?: number;
  enableDetailedMetrics?: boolean;
  budgetCheckIntervalMs?: number;
}

// Log Buffer Configuration
export interface LogBufferConfig {
  maxSize: number;
  flushIntervalMs: number;
  batchSize: number;
  persistToDisk: boolean;
  compressionThreshold?: number;
}

// Process Manager Configuration
export interface ProcessManagerConfig {
  maxConcurrentProcesses: number;
  processTimeoutMs: number;
  killSignal: 'SIGTERM' | 'SIGKILL';
  killTimeoutMs: number;
  monitoringIntervalMs: number;
  autoCleanupOnExit: boolean;
}

// Execution Subscription Options
export interface ExecutionSubscriptionOptions {
  executionId: string;
  includeSteps?: boolean;
  includeLogs?: boolean;
  includeCosts?: boolean;
  includeProgress?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

// Stream Options for Log Streaming
export interface LogStreamOptions {
  executionId: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  levels?: Array<'debug' | 'info' | 'warn' | 'error'>;
  sources?: Array<'agent' | 'system' | 'claude' | 'user'>;
  limit?: number;
  follow?: boolean; // Real-time streaming
}

// Execution Metrics
export interface ExecutionMetrics {
  executionId: string;
  agentType: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  status: ExecutionStatus;
  stepsCompleted: number;
  totalSteps: number;
  logsGenerated: number;
  costIncurred: number;
  tokensUsed: number;
  peakMemoryUsage?: number;
  averageCpuUsage?: number;
  networkRequestCount?: number;
  errors: number;
  warnings: number;
}

// Batch Operation Result
export interface BatchOperationResult<T> {
  successful: T[];
  failed: Array<{ item: any; error: string }>;
  totalProcessed: number;
  successCount: number;
  failureCount: number;
}

// Real-time Status Update
export interface RealTimeStatusUpdate {
  executionId: string;
  timestamp: Date;
  status: ExecutionStatus;
  progress: number;
  currentActivity: string;
  resourceUsage?: {
    memory: number;
    cpu: number;
  };
  recentLogs: LogEntry[];
  costSoFar: number;
}

// Event Listener Types
export type ExecutionEventListener<T = any> = (event: T) => void | Promise<void>;

// Execution Tracker Interface
export interface IExecutionTracker {
  readonly executionId: string;
  readonly startTime: Date;
  readonly currentStatus: ExecutionStatus;
  readonly currentStepNumber: number;
  readonly progress: ExecutionProgress;
  
  start(): Promise<string>;
  addStep(step: ExecutionStepConfig): Promise<void>;
  startStep(stepNumber: number): Promise<void>;
  completeStep(stepNumber: number, result: { output?: string; error?: string; metadata?: any }): Promise<void>;
  skipStep(stepNumber: number, reason?: string): Promise<void>;
  addLog(message: string, level?: LogEntry['level'], source?: LogEntry['source'], metadata?: any): Promise<void>;
  recordCost(costData: Omit<CostTrackingData, 'executionId' | 'timestamp'>): Promise<void>;
  updateProgress(progress: number, estimatedRemainingMs?: number): Promise<void>;
  complete(result: ExecutionResult): Promise<void>;
  fail(error: string, exitCode?: number): Promise<void>;
  cancel(reason?: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getMetrics(): ExecutionMetrics;
  getDuration(): number;
  cleanup(): Promise<void>;
}

// Process Manager Interface  
export interface IProcessManager {
  startProcess(executionId: string, command: string, args?: string[], options?: any): Promise<ProcessInfo>;
  killProcess(executionId: string, signal?: 'SIGTERM' | 'SIGKILL'): Promise<boolean>;
  getProcessInfo(executionId: string): ProcessInfo | null;
  getRunningProcesses(): ProcessInfo[];
  monitorProcess(executionId: string): Promise<void>;
  cleanup(): Promise<void>;
}

// Log Streamer Interface
export interface ILogStreamer {
  startStream(executionId: string, options?: LogStreamOptions): Promise<void>;
  stopStream(executionId: string): Promise<void>;
  addLogEntry(entry: LogEntry): Promise<void>;
  getLogHistory(executionId: string, options?: LogStreamOptions): Promise<LogEntry[]>;
  flushBuffer(executionId?: string): Promise<void>;
  cleanup(): Promise<void>;
}