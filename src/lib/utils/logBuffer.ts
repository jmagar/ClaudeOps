import { EventEmitter } from 'events';
import type { LogEntry, LogBufferConfig, BatchOperationResult } from '../types/execution';

/**
 * High-performance log buffer with batching and memory management
 * Designed for real-time log streaming with WebSocket integration
 */
export class LogBuffer extends EventEmitter {
  private buffer: Map<string, LogEntry[]> = new Map();
  private bufferSizes: Map<string, number> = new Map();
  private flushTimers: Map<string, NodeJS.Timeout> = new Map();
  private totalMemoryUsage: number = 0;
  private config: Required<LogBufferConfig>;
  
  constructor(config: Partial<LogBufferConfig> = {}) {
    super();
    
    this.config = {
      maxSize: config.maxSize ?? 10000,
      flushIntervalMs: config.flushIntervalMs ?? 1000,
      batchSize: config.batchSize ?? 50,
      persistToDisk: config.persistToDisk ?? true,
      compressionThreshold: config.compressionThreshold ?? 1000
    };

    // Periodic cleanup of old buffers
    setInterval(() => this.performMaintenance(), 30000); // Every 30 seconds
  }

  /**
   * Add a log entry to the buffer
   */
  async addEntry(entry: LogEntry): Promise<void> {
    const { executionId } = entry;
    
    if (!this.buffer.has(executionId)) {
      this.buffer.set(executionId, []);
      this.bufferSizes.set(executionId, 0);
    }

    const executionBuffer = this.buffer.get(executionId)!;
    const entrySize = this.estimateEntrySize(entry);

    // Check if we need to make room
    if (executionBuffer.length >= this.config.maxSize) {
      await this.evictOldEntries(executionId);
    }

    // Add the entry
    executionBuffer.push(entry);
    this.bufferSizes.set(executionId, this.bufferSizes.get(executionId)! + entrySize);
    this.totalMemoryUsage += entrySize;

    // Emit real-time event for WebSocket streaming
    this.emit('entry:added', entry);

    // Check if we should flush immediately
    if (this.shouldFlushImmediately(executionId)) {
      await this.flushBuffer(executionId);
    } else {
      this.scheduleFlush(executionId);
    }
  }

