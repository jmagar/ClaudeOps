import { EventEmitter } from 'events';
import type {
  LogEntry,
  LogStreamOptions,
  ILogStreamer,
  BatchOperationResult,
  ExecutionEvent
} from '../types/execution';
import { globalLogBuffer } from '../utils/logBuffer';
import { getWebSocketManager } from '../websocket/server';
import { createId } from '@paralleldrive/cuid2';

/**
 * Real-time log streaming service with WebSocket integration
 * Handles log aggregation, buffering, and streaming to clients
 */
export class LogStreamer extends EventEmitter implements ILogStreamer {
  private activeStreams: Map<string, LogStreamOptions> = new Map();
  private streamSubscriptions: Map<string, Set<string>> = new Map(); // executionId -> clientIds
  private lastLogSequence: Map<string, number> = new Map();
  private compressionEnabled: boolean = true;

  constructor() {
    super();

    // Listen to log buffer events
    globalLogBuffer.on('entry:added', (entry: LogEntry) => {
      this.handleNewLogEntry(entry);
    });

    globalLogBuffer.on('buffer:flushed', (event) => {
      this.handleBufferFlushed(event);
    });

    // Monitor WebSocket manager for client connections
    this.setupWebSocketIntegration();
  }

  /**
   * Start streaming logs for an execution
   */
  async startStream(executionId: string, options: LogStreamOptions = { executionId }): Promise<void> {
    try {
      // Validate options
      if (!executionId) {
        throw new Error('executionId is required');
      }

      const streamOptions: LogStreamOptions = {
        executionId,
        fromTimestamp: options.fromTimestamp,
        toTimestamp: options.toTimestamp,
        levels: options.levels || ['debug', 'info', 'warn', 'error'],
        sources: options.sources || ['agent', 'system', 'claude', 'user'],
        limit: options.limit,
        follow: options.follow !== false // Default to true
      };

      this.activeStreams.set(executionId, streamOptions);

      // Initialize client subscription tracking
      if (!this.streamSubscriptions.has(executionId)) {
        this.streamSubscriptions.set(executionId, new Set());
      }

      // Send historical logs if requested
      if (streamOptions.fromTimestamp || streamOptions.limit) {
        await this.sendHistoricalLogs(executionId, streamOptions);
      }

      // Initialize sequence tracking
      this.lastLogSequence.set(executionId, 0);

      this.emit('stream:started', { executionId, options: streamOptions });
      console.log(`Started log stream for execution ${executionId}`);

    } catch (error) {
      this.emit('stream:error', { executionId, error });
      throw error;
    }
  }

  /**
   * Stop streaming logs for an execution
   */
  async stopStream(executionId: string): Promise<void> {
    try {
      this.activeStreams.delete(executionId);
      this.streamSubscriptions.delete(executionId);
      this.lastLogSequence.delete(executionId);

      // Notify WebSocket clients that stream has stopped
      const wsManager = getWebSocketManager();
      if (wsManager) {
        wsManager.sendToClient(executionId, {
          type: 'error',
          code: 'STREAM_STOPPED',
          message: 'Stream stopped',
          timestamp: new Date().toISOString()
        });
      }

      this.emit('stream:stopped', { executionId });
      console.log(`Stopped log stream for execution ${executionId}`);

    } catch (error) {
      this.emit('stream:error', { executionId, error });
      throw error;
    }
  }

  /**
   * Add a log entry to the stream
   */
  async addLogEntry(entry: LogEntry): Promise<void> {
    try {
      // Validate log entry
      this.validateLogEntry(entry);

      // Add timestamp if not present
      if (!entry.timestamp) {
        entry.timestamp = new Date().toISOString();
      }

      // Add to buffer (which will handle the streaming)
      await globalLogBuffer.addEntry(entry);

      this.emit('log:added', entry);

    } catch (error) {
      this.emit('log:error', { entry, error });
      throw error;
    }
  }

