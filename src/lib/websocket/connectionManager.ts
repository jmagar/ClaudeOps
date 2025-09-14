import { WebSocket } from 'ws';
import { createId } from '@paralleldrive/cuid2';
import { 
  ServerMessage, 
  ClientMessage, 
  createMessage,
  getMessagePriority,
  isValidClientMessage 
} from './messageTypes.js';
import { RateLimiter } from './rateLimiter.js';
import { BackpressureHandler } from './backpressureHandler.js';

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  ip: string;
  userAgent?: string;
  connectedAt: Date;
  lastActivity: Date;
  subscriptions: Set<string>; // execution IDs they're subscribed to
  isAlive: boolean;
  messageCount: number;
  bytesReceived: number;
  bytesSent: number;
}

interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  totalMessages: number;
  totalBytes: number;
  averageLatency: number;
  uptime: number;
}

export class ConnectionManager {
  private clients = new Map<string, ConnectedClient>();
  private executionSubscriptions = new Map<string, Set<string>>(); // executionId -> Set<clientId>
  private rateLimiter: RateLimiter;
  private backpressureHandler: BackpressureHandler;
  private heartbeatInterval: NodeJS.Timeout;
  private statsInterval: NodeJS.Timeout;
  private startTime = Date.now();

  private readonly heartbeatIntervalMs = 30000; // 30 seconds
  private readonly heartbeatTimeoutMs = 5000; // 5 seconds

  constructor() {
    this.rateLimiter = new RateLimiter({
      messagesPerMinute: 120, // Higher limit for active development
      bytesPerMinute: 1024 * 1024 * 2, // 2MB per minute
      burstMessages: 20,
      burstBytes: 1024 * 200 // 200KB burst
    });

    this.backpressureHandler = new BackpressureHandler({
      maxQueueSize: 500,
      maxQueueBytes: 1024 * 1024 * 2, // 2MB per client
      flushBatchSize: 25,
      flushIntervalMs: 50 // More frequent flushing
    });

    this.startHeartbeat();
    this.startStatsCollection();
  }

  /**
   * Add a new WebSocket connection
   */
  addConnection(ws: WebSocket, request: any): string {
    const clientId = createId();
    const client: ConnectedClient = {
      id: clientId,
      ws,
      ip: request.socket.remoteAddress || 'unknown',
      userAgent: request.headers['user-agent'],
      connectedAt: new Date(),
      lastActivity: new Date(),
      subscriptions: new Set(),
      isAlive: true,
      messageCount: 0,
      bytesReceived: 0,
      bytesSent: 0
    };

    this.clients.set(clientId, client);

    // Set up WebSocket event handlers
    this.setupWebSocketHandlers(clientId, ws);

    // Send welcome message
    this.sendToClient(clientId, createMessage('connection', {
      message: 'Connected to ClaudeOps WebSocket server',
      clientId
    }));

    console.log(`Client ${clientId} connected from ${client.ip}. Total connections: ${this.clients.size}`);
    return clientId;
  }

