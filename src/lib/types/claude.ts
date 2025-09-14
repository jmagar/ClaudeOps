// Claude SDK types (placeholder until SDK is available)
export interface Options {
  model: string;
  maxTurns?: number;
  maxThinkingTokens?: number;
  cwd?: string;
  permissionMode?: string;
  executableArgs?: string[];
  env?: Record<string, string | undefined>;
}

export interface Query {
  prompt: string;
  options?: Partial<Options>;
}

export interface NonNullableUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface SDKResultMessage {
  type: 'result';
  total_cost_usd: number;
  duration_ms: number;
  usage: NonNullableUsage;
}

export interface SDKUserMessage {
  type: 'user';
  content: string;
}

export type PermissionMode = 'acceptEdits' | 'requireApproval' | 'denyAll';

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface PermissionUpdate {
  mode: PermissionMode;
}

export interface ToolInput {
  name: string;
  parameters: Record<string, any>;
}

export interface ToolOutput {
  success: boolean;
  result?: any;
  error?: string;
}

export interface HookEvent {
  type: string;
  data: any;
}

export interface HookCallbackMatcher {
  eventType: string;
}


export interface PreToolUseHookInput {
  toolName: string;
  parameters: Record<string, any>;
}

export interface PostToolUseHookInput {
  toolName: string;
  result: any;
}

export interface SessionStartHookInput {
  sessionId: string;
}

export interface SessionEndHookInput {
  sessionId: string;
}

export interface NotificationHookInput {
  message: string;
  level: 'info' | 'warning' | 'error';
}

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
  classification?: any;
  fingerprint?: string;
  timestamp?: string;
}

// Hook types (placeholders until SDK is available)
export interface HookCallbackMatcher {
  pattern: string;
  callback: (input: any) => any;
}

export interface HookJSONOutput {
  success: boolean;
  data?: any;
}

export interface PreToolUseHookInput {
  tool: string;
  parameters: any;
}

export interface PostToolUseHookInput {
  tool: string;
  result: any;
}

export interface SessionStartHookInput {
  sessionId: string;
}

export interface SessionEndHookInput {
  sessionId: string;
}

export interface NotificationHookInput {
  type: string;
  message: string;
}

export type CanUseTool = (
  toolName: string,
  input: any,
  options: { signal: AbortSignal; suggestions?: any[] }
) => Promise<PermissionResult>;

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