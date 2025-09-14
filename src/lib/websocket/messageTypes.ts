// Base message interface
export interface BaseMessage {
  id?: string;
  timestamp: string;
}

// Client to server messages
export interface AgentExecuteMessage extends BaseMessage {
  type: 'agent:execute';
  agentType: string;
  executionId?: string;
  config?: Record<string, unknown>;
}

export interface AgentCancelMessage extends BaseMessage {
  type: 'agent:cancel';
  executionId: string;
}

export interface AgentStatusMessage extends BaseMessage {
  type: 'agent:status';
  executionId: string;
}

export interface LogsSubscribeMessage extends BaseMessage {
  type: 'logs:subscribe';
  executionId: string;
}

export interface LogsUnsubscribeMessage extends BaseMessage {
  type: 'logs:unsubscribe';
  executionId: string;
}

export interface PingMessage extends BaseMessage {
  type: 'ping';
}

export type ClientMessage = 
  | AgentExecuteMessage
  | AgentCancelMessage 
  | AgentStatusMessage
  | LogsSubscribeMessage
  | LogsUnsubscribeMessage
  | PingMessage;

// Server to client messages
export interface ConnectionMessage extends BaseMessage {
  type: 'connection';
  message: string;
  clientId: string;
}

export interface ExecutionStartedMessage extends BaseMessage {
  type: 'execution:started';
  executionId: string;
  agentType: string;
}

export interface ExecutionLogMessage extends BaseMessage {
  type: 'execution:log';
  executionId: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

export interface ExecutionProgressMessage extends BaseMessage {
  type: 'execution:progress';
  executionId: string;
  progress: number;
  step?: string;
}

export interface ExecutionCompletedMessage extends BaseMessage {
  type: 'execution:completed';
  executionId: string;
  result: {
    success: boolean;
    data?: unknown;
    summary?: string;
    costUsd?: number;
    durationMs?: number;
  };
}

export interface ExecutionFailedMessage extends BaseMessage {
  type: 'execution:failed';
  executionId: string;
  error: {
    message: string;
    code?: string;
    stack?: string;
  };
}

export interface CostUpdatedMessage extends BaseMessage {
  type: 'cost:updated';
  executionId: string;
  currentCost: number;
  totalCost: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheHits?: number;
  };
}

export interface SystemStatusMessage extends BaseMessage {
  type: 'system:status';
  status: 'healthy' | 'warning' | 'error';
  details?: {
    cpu?: number;
    memory?: number;
    disk?: number;
    services?: Array<{ name: string; status: string }>;
  };
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: string;
  message: string;
  details?: unknown;
}

export interface PongMessage extends BaseMessage {
  type: 'pong';
}

export interface BatchMessage extends BaseMessage {
  type: 'batch';
  messages: ServerMessage[];
}

export type ServerMessage = 
  | ConnectionMessage
  | ExecutionStartedMessage
  | ExecutionLogMessage
  | ExecutionProgressMessage
  | ExecutionCompletedMessage
  | ExecutionFailedMessage
  | CostUpdatedMessage
  | SystemStatusMessage
  | ErrorMessage
  | PongMessage
  | BatchMessage;

// Message validation helpers
export function isValidClientMessage(data: unknown): data is ClientMessage {
  if (!data || typeof data !== 'object') return false;
  
  const msg = data as Record<string, unknown>;
  if (typeof msg.type !== 'string' || typeof msg.timestamp !== 'string') return false;

  const validTypes = [
    'agent:execute',
    'agent:cancel', 
    'agent:status',
    'logs:subscribe',
    'logs:unsubscribe',
    'ping'
  ];

  return validTypes.includes(msg.type);
}

// Overloaded function for better type safety
export function createMessage(type: 'connection', data: Omit<ConnectionMessage, 'type' | 'timestamp'> & { timestamp?: string }): ConnectionMessage;
export function createMessage(type: 'execution:started', data: Omit<ExecutionStartedMessage, 'type' | 'timestamp'> & { timestamp?: string }): ExecutionStartedMessage;
export function createMessage(type: 'execution:log', data: Omit<ExecutionLogMessage, 'type' | 'timestamp'> & { timestamp?: string }): ExecutionLogMessage;
export function createMessage(type: 'execution:progress', data: Omit<ExecutionProgressMessage, 'type' | 'timestamp'> & { timestamp?: string }): ExecutionProgressMessage;
export function createMessage(type: 'execution:completed', data: Omit<ExecutionCompletedMessage, 'type' | 'timestamp'> & { timestamp?: string }): ExecutionCompletedMessage;
export function createMessage(type: 'execution:failed', data: Omit<ExecutionFailedMessage, 'type' | 'timestamp'> & { timestamp?: string }): ExecutionFailedMessage;
export function createMessage(type: 'cost:updated', data: Omit<CostUpdatedMessage, 'type' | 'timestamp'> & { timestamp?: string }): CostUpdatedMessage;
export function createMessage(type: 'system:status', data: Omit<SystemStatusMessage, 'type' | 'timestamp'> & { timestamp?: string }): SystemStatusMessage;
export function createMessage(type: 'error', data: Omit<ErrorMessage, 'type' | 'timestamp'> & { timestamp?: string }): ErrorMessage;
export function createMessage(type: 'pong', data: Omit<PongMessage, 'type' | 'timestamp'> & { timestamp?: string }): PongMessage;
export function createMessage(type: 'batch', data: Omit<BatchMessage, 'type' | 'timestamp'> & { timestamp?: string }): BatchMessage;
export function createMessage(type: string, data: any): ServerMessage {
  return {
    type,
    timestamp: data.timestamp || new Date().toISOString(),
    ...data
  } as ServerMessage;
}

// Message priority for queue management
export function getMessagePriority(message: ServerMessage): number {
  switch (message.type) {
    case 'execution:failed':
    case 'error':
      return 10; // Highest priority
    case 'execution:started':
    case 'execution:completed':
      return 8;
    case 'execution:progress':
      return 6;
    case 'cost:updated':
      return 5;
    case 'execution:log':
      return 4;
    case 'system:status':
      return 3;
    case 'connection':
    case 'pong':
      return 1; // Lowest priority
    default:
      return 2;
  }
}