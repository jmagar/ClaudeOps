import { WebSocket } from 'ws';
import { ServerMessage } from './messageTypes.js';

interface QueuedMessage {
  id: string;
  message: ServerMessage;
  priority: number;
  timestamp: number;
  retryCount: number;
}

interface ClientBackpressureState {
  clientId: string;
  queue: QueuedMessage[];
  queueSize: number;
  queueBytes: number;
  isPaused: boolean;
  lastFlushAttempt: number;
  droppedMessages: number;
  totalMessages: number;
}

interface BackpressureConfig {
  maxQueueSize: number;
  maxQueueBytes: number;
  flushBatchSize: number;
  flushIntervalMs: number;
  dropThreshold: number;
  maxRetries: number;
  priorityThreshold: number;
}

export class BackpressureHandler {
  private clientStates = new Map<string, ClientBackpressureState>();
  private flushTimer: NodeJS.Timeout;

  private readonly config: BackpressureConfig = {
    maxQueueSize: 1000,
    maxQueueBytes: 1024 * 1024 * 5, // 5MB per client
    flushBatchSize: 50,
    flushIntervalMs: 100,
    dropThreshold: 0.8, // Start dropping at 80% capacity
    maxRetries: 3,
    priorityThreshold: 7 // Messages with priority >= 7 are never dropped
  };

  constructor(customConfig?: Partial<BackpressureConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    // Start flush timer
    this.flushTimer = setInterval(() => {
      this.flushAll();
    }, this.config.flushIntervalMs);
  }

