import { EventEmitter } from 'events';
import { systemMonitor, type SystemStats } from './systemMonitor';
import { metricsService } from '../services/metricsService';
import type { SystemHealthStatus } from '../types/database';

export interface MetricsCollectionConfig {
  enableRealTimeCollection: boolean;
  historicalRetentionDays: number;
  aggregationIntervals: {
    minute: boolean;
    hour: boolean;
    day: boolean;
  };
  customMetrics: {
    [key: string]: () => Promise<number>;
  };
}

export interface AggregatedMetrics {
  period: 'minute' | 'hour' | 'day';
  startTime: string;
  endTime: string;
  metrics: {
    avgCpu: number;
    maxCpu: number;
    minCpu: number;
    avgMemory: number;
    maxMemory: number;
    minMemory: number;
    avgDisk: number;
    maxDisk: number;
    minDisk: number;
    avgLoad: number;
    maxLoad: number;
    minLoad: number;
    uptimePercentage: number;
    healthDistribution: {
      healthy: number;
      warning: number;
      critical: number;
    };
    dataPoints: number;
  };
}

export interface HistoricalTrend {
  metric: string;
  timeframe: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  changePercentage: number;
  significance: 'low' | 'medium' | 'high';
  data: Array<{
    timestamp: string;
    value: number;
  }>;
}

export interface MetricsSnapshot {
  timestamp: string;
  current: SystemStats;
  trends: HistoricalTrend[];
  aggregated: {
    last24Hours: AggregatedMetrics;
    last7Days: AggregatedMetrics;
    last30Days: AggregatedMetrics;
  };
  predictions: {
    nextHour: {
      cpu: number;
      memory: number;
      disk: number;
    };
    confidence: number;
  };
}

export class MetricsCollector extends EventEmitter {
  private config: MetricsCollectionConfig;
  private collectionHistory: Map<string, number[]> = new Map();
  private aggregationTimers: Map<string, NodeJS.Timeout> = new Map();
  private isCollecting = false;

  constructor(config: Partial<MetricsCollectionConfig> = {}) {
    super();
    
    this.config = {
      enableRealTimeCollection: true,
      historicalRetentionDays: 30,
      aggregationIntervals: {
        minute: true,
        hour: true,
        day: true
      },
      customMetrics: {},
      ...config
    };

    this.setupEventListeners();
  }

  /**
   * Start metrics collection
   */
  async start(): Promise<void> {
    if (this.isCollecting) {
      throw new Error('Metrics collection is already running');
    }

    this.isCollecting = true;
    
    // Start system monitor if not already running
    if (!systemMonitor.isMonitoring()) {
      await systemMonitor.start();
    }

    // Setup aggregation timers
    this.setupAggregationTimers();

    // Initialize collection history
    await this.initializeHistory();

    this.emit('started');
    console.log('Metrics collector started');
  }

  /**
   * Stop metrics collection
   */
  async stop(): Promise<void> {
    if (!this.isCollecting) {
      return;
    }

    this.isCollecting = false;

    // Clear aggregation timers
    for (const [key, timer] of Array.from(this.aggregationTimers.entries())) {
      clearInterval(timer);
    }
    this.aggregationTimers.clear();

    this.emit('stopped');
    console.log('Metrics collector stopped');
  }

  /**
   * Get current metrics snapshot with historical context
   */
  async getMetricsSnapshot(): Promise<MetricsSnapshot> {
    const current = systemMonitor.getLastStats();
    if (!current) {
      throw new Error('No current system stats available');
    }

    const trends = await this.getHistoricalTrends();
    const aggregated = await this.getAggregatedMetrics();
    const predictions = this.calculatePredictions();

    return {
      timestamp: new Date().toISOString(),
      current,
      trends,
      aggregated,
      predictions
    };
  }

