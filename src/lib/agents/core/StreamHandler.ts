import type {
  StreamUpdate,
  ProgressUpdate,
  LogCallback,
  ProgressCallback
} from './types';

import type { SDKMessage } from '@anthropic-ai/claude-code';

/**
 * Manages real-time streaming updates and progress reporting
 */
export class StreamHandler {
  private listeners: Set<StreamListener> = new Set();
  private messageBuffer: StreamUpdate[] = [];
  private bufferSize: number;
  private log: LogCallback;
  private startTime: number = Date.now();

  constructor(bufferSize: number = 100, log?: LogCallback) {
    this.bufferSize = bufferSize;
    this.log = log || (() => {});
  }

  /**
   * Add a stream listener
   */
  addListener(listener: StreamListener): void {
    this.listeners.add(listener);
    this.log('📡 Stream listener added', 'debug');
  }

  /**
   * Remove a stream listener
   */
  removeListener(listener: StreamListener): void {
    this.listeners.delete(listener);
    this.log('📡 Stream listener removed', 'debug');
  }

  /**
   * Process and broadcast a stream update
   */
  async handleUpdate(update: StreamUpdate): Promise<void> {
    // Add to buffer
    this.addToBuffer(update);

    // Enhance update with timing information
    const enhancedUpdate = this.enhanceUpdate(update);

    // Broadcast to all listeners
    await this.broadcast(enhancedUpdate);

    // Log if appropriate
    this.logUpdate(enhancedUpdate);
  }

  /**
   * Handle SDK message and convert to stream update
   */
  async handleSDKMessage(message: SDKMessage): Promise<void> {
    const update = this.convertSDKMessageToUpdate(message);
    if (update) {
      await this.handleUpdate(update);
    }
  }

  /**
   * Handle progress updates
   */
  async handleProgress(progress: ProgressUpdate): Promise<void> {
    const update: StreamUpdate = {
      type: 'progress',
      content: progress,
      timestamp: new Date().toISOString(),
      metadata: {
        stage: progress.stage,
        percentage: progress.percentage,
        cost: progress.cost
      }
    };

    await this.handleUpdate(update);
  }

  /**
   * Handle tool execution start
   */
  async handleToolStart(toolName: string, input: any): Promise<void> {
    const update: StreamUpdate = {
      type: 'tool_use',
      content: {
        tool: toolName,
        input,
        status: 'started',
        startTime: Date.now()
      },
      timestamp: new Date().toISOString(),
      metadata: {
        tool: toolName,
        status: 'started'
      }
    };

    await this.handleUpdate(update);
  }

  /**
   * Handle tool execution completion
   */
  async handleToolComplete(toolName: string, input: any, result: any, startTime: number): Promise<void> {
    const duration = Date.now() - startTime;
    
    const update: StreamUpdate = {
      type: 'tool_result',
      content: {
        tool: toolName,
        input,
        result,
        status: 'completed',
        duration
      },
      timestamp: new Date().toISOString(),
      metadata: {
        tool: toolName,
        status: 'completed',
        duration,
        resultSize: this.getResultSize(result)
      }
    };

    await this.handleUpdate(update);
  }

  /**
   * Handle error occurrence
   */
  async handleError(error: Error, context?: any): Promise<void> {
    const update: StreamUpdate = {
      type: 'error',
      content: {
        message: error.message,
        name: error.name,
        stack: error.stack,
        context
      },
      timestamp: new Date().toISOString(),
      metadata: {
        errorType: error.name,
        hasContext: !!context
      }
    };

    await this.handleUpdate(update);
  }

  /**
   * Get streaming statistics
   */
  getStatistics(): StreamStatistics {
    const now = Date.now();
    const runtime = now - this.startTime;
    
    const messagesByType: Record<string, number> = {};
    const recentMessages = this.messageBuffer.slice(-50); // Last 50 messages
    
    for (const message of this.messageBuffer) {
      messagesByType[message.type] = (messagesByType[message.type] || 0) + 1;
    }

    return {
      totalMessages: this.messageBuffer.length,
      messagesByType,
      activeListeners: this.listeners.size,
      runtime,
      messagesPerMinute: (this.messageBuffer.length / (runtime / 60000)) || 0,
      bufferUtilization: (this.messageBuffer.length / this.bufferSize) * 100,
      recentActivity: this.analyzeRecentActivity(recentMessages)
    };
  }

