import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { ConnectionManager } from './connectionManager';
import { isAllowedOrigin } from '../../../server';
import { 
  ServerMessage, 
  createMessage,
  ExecutionLogMessage,
  ExecutionStartedMessage,
  ExecutionCompletedMessage,
  ExecutionFailedMessage,
  ExecutionProgressMessage,
  CostUpdatedMessage,
  SystemStatusMessage
} from './messageTypes';

export class WebSocketManager {
  private connectionManager: ConnectionManager;
  private wss: WebSocketServer;
  private messageBuffer: ServerMessage[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  private readonly batchSize = 50;
  private readonly batchTimeoutMs = 100;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.connectionManager = new ConnectionManager();
    this.setupWebSocketServer();

    console.log('WebSocket server initialized');
  }

  /**
   * Set up WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      try {
        // Validate origin using consolidated validation function
        const origin = request.headers.origin;
        const host = request.headers.host;
        
        if (!isAllowedOrigin(origin || '', host)) {
          console.warn(`Rejected WebSocket connection from invalid origin: ${origin}`);
          ws.close(1008, 'Invalid origin');
          return;
        }

        // Add connection to manager
        const clientId = this.connectionManager.addConnection(ws, request);
        
        // Log connection details
        console.log(`WebSocket connection established: ${clientId}`, {
          ip: request.socket.remoteAddress,
          userAgent: request.headers['user-agent'],
          origin: request.headers.origin
        });

      } catch (error) {
        console.error('Error handling WebSocket connection:', error);
        ws.close(1011, 'Internal server error');
      }
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    this.wss.on('close', () => {
      console.log('WebSocket server closed');
    });

  }


  // Public API methods for broadcasting different types of messages

  /**
   * Notify clients that an agent execution has started
   */
  notifyExecutionStarted(executionId: string, agentType: string): void {
    const message = createMessage('execution:started', {
      executionId,
      agentType
    });

    this.connectionManager.broadcastToExecution(executionId, message);
    console.log(`Notified execution start: ${executionId} (${agentType})`);
  }

  /**
   * Stream a log message to subscribed clients
   */
  streamLog(
    executionId: string, 
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    source?: string
  ): void {
    const logMessage = createMessage('execution:log', {
      executionId,
      level,
      message,
      source
    });

    // Use batching for high-frequency log messages
    this.addToBatch(logMessage, executionId);
  }

  /**
   * Update execution progress
   */
  updateExecutionProgress(
    executionId: string,
    progress: number,
    step?: string
  ): void {
    const message = createMessage('execution:progress', {
      executionId,
      progress: Math.max(0, Math.min(100, progress)), // Clamp to 0-100
      step
    });

    this.connectionManager.broadcastToExecution(executionId, message);
  }

  /**
   * Notify clients that an execution has completed
   */
  notifyExecutionCompleted(
    executionId: string,
    result: {
      success: boolean;
      data?: unknown;
      summary?: string;
      costUsd?: number;
      durationMs?: number;
    }
  ): void {
    const message = createMessage('execution:completed', {
      executionId,
      result
    });

    this.connectionManager.broadcastToExecution(executionId, message);
    this.flushBatch(); // Ensure completion message is sent immediately
    console.log(`Notified execution completion: ${executionId}`);
  }

  /**
   * Notify clients that an execution has failed
   */
  notifyExecutionFailed(
    executionId: string,
    error: {
      message: string;
      code?: string;
      stack?: string;
    }
  ): void {
    const message = createMessage('execution:failed', {
      executionId,
      error
    });

    this.connectionManager.broadcastToExecution(executionId, message);
    this.flushBatch(); // Ensure error message is sent immediately
    console.error(`Notified execution failure: ${executionId} - ${error.message}`);
  }