  /**
   * Get historical trends for specific metrics
   */
  async getHistoricalTrends(
    metrics: string[] = ['cpu', 'memory', 'disk'],
    timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'
  ): Promise<HistoricalTrend[]> {
    const trends: HistoricalTrend[] = [];
    const hours = this.getHoursForTimeframe(timeframe);

    for (const metric of metrics) {
      try {
        const trend = await this.calculateMetricTrend(metric, hours);
        trends.push(trend);
      } catch (error) {
        console.error(`Error calculating trend for ${metric}:`, error);
      }
    }

    return trends;
  }

  /**
   * Get aggregated metrics for different time periods
   */
  async getAggregatedMetrics(): Promise<{
    last24Hours: AggregatedMetrics;
    last7Days: AggregatedMetrics;
    last30Days: AggregatedMetrics;
  }> {
    const [last24Hours, last7Days, last30Days] = await Promise.all([
      this.calculateAggregatedMetrics(24),
      this.calculateAggregatedMetrics(24 * 7),
      this.calculateAggregatedMetrics(24 * 30)
    ]);

    return {
      last24Hours,
      last7Days,
      last30Days
    };
  }

  /**
   * Add custom metric collector
   */
  addCustomMetric(name: string, collector: () => Promise<number>): void {
    this.config.customMetrics[name] = collector;
    this.emit('customMetricAdded', { name });
  }

  /**
   * Remove custom metric collector
   */
  removeCustomMetric(name: string): void {
    delete this.config.customMetrics[name];
    this.emit('customMetricRemoved', { name });
  }

  /**
   * Force cleanup of old metrics data
   */
  async cleanupOldMetrics(): Promise<{ deletedCount: number }> {
    const result = await metricsService.cleanupOldMetrics(this.config.historicalRetentionDays);
    if (result.success && result.data) {
      return result.data;
    }
    throw new Error(result.error || 'Failed to cleanup old metrics');
  }

  /**
   * Get collection statistics
   */
  getCollectionStats(): {
    isCollecting: boolean;
    historySize: number;
    customMetricsCount: number;
    aggregationTimersActive: number;
    config: MetricsCollectionConfig;
  } {
    return {
      isCollecting: this.isCollecting,
      historySize: Array.from(this.collectionHistory.values()).reduce((sum, arr) => sum + arr.length, 0),
      customMetricsCount: Object.keys(this.config.customMetrics).length,
      aggregationTimersActive: this.aggregationTimers.size,
      config: { ...this.config }
    };
  }

