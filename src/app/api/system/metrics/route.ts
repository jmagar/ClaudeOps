import { NextRequest } from 'next/server';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateQueryParams,
  createSuccessResponse
} from '@/lib/middleware/errorHandler';
import { 
  MetricsQuerySchema,
  type MetricsQuery
} from '@/lib/middleware/validation';
import { metricsService } from '@/lib/services/metricsService';
import { systemMonitor } from '@/lib/monitoring/systemMonitor';
import { metricsCollector } from '@/lib/monitoring/metricsCollector';
import { alertManager } from '@/lib/monitoring/alertManager';
import { monitoringScheduler } from '@/lib/monitoring/scheduler';
import type { SystemHealthStatus, MetricsFilter } from '@/lib/types/database';

interface SystemMetricsResponse {
  current: {
    timestamp: string;
    status: SystemHealthStatus;
    cpu: number;
    memory: number;
    disk: number;
    load: [number, number, number];
    uptime: number;
    networkConnectivity: {
      internet: boolean;
      latency?: number;
    };
  };
  trends: Array<{
    timestamp: string;
    cpu: number | null;
    memory: number | null;
    disk: number | null;
    load: number | null;
    health: SystemHealthStatus;
  }>;
  aggregated: {
    last24Hours: {
      avg: { cpu: number; memory: number; disk: number };
      max: { cpu: number; memory: number; disk: number };
      min: { cpu: number; memory: number; disk: number };
      healthDistribution: { healthy: number; warning: number; critical: number };
    };
    last7Days: {
      avg: { cpu: number; memory: number; disk: number };
      max: { cpu: number; memory: number; disk: number };
      min: { cpu: number; memory: number; disk: number };
      healthDistribution: { healthy: number; warning: number; critical: number };
    };
  };
  alerts: {
    active: number;
    recent: Array<{
      id: string;
      severity: string;
      title: string;
      message: string;
      timestamp: string;
    }>;
  };
  monitoring: {
    systemMonitor: {
      isRunning: boolean;
      config: any;
    };
    metricsCollector: {
      isCollecting: boolean;
      stats: any;
    };
    scheduler: {
      isRunning: boolean;
      stats: any;
    };
  };
}

