import { EventEmitter } from 'events';
import { getWebSocketManager } from '../websocket/server';
import type { SystemHealthStatus } from '../types/database';

export interface Alert {
  id: string;
  type: 'system' | 'custom' | 'threshold';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  source: string;
  metric?: string;
  value?: number;
  threshold?: number;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
  resolvedAt?: string;
  acknowledgdAt?: string;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  metric: string;
  condition: 'greater_than' | 'less_than' | 'equal_to' | 'not_equal_to';
  threshold: number;
  severity: Alert['severity'];
  suppressionDuration: number; // minutes
  evaluationWindow: number; // minutes
  consecutiveBreaches: number;
  metadata?: Record<string, any>;
}

export interface AlertChannel {
  id: string;
  type: 'websocket' | 'console' | 'custom';
  name: string;
  enabled: boolean;
  config: Record<string, any>;
  handler?: (alert: Alert) => Promise<void>;
}

export interface AlertManagerConfig {
  maxActiveAlerts: number;
  alertRetentionHours: number;
  defaultSuppressionMinutes: number;
  enableAutoResolution: boolean;
  resolutionCheckInterval: number;
}

export interface AlertStats {
  totalAlerts: number;
  activeAlerts: number;
  resolvedAlerts: number;
  acknowledgedAlerts: number;
  alertsByType: Record<string, number>;
  alertsBySeverity: Record<string, number>;
  alertsLast24Hours: number;
  averageResolutionTime: number;
}