  /**
   * Setup event listeners for system monitor
   */
  private setupEventListeners(): void {
    systemMonitor.on('metricsCollected', (stats: SystemStats) => {
      if (this.isCollecting) {
        this.processMetrics(stats);
      }
    });

    systemMonitor.on('thresholdBreach', (breaches) => {
      this.emit('thresholdBreach', breaches);
    });

    systemMonitor.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Process collected metrics
   */
  private processMetrics(stats: SystemStats): void {
    // Update collection history for trend analysis
    this.updateCollectionHistory(stats);

    // Collect custom metrics
    this.collectCustomMetrics();

    // Emit processed metrics
    this.emit('metricsProcessed', {
      stats,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Update collection history for trend analysis
   */
  private updateCollectionHistory(stats: SystemStats): void {
    const timestamp = Date.now();
    const maxHistorySize = 1000; // Keep last 1000 data points per metric

    // Update CPU history
    this.addToHistory('cpu', stats.cpuUsage, maxHistorySize);
    this.addToHistory('memory', stats.memoryUsage, maxHistorySize);
    this.addToHistory('disk', stats.diskUsage, maxHistorySize);
    this.addToHistory('load', stats.loadAverage[0], maxHistorySize);
  }

  /**
   * Add value to metric history
   */
  private addToHistory(metric: string, value: number, maxSize: number): void {
    if (!this.collectionHistory.has(metric)) {
      this.collectionHistory.set(metric, []);
    }

    const history = this.collectionHistory.get(metric)!;
    history.push(value);

    // Maintain history size limit
    if (history.length > maxSize) {
      history.splice(0, history.length - maxSize);
    }
  }

  /**
   * Collect custom metrics
   */
  private async collectCustomMetrics(): Promise<void> {
    for (const [name, collector] of Object.entries(this.config.customMetrics)) {
      try {
        const value = await collector();
        this.addToHistory(`custom_${name}`, value, 1000);
        this.emit('customMetricCollected', { name, value });
      } catch (error) {
        console.error(`Error collecting custom metric ${name}:`, error);
      }
    }
  }

  /**
   * Setup aggregation timers
   */
  private setupAggregationTimers(): void {
    if (this.config.aggregationIntervals.minute) {
      const timer = setInterval(() => {
        this.performAggregation('minute');
      }, 60000); // Every minute
      this.aggregationTimers.set('minute', timer);
    }

    if (this.config.aggregationIntervals.hour) {
      const timer = setInterval(() => {
        this.performAggregation('hour');
      }, 3600000); // Every hour
      this.aggregationTimers.set('hour', timer);
    }

    if (this.config.aggregationIntervals.day) {
      const timer = setInterval(() => {
        this.performAggregation('day');
      }, 86400000); // Every day
      this.aggregationTimers.set('day', timer);
    }
  }

  /**
   * Perform metrics aggregation
   */
  private async performAggregation(period: 'minute' | 'hour' | 'day'): Promise<void> {
    try {
      const hours = period === 'minute' ? 0.017 : period === 'hour' ? 1 : 24; // Approximate
      const aggregated = await this.calculateAggregatedMetrics(hours);
      
      this.emit('aggregationCompleted', {
        period,
        aggregated,
        timestamp: new Date().toISOString()
      });

      console.log(`Completed ${period} aggregation`);
    } catch (error) {
      console.error(`Error performing ${period} aggregation:`, error);
      this.emit('aggregationError', { period, error });
    }
  }

  /**
   * Calculate aggregated metrics for a time period
   */
  private async calculateAggregatedMetrics(hours: number): Promise<AggregatedMetrics> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000));

    const result = await metricsService.getHealthStatistics('localhost', hours);

    if (!result.success) {
      throw new Error(`Failed to get health statistics: ${result.error}`);
    }

    const stats = result.data!;
    
    return {
      period: hours <= 1 ? 'minute' : hours <= 24 ? 'hour' : 'day',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      metrics: {
        avgCpu: stats.averages.cpu || 0,
        maxCpu: stats.maximums.cpu || 0,
        minCpu: stats.minimums.cpu || 0,
        avgMemory: stats.averages.memory || 0,
        maxMemory: stats.maximums.memory || 0,
        minMemory: stats.minimums.memory || 0,
        avgDisk: stats.averages.disk || 0,
        maxDisk: stats.maximums.disk || 0,
        minDisk: stats.minimums.disk || 0,
        avgLoad: stats.averages.load1m || 0,
        maxLoad: stats.averages.load1m || 0, // Simplified for now
        minLoad: stats.averages.load1m || 0,
        uptimePercentage: this.calculateUptimePercentage(stats.healthDistribution),
        healthDistribution: stats.healthDistribution,
        dataPoints: stats.healthDistribution.healthy + stats.healthDistribution.warning + stats.healthDistribution.critical
      }
    };
  }

  /**
   * Calculate uptime percentage from health distribution
   */
  private calculateUptimePercentage(healthDist: { healthy: number; warning: number; critical: number }): number {
    const total = healthDist.healthy + healthDist.warning + healthDist.critical;
    return total > 0 ? ((healthDist.healthy + healthDist.warning) / total) * 100 : 0;
  }

  /**
   * Calculate trend for a specific metric
   */
  private async calculateMetricTrend(metric: string, hours: number): Promise<HistoricalTrend> {
    const trends = await metricsService.getMetricsTrends('localhost', hours);

    if (!trends.success) {
      throw new Error(`Failed to get trends for ${metric}: ${trends.error}`);
    }

    const data = trends.data!;
    const values = data.map(trend => {
      switch (metric) {
        case 'cpu': return trend.cpuUsage || 0;
        case 'memory': return trend.memoryUsage || 0;
        case 'disk': return trend.diskUsage || 0;
        case 'load': return trend.loadAverage1m || 0;
        default: return 0;
      }
    });

    const trend = this.calculateTrendDirection(values);
    const changePercentage = this.calculateChangePercentage(values);
    const significance = this.calculateSignificance(changePercentage, values.length);

    return {
      metric,
      timeframe: `${hours}h`,
      trend,
      changePercentage,
      significance,
      data: data.map((trend, index) => ({
        timestamp: trend.timestamp,
        value: values[index]
      }))
    };
  }

  /**
   * Calculate trend direction from values
   */
  private calculateTrendDirection(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;

    const difference = secondAvg - firstAvg;
    const threshold = 5; // 5% threshold for significance

    if (Math.abs(difference) < threshold) return 'stable';
    return difference > 0 ? 'increasing' : 'decreasing';
  }

  /**
   * Calculate percentage change from values
   */
  private calculateChangePercentage(values: number[]): number {
    if (values.length < 2) return 0;

    const first = values[0];
    const last = values[values.length - 1];

    if (first === 0) return last > 0 ? 100 : 0;
    return ((last - first) / first) * 100;
  }

  /**
   * Calculate trend significance
   */
  private calculateSignificance(changePercentage: number, dataPoints: number): 'low' | 'medium' | 'high' {
    const absChange = Math.abs(changePercentage);
    
    if (absChange > 25 && dataPoints > 10) return 'high';
    if (absChange > 10 && dataPoints > 5) return 'medium';
    return 'low';
  }

  /**
   * Calculate predictions for next period
   */
  private calculatePredictions(): { nextHour: { cpu: number; memory: number; disk: number }; confidence: number } {
    // Simple linear prediction based on recent trends
    const cpuHistory = this.collectionHistory.get('cpu') || [];
    const memoryHistory = this.collectionHistory.get('memory') || [];
    const diskHistory = this.collectionHistory.get('disk') || [];

    const predictCpu = this.linearPredict(cpuHistory);
    const predictMemory = this.linearPredict(memoryHistory);
    const predictDisk = this.linearPredict(diskHistory);

    const confidence = Math.min(
      cpuHistory.length,
      memoryHistory.length,
      diskHistory.length
    ) / 10; // Simple confidence based on data availability

    return {
      nextHour: {
        cpu: Math.max(0, Math.min(100, predictCpu)),
        memory: Math.max(0, Math.min(100, predictMemory)),
        disk: Math.max(0, Math.min(100, predictDisk))
      },
      confidence: Math.min(1, confidence / 10)
    };
  }

  /**
   * Simple linear prediction
   */
  private linearPredict(values: number[]): number {
    if (values.length < 2) {
      return values[0] || 0;
    }

    const recent = values.slice(-10); // Use last 10 points
    const n = recent.length;
    
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i];
      sumXY += i * recent[i];
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Predict next value
    return slope * n + intercept;
  }

