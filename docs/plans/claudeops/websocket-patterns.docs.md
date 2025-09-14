# WebSocket Integration Patterns for Next.js Real-Time Applications

*A comprehensive guide to implementing WebSocket patterns for the ClaudeOps project*

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [WebSocket vs Server-Sent Events Analysis](#websocket-vs-server-sent-events-analysis)
3. [WebSocket Server Implementation Patterns](#websocket-server-implementation-patterns)
4. [Client-Side Connection Management](#client-side-connection-management)
5. [Real-Time Log Streaming Patterns](#real-time-log-streaming-patterns)
6. [Connection State Management](#connection-state-management)
7. [Error Handling and Reconnection Strategies](#error-handling-and-reconnection-strategies)
8. [Performance Optimization](#performance-optimization)
9. [Security Considerations](#security-considerations)
10. [Implementation Recommendations](#implementation-recommendations)
11. [Code Examples](#code-examples)

---

## Executive Summary

Based on comprehensive research into modern WebSocket integration patterns for Next.js applications, this document provides implementation strategies specifically tailored for the ClaudeOps project's real-time agent execution monitoring requirements.

### Key Findings:

- **WebSocket is recommended over SSE** for bidirectional communication needs (agent control + log streaming)
- **Custom server setup required** for Next.js WebSocket integration (not supported in serverless)
- **`ws` library provides optimal performance** for Node.js WebSocket servers
- **React custom hooks pattern** is ideal for connection management
- **Connection pooling and heartbeat mechanisms** are essential for reliability

---

## WebSocket vs Server-Sent Events Analysis

### Use Case Comparison

| Feature | WebSocket | Server-Sent Events (SSE) | Recommendation |
|---------|-----------|-------------------------|----------------|
| **Bidirectional Communication** | ✅ Full duplex | ❌ Server-to-client only | WebSocket for agent control |
| **Agent Execution Control** | ✅ Start/stop/cancel agents | ❌ Requires separate HTTP requests | WebSocket preferred |
| **Real-time Log Streaming** | ✅ Excellent | ✅ Excellent | Either works well |
| **Connection Overhead** | Medium (persistent) | Low (HTTP-based) | SSE for simple streaming |
| **Browser Support** | ✅ Universal | ✅ Universal (with polyfill) | Both supported |
| **Serverless Compatibility** | ❌ Not supported | ✅ Supported | SSE for serverless |
| **Implementation Complexity** | Higher | Lower | SSE for simplicity |

### Recommendation for ClaudeOps

**Choose WebSocket** because:
1. Need bidirectional communication for agent control (start, stop, cancel)
2. Real-time updates for both logs AND execution status
3. Local deployment eliminates serverless constraints
4. Superior performance for high-frequency updates

---

## WebSocket Server Implementation Patterns

### Pattern 1: Next.js Custom Server with `ws` Library

**Recommended for production-ready applications**

```typescript
// server.js - Custom Next.js server
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // WebSocket server setup
  const wss = new WebSocketServer({ 
    server,
    path: '/api/ws',
    clientTracking: true
  });

  wss.on('connection', (ws, req) => {
    console.log('Client connected:', req.socket.remoteAddress);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to Agent Runner'
    }));

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleWebSocketMessage(ws, message);
      } catch (error) {
        console.error('Invalid message format:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      console.log('Client disconnected');
      // Cleanup any running processes for this client
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Start server
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
```

### Pattern 2: Message Handler with Type Safety

```typescript
// lib/websocket/messageHandler.ts
interface AgentMessage {
  type: 'execute' | 'cancel' | 'status';
  executionId?: string;
  agentType?: string;
  payload?: any;
}

interface LogMessage {
  type: 'log';
  executionId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

type WebSocketMessage = AgentMessage | LogMessage;

export async function handleWebSocketMessage(
  ws: WebSocket,
  message: WebSocketMessage
) {
  switch (message.type) {
    case 'execute':
      await handleAgentExecution(ws, message);
      break;
    case 'cancel':
      await handleAgentCancellation(ws, message);
      break;
    case 'status':
      await handleStatusRequest(ws, message);
      break;
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown message type: ${message.type}`
      }));
  }
}

async function handleAgentExecution(ws: WebSocket, message: AgentMessage) {
  const executionId = generateExecutionId();
  
  // Store WebSocket reference for this execution
  ExecutionManager.registerExecution(executionId, ws);
  
  // Start agent execution
  const execution = await AgentExecutor.start({
    type: message.agentType!,
    executionId,
    onLog: (logData) => {
      ws.send(JSON.stringify({
        type: 'log',
        executionId,
        ...logData
      }));
    },
    onStatusChange: (status) => {
      ws.send(JSON.stringify({
        type: 'status',
        executionId,
        status
      }));
    }
  });
  
  ws.send(JSON.stringify({
    type: 'execution_started',
    executionId,
    agentType: message.agentType
  }));
}
```

### Pattern 3: Broadcasting to Multiple Clients

```typescript
// lib/websocket/broadcast.ts
export class WebSocketBroadcaster {
  private static clients = new Set<WebSocket>();
  
  static addClient(ws: WebSocket) {
    this.clients.add(ws);
    
    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }
  
  static broadcast(message: object, excludeClient?: WebSocket) {
    const data = JSON.stringify(message);
    
    this.clients.forEach(client => {
      if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }
  
  static broadcastToExecution(executionId: string, message: object) {
    // Send to clients subscribed to specific execution
    const subscribers = ExecutionManager.getSubscribers(executionId);
    subscribers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }
}
```

---

## Client-Side Connection Management

### Pattern 1: Custom React Hook with TypeScript

```typescript
// hooks/useWebSocket.ts
import { useCallback, useEffect, useRef, useState } from 'react';

interface WebSocketConfig {
  url: string;
  protocols?: string[];
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

interface WebSocketState {
  socket: WebSocket | null;
  lastMessage: any;
  readyState: number;
  isConnected: boolean;
}

export function useWebSocket(config: WebSocketConfig) {
  const [socketState, setSocketState] = useState<WebSocketState>({
    socket: null,
    lastMessage: null,
    readyState: WebSocket.CONNECTING,
    isConnected: false
  });
  
  const [reconnectCount, setReconnectCount] = useState(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const socketRef = useRef<WebSocket | null>(null);
  
  const connect = useCallback(() => {
    try {
      const socket = new WebSocket(config.url, config.protocols);
      socketRef.current = socket;
      
      socket.onopen = (event) => {
        console.log('WebSocket connected');
        setSocketState(prev => ({
          ...prev,
          socket,
          readyState: socket.readyState,
          isConnected: true
        }));
        setReconnectCount(0);
        config.onOpen?.(event);
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setSocketState(prev => ({
            ...prev,
            lastMessage: data
          }));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      socket.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setSocketState(prev => ({
          ...prev,
          socket: null,
          readyState: WebSocket.CLOSED,
          isConnected: false
        }));
        
        config.onClose?.(event);
        
        // Attempt reconnection
        if (reconnectCount < (config.reconnectAttempts || 5)) {
          const delay = (config.reconnectInterval || 1000) * Math.pow(2, reconnectCount);
          console.log(`Attempting reconnect in ${delay}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectCount(prev => prev + 1);
            connect();
          }, delay);
        }
      };
      
      socket.onerror = (event) => {
        console.error('WebSocket error:', event);
        config.onError?.(event);
      };
      
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
    }
  }, [config, reconnectCount]);
  
  const sendMessage = useCallback((message: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);
  
  return {
    ...socketState,
    sendMessage,
    disconnect,
    reconnect: connect,
    reconnectCount
  };
}
```

### Pattern 2: WebSocket Context Provider

```typescript
// contexts/WebSocketContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';

interface WebSocketContextType {
  sendMessage: (message: any) => void;
  lastMessage: any;
  isConnected: boolean;
  reconnectCount: number;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
  url: string;
}

export function WebSocketProvider({ children, url }: WebSocketProviderProps) {
  const websocket = useWebSocket({
    url,
    reconnectAttempts: 5,
    reconnectInterval: 1000,
    onOpen: () => console.log('Connected to agent runner'),
    onClose: () => console.log('Disconnected from agent runner'),
    onError: (error) => console.error('WebSocket error:', error)
  });
  
  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within WebSocketProvider');
  }
  return context;
}
```

---

## Real-Time Log Streaming Patterns

### Pattern 1: Log Buffer Management

```typescript
// hooks/useLogStream.ts
import { useEffect, useState } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

interface LogEntry {
  id: string;
  executionId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export function useLogStream(executionId: string, maxLogs = 1000) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const { lastMessage, sendMessage } = useWebSocketContext();
  
  useEffect(() => {
    if (lastMessage?.type === 'log' && lastMessage.executionId === executionId) {
      setLogs(prevLogs => {
        const newLogs = [...prevLogs, lastMessage];
        // Maintain maximum log buffer size
        return newLogs.length > maxLogs 
          ? newLogs.slice(-maxLogs) 
          : newLogs;
      });
    }
    
    if (lastMessage?.type === 'execution_started' && lastMessage.executionId === executionId) {
      setIsStreaming(true);
      setLogs([]); // Clear previous logs
    }
    
    if (lastMessage?.type === 'execution_completed' && lastMessage.executionId === executionId) {
      setIsStreaming(false);
    }
  }, [lastMessage, executionId, maxLogs]);
  
  const clearLogs = () => setLogs([]);
  
  const subscribeToExecution = (execId: string) => {
    sendMessage({
      type: 'subscribe',
      executionId: execId
    });
  };
  
  return {
    logs,
    isStreaming,
    clearLogs,
    subscribeToExecution
  };
}
```

### Pattern 2: Virtual Log Scrolling

```typescript
// components/LogViewer.tsx
import React, { useEffect, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import { useLogStream } from '../hooks/useLogStream';

interface LogViewerProps {
  executionId: string;
  height?: number;
}

export function LogViewer({ executionId, height = 400 }: LogViewerProps) {
  const { logs, isStreaming } = useLogStream(executionId);
  const listRef = useRef<List>(null);
  
  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logs.length > 0 && listRef.current) {
      listRef.current.scrollToItem(logs.length - 1, 'end');
    }
  }, [logs.length]);
  
  const LogItem = ({ index, style }: { index: number; style: any }) => {
    const log = logs[index];
    const levelColor = {
      info: 'text-blue-600',
      warn: 'text-yellow-600', 
      error: 'text-red-600'
    }[log.level];
    
    return (
      <div style={style} className="px-4 py-1 font-mono text-sm border-b">
        <span className="text-gray-500">{log.timestamp}</span>
        <span className={`ml-2 ${levelColor}`}>[{log.level.toUpperCase()}]</span>
        <span className="ml-2">{log.message}</span>
      </div>
    );
  };
  
  return (
    <div className="border rounded-lg bg-gray-50">
      <div className="p-2 border-b bg-gray-100 flex justify-between items-center">
        <h3 className="font-semibold">Execution Logs</h3>
        {isStreaming && (
          <div className="flex items-center text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" />
            Streaming
          </div>
        )}
      </div>
      <List
        ref={listRef}
        height={height}
        itemCount={logs.length}
        itemSize={32}
        itemData={logs}
      >
        {LogItem}
      </List>
    </div>
  );
}
```

---

## Connection State Management

### Pattern 1: Connection State Hook

```typescript
// hooks/useConnectionState.ts
import { useState, useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastConnected: Date | null;
  reconnectCount: number;
  latency: number | null;
}

export function useConnectionState() {
  const { isConnected, reconnectCount, sendMessage, lastMessage } = useWebSocketContext();
  const [state, setState] = useState<ConnectionState>({
    status: 'connecting',
    lastConnected: null,
    reconnectCount: 0,
    latency: null
  });
  
  const [pingStart, setPingStart] = useState<number | null>(null);
  
  // Update connection status
  useEffect(() => {
    if (isConnected) {
      setState(prev => ({
        ...prev,
        status: 'connected',
        lastConnected: new Date(),
        reconnectCount
      }));
    } else {
      setState(prev => ({
        ...prev,
        status: reconnectCount > 0 ? 'disconnected' : 'connecting',
        reconnectCount
      }));
    }
  }, [isConnected, reconnectCount]);
  
  // Handle pong responses for latency measurement
  useEffect(() => {
    if (lastMessage?.type === 'pong' && pingStart) {
      const latency = Date.now() - pingStart;
      setState(prev => ({ ...prev, latency }));
      setPingStart(null);
    }
  }, [lastMessage, pingStart]);
  
  const measureLatency = () => {
    if (isConnected) {
      setPingStart(Date.now());
      sendMessage({ type: 'ping', timestamp: Date.now() });
    }
  };
  
  return {
    ...state,
    measureLatency
  };
}
```

### Pattern 2: Connection Status Indicator

```typescript
// components/ConnectionIndicator.tsx
import React from 'react';
import { useConnectionState } from '../hooks/useConnectionState';

export function ConnectionIndicator() {
  const { status, lastConnected, reconnectCount, latency } = useConnectionState();
  
  const statusConfig = {
    connecting: {
      color: 'bg-yellow-500',
      text: 'Connecting...',
      icon: '⏳'
    },
    connected: {
      color: 'bg-green-500',
      text: 'Connected',
      icon: '✅'
    },
    disconnected: {
      color: 'bg-red-500',
      text: 'Disconnected',
      icon: '❌'
    },
    error: {
      color: 'bg-red-600',
      text: 'Connection Error',
      icon: '⚠️'
    }
  };
  
  const config = statusConfig[status];
  
  return (
    <div className="flex items-center space-x-2 text-sm">
      <div className={`w-3 h-3 rounded-full ${config.color}`} />
      <span>{config.icon} {config.text}</span>
      
      {status === 'connected' && latency && (
        <span className="text-gray-500">({latency}ms)</span>
      )}
      
      {reconnectCount > 0 && (
        <span className="text-gray-500">(Attempt #{reconnectCount})</span>
      )}
      
      {lastConnected && (
        <span className="text-gray-400">
          Last: {lastConnected.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
```

---

## Error Handling and Reconnection Strategies

### Pattern 1: Exponential Backoff Reconnection

```typescript
// lib/websocket/reconnection.ts
export class ReconnectionManager {
  private attempts = 0;
  private maxAttempts = 10;
  private baseDelay = 1000; // 1 second
  private maxDelay = 30000; // 30 seconds
  private timeoutId: NodeJS.Timeout | null = null;
  
  constructor(
    private reconnectFn: () => void,
    private onMaxAttemptsReached?: () => void
  ) {}
  
  scheduleReconnect() {
    if (this.attempts >= this.maxAttempts) {
      console.error('Max reconnection attempts reached');
      this.onMaxAttemptsReached?.();
      return;
    }
    
    const delay = Math.min(
      this.baseDelay * Math.pow(2, this.attempts),
      this.maxDelay
    );
    
    console.log(`Scheduling reconnect attempt ${this.attempts + 1} in ${delay}ms`);
    
    this.timeoutId = setTimeout(() => {
      this.attempts++;
      this.reconnectFn();
    }, delay);
  }
  
  reset() {
    this.attempts = 0;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
  
  cancel() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
```

### Pattern 2: Error Recovery Strategies

```typescript
// lib/websocket/errorHandling.ts
export enum WebSocketErrorType {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  SERVER_ERROR = 'SERVER_ERROR'
}

export interface WebSocketError {
  type: WebSocketErrorType;
  message: string;
  code?: number;
  recoverable: boolean;
  timestamp: Date;
}

export class ErrorHandler {
  private errorHistory: WebSocketError[] = [];
  
  handleError(error: Event | CloseEvent, ws: WebSocket): WebSocketError {
    let wsError: WebSocketError;
    
    if (error instanceof CloseEvent) {
      wsError = this.handleCloseEvent(error);
    } else {
      wsError = this.handleGenericError(error);
    }
    
    this.errorHistory.push(wsError);
    this.logError(wsError);
    
    return wsError;
  }
  
  private handleCloseEvent(event: CloseEvent): WebSocketError {
    const { code, reason } = event;
    
    switch (code) {
      case 1000: // Normal closure
        return {
          type: WebSocketErrorType.CONNECTION_FAILED,
          message: 'Connection closed normally',
          code,
          recoverable: true,
          timestamp: new Date()
        };
        
      case 1001: // Going away
        return {
          type: WebSocketErrorType.CONNECTION_FAILED,
          message: 'Server is going away',
          code,
          recoverable: true,
          timestamp: new Date()
        };
        
      case 1006: // Abnormal closure
        return {
          type: WebSocketErrorType.NETWORK_ERROR,
          message: 'Connection lost unexpectedly',
          code,
          recoverable: true,
          timestamp: new Date()
        };
        
      case 1011: // Server error
        return {
          type: WebSocketErrorType.SERVER_ERROR,
          message: reason || 'Internal server error',
          code,
          recoverable: false,
          timestamp: new Date()
        };
        
      case 1008: // Policy violation
        return {
          type: WebSocketErrorType.AUTHENTICATION_ERROR,
          message: 'Authentication failed',
          code,
          recoverable: false,
          timestamp: new Date()
        };
        
      default:
        return {
          type: WebSocketErrorType.CONNECTION_FAILED,
          message: reason || `Connection closed with code ${code}`,
          code,
          recoverable: true,
          timestamp: new Date()
        };
    }
  }
  
  private handleGenericError(error: Event): WebSocketError {
    return {
      type: WebSocketErrorType.NETWORK_ERROR,
      message: 'WebSocket connection error',
      recoverable: true,
      timestamp: new Date()
    };
  }
  
  private logError(error: WebSocketError) {
    const logLevel = error.recoverable ? 'warn' : 'error';
    console[logLevel]('WebSocket error:', {
      type: error.type,
      message: error.message,
      code: error.code,
      recoverable: error.recoverable,
      timestamp: error.timestamp
    });
  }
  
  getRecentErrors(minutes = 5): WebSocketError[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.errorHistory.filter(error => error.timestamp > cutoff);
  }
  
  clearHistory() {
    this.errorHistory = [];
  }
}
```

### Pattern 3: Heartbeat Implementation

```typescript
// lib/websocket/heartbeat.ts
export class HeartbeatManager {
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private interval = 30000; // 30 seconds
  private timeout = 5000; // 5 seconds
  
  constructor(
    private ws: WebSocket,
    private onTimeout: () => void
  ) {}
  
  start() {
    this.stop(); // Clear any existing intervals
    
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendPing();
      }
    }, this.interval);
  }
  
  stop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }
  
  private sendPing() {
    this.ws.send(JSON.stringify({
      type: 'ping',
      timestamp: Date.now()
    }));
    
    // Set timeout for pong response
    this.pongTimeout = setTimeout(() => {
      console.warn('Heartbeat timeout - connection appears dead');
      this.onTimeout();
    }, this.timeout);
  }
  
  handlePong() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }
}
```

---

## Performance Optimization

### Pattern 1: Message Queuing and Batching

```typescript
// lib/websocket/messageQueue.ts
interface QueuedMessage {
  id: string;
  type: string;
  payload: any;
  timestamp: Date;
  priority: number;
}

export class MessageQueue {
  private queue: QueuedMessage[] = [];
  private batchSize = 10;
  private batchTimeout = 100; // ms
  private timeoutId: NodeJS.Timeout | null = null;
  
  constructor(
    private sendFunction: (messages: QueuedMessage[]) => void
  ) {}
  
  enqueue(message: Omit<QueuedMessage, 'id' | 'timestamp'>) {
    const queuedMessage: QueuedMessage = {
      ...message,
      id: this.generateId(),
      timestamp: new Date()
    };
    
    // Insert based on priority (higher priority first)
    const insertIndex = this.queue.findIndex(m => m.priority < message.priority);
    if (insertIndex === -1) {
      this.queue.push(queuedMessage);
    } else {
      this.queue.splice(insertIndex, 0, queuedMessage);
    }
    
    this.scheduleBatch();
  }
  
  private scheduleBatch() {
    if (this.timeoutId) return;
    
    if (this.queue.length >= this.batchSize) {
      this.sendBatch();
    } else {
      this.timeoutId = setTimeout(() => {
        this.sendBatch();
      }, this.batchTimeout);
    }
  }
  
  private sendBatch() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    if (this.queue.length === 0) return;
    
    const batch = this.queue.splice(0, this.batchSize);
    this.sendFunction(batch);
  }
  
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  flush() {
    if (this.queue.length > 0) {
      this.sendBatch();
    }
  }
  
  clear() {
    this.queue = [];
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
```

### Pattern 2: Connection Pooling

```typescript
// lib/websocket/connectionPool.ts
export class WebSocketPool {
  private static instance: WebSocketPool;
  private connections = new Map<string, WebSocket>();
  private maxConnections = 5;
  
  static getInstance(): WebSocketPool {
    if (!WebSocketPool.instance) {
      WebSocketPool.instance = new WebSocketPool();
    }
    return WebSocketPool.instance;
  }
  
  getConnection(key: string, url: string): WebSocket {
    let connection = this.connections.get(key);
    
    if (!connection || connection.readyState === WebSocket.CLOSED) {
      // Remove dead connection
      if (connection) {
        this.connections.delete(key);
      }
      
      // Check connection limit
      if (this.connections.size >= this.maxConnections) {
        this.closeOldestConnection();
      }
      
      // Create new connection
      connection = new WebSocket(url);
      this.connections.set(key, connection);
      
      connection.onclose = () => {
        this.connections.delete(key);
      };
    }
    
    return connection;
  }
  
  private closeOldestConnection() {
    const [oldestKey] = this.connections.keys();
    const oldestConnection = this.connections.get(oldestKey);
    
    if (oldestConnection) {
      oldestConnection.close();
      this.connections.delete(oldestKey);
    }
  }
  
  closeAll() {
    this.connections.forEach(connection => {
      if (connection.readyState === WebSocket.OPEN) {
        connection.close();
      }
    });
    this.connections.clear();
  }
  
  getActiveConnections(): number {
    return Array.from(this.connections.values()).filter(
      ws => ws.readyState === WebSocket.OPEN
    ).length;
  }
}
```

---

## Security Considerations

### Pattern 1: Authentication and Authorization

```typescript
// lib/websocket/auth.ts
import jwt from 'jsonwebtoken';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  permissions?: string[];
}

export class WebSocketAuthenticator {
  static async authenticate(
    ws: AuthenticatedWebSocket,
    request: any
  ): Promise<boolean> {
    try {
      const token = this.extractToken(request);
      if (!token) {
        this.sendAuthError(ws, 'No authentication token provided');
        return false;
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      // Attach user info to WebSocket
      ws.userId = decoded.userId;
      ws.permissions = decoded.permissions || [];
      
      console.log(`User ${decoded.userId} authenticated via WebSocket`);
      return true;
      
    } catch (error) {
      this.sendAuthError(ws, 'Invalid authentication token');
      return false;
    }
  }
  
  private static extractToken(request: any): string | null {
    // Try query parameter first
    const queryToken = request.url?.includes('token=') 
      ? new URL(request.url, 'ws://localhost').searchParams.get('token')
      : null;
    
    if (queryToken) return queryToken;
    
    // Try Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    return null;
  }
  
  private static sendAuthError(ws: WebSocket, message: string) {
    ws.send(JSON.stringify({
      type: 'error',
      code: 'AUTH_FAILED',
      message
    }));
    ws.close(1008, 'Authentication failed');
  }
  
  static hasPermission(ws: AuthenticatedWebSocket, permission: string): boolean {
    return ws.permissions?.includes(permission) || false;
  }
}
```

### Pattern 2: Rate Limiting

```typescript
// lib/websocket/rateLimiter.ts
interface ClientLimits {
  messagesPerMinute: number;
  lastReset: Date;
  messageCount: number;
}

export class WebSocketRateLimiter {
  private clientLimits = new Map<string, ClientLimits>();
  private defaultLimit = 60; // messages per minute
  
  checkLimit(clientId: string, customLimit?: number): boolean {
    const limit = customLimit || this.defaultLimit;
    const now = new Date();
    
    let clientData = this.clientLimits.get(clientId);
    
    if (!clientData) {
      clientData = {
        messagesPerMinute: limit,
        lastReset: now,
        messageCount: 0
      };
      this.clientLimits.set(clientId, clientData);
    }
    
    // Reset counter if a minute has passed
    const timeDiff = now.getTime() - clientData.lastReset.getTime();
    if (timeDiff >= 60000) {
      clientData.messageCount = 0;
      clientData.lastReset = now;
    }
    
    // Check if limit exceeded
    if (clientData.messageCount >= limit) {
      return false;
    }
    
    clientData.messageCount++;
    return true;
  }
  
  getRemainingMessages(clientId: string): number {
    const clientData = this.clientLimits.get(clientId);
    if (!clientData) return this.defaultLimit;
    
    return Math.max(0, clientData.messagesPerMinute - clientData.messageCount);
  }
  
  cleanup() {
    const cutoff = new Date(Date.now() - 300000); // 5 minutes ago
    
    for (const [clientId, data] of this.clientLimits.entries()) {
      if (data.lastReset < cutoff) {
        this.clientLimits.delete(clientId);
      }
    }
  }
}
```

---

## Implementation Recommendations

### For ClaudeOps

Based on the project requirements and research findings, here are the specific recommendations:

#### 1. **Use Custom Next.js Server with `ws` Library**
- Provides maximum control and performance
- Supports the bidirectional communication needed for agent control
- Well-suited for local deployment model

#### 2. **Implement Hierarchical Connection Management**
```
WebSocketProvider (App Level)
├── ExecutionManager (Execution-specific connections)
├── LogStream (Real-time log streaming)
└── StatusUpdates (Agent status changes)
```

#### 3. **Message Types for Agent Runner**
```typescript
interface AgentRunnerMessages {
  // Client to Server
  'agent:execute': { agentType: string; config: any };
  'agent:cancel': { executionId: string };
  'agent:status': { executionId: string };
  'logs:subscribe': { executionId: string };
  
  // Server to Client
  'execution:started': { executionId: string; agentType: string };
  'execution:log': { executionId: string; level: string; message: string };
  'execution:progress': { executionId: string; progress: number };
  'execution:completed': { executionId: string; result: any; cost: number };
  'execution:failed': { executionId: string; error: string };
  'system:status': { cpu: number; memory: number; disk: number };
}
```

#### 4. **File Structure**
```
src/
├── lib/
│   ├── websocket/
│   │   ├── server.ts          # WebSocket server setup
│   │   ├── messageHandler.ts  # Message routing and handling
│   │   ├── executionManager.ts # Agent execution management
│   │   └── broadcaster.ts     # Message broadcasting
├── hooks/
│   ├── useWebSocket.ts        # Base WebSocket hook
│   ├── useAgentExecution.ts   # Agent execution hook
│   └── useLogStream.ts        # Log streaming hook
├── contexts/
│   └── WebSocketContext.tsx   # WebSocket provider
└── components/
    ├── ConnectionIndicator.tsx
    ├── LogViewer.tsx
    └── ExecutionControl.tsx
```

#### 5. **Performance Optimizations**
- Implement log buffer management (max 1000 entries)
- Use virtual scrolling for log viewer
- Batch non-critical messages (status updates)
- Implement compression for large messages

#### 6. **Error Handling Strategy**
- Exponential backoff for reconnection (max 10 attempts)
- Graceful degradation to HTTP polling if WebSocket fails
- Clear error messages for users
- Automatic cleanup of failed executions

---

## Code Examples

### Complete Next.js Integration Example

```typescript
// pages/_app.tsx
import { WebSocketProvider } from '../contexts/WebSocketContext';

function MyApp({ Component, pageProps }) {
  return (
    <WebSocketProvider url="ws://localhost:3000/api/ws">
      <Component {...pageProps} />
    </WebSocketProvider>
  );
}

export default MyApp;
```

```typescript
// components/AgentDashboard.tsx
import React from 'react';
import { useAgentExecution } from '../hooks/useAgentExecution';
import { LogViewer } from './LogViewer';
import { ConnectionIndicator } from './ConnectionIndicator';

export function AgentDashboard() {
  const { executeAgent, cancelExecution, activeExecutions } = useAgentExecution();
  
  const handleExecuteHealthCheck = async () => {
    const execution = await executeAgent({
      type: 'system-health',
      config: { includeDockerStats: true }
    });
    console.log('Started execution:', execution.id);
  };
  
  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Agent Dashboard</h1>
        <ConnectionIndicator />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Quick Actions</h2>
          <button
            onClick={handleExecuteHealthCheck}
            className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Run System Health Check
          </button>
        </div>
        
        <div>
          <h2 className="text-lg font-semibold mb-4">Active Executions</h2>
          {activeExecutions.map(execution => (
            <div key={execution.id} className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">{execution.agentType}</span>
                <button
                  onClick={() => cancelExecution(execution.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm"
                >
                  Cancel
                </button>
              </div>
              <LogViewer executionId={execution.id} height={200} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

This comprehensive documentation provides a solid foundation for implementing WebSocket patterns in the ClaudeOps project, with specific focus on real-time agent execution monitoring and log streaming.