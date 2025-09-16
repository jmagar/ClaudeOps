import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { 
  withErrorHandler, 
  handleAsyncOperation, 
  validateQueryParams,
  createSuccessResponse,
  ValidationError
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
import type { SystemMonitorConfig, SystemStats, SystemThresholds } from '@/lib/monitoring/systemMonitor';
import type { MetricsCollectionConfig } from '@/lib/monitoring/metricsCollector';
import type { SchedulerStats } from '@/lib/monitoring/scheduler';
import type { Alert } from '@/lib/monitoring/alertManager';

// Threshold validation schema
const ThresholdsSchema = z.object({
  cpu: z.number().min(0).max(100).optional(),
  memory: z.number().min(0).max(100).optional(),
  disk: z.number().min(0).max(100).optional(),
  loadAverage: z.number().min(0).optional(),
  responseTime: z.number().min(0).optional()
}).partial();

type ValidatedThresholds = z.infer<typeof ThresholdsSchema>;

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
      config: SystemMonitorConfig;
    };
    metricsCollector: {
      isCollecting: boolean;
      stats: {
        isCollecting: boolean;
        historySize: number;
        customMetricsCount: number;
        aggregationTimersActive: number;
        config: MetricsCollectionConfig;
      };
    };
    scheduler: {
      isRunning: boolean;
      stats: SchedulerStats;
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
    // AuthN/Z: require internal token or session-based admin (replace with your real check)
    const token = req.headers.get('x-internal-token');
    if (process.env.INTERNAL_API_TOKEN && token !== process.env.INTERNAL_API_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized'
        },
        timestamp: new Date().toISOString()
      }, { status: 401 });
    }
    
    const searchParams = req.nextUrl.searchParams;
    const query = validateQueryParams(searchParams, MetricsQuerySchema);
    
    const endpoint = z.enum(['overview','history','trends','health']).parse(searchParams.get('endpoint') ?? 'overview');
    
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
        throw new ValidationError(`Unknown endpoint: ${endpoint}`);
    }
  }
);

// Action types for POST requests
type MonitoringActionParsed = 
  | { action: 'start_monitoring' }
  | { action: 'stop_monitoring' }
  | { action: 'collect_metrics' }
  | { action: 'run_health_check' }
  | { action: 'acknowledge_alert'; alertId: string; acknowledgedBy?: string }
  | { action: 'resolve_alert'; alertId: string; resolvedBy?: string }
  | { action: 'update_thresholds'; thresholds: Record<string, unknown> };

type ActionResult = 
  | { message: string; results: { systemMonitor: boolean; metricsCollector: boolean; scheduler: boolean } }
  | { message: string; stats: SystemStats }
  | { message: string; result: unknown }
  | { message: string; alertId: string }
  | { message: string; thresholds: Record<string, unknown> };

/**
 * POST /api/system/metrics
 * Control monitoring services or trigger actions
 */