  /**
   * Get hours for timeframe
   */
  private getHoursForTimeframe(timeframe: 'hour' | 'day' | 'week' | 'month'): number {
    switch (timeframe) {
      case 'hour': return 1;
      case 'day': return 24;
      case 'week': return 24 * 7;
      case 'month': return 24 * 30;
      default: return 24;
    }
  }

  /**
   * Initialize collection history from database
   */
  private async initializeHistory(): Promise<void> {
    try {
      // Load recent metrics to populate initial history
      const result = await metricsService.getMetricsTrends('localhost', 24);
      
      if (result.success && result.data) {
        for (const metric of result.data) {
          if (metric.cpuUsage !== null) {
            this.addToHistory('cpu', metric.cpuUsage, 1000);
          }
          if (metric.memoryUsage !== null) {
            this.addToHistory('memory', metric.memoryUsage, 1000);
          }
          if (metric.diskUsage !== null) {
            this.addToHistory('disk', metric.diskUsage, 1000);
          }
          if (metric.loadAverage1m !== null) {
            this.addToHistory('load', metric.loadAverage1m, 1000);
          }
        }
      }

      console.log('Metrics collection history initialized');
    } catch (error) {
      console.error('Error initializing collection history:', error);
    }
  }
}

// Export singleton instance
export const metricsCollector = new MetricsCollector();