  /**
   * Add a message to the queue for a client
   */
  enqueueMessage(
    clientId: string,
    ws: WebSocket,
    message: ServerMessage,
    priority: number
  ): boolean {
    let state = this.clientStates.get(clientId);
    
    if (!state) {
      state = {
        clientId,
        queue: [],
        queueSize: 0,
        queueBytes: 0,
        isPaused: false,
        lastFlushAttempt: 0,
        droppedMessages: 0,
        totalMessages: 0
      };
      this.clientStates.set(clientId, state);
    }

    state.totalMessages++;

    // Check WebSocket readiness
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`WebSocket not open for client ${clientId}, dropping message`);
      state.droppedMessages++;
      return false;
    }

    // Try to send immediately if queue is empty and socket is ready
    if (state.queue.length === 0 && !this.hasBackpressure(ws)) {
      return this.sendMessageDirectly(ws, message, state);
    }

    // Check queue capacity
    const messageBytes = this.estimateMessageSize(message);
    const wouldExceedCapacity = 
      state.queueSize >= this.config.maxQueueSize ||
      state.queueBytes + messageBytes > this.config.maxQueueBytes;

    if (wouldExceedCapacity) {
      // Check if we should drop messages
      const utilizationRatio = Math.max(
        state.queueSize / this.config.maxQueueSize,
        state.queueBytes / this.config.maxQueueBytes
      );

      if (utilizationRatio >= this.config.dropThreshold) {
        if (priority >= this.config.priorityThreshold) {
          // High priority message - drop low priority messages to make room
          this.dropLowPriorityMessages(state, messageBytes);
        } else {
          // Drop this message
          console.warn(`Dropping message for client ${clientId} due to backpressure`);
          state.droppedMessages++;
          return false;
        }
      } else {
        console.warn(`Queue full for client ${clientId}, dropping message`);
        state.droppedMessages++;
        return false;
      }
    }

    // Add to queue
    const queuedMessage: QueuedMessage = {
      id: this.generateMessageId(),
      message,
      priority,
      timestamp: Date.now(),
      retryCount: 0
    };

    // Insert based on priority (higher priority first)
    const insertIndex = state.queue.findIndex(m => m.priority < priority);
    if (insertIndex === -1) {
      state.queue.push(queuedMessage);
    } else {
      state.queue.splice(insertIndex, 0, queuedMessage);
    }

    state.queueSize++;
    state.queueBytes += messageBytes;

    // Set paused state if needed
    if (!state.isPaused && this.hasBackpressure(ws)) {
      state.isPaused = true;
      console.debug(`Client ${clientId} paused due to backpressure`);
    }

    return true;
  }

  /**
   * Attempt to send message directly without queueing
   */
  private sendMessageDirectly(ws: WebSocket, message: ServerMessage, state: ClientBackpressureState): boolean {
    try {
      const messageStr = JSON.stringify(message);
      ws.send(messageStr);
      return true;
    } catch (error) {
      console.error(`Failed to send message directly to client ${state.clientId}:`, error);
      state.droppedMessages++;
      return false;
    }
  }

  /**
   * Check if WebSocket has backpressure
   */
  private hasBackpressure(ws: WebSocket): boolean {
    // Check WebSocket buffer
    return ws.bufferedAmount > 0;
  }

  /**
   * Drop low priority messages to make room
   */
  private dropLowPriorityMessages(state: ClientBackpressureState, bytesNeeded: number): void {
    const originalLength = state.queue.length;
    let bytesFreed = 0;

    // Remove messages with priority < threshold, starting from the end
    for (let i = state.queue.length - 1; i >= 0 && bytesFreed < bytesNeeded; i--) {
      const msg = state.queue[i];
      if (msg.priority < this.config.priorityThreshold) {
        const msgBytes = this.estimateMessageSize(msg.message);
        state.queue.splice(i, 1);
        state.queueSize--;
        state.queueBytes -= msgBytes;
        bytesFreed += msgBytes;
        state.droppedMessages++;
      }
    }

    const droppedCount = originalLength - state.queue.length;
    if (droppedCount > 0) {
      console.warn(`Dropped ${droppedCount} low priority messages for client ${state.clientId} to make room`);
    }
  }

  /**
   * Flush queued messages for a specific client
   */
  flushClient(clientId: string, ws: WebSocket): number {
    const state = this.clientStates.get(clientId);
    if (!state || state.queue.length === 0) {
      return 0;
    }

    let flushed = 0;
    const batchSize = Math.min(this.config.flushBatchSize, state.queue.length);

    // Check if WebSocket is ready
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`WebSocket not open for client ${clientId}, clearing queue`);
      this.clearQueue(state);
      return 0;
    }

    // Check for backpressure
    if (this.hasBackpressure(ws)) {
      state.lastFlushAttempt = Date.now();
      return 0;
    }

    // Process batch
    const messagesToSend = state.queue.splice(0, batchSize);
    
    for (const queuedMsg of messagesToSend) {
      try {
        const messageStr = JSON.stringify(queuedMsg.message);
        ws.send(messageStr);
        
        state.queueSize--;
        state.queueBytes -= this.estimateMessageSize(queuedMsg.message);
        flushed++;

        // Check for backpressure after each send
        if (this.hasBackpressure(ws)) {
          // Put remaining messages back at the front of queue
          state.queue.unshift(...messagesToSend.slice(flushed));
          break;
        }
      } catch (error) {
        console.error(`Failed to send queued message to client ${clientId}:`, error);
        
        queuedMsg.retryCount++;
        if (queuedMsg.retryCount < this.config.maxRetries) {
          // Put back for retry
          state.queue.unshift(queuedMsg);
        } else {
          // Drop after max retries
          state.droppedMessages++;
          state.queueSize--;
          state.queueBytes -= this.estimateMessageSize(queuedMsg.message);
        }
        break;
      }
    }

    // Update paused state
    if (state.isPaused && !this.hasBackpressure(ws)) {
      state.isPaused = false;
      console.debug(`Client ${clientId} resumed after backpressure relief`);
    }

    state.lastFlushAttempt = Date.now();
    return flushed;
  }

  /**
   * Flush all client queues
   */
  private flushAll(): void {
    for (const [clientId, state] of Array.from(this.clientStates.entries())) {
      if (state.queue.length > 0) {
        // We don't have WebSocket reference here, this will be called from connection manager
        console.debug(`Client ${clientId} has ${state.queue.length} queued messages`);
      }
    }
  }

  /**
   * Clear queue for a client
   */
  private clearQueue(state: ClientBackpressureState): void {
    const queueSize = state.queue.length;
    state.queue = [];
    state.queueSize = 0;
    state.queueBytes = 0;
    state.droppedMessages += queueSize;
    console.warn(`Cleared queue for client ${state.clientId}, dropped ${queueSize} messages`);
  }

  /**
   * Remove client state when they disconnect
   */
  removeClient(clientId: string): void {
    const state = this.clientStates.get(clientId);
    if (state) {
      if (state.queue.length > 0) {
        console.info(`Removing client ${clientId} with ${state.queue.length} queued messages`);
      }
      this.clientStates.delete(clientId);
    }
  }

  /**
   * Get backpressure statistics for a client
   */
  getClientStats(clientId: string): {
    queueSize: number;
    queueBytes: number;
    isPaused: boolean;
    droppedMessages: number;
    totalMessages: number;
    dropRate: number;
  } | null {
    const state = this.clientStates.get(clientId);
    if (!state) return null;

    return {
      queueSize: state.queueSize,
      queueBytes: state.queueBytes,
      isPaused: state.isPaused,
      droppedMessages: state.droppedMessages,
      totalMessages: state.totalMessages,
      dropRate: state.totalMessages > 0 ? state.droppedMessages / state.totalMessages : 0
    };
  }

  /**
   * Get overall system stats
   */
  getSystemStats(): {
    totalClients: number;
    totalQueuedMessages: number;
    totalQueuedBytes: number;
    clientsWithBackpressure: number;
    totalDroppedMessages: number;
    avgDropRate: number;
  } {
    let totalQueuedMessages = 0;
    let totalQueuedBytes = 0;
    let clientsWithBackpressure = 0;
    let totalDroppedMessages = 0;
    let totalMessages = 0;

    for (const state of Array.from(this.clientStates.values())) {
      totalQueuedMessages += state.queueSize;
      totalQueuedBytes += state.queueBytes;
      if (state.isPaused) clientsWithBackpressure++;
      totalDroppedMessages += state.droppedMessages;
      totalMessages += state.totalMessages;
    }

    return {
      totalClients: this.clientStates.size,
      totalQueuedMessages,
      totalQueuedBytes,
      clientsWithBackpressure,
      totalDroppedMessages,
      avgDropRate: totalMessages > 0 ? totalDroppedMessages / totalMessages : 0
    };
  }

  /**
   * Estimate message size in bytes
   */
  private estimateMessageSize(message: ServerMessage): number {
    try {
      return Buffer.byteLength(JSON.stringify(message), 'utf8');
    } catch (error) {
      // Fallback estimation
      return JSON.stringify(message).length * 2; // Rough UTF-8 estimate
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.clientStates.clear();
  }
}