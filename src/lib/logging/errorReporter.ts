import { EventEmitter } from 'events';
import { logger, LogContext } from './logger';
import { ErrorUtils, ErrorSeverity } from '../utils/errorUtils';
import { EnhancedError, ErrorCategory } from '../types/claude';
import { dbConnection } from '../db/connection';
import { executionSteps, executions } from '../db/schema';
import { eq, sql, and, gte, lte } from 'drizzle-orm';

/**
 * Monitoring system integrations
 */
export interface MonitoringConfig {
  enabled: boolean;
  webhook?: {
    url: string;
    method: 'POST' | 'PUT';
    headers?: Record<string, string>;
    timeout: number;
  };
  email?: {
    enabled: boolean;
    smtpHost: string;
    smtpPort: number;
    username: string;
    password: string;
    from: string;
    recipients: string[];
  };
  slack?: {
    enabled: boolean;
    webhookUrl: string;
    channel: string;
    username: string;
  };
  datadog?: {
    enabled: boolean;
    apiKey: string;
    host: string;
    service: string;
    environment: string;
  };
  custom?: Array<{
    name: string;
    endpoint: string;
    method: 'POST' | 'PUT';
    headers: Record<string, string>;
    transform?: (report: ErrorReport) => any;
  }>;
}

/**
 * Error report structure for external systems
 */
export interface ErrorReport {
  id: string;
  timestamp: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  title: string;
  message: string;
  fingerprint: string;
  context: {
    executionId?: string;
    agentType?: string;
    operation?: string;
    component?: string;
    userId?: string;
  };
  technical: {
    stack?: string;
    code?: string;
    resolution?: string;
    retryable: boolean;
    attempts?: number;
  };
  system: {
    service: 'ClaudeOps';
    version: string;
    environment: string;
    hostname: string;
    processId: number;
  };
  metrics: {
    frequency: number;
    firstOccurrence: string;
    lastOccurrence: string;
    affectedExecutions?: number;
  };
  related?: {
    executionId?: string;
    logEntries: string[];
    similarErrors: string[];
  };
}

/**
 * Alert configuration for different error conditions
 */
export interface AlertConfig {
  enabled: boolean;
  conditions: {
    errorRate?: {
      threshold: number; // errors per minute
      window: number; // minutes
    };
    severityThreshold?: ErrorSeverity;
    specificCategories?: ErrorCategory[];
    executionFailureRate?: {
      threshold: number; // percentage
      window: number; // minutes
    };
    systemHealth?: {
      cpuThreshold: number;
      memoryThreshold: number;
      diskThreshold: number;
    };
  };
  cooldown: number; // minutes between alerts for same condition
  escalation: {
    levels: Array<{
      after: number; // minutes
      channels: ('webhook' | 'email' | 'slack')[];
    }>;
  };
}

/**
 * Error aggregation for reporting
 */
export interface ErrorAggregation {
  timeWindow: '5m' | '15m' | '1h' | '6h' | '24h';
  groupBy: 'fingerprint' | 'category' | 'severity' | 'component';
  metrics: {
    count: number;
    uniqueErrors: number;
    affectedExecutions: number;
    avgResolutionTime: number;
    recoveryRate: number;
  };
  topErrors: Array<{
    fingerprint: string;
    count: number;
    message: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
  }>;
}

/**
 * Alert tracking for cooldown management
 */
interface AlertTracker {
  condition: string;
  lastSent: Date;
  escalationLevel: number;
  count: number;
}

/**
 * Comprehensive error reporting with monitoring integration
 */
export class ErrorReporter extends EventEmitter {
  private static instance: ErrorReporter;
  private config: MonitoringConfig;
  private alertConfig: AlertConfig;
  private errorCache: Map<string, { reports: ErrorReport[]; count: number; lastSeen: Date }>;
  private alertTrackers: Map<string, AlertTracker>;
  private reportingQueue: ErrorReport[];
  private processingInterval?: NodeJS.Timeout;