  /**
   * Add multiple log entries in batch
   */
  async addBatch(entries: LogEntry[]): Promise<BatchOperationResult<LogEntry>> {
    const result: BatchOperationResult<LogEntry> = {
      successful: [],
      failed: [],
      totalProcessed: entries.length,
      successCount: 0,
      failureCount: 0
    };

    for (const entry of entries) {
      try {
        await this.addEntry(entry);
        result.successful.push(entry);
        result.successCount++;
      } catch (error) {
        result.failed.push({
          item: entry,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.failureCount++;
      }
    }

    return result;
  }

  /**
   * Get log entries for an execution
   */
  getEntries(executionId: string, options: {
    fromTimestamp?: string;
    toTimestamp?: string;
    levels?: string[];
    limit?: number;
    offset?: number;
  } = {}): LogEntry[] {
    const buffer = this.buffer.get(executionId);
    if (!buffer) return [];

    let filtered = buffer;

    // Apply timestamp filters
    if (options.fromTimestamp) {
      const fromTime = new Date(options.fromTimestamp).getTime();
      filtered = filtered.filter(entry => new Date(entry.timestamp).getTime() >= fromTime);
    }

    if (options.toTimestamp) {
      const toTime = new Date(options.toTimestamp).getTime();
      filtered = filtered.filter(entry => new Date(entry.timestamp).getTime() <= toTime);
    }

    // Apply level filter
    if (options.levels && options.levels.length > 0) {
      filtered = filtered.filter(entry => options.levels!.includes(entry.level));
    }

    // Apply pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? filtered.length;
    
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get recent entries for real-time streaming
   */
  getRecentEntries(executionId: string, count: number = 50): LogEntry[] {
    const buffer = this.buffer.get(executionId);
    if (!buffer) return [];

    return buffer.slice(-count);
  }

  /**
   * Flush buffer for specific execution
   */
  async flushBuffer(executionId: string): Promise<LogEntry[]> {
    const buffer = this.buffer.get(executionId);
    if (!buffer || buffer.length === 0) {
      return [];
    }

    // Clear the flush timer
    const timer = this.flushTimers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(executionId);
    }

    // Get entries to flush
    const entriesToFlush = [...buffer];
    
    // Emit flush event with the entries
    this.emit('buffer:flushed', {
      executionId,
      entries: entriesToFlush,
      count: entriesToFlush.length
    });

    // If persistence is enabled, emit for persistence
    if (this.config.persistToDisk) {
      this.emit('persist:requested', {
        executionId,
        entries: entriesToFlush
      });
    }

    return entriesToFlush;
  }

  /**
   * Flush all buffers
   */
  async flushAll(): Promise<Map<string, LogEntry[]>> {
    const results = new Map<string, LogEntry[]>();
    
    for (const executionId of Array.from(this.buffer.keys())) {
      const flushed = await this.flushBuffer(executionId);
      if (flushed.length > 0) {
        results.set(executionId, flushed);
      }
    }

    return results;
  }

  /**
   * Clear buffer for specific execution
   */
  clearBuffer(executionId: string): boolean {
    const buffer = this.buffer.get(executionId);
    if (!buffer) return false;

    // Update memory tracking
    const bufferSize = this.bufferSizes.get(executionId) ?? 0;
    this.totalMemoryUsage -= bufferSize;

    // Clear timers
    const timer = this.flushTimers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(executionId);
    }

    // Remove from maps
    this.buffer.delete(executionId);
    this.bufferSizes.delete(executionId);

    this.emit('buffer:cleared', { executionId });
    return true;
  }

  /**
   * Clear all buffers
   */
  clearAll(): void {
    // Clear all timers
    for (const timer of Array.from(this.flushTimers.values())) {
      clearTimeout(timer);
    }

    // Clear all data
    this.buffer.clear();
    this.bufferSizes.clear();
    this.flushTimers.clear();
    this.totalMemoryUsage = 0;

    this.emit('buffers:cleared');
  }

  /**
   * Get buffer statistics
   */
  getStats(): {
    totalExecutions: number;
    totalEntries: number;
    totalMemoryUsage: number;
    averageEntriesPerExecution: number;
    largestBuffer: { executionId: string; entries: number } | null;
    memoryUsageByExecution: Array<{ executionId: string; size: number; entries: number }>;
  } {
    const stats = {
      totalExecutions: this.buffer.size,
      totalEntries: 0,
      totalMemoryUsage: this.totalMemoryUsage,
      averageEntriesPerExecution: 0,
      largestBuffer: null as { executionId: string; entries: number } | null,
      memoryUsageByExecution: [] as Array<{ executionId: string; size: number; entries: number }>
    };

    let largestCount = 0;

    for (const [executionId, buffer] of Array.from(this.buffer.entries())) {
      const entryCount = buffer.length;
      const memorySize = this.bufferSizes.get(executionId) ?? 0;

      stats.totalEntries += entryCount;
      
      if (entryCount > largestCount) {
        largestCount = entryCount;
        stats.largestBuffer = { executionId, entries: entryCount };
      }

      stats.memoryUsageByExecution.push({
        executionId,
        size: memorySize,
        entries: entryCount
      });
    }

    stats.averageEntriesPerExecution = stats.totalExecutions > 0 
      ? stats.totalEntries / stats.totalExecutions 
      : 0;

    return stats;
  }

  /**
   * Get buffer status for specific execution
   */
  getBufferStatus(executionId: string): {
    exists: boolean;
    entryCount: number;
    memorySize: number;
    pendingFlush: boolean;
    oldestEntry?: string;
    newestEntry?: string;
  } {
    const buffer = this.buffer.get(executionId);
    
    if (!buffer) {
      return {
        exists: false,
        entryCount: 0,
        memorySize: 0,
        pendingFlush: false
      };
    }

    return {
      exists: true,
      entryCount: buffer.length,
      memorySize: this.bufferSizes.get(executionId) ?? 0,
      pendingFlush: this.flushTimers.has(executionId),
      oldestEntry: buffer.length > 0 ? buffer[0].timestamp : undefined,
      newestEntry: buffer.length > 0 ? buffer[buffer.length - 1].timestamp : undefined
    };
  }

  /**
   * Check if buffer should be flushed immediately
   */
  private shouldFlushImmediately(executionId: string): boolean {
    const buffer = this.buffer.get(executionId);
    if (!buffer) return false;

    // Flush if buffer is at batch size
    if (buffer.length >= this.config.batchSize) {
      return true;
    }

    // Flush if buffer is getting close to max size
    if (buffer.length >= this.config.maxSize * 0.9) {
      return true;
    }

    // Flush if last entry was an error
    const lastEntry = buffer[buffer.length - 1];
    if (lastEntry && lastEntry.level === 'error') {
      return true;
    }

    return false;
  }

  /**
   * Schedule a flush for later
   */
  private scheduleFlush(executionId: string): void {
    // Don't schedule if already scheduled
    if (this.flushTimers.has(executionId)) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        await this.flushBuffer(executionId);
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.flushIntervalMs);

    this.flushTimers.set(executionId, timer);
  }