  /**
   * Get recent messages from buffer
   */
  getRecentMessages(count: number = 20): StreamUpdate[] {
    return this.messageBuffer.slice(-count);
  }

  /**
   * Clear the message buffer
   */
  clearBuffer(): void {
    const oldSize = this.messageBuffer.length;
    this.messageBuffer = [];
    this.log(`🧹 Cleared stream buffer (${oldSize} messages)`, 'debug');
  }

  /**
   * Convert SDK message to stream update
   */
  private convertSDKMessageToUpdate(message: SDKMessage): StreamUpdate | null {
    switch (message.type) {
      case 'assistant':
        return {
          type: 'message',
          content: {
            role: 'assistant',
            content: message.message.content
          },
          timestamp: new Date().toISOString(),
          metadata: {
            messageType: 'assistant',
            contentType: Array.isArray(message.message.content) ? 'blocks' : 'text'
          }
        };

      case 'user':
        return {
          type: 'message',
          content: {
            role: 'user',
            content: message.message.content
          },
          timestamp: new Date().toISOString(),
          metadata: {
            messageType: 'user',
            contentType: Array.isArray(message.message.content) ? 'blocks' : 'text'
          }
        };

      case 'result':
        return {
          type: 'message',
          content: {
            role: 'system',
            result: message.subtype,
            usage: message.subtype === 'success' ? message.usage : undefined,
            cost: message.subtype === 'success' ? message.total_cost_usd : undefined
          },
          timestamp: new Date().toISOString(),
          metadata: {
            messageType: 'result',
            resultType: message.subtype,
            isSuccess: message.subtype === 'success'
          }
        };

      default:
        return null;
    }
  }

  /**
   * Add update to buffer with size management
   */
  private addToBuffer(update: StreamUpdate): void {
    this.messageBuffer.push(update);
    
    // Trim buffer if it exceeds size limit
    if (this.messageBuffer.length > this.bufferSize) {
      const excess = this.messageBuffer.length - this.bufferSize;
      this.messageBuffer.splice(0, excess);
      this.log(`📦 Trimmed stream buffer (removed ${excess} old messages)`, 'debug');
    }
  }

  /**
   * Enhance update with additional metadata
   */
  private enhanceUpdate(update: StreamUpdate): StreamUpdate {
    const now = Date.now();
    
    return {
      ...update,
      metadata: {
        ...update.metadata,
        sequenceNumber: this.messageBuffer.length,
        runtime: now - this.startTime,
        bufferUtilization: (this.messageBuffer.length / this.bufferSize) * 100
      }
    };
  }