  constructor(
    monitoringConfig: Partial<MonitoringConfig> = {},
    alertConfig: Partial<AlertConfig> = {}
  ) {
    super();

    this.config = {
      enabled: true,
      webhook: {
        timeout: 5000,
        ...monitoringConfig.webhook
      },
      ...monitoringConfig
    } as MonitoringConfig;

    this.alertConfig = {
      enabled: true,
      conditions: {
        errorRate: { threshold: 10, window: 5 },
        severityThreshold: ErrorSeverity.HIGH,
        executionFailureRate: { threshold: 50, window: 15 },
        ...alertConfig.conditions
      },
      cooldown: 15,
      escalation: {
        levels: [
          { after: 0, channels: ['webhook'] },
          { after: 30, channels: ['webhook', 'slack'] },
          { after: 60, channels: ['webhook', 'slack', 'email'] }
        ]
      },
      ...alertConfig
    } as AlertConfig;

    this.errorCache = new Map();
    this.alertTrackers = new Map();
    this.reportingQueue = [];

    this.startProcessing();
  }

  /**
   * Get singleton instance
   */
  static getInstance(
    monitoringConfig?: Partial<MonitoringConfig>,
    alertConfig?: Partial<AlertConfig>
  ): ErrorReporter {
    if (!ErrorReporter.instance) {
      ErrorReporter.instance = new ErrorReporter(monitoringConfig, alertConfig);
    }
    return ErrorReporter.instance;
  }

