import { 
  ClientMessage, 
  ServerMessage,
  isValidClientMessage
} from '../websocket/messageTypes';

export interface WebSocketClientConfig {
  url: string;
  protocols?: string[];
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  heartbeatTimeout?: number;
}

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  clientId: string | null;
  lastConnected: Date | null;
  reconnectCount: number;
  latency: number | null;
  error: string | null;
}

export interface WebSocketClientStats {
  messagesSent: number;
  messagesReceived: number;
  bytesTransferred: number;
  connectionUptime: number;
  lastActivity: Date | null;
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketClientConfig>;
  private reconnectTimeoutId: NodeJS.Timeout | null = null;
  private heartbeatIntervalId: NodeJS.Timeout | null = null;
  private heartbeatTimeoutId: NodeJS.Timeout | null = null;
  private lastPingTime: number | null = null;

  private stats: WebSocketClientStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesTransferred: 0,
    connectionUptime: 0,
    lastActivity: null
  };

  private state: ConnectionState = {
    status: 'disconnected',
    clientId: null,
    lastConnected: null,
    reconnectCount: 0,
    latency: null,
    error: null
  };

  private messageQueue: ClientMessage[] = [];
  private maxQueueSize = 100;

  // Event handlers
  private onOpenHandler: ((event: Event) => void) | null = null;
  private onCloseHandler: ((event: CloseEvent) => void) | null = null;
  private onErrorHandler: ((event: Event) => void) | null = null;
  private onMessageHandler: ((message: ServerMessage) => void) | null = null;
  private onStateChangeHandler: ((state: ConnectionState) => void) | null = null;

  constructor(config: WebSocketClientConfig) {
    this.config = {
      url: config.url,
      protocols: config.protocols || [],
      reconnectAttempts: config.reconnectAttempts ?? 10,
      reconnectInterval: config.reconnectInterval ?? 1000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      heartbeatTimeout: config.heartbeatTimeout ?? 5000
    };
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      this.updateState({ status: 'connecting', error: null });
      this.clearReconnectTimeout();

      try {
        this.ws = new WebSocket(this.config.url, this.config.protocols);
        
        this.ws.onopen = (event) => {
          console.log('WebSocket connected');
          this.updateState({
            status: 'connected',
            lastConnected: new Date(),
            reconnectCount: 0,
            error: null
          });

          this.stats.connectionUptime = Date.now();
          this.startHeartbeat();
          this.flushMessageQueue();
          
          this.onOpenHandler?.(event);
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          this.handleClose(event);
        };

        this.ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          this.updateState({ 
            status: 'error',
            error: 'Connection error occurred'
          });
          this.onErrorHandler?.(event);
          
          if (this.state.status === 'connecting') {
            reject(new Error('Failed to connect to WebSocket server'));
          }
        };

        // Timeout for initial connection
        setTimeout(() => {
          if (this.state.status === 'connecting') {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        this.updateState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    console.log('Disconnecting WebSocket...');
    this.clearReconnectTimeout();
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnection
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }

    this.updateState({
      status: 'disconnected',
      clientId: null,
      error: null
    });
  }

  /**
   * Send a message to the server
   */
  sendMessage(message: Omit<ClientMessage, 'timestamp'>): boolean {
    const fullMessage: ClientMessage = {
      ...message,
      timestamp: new Date().toISOString()
    } as ClientMessage;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const serialized = JSON.stringify(fullMessage);
        this.ws.send(serialized);
        
        this.stats.messagesSent++;
        this.stats.bytesTransferred += serialized.length;
        this.stats.lastActivity = new Date();
        
        console.debug('Sent WebSocket message:', message.type);
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    } else {
      // Queue message for later if connection is not ready
      if (this.messageQueue.length < this.maxQueueSize) {
        this.messageQueue.push(fullMessage);
        console.debug('Queued WebSocket message:', message.type);
        return true;
      } else {
        console.warn('WebSocket message queue is full, dropping message');
        return false;
      }
    }
  }

  /**
   * Subscribe to execution logs
   */
  subscribeToExecution(executionId: string): boolean {
    return this.sendMessage({
      type: 'logs:subscribe',
      executionId
    } as Omit<ClientMessage, 'timestamp'>);
  }

  /**
   * Unsubscribe from execution logs
   */
  unsubscribeFromExecution(executionId: string): boolean {
    return this.sendMessage({
      type: 'logs:unsubscribe',
      executionId
    } as Omit<ClientMessage, 'timestamp'>);
  }

  /**
   * Send ping to measure latency
   */
  ping(): boolean {
    this.lastPingTime = Date.now();
    return this.sendMessage({ type: 'ping' });
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Get connection statistics
   */
  getStats(): WebSocketClientStats {
    const uptime = this.stats.connectionUptime > 0 
      ? Date.now() - this.stats.connectionUptime 
      : 0;
    
    return {
      ...this.stats,
      connectionUptime: uptime
    };
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.state.status === 'connected' && 
           this.ws?.readyState === WebSocket.OPEN;
  }

  // Event handler setters
  onOpen(handler: (event: Event) => void): void {
    this.onOpenHandler = handler;
  }

  onClose(handler: (event: CloseEvent) => void): void {
    this.onCloseHandler = handler;
  }

  onError(handler: (event: Event) => void): void {
    this.onErrorHandler = handler;
  }

  onMessage(handler: (message: ServerMessage) => void): void {
    this.onMessageHandler = handler;
  }

  onStateChange(handler: (state: ConnectionState) => void): void {
    this.onStateChangeHandler = handler;
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      this.stats.messagesReceived++;
      this.stats.bytesTransferred += event.data.length;
      this.stats.lastActivity = new Date();

      // Handle special message types
      if (data.type === 'connection') {
        this.updateState({ clientId: data.clientId });
      } else if (data.type === 'pong') {
        this.handlePong();
      }

      this.onMessageHandler?.(data);
      console.debug('Received WebSocket message:', data.type);

    } catch (error) {
      console.error('Failed to parse WebSocket message:', error, event.data);
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
    
    this.stopHeartbeat();
    this.updateState({
      status: 'disconnected',
      error: event.code !== 1000 ? `Connection closed: ${event.reason}` : null
    });

    this.onCloseHandler?.(event);

    // Attempt reconnection if not intentional
    if (event.code !== 1000 && this.state.reconnectCount < this.config.reconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle pong response for latency measurement
   */
  private handlePong(): void {
    if (this.lastPingTime) {
      const latency = Date.now() - this.lastPingTime;
      this.updateState({ latency });
      this.lastPingTime = null;
    }

    // Clear heartbeat timeout
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeoutId) return;

    const reconnectCount = this.state.reconnectCount + 1;
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, reconnectCount - 1),
      30000 // Max 30 seconds
    );

    console.log(`Scheduling reconnect attempt ${reconnectCount} in ${delay}ms`);

    this.updateState({ reconnectCount });

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      this.connect().catch(error => {
        console.error('Reconnection attempt failed:', error);
        
        if (this.state.reconnectCount < this.config.reconnectAttempts) {
          this.scheduleReconnect();
        } else {
          console.error('Max reconnection attempts reached');
          this.updateState({
            status: 'error',
            error: 'Max reconnection attempts reached'
          });
        }
      });
    }, delay);
  }

  /**
   * Clear reconnection timeout
   */
  private clearReconnectTimeout(): void {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatIntervalId = setInterval(() => {
      if (this.isConnected()) {
        this.ping();
        
        // Set timeout for pong response
        this.heartbeatTimeoutId = setTimeout(() => {
          console.warn('Heartbeat timeout - connection may be dead');
          this.ws?.close(1000, 'Heartbeat timeout');
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
    
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
  }

  /**
   * Flush queued messages when connection is established
   */
  private flushMessageQueue(): void {
    if (this.messageQueue.length === 0) return;

    console.log(`Flushing ${this.messageQueue.length} queued messages`);
    
    const queuedMessages = this.messageQueue.splice(0);
    for (const message of queuedMessages) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          const serialized = JSON.stringify(message);
          this.ws.send(serialized);
          this.stats.messagesSent++;
          this.stats.bytesTransferred += serialized.length;
        } catch (error) {
          console.error('Failed to send queued message:', error);
          // Re-queue if send fails
          this.messageQueue.unshift(message);
          break;
        }
      }
    }
  }

  /**
   * Update connection state and notify listeners
   */
  private updateState(updates: Partial<ConnectionState>): void {
    const previousState = { ...this.state };
    this.state = { ...this.state, ...updates };
    
    // Only notify if state actually changed
    if (JSON.stringify(previousState) !== JSON.stringify(this.state)) {
      this.onStateChangeHandler?.(this.state);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.disconnect();
    this.clearReconnectTimeout();
    
    // Clear all handlers
    this.onOpenHandler = null;
    this.onCloseHandler = null;
    this.onErrorHandler = null;
    this.onMessageHandler = null;
    this.onStateChangeHandler = null;
  }
}