  /**
   * Broadcast update to all listeners
   */
  private async broadcast(update: StreamUpdate): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const listener of this.listeners) {
      promises.push(
        listener(update).catch(error => {
          this.log(`❌ Stream listener error: ${error}`, 'error');
        })
      );
    }

    await Promise.allSettled(promises);
  }

  /**
   * Log update if it meets certain criteria
   */
  private logUpdate(update: StreamUpdate): void {
    // Log errors always
    if (update.type === 'error') {
      this.log(`🔴 Stream error: ${update.content.message}`, 'error');
      return;
    }

    // Log tool operations
    if (update.type === 'tool_use' || update.type === 'tool_result') {
      const tool = update.content.tool;
      const status = update.content.status;
      const duration = update.content.duration;
      
      if (status === 'started') {
        this.log(`🔧 Tool started: ${tool}`, 'debug');
      } else if (status === 'completed') {
        this.log(`✅ Tool completed: ${tool} (${duration}ms)`, 'debug');
      }
      return;
    }

    // Log progress milestones
    if (update.type === 'progress') {
      const progress = update.content as ProgressUpdate;
      if (progress.percentage && progress.percentage % 25 === 0) {
        this.log(`📈 Progress: ${progress.percentage}% - ${progress.message}`, 'info');
      }
    }
  }

  /**
   * Get size of result for metadata
   */
  private getResultSize(result: any): number {
    if (typeof result === 'string') {
      return result.length;
    }
    
    if (typeof result === 'object') {
      return JSON.stringify(result).length;
    }
    
    return 0;
  }

  /**
   * Analyze recent activity patterns
   */
  private analyzeRecentActivity(recentMessages: StreamUpdate[]): ActivityAnalysis {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    
    const recentActivity = recentMessages.filter(msg => 
      new Date(msg.timestamp).getTime() > fiveMinutesAgo
    );

    const toolUsage = recentActivity
      .filter(msg => msg.type === 'tool_use')
      .map(msg => msg.content.tool);

    const errorCount = recentActivity.filter(msg => msg.type === 'error').length;
    
    return {
      messageCount: recentActivity.length,
      toolsUsed: [...new Set(toolUsage)],
      errorCount,
      averageInterval: recentActivity.length > 1 
        ? (now - new Date(recentActivity[0].timestamp).getTime()) / recentActivity.length
        : 0,
      isActive: recentActivity.length > 0
    };
  }
}

// Stream-related types
type StreamListener = (update: StreamUpdate) => Promise<void>;

interface StreamStatistics {
  totalMessages: number;
  messagesByType: Record<string, number>;
  activeListeners: number;
  runtime: number;
  messagesPerMinute: number;
  bufferUtilization: number;
  recentActivity: ActivityAnalysis;
}

interface ActivityAnalysis {
  messageCount: number;
  toolsUsed: string[];
  errorCount: number;
  averageInterval: number;
  isActive: boolean;
}

// Utility functions for common streaming patterns
export class StreamUtils {
  /**
   * Create a simple console logger listener
   */
  static createConsoleListener(verbose: boolean = false): StreamListener {
    return async (update: StreamUpdate) => {
      const timestamp = new Date(update.timestamp).toLocaleTimeString();
      
      switch (update.type) {
        case 'tool_use':
          if (update.content.status === 'started') {
            console.log(`[${timestamp}] 🔧 ${update.content.tool}`);
          }
          break;
          
        case 'tool_result':
          const duration = update.content.duration;
          console.log(`[${timestamp}] ✅ ${update.content.tool} (${duration}ms)`);
          break;
          
        case 'progress':
          const progress = update.content as ProgressUpdate;
          const percentage = progress.percentage ? ` ${progress.percentage}%` : '';
          console.log(`[${timestamp}] 📈${percentage} ${progress.message}`);
          break;
          
        case 'error':
          console.error(`[${timestamp}] ❌ ${update.content.message}`);
          break;
          
        case 'message':
          if (verbose) {
            const content = typeof update.content.content === 'string' 
              ? update.content.content.substring(0, 100) + '...'
              : '[blocks]';
            console.log(`[${timestamp}] 💭 ${update.content.role}: ${content}`);
          }
          break;
      }
    };
  }

  /**
   * Create a filtering listener that only passes certain update types
   */
  static createFilteredListener(
    listener: StreamListener,
    allowedTypes: string[]
  ): StreamListener {
    return async (update: StreamUpdate) => {
      if (allowedTypes.includes(update.type)) {
        await listener(update);
      }
    };
  }

  /**
   * Create a rate-limited listener that throttles updates
   */
  static createRateLimitedListener(
    listener: StreamListener,
    maxUpdatesPerSecond: number
  ): StreamListener {
    let lastUpdate = 0;
    const interval = 1000 / maxUpdatesPerSecond;
    
    return async (update: StreamUpdate) => {
      const now = Date.now();
      if (now - lastUpdate >= interval) {
        lastUpdate = now;
        await listener(update);
      }
    };
  }
}