  /**
   * Report an error to monitoring systems
   */
  async reportError(
    error: Error | EnhancedError,
    context: LogContext & {
      operation: string;
      severity?: ErrorSeverity;
      attempts?: number;
    }
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const enhanced = ErrorUtils.enhanceError(error, context);
      const report = await this.createErrorReport(enhanced, context);
      
      // Cache the report
      this.cacheReport(report);
      
      // Add to processing queue
      this.reportingQueue.push(report);
      
      // Emit event for real-time processing
      this.emit('errorReported', report);
      
      // Check if this should trigger an alert
      await this.checkAlertConditions(report);
      
    } catch (reportingError) {
      logger.error('Failed to report error', reportingError as Error, {
        component: 'error-reporter',
        operation: 'report-error',
        originalError: error.message
      });
    }
  }

  /**
   * Create structured error report
   */
  private async createErrorReport(
    error: EnhancedError,
    context: LogContext & { operation: string; severity?: ErrorSeverity; attempts?: number }
  ): Promise<ErrorReport> {
    const fingerprint = error.fingerprint || ErrorUtils.generateFingerprint(error);
    const classification = error.classification || ErrorUtils.classifyError(error);
    const cached = this.errorCache.get(fingerprint);
    
    // Get related execution information
    const relatedInfo = await this.getRelatedInformation(error, context);
    
    return {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      severity: context.severity || classification.severity,
      category: classification.category,
      title: ErrorUtils.formatForUser(error).title,
      message: error.message,
      fingerprint,
      context: {
        executionId: context.executionId,
        agentType: context.agentType,
        operation: context.operation,
        component: context.component,
        userId: context.userId
      },
      technical: {
        stack: error.stack,
        code: (error as any).code,
        resolution: classification.resolution,
        retryable: classification.retryable,
        attempts: context.attempts
      },
      system: {
        service: 'ClaudeOps',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        hostname: require('os').hostname(),
        processId: process.pid
      },
      metrics: {
        frequency: cached ? cached.count + 1 : 1,
        firstOccurrence: cached ? cached.reports[0].timestamp : new Date().toISOString(),
        lastOccurrence: new Date().toISOString(),
        affectedExecutions: relatedInfo.affectedExecutions
      },
      related: relatedInfo.executionId ? {
        executionId: relatedInfo.executionId,
        logEntries: relatedInfo.logEntries,
        similarErrors: relatedInfo.similarErrors
      } : undefined
    };
  }

  /**
   * Get related information for the error
   */
  private async getRelatedInformation(
    error: EnhancedError,
    context: LogContext
  ): Promise<{
    executionId?: string;
    affectedExecutions: number;
    logEntries: string[];
    similarErrors: string[];
  }> {
    try {
      const db = dbConnection.getDb();
      const fingerprint = error.fingerprint || ErrorUtils.generateFingerprint(error);
      
      // Get affected executions count
      const affectedExecutions = await db
        .select({ count: sql<number>`count(*)` })
        .from(executionSteps)
        .where(
          and(
            eq(executionSteps.stepType, 'error'),
            sql`json_extract(output, '$.fingerprint') = ${fingerprint}`
          )
        )
        .get();
      
      // Get recent log entries for context
      const recentLogs = context.executionId ? await db
        .select({ output: executionSteps.output, stepName: executionSteps.stepName })
        .from(executionSteps)
        .where(eq(executionSteps.executionId, context.executionId))
        .orderBy(sql`started_at DESC`)
        .limit(5)
        .all() : [];
      
      // Find similar recent errors
      const similarErrors = await db
        .select({ 
          fingerprint: sql<string>`json_extract(output, '$.fingerprint')`,
          message: sql<string>`json_extract(output, '$.message')`
        })
        .from(executionSteps)
        .where(
          and(
            eq(executionSteps.stepType, 'error'),
            sql`json_extract(output, '$.category') = ${error.category}`,
            sql`started_at >= datetime('now', '-1 hour')`
          )
        )
        .limit(3)
        .all();
      
      return {
        executionId: context.executionId,
        affectedExecutions: affectedExecutions?.count || 0,
        logEntries: recentLogs.map(log => `${log.stepName}: ${log.output}`),
        similarErrors: similarErrors.map(err => err.message).filter(Boolean)
      };
    } catch (error) {
      logger.warn('Failed to get related error information', {
        component: 'error-reporter',
        error: (error as Error).message
      });
      
      return {
        affectedExecutions: 0,
        logEntries: [],
        similarErrors: []
      };
    }
  }

  /**
   * Cache error report for aggregation
   */
  private cacheReport(report: ErrorReport): void {
    const cached = this.errorCache.get(report.fingerprint);
    
    if (cached) {
      cached.reports.push(report);
      cached.count++;
      cached.lastSeen = new Date();
      
      // Keep only last 50 reports per fingerprint
      if (cached.reports.length > 50) {
        cached.reports = cached.reports.slice(-50);
      }
    } else {
      this.errorCache.set(report.fingerprint, {
        reports: [report],
        count: 1,
        lastSeen: new Date()
      });
    }
  }

  /**
   * Start processing queued reports
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processQueuedReports().catch(error => {
        logger.error('Error processing queued reports', error as Error, {
          component: 'error-reporter',
          operation: 'process-queue'
        });
      });
    }, 5000); // Process every 5 seconds
  }

  /**
   * Process queued error reports
   */
  private async processQueuedReports(): Promise<void> {
    if (this.reportingQueue.length === 0) {
      return;
    }

    const reportsToProcess = this.reportingQueue.splice(0, 10); // Process up to 10 at a time
    
    for (const report of reportsToProcess) {
      try {
        await this.sendToMonitoringSystems(report);
      } catch (error) {
        logger.error('Failed to send error report', error as Error, {
          component: 'error-reporter',
          operation: 'send-report',
          reportId: report.id
        });
        
        // Re-queue for retry (max 3 attempts)
        const attempts = (report as any).attempts || 0;
        if (attempts < 3) {
          (report as any).attempts = attempts + 1;
          this.reportingQueue.push(report);
        }
      }
    }
  }

  /**
   * Send report to configured monitoring systems
   */
  private async sendToMonitoringSystems(report: ErrorReport): Promise<void> {
    const promises: Promise<void>[] = [];

    // Webhook integration
    if (this.config.webhook?.url) {
      promises.push(this.sendToWebhook(report));
    }

    // Slack integration
    if (this.config.slack?.enabled && this.config.slack.webhookUrl) {
      promises.push(this.sendToSlack(report));
    }

    // Email integration (simplified - would need proper SMTP implementation)
    if (this.config.email?.enabled) {
      promises.push(this.sendToEmail(report));
    }

    // DataDog integration
    if (this.config.datadog?.enabled) {
      promises.push(this.sendToDatadog(report));
    }

    // Custom integrations
    if (this.config.custom) {
      for (const custom of this.config.custom) {
        promises.push(this.sendToCustom(report, custom));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send report to webhook
   */
  private async sendToWebhook(report: ErrorReport): Promise<void> {
    if (!this.config.webhook?.url) return;

    const response = await fetch(this.config.webhook.url, {
      method: this.config.webhook.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.webhook.headers
      },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(this.config.webhook.timeout)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    logger.debug('Error report sent to webhook', {
      component: 'error-reporter',
      reportId: report.id,
      url: this.config.webhook.url
    });
  }

  /**
   * Send report to Slack
   */
  private async sendToSlack(report: ErrorReport): Promise<void> {
    if (!this.config.slack?.webhookUrl) return;

    const slackMessage = {
      channel: this.config.slack.channel,
      username: this.config.slack.username || 'ClaudeOps',
      attachments: [{
        color: this.getSlackColor(report.severity),
        title: `${report.title} (${report.category})`,
        text: report.message,
        fields: [
          {
            title: 'Severity',
            value: report.severity,
            short: true
          },
          {
            title: 'Component',
            value: report.context.component || 'Unknown',
            short: true
          },
          {
            title: 'Execution ID',
            value: report.context.executionId || 'N/A',
            short: true
          },
          {
            title: 'Frequency',
            value: report.metrics.frequency.toString(),
            short: true
          }
        ],
        ts: Math.floor(new Date(report.timestamp).getTime() / 1000)
      }]
    };

    const response = await fetch(this.config.slack.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackMessage)
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed: ${response.status}`);
    }

    logger.debug('Error report sent to Slack', {
      component: 'error-reporter',
      reportId: report.id
    });
  }

  /**
   * Send report to email (stub implementation)
   */
  private async sendToEmail(report: ErrorReport): Promise<void> {
    // This would require a proper SMTP implementation
    logger.debug('Email notification would be sent', {
      component: 'error-reporter',
      reportId: report.id,
      recipients: this.config.email?.recipients
    });
  }

  /**
   * Send report to DataDog
   */
  private async sendToDatadog(report: ErrorReport): Promise<void> {
    if (!this.config.datadog?.apiKey) return;

    const datadogEvent = {
      title: report.title,
      text: report.message,
      priority: report.severity === ErrorSeverity.CRITICAL ? 'high' : 'normal',
      tags: [
        `service:${this.config.datadog.service}`,
        `environment:${this.config.datadog.environment}`,
        `category:${report.category}`,
        `severity:${report.severity}`
      ],
      source_type_name: 'claudeops'
    };

    const response = await fetch(`https://${this.config.datadog.host}/api/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'DD-API-KEY': this.config.datadog.apiKey
      },
      body: JSON.stringify(datadogEvent)
    });

    if (!response.ok) {
      throw new Error(`DataDog API failed: ${response.status}`);
    }

    logger.debug('Error report sent to DataDog', {
      component: 'error-reporter',
      reportId: report.id
    });
  }

  /**
   * Send report to custom integration
   */
  private async sendToCustom(
    report: ErrorReport,
    config: NonNullable<MonitoringConfig['custom']>[0]
  ): Promise<void> {
    const payload = config.transform ? config.transform(report) : report;

    const response = await fetch(config.endpoint, {
      method: config.method,
      headers: config.headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Custom integration ${config.name} failed: ${response.status}`);
    }

    logger.debug('Error report sent to custom integration', {
      component: 'error-reporter',
      reportId: report.id,
      integration: config.name
    });
  }

  /**
   * Get Slack color for severity
   */
  private getSlackColor(severity: ErrorSeverity): string {
    switch (severity) {
      case ErrorSeverity.CRITICAL: return 'danger';
      case ErrorSeverity.HIGH: return 'warning';
      case ErrorSeverity.MEDIUM: return '#ffab00';
      case ErrorSeverity.LOW: return 'good';
      default: return '#cccccc';
    }
  }

  /**
   * Check if error should trigger alerts
   */
  private async checkAlertConditions(report: ErrorReport): Promise<void> {
    if (!this.alertConfig.enabled) {
      return;
    }

    // Check severity threshold
    if (this.alertConfig.conditions.severityThreshold) {
      const severityLevels = {
        [ErrorSeverity.LOW]: 1,
        [ErrorSeverity.MEDIUM]: 2,
        [ErrorSeverity.HIGH]: 3,
        [ErrorSeverity.CRITICAL]: 4
      };

      if (severityLevels[report.severity] >= severityLevels[this.alertConfig.conditions.severityThreshold]) {
        await this.triggerAlert('severity-threshold', `High severity error: ${report.title}`, report);
      }
    }

    // Check error rate
    if (this.alertConfig.conditions.errorRate) {
      const recentErrorCount = await this.getRecentErrorCount(
        this.alertConfig.conditions.errorRate.window
      );
      
      if (recentErrorCount >= this.alertConfig.conditions.errorRate.threshold) {
        await this.triggerAlert(
          'error-rate',
          `High error rate: ${recentErrorCount} errors in ${this.alertConfig.conditions.errorRate.window} minutes`,
          report
        );
      }
    }

    // Check execution failure rate
    if (this.alertConfig.conditions.executionFailureRate) {
      const failureRate = await this.getExecutionFailureRate(
        this.alertConfig.conditions.executionFailureRate.window
      );
      
      if (failureRate >= this.alertConfig.conditions.executionFailureRate.threshold) {
        await this.triggerAlert(
          'execution-failure-rate',
          `High execution failure rate: ${failureRate.toFixed(1)}%`,
          report
        );
      }
    }
  }

  /**
   * Trigger alert with escalation
   */
  private async triggerAlert(condition: string, message: string, report: ErrorReport): Promise<void> {
    const tracker = this.alertTrackers.get(condition);
    const now = new Date();

    // Check cooldown
    if (tracker && (now.getTime() - tracker.lastSent.getTime()) < this.alertConfig.cooldown * 60 * 1000) {
      return;
    }

    const escalationLevel = tracker ? tracker.escalationLevel + 1 : 0;
    const escalation = this.alertConfig.escalation.levels[Math.min(escalationLevel, this.alertConfig.escalation.levels.length - 1)];

    if (!escalation) {
      return;
    }

    // Update tracker
    this.alertTrackers.set(condition, {
      condition,
      lastSent: now,
      escalationLevel,
      count: tracker ? tracker.count + 1 : 1
    });

    // Send alert through specified channels
    const alertReport = {
      ...report,
      title: `ALERT: ${message}`,
      message: `${message}\n\nOriginal error: ${report.message}`
    };

    for (const channel of escalation.channels) {
      try {
        switch (channel) {
          case 'webhook':
            if (this.config.webhook?.url) {
              await this.sendToWebhook(alertReport);
            }
            break;
          case 'slack':
            if (this.config.slack?.enabled) {
              await this.sendToSlack(alertReport);
            }
            break;
          case 'email':
            if (this.config.email?.enabled) {
              await this.sendToEmail(alertReport);
            }
            break;
        }
      } catch (error) {
        logger.error('Failed to send alert', error as Error, {
          component: 'error-reporter',
          channel,
          condition
        });
      }
    }

    logger.warn('Alert triggered', {
      component: 'error-reporter',
      condition,
      escalationLevel,
      channels: escalation.channels
    });
  }

  /**
   * Get recent error count for rate checking
   */
  private async getRecentErrorCount(windowMinutes: number): Promise<number> {
    try {
      const db = dbConnection.getDb();
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(executionSteps)
        .where(
          and(
            eq(executionSteps.stepType, 'error'),
            sql`started_at >= ${since.toISOString()}`
          )
        )
        .get();

      return result?.count || 0;
    } catch (error) {
      logger.error('Failed to get recent error count', error as Error, {
        component: 'error-reporter'
      });
      return 0;
    }
  }

  /**
   * Get execution failure rate
   */
  private async getExecutionFailureRate(windowMinutes: number): Promise<number> {
    try {
      const db = dbConnection.getDb();
      const since = new Date(Date.now() - windowMinutes * 60 * 1000);

      const totalResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(executions)
        .where(sql`started_at >= ${since.toISOString()}`)
        .get();

      const failedResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(executions)
        .where(
          and(
            eq(executions.status, 'failed'),
            sql`started_at >= ${since.toISOString()}`
          )
        )
        .get();

      const total = totalResult?.count || 0;
      const failed = failedResult?.count || 0;

      return total > 0 ? (failed / total) * 100 : 0;
    } catch (error) {
      logger.error('Failed to get execution failure rate', error as Error, {
        component: 'error-reporter'
      });
      return 0;
    }
  }

  /**
   * Get error aggregations for analysis
   */
  async getErrorAggregations(timeWindow: ErrorAggregation['timeWindow'] = '1h'): Promise<ErrorAggregation> {
    const windowMs = this.parseTimeWindow(timeWindow);
    const since = new Date(Date.now() - windowMs);
    
    // Get cached reports within time window
    const recentReports: ErrorReport[] = [];
    for (const cached of this.errorCache.values()) {
      recentReports.push(...cached.reports.filter(
        report => new Date(report.timestamp) >= since
      ));
    }

    const uniqueFingerprints = new Set(recentReports.map(r => r.fingerprint));
    const affectedExecutions = new Set(
      recentReports.map(r => r.context.executionId).filter(Boolean)
    );

    // Calculate top errors
    const errorCounts = new Map<string, { count: number; report: ErrorReport }>();
    for (const report of recentReports) {
      const existing = errorCounts.get(report.fingerprint);
      if (existing) {
        existing.count++;
      } else {
        errorCounts.set(report.fingerprint, { count: 1, report });
      }
    }

    const topErrors = Array.from(errorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ count, report }) => ({
        fingerprint: report.fingerprint,
        count,
        message: report.message,
        category: report.category,
        severity: report.severity
      }));

    return {
      timeWindow,
      groupBy: 'fingerprint',
      metrics: {
        count: recentReports.length,
        uniqueErrors: uniqueFingerprints.size,
        affectedExecutions: affectedExecutions.size,
        avgResolutionTime: 0, // Would need resolution tracking
        recoveryRate: 0 // Would need recovery tracking
      },
      topErrors
    };
  }

  /**
   * Parse time window to milliseconds
   */
  private parseTimeWindow(timeWindow: string): number {
    const multipliers: Record<string, number> = {
      'm': 60 * 1000,
      'h': 60 * 60 * 1000
    };

    const match = timeWindow.match(/^(\d+)([mh])$/);
    if (!match) {
      return 60 * 60 * 1000; // Default to 1 hour
    }

    const [, amount, unit] = match;
    return parseInt(amount) * multipliers[unit];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...config };
    
    logger.info('Error reporter configuration updated', {
      component: 'error-reporter'
    });
  }

  /**
   * Update alert configuration
   */
  updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
    
    logger.info('Alert configuration updated', {
      component: 'error-reporter'
    });
  }

  /**
   * Clear alert trackers (reset cooldowns)
   */
  clearAlertTrackers(): void {
    this.alertTrackers.clear();
    
    logger.info('Alert trackers cleared', {
      component: 'error-reporter'
    });
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'warning' | 'error';
    queueSize: number;
    cacheSize: number;
    activeAlerts: number;
    lastProcessed: Date;
  } {
    const activeAlerts = this.alertTrackers.size;
    
    return {
      status: this.reportingQueue.length > 100 ? 'warning' : 'healthy',
      queueSize: this.reportingQueue.length,
      cacheSize: this.errorCache.size,
      activeAlerts,
      lastProcessed: new Date()
    };
  }

  /**
   * Cleanup and destroy
   */
  destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.removeAllListeners();
    this.errorCache.clear();
    this.alertTrackers.clear();
    this.reportingQueue.length = 0;

    logger.info('Error reporter destroyed', {
      component: 'error-reporter'
    });
  }
}

// Default error reporter instance
export const errorReporter = ErrorReporter.getInstance();