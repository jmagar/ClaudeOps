import { 
  Options, 
  Query,
  NonNullableUsage,
  SDKResultMessage,
  SDKUserMessage,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  ToolInput,
  ToolOutput,
  HookEvent,
  HookCallbackMatcher,
  HookJSONOutput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  NotificationHookInput
} from '@anthropic/claude-code-sdk';

// Core Claude SDK types re-export
export {
  Options,
  Query,
  NonNullableUsage,
  SDKResultMessage,
  SDKUserMessage,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  ToolInput,
  ToolOutput,
  HookEvent,
  HookCallbackMatcher,
  HookJSONOutput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  NotificationHookInput
};

// Agent Configuration Types
export interface AgentConfig {
  baseOptions: Options;
  costThresholds: {
    warning: number;
    critical: number;
    monthlyLimit: number;
  };
  retryPolicy: {
    maxAttempts: number;
    backoffMultiplier: number;
    initialDelay: number;
    maxDelay: number;
    retryableErrors: string[];
  };
}

export interface BudgetConfig {
  monthlyLimit: number;
  warningThreshold: number; // percentage of monthly limit
  criticalThreshold: number; // percentage of monthly limit
}

// Cost Tracking Types
export interface CostTracker {
  totalCost: number;
  monthlyCost: number;
  executionCosts: Map<string, number>;
  tokenUsage: Map<string, NonNullableUsage>;
}

export interface CostMetrics {
  executionId: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  duration: number;
  timestamp: string;
}

export interface BudgetAlert {
  level: 'warning' | 'critical';
  currentCost: number;
  budgetLimit: number;
  percentage: number;
  timestamp: string;
}

// Execution Types
export interface AgentExecutionRequest {
  agentType: string;
  prompt: string;
  estimatedCost: number;
  workingDirectory?: string;
  overrides?: Partial<Options>;
}

export interface AgentExecutionResult {
  executionId: string;
  agentType: string;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  result: string;
  cost: number;
  duration: number;
  usage: NonNullableUsage;
  logs: string[];
  timestamp: string;
  error?: string;
}

export interface SequentialResult {
  executionId: string;
  results: AgentResult[];
  totalCost: number;
  success: boolean;
  aggregatedSummary: string;
}

export interface ConcurrentResult {
  executionId: string;
  results: Array<{
    status: 'fulfilled' | 'rejected';
    value?: AgentResult;
    reason?: Error;
  }>;
  totalCost: number;
  successCount: number;
  failureCount: number;
}

export interface AgentResult {
  executionId: string;
  agentType: string;
  success: boolean;
  cost: number;
  duration: number;
  summary: string;
  critical: boolean;
  error?: string;
}

// Error Handling Types
export enum ErrorCategory {
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

export interface EnhancedError extends Error {
  category: ErrorCategory;
  retryable: boolean;
  resolution?: string;
  context?: Record<string, unknown>;
}

export interface ExecutionError {
  executionId: string;
  agentType: string;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  resolution?: string;
  timestamp: string;
}

// Circuit Breaker Types
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringWindow: number;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// Retry Configuration
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

// Session Management Types
export interface SessionData {
  id: string;
  agentType: string;
  created: string;
  lastActivity: string;
  context: Record<string, unknown>;
  cost: number;
}

// Hook Types
export interface NotificationEvent {
  timestamp: string;
  title?: string;
  message: string;
  sessionId: string;
}

// Process Management Types
export interface ProcessConfig {
  timeout: number;
  maxMemory: number;
  workingDirectory: string;
  environment: Record<string, string>;
}

export interface ProcessResult {
  executionId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

export interface ResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskIO: number;
  networkIO: number;
}

// Streaming Types
export interface StreamingController {
  interrupt(): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  addMessage(text: string): Promise<void>;
}

// Configuration Factory Types
export type AgentType = 
  | 'system-health'
  | 'docker-janitor'
  | 'backup-validator'
  | 'custom';

export interface SDKConfigOptions {
  agentType: AgentType;
  workingDirectory?: string;
  maxTurns?: number;
  maxThinkingTokens?: number;
  allowedTools?: string[];
  appendSystemPrompt?: string;
}

// Event Types for Real-time Updates
export interface ExecutionEvent {
  type: 'started' | 'progress' | 'completed' | 'failed' | 'log';
  executionId: string;
  timestamp: string;
  data: unknown;
}

export interface CostUpdateEvent {
  executionId: string;
  currentCost: number;
  totalCost: number;
  monthlyCost: number;
  timestamp: string;
}