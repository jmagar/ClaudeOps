# Agent Framework API Reference

Complete API documentation for the Claude Code SDK Agent Framework.

## Table of Contents

- [Core Classes](#core-classes)
  - [BaseAgent](#baseagent)
  - [ErrorHandler](#errorhandler)
  - [HookManager](#hookmanager)
  - [SessionManager](#sessionmanager)
  - [StreamHandler](#streamhandler)
  - [PermissionManager](#permissionmanager)
- [Factory Classes](#factory-classes)
  - [AgentFactory](#agentfactory)
  - [AgentUtils](#agentutils)
- [Type Definitions](#type-definitions)
- [Interfaces](#interfaces)
- [Enums and Constants](#enums-and-constants)

## Core Classes

### BaseAgent

Abstract base class that all agents must extend. Provides common functionality for Claude SDK integration, error handling, session management, and streaming.

#### Constructor

```typescript
abstract class BaseAgent<TOptions extends BaseAgentOptions = BaseAgentOptions>
```

#### Abstract Methods

Agents must implement these methods:

##### `buildPrompt(options: TOptions): string`

Builds the investigation prompt based on provided options.

**Parameters:**
- `options: TOptions` - Agent-specific options extending BaseAgentOptions

**Returns:** `string` - The prompt to send to Claude

**Example:**
```typescript
buildPrompt(options: MyAgentOptions): string {
  return `Analyze the system with depth: ${options.analysisDepth}...`;
}
```

##### `getSystemPrompt(): string`

Returns the system prompt that defines Claude's behavior and expertise.

**Returns:** `string` - System prompt for Claude

##### `getAgentType(): string`

Returns the unique identifier for this agent type.

**Returns:** `string` - Agent type identifier (e.g., 'system-health', 'network-analyzer')

##### `getAllowedTools(): string[]`

Returns the list of tools this agent is permitted to use.

**Returns:** `string[]` - Array of tool names

**Common Tools:**
- `'Bash'` - Execute shell commands
- `'Read'` - Read files
- `'Write'` - Write files
- `'Edit'` - Edit files
- `'Grep'` - Search file contents
- `'Glob'` - File pattern matching

##### `getConfig(): AgentConfig`

Returns agent configuration and metadata.

**Returns:** `AgentConfig` - Agent configuration object

##### `getCapabilities(): Record<string, any>`

Returns agent capabilities metadata (for backward compatibility).

**Returns:** `Record<string, any>` - Capabilities object

#### Public Methods

##### `execute(options?: TOptions): Promise<BaseAgentResult>`

Main execution method that runs the agent with full framework integration.

**Parameters:**
- `options?: TOptions` - Agent-specific execution options

**Returns:** `Promise<BaseAgentResult>` - Execution result with metadata

**Features:**
- Automatic error handling and recovery
- Real-time progress tracking
- Session management integration
- Hook system execution
- Cost and usage tracking

**Example:**
```typescript
const result = await agent.execute({
  timeout_ms: 300000,
  maxTurns: 50,
  onLog: (msg, level) => console.log(`[${level}] ${msg}`),
  onProgress: (progress) => console.log(progress.message),
  hooks: {
    onComplete: async (result) => console.log('Done!', result.summary)
  }
});
```

##### `getPermissionMode(): PermissionMode`

Returns the permission mode for this agent.

**Returns:** `PermissionMode` - Permission mode ('acceptEdits', 'plan', or 'bypassPermissions')

**Default:** `'acceptEdits'`

#### Protected Methods

##### `handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery>`

Override this method to provide custom error handling for your agent.

**Parameters:**
- `error: AgentError` - The error that occurred
- `context: ErrorContext` - Execution context when error occurred

**Returns:** `Promise<ErrorRecovery>` - Recovery strategy

**Example:**
```typescript
protected async handleAgentSpecificError(error: AgentError, context: ErrorContext) {
  if (error.message.includes('connection refused')) {
    return {
      action: 'continue',
      message: 'Service unavailable, using cached data'
    };
  }
  return super.handleAgentSpecificError(error, context);
}
```

##### `saveSessionState(state: Partial<any>): Promise<void>`

Override for custom session state persistence.

##### `restoreSessionState(sessionId: string): Promise<any>`

Override for custom session state restoration.

---

### ErrorHandler

Manages sophisticated error handling with retry logic and recovery strategies.

#### Constructor

```typescript
constructor(log?: LogCallback)
```

**Parameters:**
- `log?: LogCallback` - Optional logging function

#### Public Methods

##### `handleError(error: AgentError, context: ErrorContext, options?: Partial<BaseAgentOptions>): Promise<ErrorRecovery>`

Main error handling method with recovery strategies.

**Parameters:**
- `error: AgentError` - The error to handle
- `context: ErrorContext` - Execution context
- `options?: Partial<BaseAgentOptions>` - Agent options

**Returns:** `Promise<ErrorRecovery>` - Recovery strategy

**Error Types Handled:**
- `'sdk_error'` - Claude SDK errors with subtypes
- `'timeout'` - Execution timeouts
- `'permission_denied'` - Permission errors
- `'cost_limit'` - Cost limit exceeded
- `'custom'` - Application-specific errors

**Recovery Actions:**
- `'retry'` - Retry with backoff delay
- `'increase_turns'` - Increase max turns and retry
- `'reduce_scope'` - Continue with reduced scope
- `'abort'` - Stop execution
- `'continue'` - Continue with current state

##### `isRecoverable(error: AgentError): boolean`

Determines if an error is recoverable.

**Parameters:**
- `error: AgentError` - Error to check

**Returns:** `boolean` - True if error is recoverable

##### `getErrorStats(): ErrorStats`

Returns error statistics and metrics.

**Returns:** `ErrorStats` - Error statistics object

##### `reset(): void`

Resets error tracking state.

---

### HookManager

Manages hook execution for tool monitoring, security, and performance tracking.

#### Constructor

```typescript
constructor(hooks?: AgentHooks, log?: LogCallback)
```

**Parameters:**
- `hooks?: AgentHooks` - Initial hook configuration
- `log?: LogCallback` - Optional logging function

#### Public Methods

##### `createPreToolUseHook(): PreToolUseHook`

Creates a pre-tool-use hook with security validation and rate limiting.

**Returns:** `PreToolUseHook` - Hook function for pre-tool execution

**Features:**
- Rate limiting per tool type
- Security command validation
- Custom hook execution
- Metrics tracking

##### `createPostToolUseHook(): PostToolUseHook`

Creates a post-tool-use hook for result processing and metrics.

**Returns:** `PostToolUseHook` - Hook function for post-tool execution

**Features:**
- Execution metrics tracking
- Result size monitoring
- Custom hook execution
- Error pattern detection

##### `getMetrics(): Record<string, ToolMetrics>`

Returns performance metrics for all tools.

**Returns:** `Record<string, ToolMetrics>` - Tool metrics by name

**ToolMetrics Properties:**
- `name: string` - Tool name
- `totalCalls: number` - Total executions
- `totalDuration: number` - Total execution time
- `successCount: number` - Successful executions
- `errorCount: number` - Failed executions
- `averageDuration: number` - Average execution time
- `lastUsed: string` - ISO timestamp of last use

##### `getRateLimitStatus(): Record<string, RateLimitStatus>`

Returns rate limit status for all tools.

**Returns:** `Record<string, RateLimitStatus>` - Rate limit status by tool

##### `reset(): void`

Resets all metrics and rate limits.

#### Security Features

The HookManager includes built-in security validation:

**Blocked Command Patterns:**
- Destructive file operations (`rm -rf /`)
- Direct disk writes (`dd if=`)
- Filesystem formatting (`mkfs`)
- User management (`userdel`, `passwd root`)
- Privilege escalation (`sudo su`)
- Remote code execution (`curl | sh`)
- System shutdown commands

**Rate Limits (per minute):**
- Bash: 20 commands
- Read: 50 operations
- Grep: 30 searches
- Glob: 30 patterns

---

### SessionManager

Manages agent session persistence, checkpointing, and resumption.

#### Constructor

```typescript
constructor(
  sessionDir?: string,
  log?: LogCallback,
  checkpointInterval?: number
)
```

**Parameters:**
- `sessionDir?: string` - Directory for session storage (default: './sessions')
- `log?: LogCallback` - Optional logging function
- `checkpointInterval?: number` - Auto-checkpoint interval in ms (default: 30000)

#### Public Methods

##### `initialize(): Promise<void>`

Initializes the session directory.

##### `createSession(agentType: string, executionId: string, options: BaseAgentOptions, metadata?: Record<string, any>): Promise<string>`

Creates a new session.

**Parameters:**
- `agentType: string` - Type of agent
- `executionId: string` - Unique execution ID
- `options: BaseAgentOptions` - Agent options
- `metadata?: Record<string, any>` - Optional metadata

**Returns:** `Promise<string>` - Session ID

##### `loadSession(sessionId: string): Promise<SessionState | null>`

Loads an existing session.

**Parameters:**
- `sessionId: string` - Session ID to load

**Returns:** `Promise<SessionState | null>` - Session state or null if not found

##### `saveSession(session: SessionState): Promise<void>`

Saves session state to disk.

##### `updateSession(updates: Partial<SessionState>): Promise<void>`

Updates the current session with new data.

##### `addCheckpoint(turn: number, cost: number, progress: ProgressUpdate, lastTool?: string): Promise<void>`

Adds a checkpoint to the current session.

##### `addMessage(message: SDKMessage): Promise<void>`

Adds a message to the current session.

##### `resumeSession(sessionId: string): Promise<{ session: SessionState; resumeFromCheckpoint: SessionCheckpoint | null; messages: SDKMessage[] }>`

Resumes a session from the latest checkpoint.

##### `listSessions(): Promise<SessionSummary[]>`

Lists all sessions with metadata.

##### `deleteSession(sessionId: string): Promise<void>`

Deletes a session.

##### `cleanup(maxAge?: number): Promise<number>`

Cleans up old sessions.

**Parameters:**
- `maxAge?: number` - Maximum age in milliseconds (default: 7 days)

**Returns:** `Promise<number>` - Number of sessions deleted

##### `getStatistics(): Promise<SessionStatistics>`

Returns session statistics.

##### `getCurrentSession(): SessionState | null`

Returns the current active session.

---

### StreamHandler

Manages real-time streaming updates and progress reporting.

#### Constructor

```typescript
constructor(bufferSize?: number, log?: LogCallback)
```

**Parameters:**
- `bufferSize?: number` - Message buffer size (default: 100)
- `log?: LogCallback` - Optional logging function

#### Public Methods

##### `addListener(listener: StreamListener): void`

Adds a stream listener for real-time updates.

**Parameters:**
- `listener: StreamListener` - Async function that receives StreamUpdate objects

##### `removeListener(listener: StreamListener): void`

Removes a stream listener.

##### `handleUpdate(update: StreamUpdate): Promise<void>`

Processes and broadcasts a stream update.

##### `handleSDKMessage(message: SDKMessage): Promise<void>`

Converts SDK messages to stream updates.

##### `handleProgress(progress: ProgressUpdate): Promise<void>`

Handles progress updates.

##### `handleToolStart(toolName: string, input: any): Promise<void>`

Handles tool execution start events.

##### `handleToolComplete(toolName: string, input: any, result: any, startTime: number): Promise<void>`

Handles tool execution completion events.

##### `handleError(error: Error, context?: any): Promise<void>`

Handles error events.

##### `getStatistics(): StreamStatistics`

Returns streaming statistics.

##### `getRecentMessages(count?: number): StreamUpdate[]`

Gets recent messages from the buffer.

**Parameters:**
- `count?: number` - Number of messages to retrieve (default: 20)

##### `clearBuffer(): void`

Clears the message buffer.

---

### PermissionManager

Manages security and permission controls for agent operations.

#### Constructor

```typescript
constructor(log?: LogCallback)
```

#### Public Methods

##### `validateToolAccess(toolName: string, input: any, context: ToolContext): Promise<PermissionResult>`

Validates tool access with security checks.

##### `canUseTool(toolName: string, context: ToolContext): boolean`

Checks if a tool can be used in the given context.

##### `logToolUsage(toolName: string, context: ToolContext): void`

Logs tool usage for auditing.

---

## Factory Classes

### AgentFactory

Factory for creating and managing different agent types.

#### Static Methods

##### `create<T extends BaseAgent>(type: AgentType, options?: BaseAgentOptions): T`

Creates an agent of the specified type.

**Parameters:**
- `type: AgentType` - Agent type identifier
- `options?: BaseAgentOptions` - Default options

**Returns:** `T` - Agent instance

**Available Types:**
- `'system-health'` - SystemHealthAgent

##### `getAvailableTypes(): AgentType[]`

Returns list of available agent types.

##### `getAgentConfig(type: AgentType): AgentConfig`

Gets agent configuration without creating an instance.

##### `createWithDefaults<T extends BaseAgent>(type: AgentType, options?: BaseAgentOptions, setupDefaults?: boolean): T`

Creates an agent with pre-configured defaults.

---

### AgentUtils

Utility functions for common agent operations.

#### Static Methods

##### `createLogger(prefix?: string): LogCallback`

Creates a standard logging function.

**Parameters:**
- `prefix?: string` - Optional prefix for log messages

##### `createProgressLogger(prefix?: string): ProgressCallback`

Creates a progress logging function.

##### `createCombinedCallbacks(prefix?: string): { onLog: LogCallback; onProgress: ProgressCallback }`

Creates combined logging and progress callbacks.

---

## Type Definitions

### BaseAgentOptions

Base options that all agents can use.

```typescript
interface BaseAgentOptions {
  timeout_ms?: number;                    // Execution timeout in milliseconds
  maxTurns?: number;                      // Maximum Claude turns
  permissionMode?: PermissionMode;        // Permission mode
  costLimit?: number;                     // Maximum cost in USD
  includePartialMessages?: boolean;       // Include partial messages
  sessionId?: string;                     // Session ID for resumption
  onLog?: LogCallback;                    // Logging callback
  onProgress?: ProgressCallback;          // Progress callback
  abortController?: AbortController;      // Abort controller
  hooks?: AgentHooks;                     // Hook configuration
}
```

### BaseAgentResult

Result object returned by agent execution.

```typescript
interface BaseAgentResult {
  executionId: string;                    // Unique execution ID
  agentType: string;                      // Agent type
  status: 'completed' | 'failed' | 'timeout' | 'cancelled'; // Status
  result: string;                         // Main result content
  cost: number;                           // Total cost in USD
  duration: number;                       // Execution time in ms
  usage: TokenUsage;                      // Token usage breakdown
  logs: string[];                         // Execution logs
  timestamp: string;                      // ISO timestamp
  error?: string;                         // Error message if failed
  summary?: string;                       // Executive summary
  sessionId?: string;                     // Session ID if used
}
```

### AgentConfig

Agent configuration and metadata.

```typescript
interface AgentConfig {
  name: string;                           // Agent display name
  version: string;                        // Agent version
  description: string;                    // Agent description
  defaultOptions: Partial<BaseAgentOptions>; // Default options
  capabilities: string[];                 // List of capabilities
  requiredTools: string[];                // Required tools
  optionalTools: string[];                // Optional tools
  typicalExecutionTime: number;           // Typical execution time in ms
  costEstimate: {                         // Cost estimates
    min: number;
    max: number;
    typical: number;
  };
}
```

### AgentHooks

Hook configuration for extending agent behavior.

```typescript
interface AgentHooks {
  preToolUse?: HookCallback[];            // Pre-tool execution hooks
  postToolUse?: HookCallback[];           // Post-tool execution hooks
  onError?: ErrorHook;                    // Error handling hook
  onComplete?: CompleteHook;              // Completion hook
}
```

### ProgressUpdate

Progress update information.

```typescript
interface ProgressUpdate {
  stage: 'starting' | 'investigating' | 'analyzing' | 'completing'; // Current stage
  message: string;                        // Progress message
  percentage?: number;                    // Completion percentage
  currentTurn?: number;                   // Current Claude turn
  maxTurns?: number;                      // Maximum turns
  toolsUsed?: string[];                   // Tools used so far
  cost?: number;                          // Current cost
}
```

### AgentError

Error information with type classification.

```typescript
interface AgentError {
  type: 'sdk_error' | 'timeout' | 'permission_denied' | 'cost_limit' | 'custom';
  subtype?: string;                       // Specific error subtype
  message: string;                        // Error message
  originalError?: Error;                  // Original error object
  context?: Record<string, any>;          // Additional context
}
```

### ErrorRecovery

Error recovery strategy.

```typescript
interface ErrorRecovery {
  action: 'retry' | 'increase_turns' | 'reduce_scope' | 'abort' | 'continue';
  retryDelay?: number;                    // Delay before retry (ms)
  newMaxTurns?: number;                   // New max turns limit
  modifiedPrompt?: string;                // Modified prompt for retry
  message?: string;                       // Recovery message
}
```

### SessionState

Complete session state information.

```typescript
interface SessionState {
  sessionId: string;                      // Unique session ID
  agentType: string;                      // Agent type
  executionId: string;                    // Execution ID
  startTime: string;                      // Session start time
  lastUpdate: string;                     // Last update time
  options: BaseAgentOptions;              // Agent options
  progress: ProgressUpdate;               // Current progress
  messages: SDKMessage[];                 // All messages
  checkpoints: SessionCheckpoint[];       // Checkpoints
  metadata: Record<string, any>;          // Custom metadata
}
```

### StreamUpdate

Real-time stream update information.

```typescript
interface StreamUpdate {
  type: 'message' | 'tool_use' | 'tool_result' | 'progress' | 'error';
  content: any;                           // Update content
  timestamp: string;                      // ISO timestamp
  metadata?: Record<string, any>;         // Additional metadata
}
```

### TokenUsage

Token usage breakdown.

```typescript
interface TokenUsage {
  input_tokens: number;                   // Input tokens used
  output_tokens: number;                  // Output tokens generated
  cache_creation_tokens: number;          // Cache creation tokens
  cache_read_tokens: number;              // Cache read tokens
}
```

## Callback Types

### LogCallback

```typescript
type LogCallback = (message: string, level?: 'info' | 'warn' | 'error' | 'debug') => void;
```

### ProgressCallback

```typescript
type ProgressCallback = (progress: ProgressUpdate) => void;
```

### ErrorHook

```typescript
type ErrorHook = (error: AgentError, context: ErrorContext) => Promise<ErrorRecovery>;
```

### CompleteHook

```typescript
type CompleteHook = (result: BaseAgentResult) => Promise<void>;
```

### StreamListener

```typescript
type StreamListener = (update: StreamUpdate) => Promise<void>;
```

## Enums and Constants

### PermissionMode

```typescript
type PermissionMode = 'acceptEdits' | 'plan' | 'bypassPermissions';
```

- `'acceptEdits'` - Accept edit operations (recommended for most agents)
- `'plan'` - Plan mode for complex multi-step operations
- `'bypassPermissions'` - Bypass permission checks (use with caution)

### AgentType

```typescript
type AgentType = 'system-health' | 'example' | string;
```

Extensible type for agent identifiers. Add new types when creating custom agents.

## Error Subtypes

SDK error subtypes handled by the framework:

- `'error_max_turns'` - Maximum turns limit reached
- `'error_rate_limit'` - Rate limit exceeded
- `'error_permission_denied'` - Permission denied
- `'error_prompt_limit'` - Prompt too large
- `'error_context_limit'` - Context window exceeded
- `'error_during_execution'` - General execution error

## Best Practices

### Error Handling

```typescript
// Custom error handling
protected async handleAgentSpecificError(error: AgentError, context: ErrorContext) {
  switch (error.subtype) {
    case 'network_error':
      return { action: 'retry', retryDelay: 5000 };
    case 'config_missing':
      return { action: 'reduce_scope', message: 'Using default configuration' };
    default:
      return super.handleAgentSpecificError(error, context);
  }
}
```

### Hook Usage

```typescript
// Tool monitoring hook
const hooks: AgentHooks = {
  preToolUse: [
    async (toolName, input) => {
      if (toolName === 'Bash' && input.command.includes('sudo')) {
        console.warn('Sudo command detected, proceeding with caution');
      }
      return true;
    }
  ],
  postToolUse: [
    async (toolName, input, result) => {
      console.log(`${toolName} executed in ${result.duration}ms`);
    }
  ]
};
```

### Session Management

```typescript
// Long-running operation with session persistence
const sessionManager = new SessionManager('./sessions');
const sessionId = await sessionManager.createSession('my-agent', 'exec-123', options);

try {
  const result = await agent.execute({ ...options, sessionId });
} catch (error) {
  // Session is automatically saved, can be resumed later
  console.log(`Session ${sessionId} can be resumed`);
}
```

This API reference provides complete documentation for all framework components. For practical usage examples, see [examples.md](./examples.md).