  /**
   * Get historical logs for an execution
   */
  async getLogHistory(executionId: string, options: LogStreamOptions = { executionId }): Promise<LogEntry[]> {
    try {
      // Get logs from buffer first
      const bufferLogs = globalLogBuffer.getEntries(executionId, {
        fromTimestamp: options.fromTimestamp,
        toTimestamp: options.toTimestamp,
        levels: options.levels,
        limit: options.limit
      });

      // Filter by source if specified
      let filteredLogs = bufferLogs;
      if (options.sources && options.sources.length > 0) {
        filteredLogs = bufferLogs.filter(log => 
          !log.source || options.sources!.includes(log.source)
        );
      }

      // Sort by timestamp
      filteredLogs.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      return filteredLogs;

    } catch (error) {
      this.emit('history:error', { executionId, error });
      throw error;
    }
  }

  /**
   * Flush buffer for specific execution
   */
  async flushBuffer(executionId?: string): Promise<void> {
    try {
      if (executionId) {
        await globalLogBuffer.flushBuffer(executionId);
      } else {
        await globalLogBuffer.flushAll();
      }

      this.emit('buffer:flushed', { executionId });

    } catch (error) {
      this.emit('buffer:error', { executionId, error });
      throw error;
    }
  }

  /**
   * Add batch of log entries
   */
  async addLogBatch(entries: LogEntry[]): Promise<BatchOperationResult<LogEntry>> {
    try {
      // Validate all entries first
      for (const entry of entries) {
        this.validateLogEntry(entry);
        if (!entry.timestamp) {
          entry.timestamp = new Date().toISOString();
        }
      }

      // Add to buffer as batch
      const result = await globalLogBuffer.addBatch(entries);

      this.emit('batch:added', { 
        entries: result.successful, 
        count: result.successCount,
        failed: result.failed.length
      });

      return result;

    } catch (error) {
      this.emit('batch:error', { entries, error });
      throw error;
    }
  }

  /**
   * Subscribe a client to log stream
   */
  subscribeClient(clientId: string, executionId: string): void {
    if (!this.streamSubscriptions.has(executionId)) {
      this.streamSubscriptions.set(executionId, new Set());
    }

    this.streamSubscriptions.get(executionId)!.add(clientId);
    this.emit('client:subscribed', { clientId, executionId });
  }

