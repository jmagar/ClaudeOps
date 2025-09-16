interface ClientLimits {
  messagesPerWindow: number;
  bytesPerWindow: number;
  windowStartTime: number;
  messageCount: number;
  byteCount: number;
  lastMessageTime: number;
  violations: number;
}

interface RateLimitConfig {
  messagesPerMinute: number;
  bytesPerMinute: number;
  burstMessages: number;
  burstBytes: number;
  violationThreshold: number;
  banDurationMs: number;
  cleanupIntervalMs: number;
}

export class RateLimiter {
  private clientLimits = new Map<string, ClientLimits>();
  private bannedClients = new Map<string, number>(); // clientId -> unban timestamp
  private cleanupTimer: NodeJS.Timeout;

  private readonly config: RateLimitConfig = {
    messagesPerMinute: 60,
    bytesPerMinute: 1024 * 1024, // 1MB per minute
    burstMessages: 10,
    burstBytes: 1024 * 100, // 100KB burst
    violationThreshold: 3,
    banDurationMs: 5 * 60 * 1000, // 5 minutes
    cleanupIntervalMs: 60 * 1000 // 1 minute
  };

  constructor(customConfig?: Partial<RateLimitConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Check if a client is allowed to send a message
   */
  checkLimit(clientId: string, messageSize: number): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const now = Date.now();

    // Check if client is banned
    const banExpiry = this.bannedClients.get(clientId);
    if (banExpiry && now < banExpiry) {
      return {
        allowed: false,
        reason: 'Client is temporarily banned',
        retryAfter: banExpiry - now
      };
    }

    // Remove expired ban
    if (banExpiry && now >= banExpiry) {
      this.bannedClients.delete(clientId);
    }

    let clientData = this.clientLimits.get(clientId);
    
    if (!clientData) {
      clientData = {
        messagesPerWindow: this.config.messagesPerMinute,
        bytesPerWindow: this.config.bytesPerMinute,
        windowStartTime: now,
        messageCount: 0,
        byteCount: 0,
        lastMessageTime: 0,
        violations: 0
      };
      this.clientLimits.set(clientId, clientData);
    }

    // Reset window if minute has passed
    const windowAge = now - clientData.windowStartTime;
    if (windowAge >= 60000) {
      clientData.messageCount = 0;
      clientData.byteCount = 0;
      clientData.windowStartTime = now;
    }

    // Check burst limits (messages in short time span)
    const timeSinceLastMessage = now - clientData.lastMessageTime;
    if (timeSinceLastMessage < 1000) { // Within 1 second
      if (clientData.messageCount >= this.config.burstMessages) {
        this.recordViolation(clientId, clientData, 'Burst message limit exceeded');
        return {
          allowed: false,
          reason: 'Too many messages in short time span',
          retryAfter: 1000 - timeSinceLastMessage
        };
      }
      
      if (clientData.byteCount + messageSize > this.config.burstBytes) {
        this.recordViolation(clientId, clientData, 'Burst byte limit exceeded');
        return {
          allowed: false,
          reason: 'Message size exceeds burst limit',
          retryAfter: 1000 - timeSinceLastMessage
        };
      }
    }

    // Check rate limits
    if (clientData.messageCount >= this.config.messagesPerMinute) {
      this.recordViolation(clientId, clientData, 'Message rate limit exceeded');
      return {
        allowed: false,
        reason: 'Message rate limit exceeded',
        retryAfter: 60000 - windowAge
      };
    }

    if (clientData.byteCount + messageSize > this.config.bytesPerMinute) {
      this.recordViolation(clientId, clientData, 'Byte rate limit exceeded');
      return {
        allowed: false,
        reason: 'Bandwidth limit exceeded',
        retryAfter: 60000 - windowAge
      };
    }

    // Update counters
    clientData.messageCount++;
    clientData.byteCount += messageSize;
    clientData.lastMessageTime = now;

    return { allowed: true };
  }