export class AlertManager extends EventEmitter {
  private config: AlertManagerConfig;
  private alerts: Map<string, Alert> = new Map();
  private rules: Map<string, AlertRule> = new Map();
  private channels: Map<string, AlertChannel> = new Map();
  private suppressions: Map<string, { until: Date; alertRuleId: string }> = new Map();
  private breachCounts: Map<string, { count: number; firstBreach: Date }> = new Map();
  private resolutionTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<AlertManagerConfig> = {}) {
    super();
    
    this.config = {
      maxActiveAlerts: 1000,
      alertRetentionHours: 24 * 7, // 7 days
      defaultSuppressionMinutes: 5,
      enableAutoResolution: true,
      resolutionCheckInterval: 60000, // 1 minute
      ...config
    };

    this.setupDefaultChannels();
    this.setupDefaultRules();
    
    if (this.config.enableAutoResolution) {
      this.startResolutionTimer();
    }
  }

  /**
   * Create a new alert
   */
  async createAlert(alertData: Omit<Alert, 'id' | 'timestamp' | 'acknowledged' | 'resolved'>): Promise<Alert> {
    const alert: Alert = {
      id: this.generateAlertId(),
      timestamp: new Date().toISOString(),
      acknowledged: false,
      resolved: false,
      ...alertData
    };

    // Check if alert should be suppressed
    if (this.isAlertSuppressed(alert)) {
      console.debug(`Alert suppressed: ${alert.title}`);
      return alert;
    }

    // Store alert
    this.alerts.set(alert.id, alert);

    // Cleanup old alerts if needed
    this.cleanupOldAlerts();

    // Emit alert created event
    this.emit('alertCreated', alert);

    // Send alert through channels
    await this.sendAlert(alert);

    console.log(`Alert created: ${alert.severity.toUpperCase()} - ${alert.title}`);
    return alert;
  }

  /**
   * Process threshold breach and potentially create alert
   */
  async processThresholdBreach(
    metric: string,
    value: number,
    threshold: number,
    severity: Alert['severity'],
    source = 'system-monitor'
  ): Promise<Alert | null> {
    const ruleId = `threshold_${metric}`;
    const rule = this.rules.get(ruleId);

    if (!rule || !rule.enabled) {
      return null;
    }

    // Track consecutive breaches
    const breachKey = `${ruleId}_${metric}`;
    const now = new Date();
    
    if (!this.breachCounts.has(breachKey)) {
      this.breachCounts.set(breachKey, { count: 1, firstBreach: now });
    } else {
      const breach = this.breachCounts.get(breachKey)!;
      
      // Reset if too much time has passed
      const timeSinceFirst = now.getTime() - breach.firstBreach.getTime();
      const evaluationWindowMs = rule.evaluationWindow * 60 * 1000;
      
      if (timeSinceFirst > evaluationWindowMs) {
        this.breachCounts.set(breachKey, { count: 1, firstBreach: now });
      } else {
        breach.count++;
      }
    }

    const breach = this.breachCounts.get(breachKey)!;
    
    // Check if we've hit the required consecutive breaches
    if (breach.count >= rule.consecutiveBreaches) {
      // Reset breach count after firing alert
      this.breachCounts.delete(breachKey);
      
      // Add suppression
      this.addSuppression(ruleId, rule.suppressionDuration);
      
      return await this.createAlert({
        type: 'threshold',
        severity,
        title: `${rule.name} Threshold Exceeded`,
        message: `${metric} is ${value.toFixed(2)}${metric.includes('percentage') ? '%' : ''}, exceeding threshold of ${threshold}${metric.includes('percentage') ? '%' : ''}`,
        source,
        metric,
        value,
        threshold,
        metadata: {
          ruleId: rule.id,
          ruleName: rule.name,
          consecutiveBreaches: breach.count,
          evaluationWindow: rule.evaluationWindow
        }
      });
    }

    return null;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgdAt = new Date().toISOString();
    
    if (acknowledgedBy) {
      alert.metadata = { ...alert.metadata, acknowledgedBy };
    }

    this.emit('alertAcknowledged', alert);
    console.log(`Alert acknowledged: ${alert.title}`);
    
    return true;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy?: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date().toISOString();
    
    if (resolvedBy) {
      alert.metadata = { ...alert.metadata, resolvedBy };
    }

    this.emit('alertResolved', alert);
    console.log(`Alert resolved: ${alert.title}`);
    
    return true;
  }

  /**
   * Get all alerts with optional filtering
   */
  getAlerts(filter?: {
    severity?: Alert['severity'];
    type?: Alert['type'];
    source?: string;
    resolved?: boolean;
    acknowledged?: boolean;
    limit?: number;
  }): Alert[] {
    let alerts = Array.from(this.alerts.values());

    // Apply filters
    if (filter) {
      if (filter.severity) {
        alerts = alerts.filter(alert => alert.severity === filter.severity);
      }
      if (filter.type) {
        alerts = alerts.filter(alert => alert.type === filter.type);
      }
      if (filter.source) {
        alerts = alerts.filter(alert => alert.source === filter.source);
      }
      if (filter.resolved !== undefined) {
        alerts = alerts.filter(alert => alert.resolved === filter.resolved);
      }
      if (filter.acknowledged !== undefined) {
        alerts = alerts.filter(alert => alert.acknowledged === filter.acknowledged);
      }
    }

    // Sort by timestamp (newest first)
    alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (filter?.limit) {
      alerts = alerts.slice(0, filter.limit);
    }

    return alerts;
  }

  /**
   * Get alert statistics
   */
  getAlertStats(): AlertStats {
    const alerts = Array.from(this.alerts.values());
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const alertsLast24Hours = alerts.filter(
      alert => new Date(alert.timestamp) > last24Hours
    ).length;

    const resolvedAlerts = alerts.filter(alert => alert.resolved);
    const totalResolutionTime = resolvedAlerts.reduce((sum, alert) => {
      if (alert.resolvedAt) {
        const resolutionTime = new Date(alert.resolvedAt).getTime() - new Date(alert.timestamp).getTime();
        return sum + resolutionTime;
      }
      return sum;
    }, 0);
    
    const averageResolutionTime = resolvedAlerts.length > 0 
      ? totalResolutionTime / resolvedAlerts.length / (1000 * 60) // Convert to minutes
      : 0;

    const alertsByType: Record<string, number> = {};
    const alertsBySeverity: Record<string, number> = {};
    
    for (const alert of alerts) {
      alertsByType[alert.type] = (alertsByType[alert.type] || 0) + 1;
      alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] || 0) + 1;
    }

    return {
      totalAlerts: alerts.length,
      activeAlerts: alerts.filter(alert => !alert.resolved).length,
      resolvedAlerts: resolvedAlerts.length,
      acknowledgedAlerts: alerts.filter(alert => alert.acknowledged).length,
      alertsByType,
      alertsBySeverity,
      alertsLast24Hours,
      averageResolutionTime
    };
  }

  /**
   * Add alert rule
   */
  addRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const fullRule: AlertRule = {
      id: this.generateRuleId(rule.name),
      ...rule
    };

    this.rules.set(fullRule.id, fullRule);
    this.emit('ruleAdded', fullRule);
    
    console.log(`Alert rule added: ${fullRule.name}`);
    return fullRule;
  }

  /**
   * Remove alert rule
   */
  removeRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return false;
    }

    this.rules.delete(ruleId);
    this.emit('ruleRemoved', rule);
    
    console.log(`Alert rule removed: ${rule.name}`);
    return true;
  }

  /**
   * Get all alert rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Add alert channel
   */
  addChannel(channel: AlertChannel): void {
    this.channels.set(channel.id, channel);
    this.emit('channelAdded', channel);
    
    console.log(`Alert channel added: ${channel.name}`);
  }

  /**
   * Remove alert channel
   */
  removeChannel(channelId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return false;
    }

    this.channels.delete(channelId);
    this.emit('channelRemoved', channel);
    
    console.log(`Alert channel removed: ${channel.name}`);
    return true;
  }

  /**
   * Get all alert channels
   */
  getChannels(): AlertChannel[] {
    return Array.from(this.channels.values());
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    if (this.resolutionTimer) {
      clearInterval(this.resolutionTimer);
      this.resolutionTimer = null;
    }

    // Resolve any remaining alerts
    const activeAlerts = this.getAlerts({ resolved: false });
    for (const alert of activeAlerts) {
      await this.resolveAlert(alert.id, 'system-shutdown');
    }

    this.emit('shutdown');
    console.log('Alert manager shutdown');
  }

  /**
   * Setup default alert channels
   */
  private setupDefaultChannels(): void {
    // WebSocket channel
    this.addChannel({
      id: 'websocket',
      type: 'websocket',
      name: 'WebSocket Broadcast',
      enabled: true,
      config: {},
      handler: async (alert: Alert) => {
        const wsManager = getWebSocketManager();
        if (wsManager) {
          const status = alert.severity === 'critical' || alert.severity === 'error' ? 'error' :
                        alert.severity === 'warning' ? 'warning' : 'healthy';
          
          wsManager.broadcastSystemStatus(status);
        }
      }
    });

    // Console channel
    this.addChannel({
      id: 'console',
      type: 'console',
      name: 'Console Log',
      enabled: true,
      config: {},
      handler: async (alert: Alert) => {
        const timestamp = new Date(alert.timestamp).toLocaleString();
        const prefix = alert.severity === 'critical' ? '🚨' :
                      alert.severity === 'error' ? '❌' :
                      alert.severity === 'warning' ? '⚠️' : 'ℹ️';
        
        console.log(`${prefix} [${timestamp}] ${alert.severity.toUpperCase()} - ${alert.title}: ${alert.message}`);
      }
    });
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultRules(): void {
    // CPU threshold rules
    this.addRule({
      name: 'CPU High Usage Warning',
      description: 'CPU usage exceeds warning threshold',
      enabled: true,
      metric: 'cpu',
      condition: 'greater_than',
      threshold: 70,
      severity: 'warning',
      suppressionDuration: 5,
      evaluationWindow: 5,
      consecutiveBreaches: 2
    });

    this.addRule({
      name: 'CPU Critical Usage',
      description: 'CPU usage exceeds critical threshold',
      enabled: true,
      metric: 'cpu',
      condition: 'greater_than',
      threshold: 90,
      severity: 'critical',
      suppressionDuration: 2,
      evaluationWindow: 3,
      consecutiveBreaches: 1
    });

    // Memory threshold rules
    this.addRule({
      name: 'Memory High Usage Warning',
      description: 'Memory usage exceeds warning threshold',
      enabled: true,
      metric: 'memory',
      condition: 'greater_than',
      threshold: 80,
      severity: 'warning',
      suppressionDuration: 5,
      evaluationWindow: 5,
      consecutiveBreaches: 2
    });

    this.addRule({
      name: 'Memory Critical Usage',
      description: 'Memory usage exceeds critical threshold',
      enabled: true,
      metric: 'memory',
      condition: 'greater_than',
      threshold: 95,
      severity: 'critical',
      suppressionDuration: 2,
      evaluationWindow: 3,
      consecutiveBreaches: 1
    });

    // Disk threshold rules
    this.addRule({
      name: 'Disk High Usage Warning',
      description: 'Disk usage exceeds warning threshold',
      enabled: true,
      metric: 'disk',
      condition: 'greater_than',
      threshold: 85,
      severity: 'warning',
      suppressionDuration: 10,
      evaluationWindow: 10,
      consecutiveBreaches: 3
    });

    this.addRule({
      name: 'Disk Critical Usage',
      description: 'Disk usage exceeds critical threshold',
      enabled: true,
      metric: 'disk',
      condition: 'greater_than',
      threshold: 95,
      severity: 'critical',
      suppressionDuration: 5,
      evaluationWindow: 5,
      consecutiveBreaches: 2
    });

    // Load average rules
    this.addRule({
      name: 'High System Load',
      description: 'System load average exceeds threshold',
      enabled: true,
      metric: 'load',
      condition: 'greater_than',
      threshold: 2.0,
      severity: 'warning',
      suppressionDuration: 5,
      evaluationWindow: 5,
      consecutiveBreaches: 3
    });
  }

  /**
   * Send alert through all enabled channels
   */
  private async sendAlert(alert: Alert): Promise<void> {
    const enabledChannels = Array.from(this.channels.values()).filter(channel => channel.enabled);
    
    const promises = enabledChannels.map(async (channel) => {
      try {
        if (channel.handler) {
          await channel.handler(alert);
        }
      } catch (error) {
        console.error(`Error sending alert through channel ${channel.name}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Check if alert should be suppressed
   */
  private isAlertSuppressed(alert: Alert): boolean {
    if (alert.type !== 'threshold' || !alert.metadata?.ruleId) {
      return false;
    }

    const suppressionKey = `${alert.metadata.ruleId}_${alert.metric}`;
    const suppression = this.suppressions.get(suppressionKey);
    
    if (suppression && suppression.until > new Date()) {
      return true;
    }

    // Clean up expired suppression
    if (suppression) {
      this.suppressions.delete(suppressionKey);
    }

    return false;
  }

  /**
   * Add suppression for alert rule
   */
  private addSuppression(ruleId: string, durationMinutes: number): void {
    const until = new Date(Date.now() + durationMinutes * 60 * 1000);
    this.suppressions.set(`${ruleId}`, { until, alertRuleId: ruleId });
  }

  /**
   * Cleanup old alerts
   */
  private cleanupOldAlerts(): void {
    const now = new Date();
    const cutoff = new Date(now.getTime() - this.config.alertRetentionHours * 60 * 60 * 1000);
    
    let cleanupCount = 0;
    for (const [alertId, alert] of Array.from(this.alerts.entries())) {
      if (new Date(alert.timestamp) < cutoff && alert.resolved) {
        this.alerts.delete(alertId);
        cleanupCount++;
      }
    }

    // Also enforce max active alerts limit
    const activeAlerts = Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    if (activeAlerts.length > this.config.maxActiveAlerts) {
      const toRemove = activeAlerts
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .slice(0, activeAlerts.length - this.config.maxActiveAlerts);
      
      for (const alert of toRemove) {
        this.alerts.delete(alert.id);
        cleanupCount++;
      }
    }

    if (cleanupCount > 0) {
      console.log(`Cleaned up ${cleanupCount} old alerts`);
    }
  }

  /**
   * Start resolution timer for auto-resolution
   */
  private startResolutionTimer(): void {
    this.resolutionTimer = setInterval(() => {
      this.checkAutoResolution();
    }, this.config.resolutionCheckInterval);
  }

  /**
   * Check for alerts that can be auto-resolved
   */
  private checkAutoResolution(): void {
    // This would be implemented based on specific auto-resolution logic
    // For now, we'll just clean up old suppressions
    const now = new Date();
    
    for (const [key, suppression] of Array.from(this.suppressions.entries())) {
      if (suppression.until <= now) {
        this.suppressions.delete(key);
      }
    }
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique rule ID
   */
  private generateRuleId(name: string): string {
    return `rule_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  }
}

// Export singleton instance
export const alertManager = new AlertManager();