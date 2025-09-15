// Import SDK types - these ARE available from the Claude Code SDK
export type {
  SDKMessage,
  SDKAssistantMessage,
  SDKUserMessage,
  SDKResultMessage,
  SDKSystemMessage,
  SDKPartialAssistantMessage,
  Options,
  PermissionMode,
  CanUseTool,
  PermissionResult,
  HookEvent,
  HookCallback,
  HookCallbackMatcher,
  HookInput,
  PreToolUseHookInput,
  PostToolUseHookInput
} from '@anthropic-ai/claude-code';

// Import TokenUsage from existing types
export { TokenUsage } from '../../types/agent';

// Base agent result interface
export interface BaseAgentResult {
  executionId: string;
  agentType: string;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  result: string;
  cost: number;
  duration: number;
  usage: TokenUsage;
  logs: string[];
  timestamp: string;
  error?: string;
  summary?: string;
  sessionId?: string;
}

// Base options that all agents can use
export interface BaseAgentOptions {
  timeout_ms?: number;
  maxTurns?: number;
  permissionMode?: PermissionMode;
  costLimit?: number;
  includePartialMessages?: boolean;
  sessionId?: string;
  onLog?: LogCallback;
  onProgress?: ProgressCallback;
  abortController?: AbortController;
  hooks?: AgentHooks;
}

// Hook system interfaces using actual SDK types
export interface AgentHooks {
  preToolUse?: HookCallback[];
  postToolUse?: HookCallback[];
  onError?: ErrorHook;
  onComplete?: CompleteHook;
}

// Callback types
export type LogCallback = (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;
export type ProgressCallback = (progress: ProgressUpdate) => void;
export type ErrorHook = (error: AgentError, context: ErrorContext) => Promise<ErrorRecovery>;
export type CompleteHook = (result: BaseAgentResult) => Promise<void>;

// Progress tracking
export interface ProgressUpdate {
  stage: 'starting' | 'investigating' | 'analyzing' | 'completing';
  message: string;
  percentage?: number;
  currentTurn?: number;
  maxTurns?: number;
  toolsUsed?: string[];
  cost?: number;
}

// Error handling types
export interface AgentError {
  type: 'sdk_error' | 'timeout' | 'permission_denied' | 'cost_limit' | 'custom';
  subtype?: string; // For SDK errors: error_max_turns, error_rate_limit, etc.
  message: string;
  originalError?: Error;
  context?: Record<string, any>;
}

export interface ErrorContext {
  executionId: string;
  agentType: string;
  currentTurn: number;
  totalCost: number;
  timeElapsed: number;
  lastTool?: string;
}

export interface ErrorRecovery {
  action: 'retry' | 'increase_turns' | 'reduce_scope' | 'abort' | 'continue';
  retryDelay?: number;
  newMaxTurns?: number;
  modifiedPrompt?: string;
  message?: string;
}

// Session management
export interface SessionState {
  sessionId: string;
  agentType: string;
  executionId: string;
  startTime: string;
  lastUpdate: string;
  options: BaseAgentOptions;
  progress: ProgressUpdate;
  messages: SDKMessage[]; // Now using proper SDK message types
  checkpoints: SessionCheckpoint[];
  metadata: Record<string, any>;
}

export interface SessionCheckpoint {
  timestamp: string;
  turn: number;
  cost: number;
  lastTool?: string;
  progress: ProgressUpdate;
  canResume: boolean;
}

// Stream handling
export interface StreamUpdate {
  type: 'message' | 'tool_use' | 'tool_result' | 'progress' | 'error';
  content: any;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Permission management using SDK types
export type CanUseToolCallback = CanUseTool;

export interface ToolContext {
  agentType: string;
  executionId: string;
  currentTurn: number;
  totalCost: number;
  previousTools: string[];
  timeElapsed: number;
}

// Agent configuration
export interface AgentConfig {
  name: string;
  version: string;
  description: string;
  defaultOptions: Partial<BaseAgentOptions>;
  capabilities: string[];
  requiredTools: string[];
  optionalTools: string[];
  typicalExecutionTime: number;
  costEstimate: {
    min: number;
    max: number;
    typical: number;
  };
}

// Abstract base agent interface that all agents must implement
export interface IBaseAgent<TOptions extends BaseAgentOptions = BaseAgentOptions> {
  execute(options?: TOptions): Promise<BaseAgentResult>;
  getConfig(): AgentConfig;
  buildPrompt(options: TOptions): string;
  getSystemPrompt(): string;
  getAgentType(): string;
  getAllowedTools(): string[];
  getPermissionMode(): PermissionMode;
}

// Factory pattern types
export type AgentType = 'system-health' | 'docker-deployment' | 'example' | string;

export interface AgentFactoryOptions {
  defaultHooks?: AgentHooks;
  defaultCostLimit?: number;
  defaultTimeout?: number;
  sessionManager?: any; // Will be properly typed when we implement it
}