  /**
   * Evict old entries to make room
   */
  private async evictOldEntries(executionId: string): Promise<void> {
    const buffer = this.buffer.get(executionId);
    if (!buffer) return;

    const evictionCount = Math.floor(this.config.maxSize * 0.1); // Remove 10%
    const evicted = buffer.splice(0, evictionCount);

    // Update memory tracking
    const evictedSize = evicted.reduce((sum, entry) => sum + this.estimateEntrySize(entry), 0);
    const currentSize = this.bufferSizes.get(executionId) ?? 0;
    this.bufferSizes.set(executionId, currentSize - evictedSize);
    this.totalMemoryUsage -= evictedSize;

    this.emit('entries:evicted', {
      executionId,
      evictedCount: evictionCount,
      evictedSize,
      oldestEvicted: evicted[0]?.timestamp,
      newestEvicted: evicted[evicted.length - 1]?.timestamp
    });
  }

  /**
   * Estimate memory size of a log entry
   */
  private estimateEntrySize(entry: LogEntry): number {
    let size = 0;
    
    // Basic string fields
    size += entry.id.length * 2; // UTF-16
    size += entry.executionId.length * 2;
    size += entry.level.length * 2;
    size += entry.message.length * 2;
    size += entry.timestamp.length * 2;
    
    if (entry.source) {
      size += entry.source.length * 2;
    }
    
    // Numbers
    if (entry.stepNumber) {
      size += 8; // 64-bit number
    }
    
    // Metadata object (rough estimate)
    if (entry.metadata) {
      size += JSON.stringify(entry.metadata).length * 2;
    }
    
    // Add overhead for object structure
    size += 200; // Estimated object overhead
    
    return size;
  }

  /**
   * Periodic maintenance tasks
   */
  private performMaintenance(): void {
    const stats = this.getStats();
    
    // Log memory usage if high
    if (this.totalMemoryUsage > 50 * 1024 * 1024) { // 50MB
      console.warn(`LogBuffer memory usage high: ${(this.totalMemoryUsage / 1024 / 1024).toFixed(2)}MB`);
      this.emit('memory:warning', { 
        memoryUsage: this.totalMemoryUsage,
        executionCount: stats.totalExecutions,
        totalEntries: stats.totalEntries
      });
    }

    // Auto-flush old buffers
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes
    
    for (const [executionId, buffer] of Array.from(this.buffer.entries())) {
      if (buffer.length > 0) {
        const oldestEntry = buffer[0];
        const entryAge = now - new Date(oldestEntry.timestamp).getTime();
        
        if (entryAge > maxAge) {
          this.flushBuffer(executionId).catch(error => {
            this.emit('error', error);
          });
        }
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('LogBuffer shutting down...');
    
    // Flush all buffers
    await this.flushAll();
    
    // Clear all timers
    for (const timer of Array.from(this.flushTimers.values())) {
      clearTimeout(timer);
    }
    
    // Clear all data
    this.clearAll();
    
    // Remove all listeners
    this.removeAllListeners();
    
    console.log('LogBuffer shutdown complete');
  }
}

// Export singleton instance
export const globalLogBuffer = new LogBuffer({
  maxSize: 10000,
  flushIntervalMs: 1000,
  batchSize: 50,
  persistToDisk: true,
  compressionThreshold: 1000
});