  /**
   * Set up WebSocket event handlers for a client
   */
  private setupWebSocketHandlers(clientId: string, ws: WebSocket): void {
    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      this.handleMessage(clientId, data);
    });

    // Handle connection close
    ws.on('close', (code: number, reason: Buffer) => {
      this.removeConnection(clientId, code, reason.toString());
    });

    // Handle WebSocket errors
    ws.on('error', (error: Error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      this.removeConnection(clientId, 1011, 'Internal error');
    });

    // Handle pong responses for heartbeat
    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.isAlive = true;
        client.lastActivity = new Date();
      }
    });
  }

  /**
   * Handle incoming message from a client
   */
  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      console.warn(`Received message from unknown client ${clientId}`);
      return;
    }

    // Update client stats
    client.messageCount++;
    client.bytesReceived += data.length;
    client.lastActivity = new Date();

    // Rate limiting check
    const rateCheck = this.rateLimiter.checkLimit(clientId, data.length);
    if (!rateCheck.allowed) {
      console.warn(`Rate limit exceeded for client ${clientId}: ${rateCheck.reason}`);
      this.sendToClient(clientId, createMessage('error', {
        code: 'RATE_LIMIT_EXCEEDED',
        message: rateCheck.reason || 'Rate limit exceeded',
        details: { retryAfter: rateCheck.retryAfter }
      }));
      return;
    }

    try {
      // Parse message
      const messageStr = data.toString('utf8');
      let message: unknown;
      
      try {
        message = JSON.parse(messageStr);
      } catch (parseError) {
        console.warn(`Invalid JSON from client ${clientId}:`, parseError);
        this.sendToClient(clientId, createMessage('error', {
          code: 'INVALID_MESSAGE_FORMAT',
          message: 'Invalid JSON format'
        }));
        return;
      }

      // Validate message structure
      if (!isValidClientMessage(message)) {
        console.warn(`Invalid message structure from client ${clientId}:`, message);
        this.sendToClient(clientId, createMessage('error', {
          code: 'INVALID_MESSAGE_STRUCTURE',
          message: 'Message does not match expected format'
        }));
        return;
      }

      // Handle the message
      await this.handleClientMessage(clientId, message);

    } catch (error) {
      console.error(`Error handling message from client ${clientId}:`, error);
      this.sendToClient(clientId, createMessage('error', {
        code: 'MESSAGE_HANDLING_ERROR',
        message: 'Failed to process message'
      }));
    }
  }

  /**
   * Handle specific client message types
   */
  private async handleClientMessage(clientId: string, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'ping':
        this.sendToClient(clientId, createMessage('pong', {}));
        break;

      case 'logs:subscribe':
        this.subscribeToExecution(clientId, message.executionId);
        break;

      case 'logs:unsubscribe':
        this.unsubscribeFromExecution(clientId, message.executionId);
        break;

      case 'agent:execute':
      case 'agent:cancel':
      case 'agent:status':
        // These would be handled by the agent execution system
        console.log(`Received ${message.type} from client ${clientId}:`, {
          executionId: 'executionId' in message ? message.executionId : undefined,
          agentType: 'agentType' in message ? message.agentType : undefined
        });
        // For now, just acknowledge
        this.sendToClient(clientId, createMessage('error', {
          code: 'NOT_IMPLEMENTED',
          message: `${message.type} is not yet implemented`
        }));
        break;

      default:
        console.warn(`Unknown message type from client ${clientId}:`, (message as any).type);
        this.sendToClient(clientId, createMessage('error', {
          code: 'UNKNOWN_MESSAGE_TYPE',
          message: `Unknown message type: ${(message as any).type}`
        }));
    }
  }

  /**
   * Subscribe a client to execution updates
   */
  private subscribeToExecution(clientId: string, executionId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.add(executionId);
    
    let subscribers = this.executionSubscriptions.get(executionId);
    if (!subscribers) {
      subscribers = new Set();
      this.executionSubscriptions.set(executionId, subscribers);
    }
    subscribers.add(clientId);

    console.log(`Client ${clientId} subscribed to execution ${executionId}`);
  }

  /**
   * Unsubscribe a client from execution updates
   */
  private unsubscribeFromExecution(clientId: string, executionId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(executionId);

    const subscribers = this.executionSubscriptions.get(executionId);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.executionSubscriptions.delete(executionId);
      }
    }

    console.log(`Client ${clientId} unsubscribed from execution ${executionId}`);
  }

  /**
   * Send a message to a specific client
   */
  sendToClient(clientId: string, message: ServerMessage): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      console.warn(`Cannot send message to client ${clientId}: client not found or WebSocket not open`);
      return false;
    }

    const priority = getMessagePriority(message);
    const success = this.backpressureHandler.enqueueMessage(clientId, client.ws, message, priority);
    
    if (success) {
      // Try to flush immediately
      const flushed = this.backpressureHandler.flushClient(clientId, client.ws);
      if (flushed > 0) {
        client.bytesSent += this.estimateMessageSize(message);
      }
    }

    return success;
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcastToAll(message: ServerMessage, excludeClientId?: string): number {
    let sent = 0;
    for (const [clientId] of Array.from(this.clients)) {
      if (clientId !== excludeClientId) {
        if (this.sendToClient(clientId, message)) {
          sent++;
        }
      }
    }
    return sent;
  }

  /**
   * Send message to clients subscribed to a specific execution
   */
  broadcastToExecution(executionId: string, message: ServerMessage): number {
    const subscribers = this.executionSubscriptions.get(executionId);
    if (!subscribers || subscribers.size === 0) {
      return 0;
    }

    let sent = 0;
    for (const clientId of Array.from(subscribers)) {
      if (this.sendToClient(clientId, message)) {
        sent++;
      }
    }

    console.log(`Broadcast execution message to ${sent}/${subscribers.size} subscribers for ${executionId}`);
    return sent;
  }

  /**
   * Remove a connection
   */
  private removeConnection(clientId: string, code?: number, reason?: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Clean up subscriptions
    for (const executionId of Array.from(client.subscriptions)) {
      const subscribers = this.executionSubscriptions.get(executionId);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.executionSubscriptions.delete(executionId);
        }
      }
    }

    // Clean up backpressure state
    this.backpressureHandler.removeClient(clientId);

    // Remove from clients map
    this.clients.delete(clientId);

    console.log(`Client ${clientId} disconnected (code: ${code}, reason: ${reason}). Total connections: ${this.clients.size}`);
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [clientId, client] of Array.from(this.clients)) {
        if (!client.isAlive) {
          console.warn(`Client ${clientId} failed heartbeat, terminating connection`);
          client.ws.terminate();
          this.removeConnection(clientId, 1000, 'Heartbeat timeout');
        } else {
          client.isAlive = false;
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.ping();
          }
        }
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Start statistics collection
   */
  private startStatsCollection(): void {
    this.statsInterval = setInterval(() => {
      const stats = this.getStats();
      console.debug('WebSocket stats:', {
        connections: stats.activeConnections,
        totalMessages: stats.totalMessages,
        uptime: Math.round(stats.uptime / 1000) + 's'
      });

      // Log backpressure stats if there are issues
      const bpStats = this.backpressureHandler.getSystemStats();
      if (bpStats.clientsWithBackpressure > 0 || bpStats.totalDroppedMessages > 0) {
        console.warn('Backpressure detected:', bpStats);
      }

      // Log rate limiter stats if there are violations
      const rlStats = this.rateLimiter.getStats();
      if (rlStats.totalViolations > 0 || rlStats.bannedClients > 0) {
        console.warn('Rate limiting active:', rlStats);
      }
    }, 60000); // Every minute
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    let totalMessages = 0;
    let totalBytes = 0;

    for (const client of Array.from(this.clients.values())) {
      totalMessages += client.messageCount;
      totalBytes += client.bytesReceived + client.bytesSent;
    }

    return {
      totalConnections: this.clients.size,
      activeConnections: Array.from(this.clients.values()).filter(
        c => c.ws.readyState === WebSocket.OPEN
      ).length,
      totalMessages,
      totalBytes,
      averageLatency: 0, // TODO: Implement latency tracking
      uptime: Date.now() - this.startTime
    };
  }

  /**
   * Get detailed client information
   */
  getClientInfo(clientId: string): ConnectedClient | null {
    return this.clients.get(clientId) || null;
  }

  /**
   * Get all connected client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Estimate message size in bytes
   */
  private estimateMessageSize(message: ServerMessage): number {
    try {
      return Buffer.byteLength(JSON.stringify(message), 'utf8');
    } catch (error) {
      return JSON.stringify(message).length * 2;
    }
  }

  /**
   * Gracefully shutdown all connections
   */
  shutdown(): Promise<void> {
    return new Promise((resolve) => {
      console.log('Shutting down WebSocket connections...');

      // Clear intervals
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
      }
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
      }

      // Close all client connections
      const closePromises: Promise<void>[] = [];
      
      for (const [clientId, client] of Array.from(this.clients)) {
        if (client.ws.readyState === WebSocket.OPEN) {
          closePromises.push(
            new Promise<void>((clientResolve) => {
              client.ws.once('close', () => clientResolve());
              client.ws.close(1001, 'Server shutting down');
              
              // Force close after timeout
              setTimeout(() => {
                if (client.ws.readyState !== WebSocket.CLOSED) {
                  client.ws.terminate();
                }
                clientResolve();
              }, 5000);
            })
          );
        }
      }

      // Wait for all connections to close or timeout
      Promise.all(closePromises).then(() => {
        this.clients.clear();
        this.executionSubscriptions.clear();
        
        // Cleanup handlers
        this.rateLimiter.destroy();
        this.backpressureHandler.destroy();
        
        console.log('All WebSocket connections closed');
        resolve();
      });

      // Force resolve after maximum wait time
      setTimeout(() => {
        console.warn('WebSocket shutdown timeout, forcing close');
        resolve();
      }, 10000);
    });
  }
}