  /**
   * Update cost information for an execution
   */
  updateExecutionCost(
    executionId: string,
    currentCost: number,
    totalCost: number,
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      cacheHits?: number;
    }
  ): void {
    const message = createMessage('cost:updated', {
      executionId,
      currentCost,
      totalCost,
      tokenUsage
    });

    this.connectionManager.broadcastToExecution(executionId, message);
  }

  /**
   * Broadcast system status to all clients
   */
  broadcastSystemStatus(
    status: 'healthy' | 'warning' | 'error',
    details?: {
      cpu?: number;
      memory?: number;
      disk?: number;
      services?: Array<{ name: string; status: string }>;
    }
  ): void {
    const message = createMessage('system:status', {
      status,
      details
    });

    const sent = this.connectionManager.broadcastToAll(message);
    console.log(`Broadcast system status (${status}) to ${sent} clients`);
  }

  /**
   * Add message to batch for efficient delivery
   */
  private addToBatch(message: ServerMessage, executionId?: string): void {
    this.messageBuffer.push(message);

    // If we have an execution ID, we might want to batch by execution
    // For now, we'll use a simple global batch

    if (this.messageBuffer.length >= this.batchSize) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.batchTimeoutMs);
    }
  }

  /**
   * Flush batched messages
   */
  private flushBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.messageBuffer.length === 0) {
      return;
    }

    const messages = this.messageBuffer.splice(0);
    
    // Group messages by execution ID for targeted delivery
    const executionGroups = new Map<string, ServerMessage[]>();
    const globalMessages: ServerMessage[] = [];

    for (const message of messages) {
      if ('executionId' in message && message.executionId) {
        const executionId = message.executionId as string;
        if (!executionGroups.has(executionId)) {
          executionGroups.set(executionId, []);
        }
        executionGroups.get(executionId)!.push(message);
      } else {
        globalMessages.push(message);
      }
    }

    // Send execution-specific messages
    for (const [executionId, execMessages] of Array.from(executionGroups)) {
      if (execMessages.length === 1) {
        this.connectionManager.broadcastToExecution(executionId, execMessages[0]);
      } else {
        // Send as batch
        const batchMessage = createMessage('batch', {
          messages: execMessages
        });
        this.connectionManager.broadcastToExecution(executionId, batchMessage);
      }
    }

    // Send global messages
    for (const message of globalMessages) {
      this.connectionManager.broadcastToAll(message);
    }

    if (messages.length > 0) {
      console.debug(`Flushed batch of ${messages.length} messages`);
    }
  }

  /**
   * Get WebSocket server statistics
   */
  getStats(): {
    connections: number;
    activeConnections: number;
    totalMessages: number;
    uptime: number;
    wsServer: {
      clients: number;
      listening: boolean;
    };
  } {
    const connStats = this.connectionManager.getStats();
    
    return {
      connections: connStats.totalConnections,
      activeConnections: connStats.activeConnections,
      totalMessages: connStats.totalMessages,
      uptime: connStats.uptime,
      wsServer: {
        clients: this.wss.clients.size,
        listening: true // WebSocketServer doesn't have readyState
      }
    };
  }

  /**
   * Get detailed client information
   */
  getClientInfo(clientId: string) {
    return this.connectionManager.getClientInfo(clientId);
  }

  /**
   * Get all connected client IDs
   */
  getConnectedClients(): string[] {
    return this.connectionManager.getClientIds();
  }

  /**
   * Manually disconnect a client
   */
  disconnectClient(clientId: string, reason = 'Administrative disconnect'): boolean {
    const client = this.connectionManager.getClientInfo(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.close(1008, reason);
      return true;
    }
    return false;
  }

  /**
   * Send a message to a specific client
   */
  sendToClient(clientId: string, message: ServerMessage): boolean {
    return this.connectionManager.sendToClient(clientId, message);
  }

  /**
   * Health check for the WebSocket server
   */
  healthCheck(): {
    healthy: boolean;
    issues: string[];
    stats: {
      connections: number;
      activeConnections: number;
      totalMessages: number;
      uptime: number;
      wsServer: {
        clients: number;
        listening: boolean;
      };
    };
  } {
    const issues: string[] = [];
    const stats = this.getStats();

    // Check if server has clients (basic health check)
    if (!this.wss.clients) {
      issues.push('WebSocket server clients collection is not available');
    }

    // Check for unusual connection counts
    if (stats.activeConnections > 100) {
      issues.push(`High connection count: ${stats.activeConnections}`);
    }

    // Check WebSocket server clients vs our tracked clients
    const clientCountMismatch = Math.abs(this.wss.clients.size - stats.activeConnections);
    if (clientCountMismatch > 5) {
      issues.push(`Client count mismatch: WebSocket server has ${this.wss.clients.size}, we track ${stats.activeConnections}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      stats
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down WebSocket server...');

    // Flush any pending batched messages
    this.flushBatch();

    // Clear batch timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Shutdown connection manager (handles client disconnections)
    await this.connectionManager.shutdown();

    // Close WebSocket server
    return new Promise((resolve) => {
      this.wss.close((error) => {
        if (error) {
          console.error('Error closing WebSocket server:', error);
        } else {
          console.log('WebSocket server closed successfully');
        }
        resolve();
      });
    });
  }
}

// Export singleton instance for use across the application
let wsManagerInstance: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager | null {
  return wsManagerInstance;
}

export function setWebSocketManager(manager: WebSocketManager): void {
  wsManagerInstance = manager;
}