  /**
   * Unsubscribe a client from log stream
   */
  unsubscribeClient(clientId: string, executionId?: string): void {
    if (executionId) {
      const subscribers = this.streamSubscriptions.get(executionId);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.streamSubscriptions.delete(executionId);
        }
      }
    } else {
      // Unsubscribe from all streams
      for (const [execId, subscribers] of Array.from(this.streamSubscriptions.entries())) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.streamSubscriptions.delete(execId);
        }
      }
    }

    this.emit('client:unsubscribed', { clientId, executionId });
  }

  /**
   * Get stream statistics
   */
  getStreamStats(): {
    activeStreams: number;
    totalSubscriptions: number;
    streamDetails: Array<{
      executionId: string;
      subscribers: number;
      options: LogStreamOptions;
      lastActivity: Date;
    }>;
    bufferStats: any;
  } {
    const streamDetails = [];
    let totalSubscriptions = 0;

    for (const [executionId, options] of Array.from(this.activeStreams.entries())) {
      const subscribers = this.streamSubscriptions.get(executionId)?.size || 0;
      totalSubscriptions += subscribers;

      streamDetails.push({
        executionId,
        subscribers,
        options,
        lastActivity: new Date() // Could track actual last activity
      });
    }

    return {
      activeStreams: this.activeStreams.size,
      totalSubscriptions,
      streamDetails,
      bufferStats: globalLogBuffer.getStats()
    };
  }

  /**
   * Handle new log entry from buffer
   */
  private handleNewLogEntry(entry: LogEntry): void {
    const { executionId } = entry;
    
    // Check if there's an active stream for this execution
    const streamOptions = this.activeStreams.get(executionId);
    if (!streamOptions || !streamOptions.follow) {
      return;
    }

    // Apply stream filters
    if (!this.shouldStreamEntry(entry, streamOptions)) {
      return;
    }

    // Get sequence number
    const sequence = this.getNextSequence(executionId);
    
    // Send to subscribed WebSocket clients
    this.streamToClients(executionId, {
      ...entry,
      sequence
    });
  }

  /**
   * Handle buffer flush event
   */
  private handleBufferFlushed(event: { executionId: string; entries: LogEntry[]; count: number }): void {
    this.emit('logs:flushed', event);
  }

  /**
   * Check if log entry should be streamed based on options
   */
  private shouldStreamEntry(entry: LogEntry, options: LogStreamOptions): boolean {
    // Check level filter
    if (options.levels && !options.levels.includes(entry.level)) {
      return false;
    }

    // Check source filter
    if (options.sources && entry.source && !options.sources.includes(entry.source)) {
      return false;
    }

    // Check timestamp range
    if (options.toTimestamp) {
      const entryTime = new Date(entry.timestamp).getTime();
      const toTime = new Date(options.toTimestamp).getTime();
      if (entryTime > toTime) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send historical logs to clients
   */
  private async sendHistoricalLogs(executionId: string, options: LogStreamOptions): Promise<void> {
    try {
      const historicalLogs = await this.getLogHistory(executionId, options);
      
      if (historicalLogs.length > 0) {
        // Send in batches to avoid overwhelming clients
        const batchSize = 20;
        for (let i = 0; i < historicalLogs.length; i += batchSize) {
          const batch = historicalLogs.slice(i, i + batchSize);
          
          this.streamToClients(executionId, {
            type: 'log:batch',
            executionId,
            logs: batch,
            batchIndex: Math.floor(i / batchSize),
            totalBatches: Math.ceil(historicalLogs.length / batchSize),
            isHistorical: true
          });

          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
    } catch (error) {
      console.error(`Failed to send historical logs for ${executionId}:`, error);
    }
  }

  /**
   * Stream data to WebSocket clients
   */
  private streamToClients(executionId: string, data: any): void {
    const wsManager = getWebSocketManager();
    if (!wsManager) {
      return;
    }

    // Get subscribed clients
    const subscribers = this.streamSubscriptions.get(executionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    // Send to each subscribed client
    for (const clientId of Array.from(subscribers)) {
      try {
        wsManager.sendToClient(clientId, data);
      } catch (error) {
        console.warn(`Failed to send log to client ${clientId}:`, error);
        // Remove failed client
        subscribers.delete(clientId);
      }
    }
  }

  /**
   * Get next sequence number for an execution
   */
  private getNextSequence(executionId: string): number {
    const current = this.lastLogSequence.get(executionId) || 0;
    const next = current + 1;
    this.lastLogSequence.set(executionId, next);
    return next;
  }

  /**
   * Validate log entry
   */
  private validateLogEntry(entry: LogEntry): void {
    if (!entry.id) {
      entry.id = createId();
    }

    if (!entry.executionId) {
      throw new Error('Log entry must have executionId');
    }

    if (!entry.level) {
      throw new Error('Log entry must have level');
    }

    if (!entry.message) {
      throw new Error('Log entry must have message');
    }

    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(entry.level)) {
      throw new Error(`Invalid log level: ${entry.level}`);
    }

    if (entry.source) {
      const validSources = ['agent', 'system', 'claude', 'user'];
      if (!validSources.includes(entry.source)) {
        throw new Error(`Invalid log source: ${entry.source}`);
      }
    }
  }

  /**
   * Setup WebSocket integration
   */
  private setupWebSocketIntegration(): void {
    // Note: This would ideally listen for WebSocket connection events
    // but the current WebSocket manager doesn't expose client connect/disconnect events
    // This is a placeholder for future integration
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log('LogStreamer cleaning up...');

    // Stop all streams
    const executionIds = Array.from(this.activeStreams.keys());
    for (const executionId of executionIds) {
      await this.stopStream(executionId);
    }

    // Clear all data
    this.activeStreams.clear();
    this.streamSubscriptions.clear();
    this.lastLogSequence.clear();

    // Remove all listeners
    this.removeAllListeners();

    console.log('LogStreamer cleanup complete');
  }
}

// Export singleton instance
export const logStreamer = new LogStreamer();