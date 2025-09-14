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
import { 
  authenticateRequest, 
  hasAdminRole, 
  validateCSRFToken, 
  createAuthErrorResponse 
} from '@/lib/middleware/auth';
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
    // Authentication check
    const { authenticated, user, error } = await authenticateRequest(req);
    if (!authenticated) {
      return createAuthErrorResponse(error || 'Authentication required', 401);
    }
    
    const searchParams = req.nextUrl.searchParams;
    const query = validateQueryParams(searchParams, MetricsQuerySchema);
    
    const endpoint = searchParams.get('endpoint') || 'overview';
    
    switch (endpoint) {
      case 'overview':
        return createSuccessResponse(await getMetricsOverview(query));
      
      case 'history':
        return createSuccessResponse(await getMetricsHistory(query));
      
      case 'trends':
        return createSuccessResponse(await getMetricsTrends(query));
      
      case 'health':
        return createSuccessResponse(await getSystemHealthSummary(query));
      
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
    // Authentication check
    const { authenticated, user, error } = await authenticateRequest(req);
    if (!authenticated) {
      return createAuthErrorResponse(error || 'Authentication required', 401);
    }
    
    // Authorization check - admin role required for control actions
    if (!hasAdminRole(user)) {
      return createAuthErrorResponse('Admin access required', 403);
    }
    
    // CSRF protection for state-changing operations
    if (!validateCSRFToken(req)) {
      return createAuthErrorResponse('Invalid CSRF token or origin', 403);
    }
    
    const body = await req.json();
    const { action, ...params } = body;
    
    let result: any;
    switch (action) {
      case 'start_monitoring':
        result = await startMonitoring();
        break;
      
      case 'stop_monitoring':
        result = await stopMonitoring();
        break;
      
      case 'collect_metrics':
        result = await collectMetricsNow();
        break;
      
      case 'run_health_check':
        result = await runHealthCheck();
        break;
      
      case 'acknowledge_alert':
        result = await acknowledgeAlert(params.alertId, params.acknowledgedBy);
        break;
      
      case 'resolve_alert':
        result = await resolveAlert(params.alertId, params.resolvedBy);
        break;
      
      case 'update_thresholds':
        result = await updateThresholds(params.thresholds);
        break;
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    
    return createSuccessResponse(result);
  }
);

/**
 * Get metrics overview
 */