interface MetricsHistoryResponse {
  data: Array<{
    timestamp: string;
    nodeId: string;
    cpu: number | null;
    memory: number | null;
    disk: number | null;
    loadAverage1m: number | null;
    loadAverage5m: number | null;
    loadAverage15m: number | null;
    internetConnected: boolean | null;
    claudeApiLatency: number | null;
    overallHealth: SystemHealthStatus;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface MetricsTrendsResponse {
  timeframe: string;
  trends: Array<{
    metric: string;
    trend: 'increasing' | 'decreasing' | 'stable';
    changePercentage: number;
    significance: 'low' | 'medium' | 'high';
    data: Array<{
      timestamp: string;
      value: number;
    }>;
  }>;
}

interface SystemHealthSummaryResponse {
  status: SystemHealthStatus;
  score: number;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskUsage: number | null;
  loadAverage: number | null;
  uptime: number | null;
  internetConnected: boolean | null;
  claudeApiLatency: number | null;
  lastUpdated: string | null;
  alerts: Array<{
    type: string;
    level: 'warning' | 'critical';
    message: string;
    value: number;
    threshold: number;
  }>;
  predictions: {
    nextHour: {
      cpu: number;
      memory: number;
      disk: number;
    };
    confidence: number;
  };
}

/**
 * GET /api/system/metrics
 * Get comprehensive system metrics data
 */
export const GET = withErrorHandler<SystemMetricsResponse | MetricsHistoryResponse | MetricsTrendsResponse | SystemHealthSummaryResponse>(
  async (req: NextRequest) => {
    const searchParams = req.nextUrl.searchParams;
    const query = validateQueryParams(searchParams, MetricsQuerySchema);
    
    const endpoint = searchParams.get('endpoint') || 'overview';
    
    switch (endpoint) {
      case 'overview':
        return await getMetricsOverview(query);
      
      case 'history':
        return await getMetricsHistory(query);
      
      case 'trends':
        return await getMetricsTrends(query);
      
      case 'health':
        return await getSystemHealthSummary(query);
      
      default:
        throw new Error(`Unknown endpoint: ${endpoint}`);
    }
  }
);

/**
 * POST /api/system/metrics
 * Control monitoring services or trigger actions
 */
export const POST = withErrorHandler<any>(
  async (req: NextRequest) => {
    const body = await req.json();
    const { action, ...params } = body;
    
    switch (action) {
      case 'start_monitoring':
        return await startMonitoring();
      
      case 'stop_monitoring':
        return await stopMonitoring();
      
      case 'collect_metrics':
        return await collectMetricsNow();
      
      case 'run_health_check':
        return await runHealthCheck();
      
      case 'acknowledge_alert':
        return await acknowledgeAlert(params.alertId, params.acknowledgedBy);
      
      case 'resolve_alert':
        return await resolveAlert(params.alertId, params.resolvedBy);
      
      case 'update_thresholds':
        return await updateThresholds(params.thresholds);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
);

/**
 * Get metrics overview
 */
async function getMetricsOverview(query: MetricsQuery): Promise<SystemMetricsResponse> {
  return await handleAsyncOperation(async () => {
    // Get current system stats
    const currentStats = systemMonitor.getLastStats();
    if (!currentStats) {
      throw new Error('No current system metrics available');
    }

    // Get health summary
    const healthResult = await metricsService.getLatestSystemHealth();
    if (!healthResult.success) {
      throw new Error(`Failed to get system health: ${healthResult.error}`);
    }

    // Get trends for the last 24 hours
    const trendsResult = await metricsService.getMetricsTrends('localhost', 24);
    if (!trendsResult.success) {
      throw new Error(`Failed to get trends: ${trendsResult.error}`);
    }

    // Get aggregated statistics
    const [stats24h, stats7d] = await Promise.all([
      metricsService.getHealthStatistics('localhost', 24),
      metricsService.getHealthStatistics('localhost', 24 * 7)
    ]);

    if (!stats24h.success || !stats7d.success) {
      throw new Error('Failed to get aggregated statistics');
    }

    // Get active alerts
    const activeAlerts = alertManager.getAlerts({ resolved: false, limit: 10 });
    const recentAlerts = alertManager.getAlerts({ limit: 5 });

    // Get monitoring service status
    const monitoringStats = {
      systemMonitor: {
        isRunning: systemMonitor.isMonitoring(),
        config: systemMonitor.getConfig()
      },
      metricsCollector: {
        isCollecting: metricsCollector.getCollectionStats().isCollecting,
        stats: metricsCollector.getCollectionStats()
      },
      scheduler: {
        isRunning: true, // Scheduler doesn't have an isRunning method
        stats: monitoringScheduler.getStats()
      }
    };

    // Get predictions from metrics collector
    let predictions = {
      nextHour: { cpu: 0, memory: 0, disk: 0 },
      confidence: 0
    };

    try {
      const snapshot = await metricsCollector.getMetricsSnapshot();
      predictions = snapshot.predictions;
    } catch (error) {
      console.warn('Failed to get predictions:', error);
    }

    const response: SystemMetricsResponse = {
      current: {
        timestamp: new Date().toISOString(),
        status: healthResult.data.status,
        cpu: currentStats.cpuUsage,
        memory: currentStats.memoryUsage,
        disk: currentStats.diskUsage,
        load: currentStats.loadAverage,
        uptime: currentStats.uptime,
        networkConnectivity: currentStats.networkConnectivity
      },
      trends: trendsResult.data.map(trend => ({
        timestamp: trend.timestamp,
        cpu: trend.cpuUsage,
        memory: trend.memoryUsage,
        disk: trend.diskUsage,
        load: trend.loadAverage1m,
        health: trend.overallHealth
      })),
      aggregated: {
        last24Hours: {
          avg: {
            cpu: stats24h.data.averages.cpu || 0,
            memory: stats24h.data.averages.memory || 0,
            disk: stats24h.data.averages.disk || 0
          },
          max: {
            cpu: stats24h.data.maximums.cpu || 0,
            memory: stats24h.data.maximums.memory || 0,
            disk: stats24h.data.maximums.disk || 0
          },
          min: {
            cpu: stats24h.data.minimums.cpu || 0,
            memory: stats24h.data.minimums.memory || 0,
            disk: stats24h.data.minimums.disk || 0
          },
          healthDistribution: stats24h.data.healthDistribution
        },
        last7Days: {
          avg: {
            cpu: stats7d.data.averages.cpu || 0,
            memory: stats7d.data.averages.memory || 0,
            disk: stats7d.data.averages.disk || 0
          },
          max: {
            cpu: stats7d.data.maximums.cpu || 0,
            memory: stats7d.data.maximums.memory || 0,
            disk: stats7d.data.maximums.disk || 0
          },
          min: {
            cpu: stats7d.data.minimums.cpu || 0,
            memory: stats7d.data.minimums.memory || 0,
            disk: stats7d.data.minimums.disk || 0
          },
          healthDistribution: stats7d.data.healthDistribution
        }
      },
      alerts: {
        active: activeAlerts.length,
        recent: recentAlerts.map(alert => ({
          id: alert.id,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          timestamp: alert.timestamp
        }))
      },
      monitoring: monitoringStats
    };

    return createSuccessResponse(response);
  });
}

/**
 * Get metrics history with pagination
 */
async function getMetricsHistory(query: MetricsQuery): Promise<MetricsHistoryResponse> {
  return await handleAsyncOperation(async () => {
    const filter: MetricsFilter = {
      nodeId: query.nodeId || 'localhost',
      limit: query.limit || 100,
      offset: query.offset || 0
    };

    if (query.dateFrom) {
      filter.dateFrom = new Date(query.dateFrom);
    }
    
    if (query.dateTo) {
      filter.dateTo = new Date(query.dateTo);
    }
    
    if (query.healthStatus) {
      filter.healthStatus = query.healthStatus as SystemHealthStatus;
    }

    const result = await metricsService.getSystemMetrics(filter);
    if (!result.success) {
      throw new Error(`Failed to get metrics history: ${result.error}`);
    }

    const response: MetricsHistoryResponse = {
      data: result.data.data.map(metric => ({
        timestamp: metric.timestamp,
        nodeId: metric.nodeId,
        cpu: metric.cpuUsagePercent,
        memory: metric.memoryUsagePercent,
        disk: metric.diskUsagePercent,
        loadAverage1m: metric.loadAverage1m,
        loadAverage5m: metric.loadAverage5m,
        loadAverage15m: metric.loadAverage15m,
        internetConnected: metric.internetConnected === 1,
        claudeApiLatency: metric.claudeApiLatencyMs,
        overallHealth: metric.overallHealth as SystemHealthStatus
      })),
      total: result.data.total,
      page: result.data.page,
      pageSize: result.data.pageSize,
      hasMore: result.data.hasMore
    };

    return createSuccessResponse(response);
  });
}

/**
 * Get metrics trends analysis
 */
async function getMetricsTrends(query: MetricsQuery): Promise<MetricsTrendsResponse> {
  return await handleAsyncOperation(async () => {
    const timeframe = query.timeframe || 'day';
    const metrics = query.metrics ? query.metrics.split(',') : ['cpu', 'memory', 'disk'];
    
    const trends = await metricsCollector.getHistoricalTrends(metrics, timeframe as any);
    
    const response: MetricsTrendsResponse = {
      timeframe,
      trends
    };

    return createSuccessResponse(response);
  });
}

/**
 * Get system health summary with predictions
 */
async function getSystemHealthSummary(query: MetricsQuery): Promise<SystemHealthSummaryResponse> {
  return await handleAsyncOperation(async () => {
    const healthResult = await metricsService.getLatestSystemHealth();
    if (!healthResult.success) {
      throw new Error(`Failed to get system health: ${healthResult.error}`);
    }

    const health = healthResult.data;
    
    // Calculate health score (0-100)
    const score = calculateHealthScore(health);

    // Get predictions
    let predictions = {
      nextHour: { cpu: 0, memory: 0, disk: 0 },
      confidence: 0
    };

    try {
      const snapshot = await metricsCollector.getMetricsSnapshot();
      predictions = snapshot.predictions;
    } catch (error) {
      console.warn('Failed to get predictions:', error);
    }

    const response: SystemHealthSummaryResponse = {
      status: health.status,
      score,
      cpuUsage: health.cpuUsage,
      memoryUsage: health.memoryUsage,
      diskUsage: health.diskUsage,
      loadAverage: health.loadAverage,
      uptime: health.uptime,
      internetConnected: health.internetConnected,
      claudeApiLatency: health.claudeApiLatency,
      lastUpdated: health.lastUpdated,
      alerts: health.alerts,
      predictions
    };

    return createSuccessResponse(response);
  });
}

/**
 * Start monitoring services
 */
async function startMonitoring(): Promise<any> {
  return await handleAsyncOperation(async () => {
    const results = {
      systemMonitor: false,
      metricsCollector: false,
      scheduler: false
    };

    // Start system monitor
    if (!systemMonitor.isMonitoring()) {
      await systemMonitor.start();
      results.systemMonitor = true;
    }

    // Start metrics collector
    if (!metricsCollector.getCollectionStats().isCollecting) {
      await metricsCollector.start();
      results.metricsCollector = true;
    }

    // Start scheduler (if not already running)
    try {
      await monitoringScheduler.start();
      results.scheduler = true;
    } catch (error) {
      // Scheduler might already be running
      console.warn('Scheduler start warning:', error);
    }

    return createSuccessResponse({
      message: 'Monitoring services started',
      results
    });
  });
}

/**
 * Stop monitoring services
 */
async function stopMonitoring(): Promise<any> {
  return await handleAsyncOperation(async () => {
    const results = {
      systemMonitor: false,
      metricsCollector: false,
      scheduler: false
    };

    // Stop system monitor
    if (systemMonitor.isMonitoring()) {
      await systemMonitor.stop();
      results.systemMonitor = true;
    }

    // Stop metrics collector
    if (metricsCollector.getCollectionStats().isCollecting) {
      await metricsCollector.stop();
      results.metricsCollector = true;
    }

    // Stop scheduler
    try {
      await monitoringScheduler.stop();
      results.scheduler = true;
    } catch (error) {
      console.warn('Scheduler stop warning:', error);
    }

    return createSuccessResponse({
      message: 'Monitoring services stopped',
      results
    });
  });
}

/**
 * Collect metrics immediately
 */
async function collectMetricsNow(): Promise<any> {
  return await handleAsyncOperation(async () => {
    const stats = await systemMonitor.collectNow();
    
    return createSuccessResponse({
      message: 'Metrics collected successfully',
      stats
    });
  });
}

/**
 * Run health check immediately
 */
async function runHealthCheck(): Promise<any> {
  return await handleAsyncOperation(async () => {
    const taskId = 'manual_health_check';
    const result = await monitoringScheduler.executeTaskNow(taskId);
    
    return createSuccessResponse({
      message: 'Health check executed',
      result
    });
  });
}

/**
 * Acknowledge an alert
 */
async function acknowledgeAlert(alertId: string, acknowledgedBy?: string): Promise<any> {
  return await handleAsyncOperation(async () => {
    const success = await alertManager.acknowledgeAlert(alertId, acknowledgedBy);
    
    if (!success) {
      throw new Error('Alert not found or already acknowledged');
    }
    
    return createSuccessResponse({
      message: 'Alert acknowledged successfully',
      alertId
    });
  });
}

/**
 * Resolve an alert
 */
async function resolveAlert(alertId: string, resolvedBy?: string): Promise<any> {
  return await handleAsyncOperation(async () => {
    const success = await alertManager.resolveAlert(alertId, resolvedBy);
    
    if (!success) {
      throw new Error('Alert not found or already resolved');
    }
    
    return createSuccessResponse({
      message: 'Alert resolved successfully',
      alertId
    });
  });
}

/**
 * Update monitoring thresholds
 */
async function updateThresholds(thresholds: any): Promise<any> {
  return await handleAsyncOperation(async () => {
    // Update system monitor thresholds
    systemMonitor.updateConfig({ thresholds });
    
    return createSuccessResponse({
      message: 'Thresholds updated successfully',
      thresholds
    });
  });
}

/**
 * Calculate health score from system health data
 */
function calculateHealthScore(health: any): number {
  let score = 100;
  
  // Deduct points based on resource usage
  if (health.cpuUsage !== null) {
    if (health.cpuUsage >= 90) score -= 30;
    else if (health.cpuUsage >= 70) score -= 15;
    else if (health.cpuUsage >= 50) score -= 5;
  }
  
  if (health.memoryUsage !== null) {
    if (health.memoryUsage >= 95) score -= 25;
    else if (health.memoryUsage >= 80) score -= 10;
    else if (health.memoryUsage >= 60) score -= 5;
  }
  
  if (health.diskUsage !== null) {
    if (health.diskUsage >= 95) score -= 20;
    else if (health.diskUsage >= 85) score -= 10;
    else if (health.diskUsage >= 70) score -= 5;
  }
  
  // Deduct points for connectivity issues
  if (health.internetConnected === false) {
    score -= 15;
  }
  
  // Deduct points based on alerts
  score -= Math.min(health.alerts.length * 5, 25);
  
  return Math.max(0, Math.min(100, score));
}