export const POST = withErrorHandler<ActionResult>(
  async (req: NextRequest) => {
    // AuthN/Z + CSRF/internal guard (swap with your session/role check if available)
    const token = req.headers.get('x-internal-token');
    if (process.env.INTERNAL_API_TOKEN && token !== process.env.INTERNAL_API_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized'
        },
        timestamp: new Date().toISOString()
      }, { status: 401 });
    }
    
    // Validate body
    const ActionSchema = z.discriminatedUnion('action', [
      z.object({ action: z.literal('start_monitoring') }),
      z.object({ action: z.literal('stop_monitoring') }),
      z.object({ action: z.literal('collect_metrics') }),
      z.object({ action: z.literal('run_health_check') }),
      z.object({ action: z.literal('acknowledge_alert'), alertId: z.string().min(1), acknowledgedBy: z.string().optional() }),
      z.object({ action: z.literal('resolve_alert'), alertId: z.string().min(1), resolvedBy: z.string().optional() }),
      z.object({ action: z.literal('update_thresholds'), thresholds: z.record(z.string(), z.unknown()) })
    ]);
    const requestBody = await req.json();
    const parsed = ActionSchema.parse(requestBody) as MonitoringActionParsed;
    const { action } = parsed;
    
    let result: ActionResult;
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
      
      case 'acknowledge_alert': {
        const { alertId, acknowledgedBy } = parsed as Extract<MonitoringActionParsed, { action: 'acknowledge_alert' }>;
        result = await acknowledgeAlert(alertId, acknowledgedBy);
        break;
      }
      
      case 'resolve_alert': {
        const { alertId, resolvedBy } = parsed as Extract<MonitoringActionParsed, { action: 'resolve_alert' }>;
        result = await resolveAlert(alertId, resolvedBy);
        break;
      }
      
      case 'update_thresholds': {
        const { thresholds } = parsed as Extract<MonitoringActionParsed, { action: 'update_thresholds' }>;
        result = await updateThresholds(thresholds);
        break;
      }
      
      default:
        throw new ValidationError(`Unknown action: ${action}`);
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
    const schedulerStats = monitoringScheduler.getStats();
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
        isRunning: monitoringScheduler.isSchedulerRunning(),
        stats: schedulerStats
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
    const offset = query.offset || 0;
    
    const filter: MetricsFilter = {
      nodeId: query.nodeId || 'localhost',
      limit: query.limit || 100,
      offset
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
        internetConnected: metric.internetConnected,
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
      scheduler: false,
      systemMonitorError: null as string | null,
      metricsCollectorError: null as string | null,
      schedulerError: null as string | null
    };

    // Start system monitor
    if (!systemMonitor.isMonitoring()) {
      try {
        await systemMonitor.start();
        results.systemMonitor = true;
      } catch (error) {
        console.warn('System monitor start error:', error);
        results.systemMonitorError = error instanceof Error ? error.message : String(error);
      }
    }

    // Start metrics collector
    if (!metricsCollector.getCollectionStats().isCollecting) {
      try {
        await metricsCollector.start();
        results.metricsCollector = true;
      } catch (error) {
        console.warn('Metrics collector start error:', error);
        results.metricsCollectorError = error instanceof Error ? error.message : String(error);
      }
    }

    // Start scheduler (if not already running)
    try {
      await monitoringScheduler.start();
      results.scheduler = true;
    } catch (error) {
      // Scheduler might already be running
      console.warn('Scheduler start warning:', error);
      results.schedulerError = error instanceof Error ? error.message : String(error);
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
      scheduler: false,
      systemMonitorError: null as string | null,
      metricsCollectorError: null as string | null,
      schedulerError: null as string | null
    };

    // Stop system monitor
    if (systemMonitor.isMonitoring()) {
      try {
        await systemMonitor.stop();
        results.systemMonitor = true;
      } catch (error) {
        console.warn('System monitor stop error:', error);
        results.systemMonitorError = error instanceof Error ? error.message : String(error);
      }
    }

    // Stop metrics collector
    if (metricsCollector.getCollectionStats().isCollecting) {
      try {
        await metricsCollector.stop();
        results.metricsCollector = true;
      } catch (error) {
        console.warn('Metrics collector stop error:', error);
        results.metricsCollectorError = error instanceof Error ? error.message : String(error);
      }
    }

    // Stop scheduler
    try {
      await monitoringScheduler.stop();
      results.scheduler = true;
    } catch (error) {
      console.warn('Scheduler stop warning:', error);
      results.schedulerError = error instanceof Error ? error.message : String(error);
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
async function updateThresholds(thresholds: Record<string, unknown>) {
    // Validate and clamp threshold values
    const parseResult = ThresholdsSchema.safeParse(thresholds);
    if (!parseResult.success) {
      throw new ValidationError(`Invalid threshold values: ${parseResult.error.message}`);
    }
    
    const validatedThresholds = parseResult.data;
    
    // Clamp percentage values to 0-100 range
    const clampedThresholds: ValidatedThresholds = {
      ...validatedThresholds,
      cpu: validatedThresholds.cpu !== undefined ? Math.max(0, Math.min(100, validatedThresholds.cpu)) : undefined,
      memory: validatedThresholds.memory !== undefined ? Math.max(0, Math.min(100, validatedThresholds.memory)) : undefined,
      disk: validatedThresholds.disk !== undefined ? Math.max(0, Math.min(100, validatedThresholds.disk)) : undefined
    };
    
    // Update system monitor thresholds - provide complete thresholds with defaults
    const currentConfig = systemMonitor.getConfig();
    const completeThresholds: SystemThresholds = {
      cpu: clampedThresholds.cpu !== undefined ? 
        { warning: clampedThresholds.cpu, critical: Math.min(clampedThresholds.cpu + 20, 100) } : 
        currentConfig.thresholds.cpu,
      memory: clampedThresholds.memory !== undefined ? 
        { warning: clampedThresholds.memory, critical: Math.min(clampedThresholds.memory + 15, 100) } : 
        currentConfig.thresholds.memory,
      disk: clampedThresholds.disk !== undefined ? 
        { warning: clampedThresholds.disk, critical: Math.min(clampedThresholds.disk + 10, 100) } : 
        currentConfig.thresholds.disk,
      load: clampedThresholds.loadAverage !== undefined ? 
        { warning: clampedThresholds.loadAverage, critical: clampedThresholds.loadAverage + 2.0 } : 
        currentConfig.thresholds.load
    };
    
    systemMonitor.updateConfig({ thresholds: completeThresholds });
    
    return {
      message: 'Thresholds updated successfully',
      thresholds: clampedThresholds
    };
}

type HealthLike = {
  cpuUsage: number | null | undefined;
  memoryUsage: number | null | undefined;
  diskUsage: number | null | undefined;
  internetConnected: boolean | null | undefined;
  alerts?: Array<unknown> | null;
};

/**
 * Calculate health score from system health data
 */
function calculateHealthScore(health: HealthLike): number {
  let score = 100;
  
  // Deduct points based on resource usage
  if (typeof health.cpuUsage === 'number') {
    if (health.cpuUsage >= 90) score -= 30;
    else if (health.cpuUsage >= 70) score -= 15;
    else if (health.cpuUsage >= 50) score -= 5;
  }
  
  if (typeof health.memoryUsage === 'number') {
    if (health.memoryUsage >= 95) score -= 25;
    else if (health.memoryUsage >= 80) score -= 10;
    else if (health.memoryUsage >= 60) score -= 5;
  }
  
  if (typeof health.diskUsage === 'number') {
    if (health.diskUsage >= 95) score -= 20;
    else if (health.diskUsage >= 85) score -= 10;
    else if (health.diskUsage >= 70) score -= 5;
  }
  
  // Deduct points for connectivity issues
  if (health.internetConnected === false) {
    score -= 15;
  }
  
  // Deduct points based on alerts
  const alertCount = Array.isArray(health.alerts) ? health.alerts.length : 0;
  score -= Math.min(alertCount * 5, 25);
  
  return Math.max(0, Math.min(100, score));
}