  /**
   * Record a rate limit violation
   */
  private recordViolation(clientId: string, clientData: ClientLimits, reason: string): void {
    clientData.violations++;
    
    console.warn(`Rate limit violation for client ${clientId}: ${reason}. Violations: ${clientData.violations}`);

    // Ban client if too many violations
    if (clientData.violations >= this.config.violationThreshold) {
      const banUntil = Date.now() + this.config.banDurationMs;
      this.bannedClients.set(clientId, banUntil);
      
      console.warn(`Client ${clientId} banned until ${new Date(banUntil).toISOString()}`);
      
      // Reset violations after ban
      clientData.violations = 0;
    }
  }

  /**
   * Get remaining quota for a client
   */
  getQuota(clientId: string): {
    messagesRemaining: number;
    bytesRemaining: number;
    windowResetTime: number;
  } {
    const clientData = this.clientLimits.get(clientId);
    
    if (!clientData) {
      return {
        messagesRemaining: this.config.messagesPerMinute,
        bytesRemaining: this.config.bytesPerMinute,
        windowResetTime: Date.now() + 60000
      };
    }

    // Check if window should be reset
    const windowAge = Date.now() - clientData.windowStartTime;
    if (windowAge >= 60000) {
      return {
        messagesRemaining: this.config.messagesPerMinute,
        bytesRemaining: this.config.bytesPerMinute,
        windowResetTime: Date.now() + 60000
      };
    }

    return {
      messagesRemaining: Math.max(0, this.config.messagesPerMinute - clientData.messageCount),
      bytesRemaining: Math.max(0, this.config.bytesPerMinute - clientData.byteCount),
      windowResetTime: clientData.windowStartTime + 60000
    };
  }

  /**
   * Check if a client is banned
   */
  isBanned(clientId: string): boolean {
    const banExpiry = this.bannedClients.get(clientId);
    if (!banExpiry) return false;
    
    const now = Date.now();
    if (now >= banExpiry) {
      this.bannedClients.delete(clientId);
      return false;
    }
    
    return true;
  }

  /**
   * Manually ban a client
   */
  banClient(clientId: string, durationMs?: number): void {
    const banUntil = Date.now() + (durationMs || this.config.banDurationMs);
    this.bannedClients.set(clientId, banUntil);
    console.warn(`Client ${clientId} manually banned until ${new Date(banUntil).toISOString()}`);
  }

  /**
   * Unban a client
   */
  unbanClient(clientId: string): boolean {
    return this.bannedClients.delete(clientId);
  }

  /**
   * Get statistics for monitoring
   */
  getStats(): {
    activeClients: number;
    bannedClients: number;
    totalViolations: number;
    avgMessagesPerClient: number;
    avgBytesPerClient: number;
  } {
    const activeClients = this.clientLimits.size;
    const bannedClients = this.bannedClients.size;
    
    let totalViolations = 0;
    let totalMessages = 0;
    let totalBytes = 0;

    for (const clientData of Array.from(this.clientLimits.values())) {
      totalViolations += clientData.violations;
      totalMessages += clientData.messageCount;
      totalBytes += clientData.byteCount;
    }

    return {
      activeClients,
      bannedClients,
      totalViolations,
      avgMessagesPerClient: activeClients > 0 ? totalMessages / activeClients : 0,
      avgBytesPerClient: activeClients > 0 ? totalBytes / activeClients : 0
    };
  }

  /**
   * Clean up old client data and expired bans
   */
  private cleanup(): void {
    const now = Date.now();
    const cleanupAge = 10 * 60 * 1000; // 10 minutes

    // Clean up old client limits
    for (const [clientId, clientData] of Array.from(this.clientLimits.entries())) {
      const age = now - clientData.lastMessageTime;
      if (age > cleanupAge) {
        this.clientLimits.delete(clientId);
      }
    }

    // Clean up expired bans
    for (const [clientId, banExpiry] of Array.from(this.bannedClients.entries())) {
      if (now >= banExpiry) {
        this.bannedClients.delete(clientId);
      }
    }

    console.debug(`Rate limiter cleanup completed. Active clients: ${this.clientLimits.size}, Banned clients: ${this.bannedClients.size}`);
  }

  /**
   * Reset all limits (useful for testing)
   */
  reset(): void {
    this.clientLimits.clear();
    this.bannedClients.clear();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.reset();
  }
}