async function getMetricsOverview(query: MetricsQuery): Promise<SystemMetricsResponse> {
    // Get current system stats
    const currentStats = systemMonitor.getLastStats();
    if (!currentStats) {
      throw new Error('No current system metrics available');
    }

    // Get health summary
    const healthResult = await metricsService.getLatestSystemHealth();
    if (!healthResult.success || !healthResult.data) {
      throw new Error(`Failed to get system health: ${healthResult.error}`);
    }

    // Get trends for the last 24 hours
    const trendsResult = await metricsService.getMetricsTrends('localhost', 24);
    if (!trendsResult.success || !trendsResult.data) {
      throw new Error(`Failed to get trends: ${trendsResult.error}`);
    }

    // Get aggregated statistics
    const [stats24h, stats7d] = await Promise.all([
      metricsService.getHealthStatistics('localhost', 24),
      metricsService.getHealthStatistics('localhost', 24 * 7)
    ]);

    if (!stats24h.success || !stats7d.success || !stats24h.data || !stats7d.data) {
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
        isRunning: monitoringScheduler.getStats().enabledTasks > 0,
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
        status: healthResult.data!.status,
        cpu: currentStats.cpuUsage,
        memory: currentStats.memoryUsage,
        disk: currentStats.diskUsage,
        load: currentStats.loadAverage,
        uptime: currentStats.uptime,
        networkConnectivity: currentStats.networkConnectivity
      },
      trends: trendsResult.data!.map(trend => ({
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
            cpu: stats24h.data!.averages.cpu || 0,
            memory: stats24h.data!.averages.memory || 0,
            disk: stats24h.data!.averages.disk || 0
          },
          max: {
            cpu: stats24h.data!.maximums.cpu || 0,
            memory: stats24h.data!.maximums.memory || 0,
            disk: stats24h.data!.maximums.disk || 0
          },
          min: {
            cpu: stats24h.data!.minimums.cpu || 0,
            memory: stats24h.data!.minimums.memory || 0,
            disk: stats24h.data!.minimums.disk || 0
          },
          healthDistribution: stats24h.data!.healthDistribution
        },
        last7Days: {
          avg: {
            cpu: stats7d.data!.averages.cpu || 0,
            memory: stats7d.data!.averages.memory || 0,
            disk: stats7d.data!.averages.disk || 0
          },
          max: {
            cpu: stats7d.data!.maximums.cpu || 0,
            memory: stats7d.data!.maximums.memory || 0,
            disk: stats7d.data!.maximums.disk || 0
          },
          min: {
            cpu: stats7d.data!.minimums.cpu || 0,
            memory: stats7d.data!.minimums.memory || 0,
            disk: stats7d.data!.minimums.disk || 0
          },
          healthDistribution: stats7d.data!.healthDistribution
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

    return response;
}

/**
 * Get metrics history with pagination
 */
async function getMetricsHistory(query: MetricsQuery): Promise<MetricsHistoryResponse> {
    const filter: MetricsFilter = {
      nodeId: query.nodeId || 'localhost',
      limit: query.limit || 100
    };
    
    // Handle pagination separately since MetricsFilter doesn't have offset
    const offset = query.offset || 0;

    if (query.dateFrom) {
      filter.dateFrom = new Date(query.dateFrom);
    }
    
    if (query.dateTo) {
      filter.dateTo = new Date(query.dateTo);
    }
    
    if (query.healthStatus) {
      filter.healthStatus = query.healthStatus as SystemHealthStatus;
    }

    const metricsResult = await metricsService.getSystemMetrics(filter);
    if (!metricsResult.success || !metricsResult.data) {
      throw new Error(`Failed to get metrics history: ${metricsResult.error}`);
    }

    const response: MetricsHistoryResponse = {
      data: metricsResult.data.data.map(metric => ({
        timestamp: metric.timestamp,
        nodeId: metric.nodeId,
        cpu: metric.cpuUsagePercent,
        memory: metric.memoryUsagePercent,
        disk: metric.diskUsagePercent,
        loadAverage1m: metric.loadAverage1m,
        loadAverage5m: metric.loadAverage5m,
        loadAverage15m: metric.loadAverage15m,
        internetConnected: Boolean(metric.internetConnected),
        claudeApiLatency: metric.claudeApiLatencyMs,
        overallHealth: metric.overallHealth as SystemHealthStatus
      })),
      total: metricsResult.data.total,
      page: metricsResult.data.page,
      pageSize: metricsResult.data.pageSize,
      hasMore: metricsResult.data.hasMore
    };

    return response;
}

type Timeframe = 'hour' | 'day' | 'week' | 'month';

/**
 * Get metrics trends analysis
 */
async function getMetricsTrends(query: MetricsQuery): Promise<MetricsTrendsResponse> {
    const timeframe: Timeframe = query.timeframe || 'day';
    const metrics = query.metrics ? query.metrics.split(',') : ['cpu', 'memory', 'disk'];
    
    const trends = await metricsCollector.getHistoricalTrends(metrics, timeframe);
    
    const response: MetricsTrendsResponse = {
      timeframe,
      trends
    };

    return response;
}

/**
 * Get system health summary with predictions
 */
async function getSystemHealthSummary(query: MetricsQuery): Promise<SystemHealthSummaryResponse> {
    const healthResult = await metricsService.getLatestSystemHealth();
    if (!healthResult.success || !healthResult.data) {
      throw new Error(`Failed to get system health: ${healthResult.error}`);
    }

    const health = healthResult.data!
    
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

    return response;
}

/**
 * Start monitoring services
 */
async function startMonitoring() {
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

    return {
      message: 'Monitoring services started',
      results
    };
}

/**
 * Stop monitoring services
 */
async function stopMonitoring() {
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

    return {
      message: 'Monitoring services stopped',
      results
    };
}

/**
 * Collect metrics immediately
 */
async function collectMetricsNow() {
    const stats = await systemMonitor.collectNow();
    
    return {
      message: 'Metrics collected successfully',
      stats
    };
}

/**
 * Run health check immediately
 */
async function runHealthCheck() {
    const taskId = 'manual_health_check';
    const result = await monitoringScheduler.executeTaskNow(taskId);
    
    return {
      message: 'Health check executed',
      result
    };
}

/**
 * Acknowledge an alert
 */
async function acknowledgeAlert(alertId: string, acknowledgedBy?: string) {
    const success = await alertManager.acknowledgeAlert(alertId, acknowledgedBy);
    
    if (!success) {
      throw new Error('Alert not found or already acknowledged');
    }
    
    return {
      message: 'Alert acknowledged successfully',
      alertId
    };
}

/**
 * Resolve an alert
 */
async function resolveAlert(alertId: string, resolvedBy?: string) {
    const success = await alertManager.resolveAlert(alertId, resolvedBy);
    
    if (!success) {
      throw new Error('Alert not found or already resolved');
    }
    
    return {
      message: 'Alert resolved successfully',
      alertId
    };
}

/**
 * Update monitoring thresholds
 */
async function updateThresholds(thresholds: any) {
    // Update system monitor thresholds
    systemMonitor.updateConfig({ thresholds });
    
    return {
      message: 'Thresholds updated successfully',
      thresholds
    };
}

interface Health {
  cpuUsage?: number | null;
  memoryUsage?: number | null;
  diskUsage?: number | null;
  internetConnected?: boolean | null;
  alerts?: any[];
}

/**
 * Calculate health score from system health data
 */
function calculateHealthScore(health: Health): number {
  let score = 100;
  
  // Deduct points based on resource usage
  if (health.cpuUsage != null && typeof health.cpuUsage === 'number') {
    if (health.cpuUsage >= 90) score -= 30;
    else if (health.cpuUsage >= 70) score -= 15;
    else if (health.cpuUsage >= 50) score -= 5;
  }
  
  if (health.memoryUsage != null && typeof health.memoryUsage === 'number') {
    if (health.memoryUsage >= 95) score -= 25;
    else if (health.memoryUsage >= 80) score -= 10;
    else if (health.memoryUsage >= 60) score -= 5;
  }
  
  if (health.diskUsage != null && typeof health.diskUsage === 'number') {
    if (health.diskUsage >= 95) score -= 20;
    else if (health.diskUsage >= 85) score -= 10;
    else if (health.diskUsage >= 70) score -= 5;
  }
  
  // Deduct points for connectivity issues (only when explicitly false)
  if (health.internetConnected === false) {
    score -= 15;
  }
  
  // Deduct points based on alerts (treat missing alerts as empty array)
  const alertsCount = health.alerts?.length || 0;
  score -= Math.min(alertsCount * 5, 25);
  
  return Math.max(0, Math.min(100, score));
}