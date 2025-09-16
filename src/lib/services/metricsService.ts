import { and, eq, desc, asc, gte, lte, avg, max, min, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db/connection';
import { systemMetrics } from '../db/schema';
import type {
  SystemMetric,
  NewSystemMetric,
  SystemHealthStatus,
  MetricsFilter,
  DatabaseOperationResult,
  PaginatedResult
} from '../types/database';
import { ValidationError, NotFoundError } from '../types/database';

// System health thresholds
const HEALTH_THRESHOLDS = {
  cpu: { warning: 70, critical: 90 },
  memory: { warning: 80, critical: 95 },
  disk: { warning: 85, critical: 95 },
  loadAverage: { warning: 2.0, critical: 4.0 }
} as const;

// Prepared statements for performance optimization
const preparedQueries = {
  getLatestMetrics: db.select()
    .from(systemMetrics)
    .where(eq(systemMetrics.nodeId, sql.placeholder('nodeId')))
    .orderBy(desc(systemMetrics.timestamp))
    .limit(1)
    .prepare(),

  getMetricsByTimeRange: db.select()
    .from(systemMetrics)
    .where(and(
      eq(systemMetrics.nodeId, sql.placeholder('nodeId')),
      gte(systemMetrics.timestamp, sql.placeholder('startTime')),
      lte(systemMetrics.timestamp, sql.placeholder('endTime'))
    ))
    .orderBy(desc(systemMetrics.timestamp))
    .prepare(),

  getHealthStats: db.select({
    avgCpu: avg(systemMetrics.cpuUsagePercent),
    avgMemory: avg(systemMetrics.memoryUsagePercent),
    avgDisk: avg(systemMetrics.diskUsagePercent),
    maxCpu: max(systemMetrics.cpuUsagePercent),
    maxMemory: max(systemMetrics.memoryUsagePercent),
    maxDisk: max(systemMetrics.diskUsagePercent),
    minCpu: min(systemMetrics.cpuUsagePercent),
    minMemory: min(systemMetrics.memoryUsagePercent),
    minDisk: min(systemMetrics.diskUsagePercent),
    avgLoad1m: avg(systemMetrics.loadAverage1m),
    avgLoad5m: avg(systemMetrics.loadAverage5m),
    avgLoad15m: avg(systemMetrics.loadAverage15m),
  })
  .from(systemMetrics)
  .where(and(
    eq(systemMetrics.nodeId, sql.placeholder('nodeId')),
    gte(systemMetrics.timestamp, sql.placeholder('startTime'))
  ))
  .prepare(),
};

interface SystemHealthSummary {
  status: SystemHealthStatus;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskUsage: number | null;
  loadAverage: number | null;
  uptime: number | null;
  internetConnected: boolean | null;
  claudeApiLatency: number | null;
  lastUpdated: string | null;
  alerts: Array<{
    type: 'cpu' | 'memory' | 'disk' | 'load' | 'connectivity';
    level: 'warning' | 'critical';
    message: string;
    value: number;
    threshold: number;
  }>;
}

interface MetricsTrend {
  timestamp: string;
  cpuUsage: number | null;
  memoryUsage: number | null;
  diskUsage: number | null;
  loadAverage1m: number | null;
  overallHealth: SystemHealthStatus;
}

export class MetricsService {
  /**
   * Record system metrics
   */
  async recordSystemMetrics(data: Omit<NewSystemMetric, 'id' | 'timestamp'>): Promise<DatabaseOperationResult<SystemMetric>> {
    try {
      this.validateMetricsData(data);

      // Calculate overall health status
      const overallHealth = this.calculateOverallHealth(data);

      const metricsData: NewSystemMetric = {
        id: createId(),
        ...data,
        overallHealth,
        timestamp: new Date().toISOString(),
      };

      const [result] = await db.insert(systemMetrics).values(metricsData).returning();

      return {
        success: true,
        data: result,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('recordSystemMetrics', error);
    }
  }

  /**
   * Get latest system health for a node
   */
  async getLatestSystemHealth(nodeId: string = 'localhost'): Promise<DatabaseOperationResult<SystemHealthSummary>> {
    try {
      const [latest] = await preparedQueries.getLatestMetrics.execute({ nodeId });

      if (!latest) {
        return {
          success: true,
          data: {
            status: 'critical',
            cpuUsage: null,
            memoryUsage: null,
            diskUsage: null,
            loadAverage: null,
            uptime: null,
            internetConnected: null,
            claudeApiLatency: null,
            lastUpdated: null,
            alerts: [{
              type: 'connectivity',
              level: 'critical',
              message: 'No system metrics available',
              value: 0,
              threshold: 0
            }]
          }
        };
      }

      const alerts = this.generateHealthAlerts(latest);

      const summary: SystemHealthSummary = {
        status: latest.overallHealth as SystemHealthStatus,
        cpuUsage: latest.cpuUsagePercent,
        memoryUsage: latest.memoryUsagePercent,
        diskUsage: latest.diskUsagePercent,
        loadAverage: latest.loadAverage1m,
        uptime: null, // Calculate from first metric if needed
        internetConnected: latest.internetConnected === 1,
        claudeApiLatency: latest.claudeApiLatencyMs,
        lastUpdated: latest.timestamp,
        alerts
      };

      return {
        success: true,
        data: summary
      };
    } catch (error) {
      return this.handleError('getLatestSystemHealth', error);
    }
  }

  /**
   * Get system metrics with filtering and pagination
   */
  async getSystemMetrics(
    filter: MetricsFilter = {},
    options: { includeDetails?: boolean } = {}
  ): Promise<DatabaseOperationResult<PaginatedResult<SystemMetric>>> {
    try {
      const conditions = this.buildMetricsConditions(filter);
      const { limit = 100, offset = 0 } = filter;

      // Build query
      let query = db.select().from(systemMetrics);
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      query = query.orderBy(desc(systemMetrics.timestamp));

      // Get total count
      let countQuery = db.select({ count: sql<number>`COUNT(*)` }).from(systemMetrics);
      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions));
      }

      const [{ count: total }] = await countQuery;
      const results = await query.limit(limit).offset(offset);

      return {
        success: true,
        data: {
          data: results,
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          hasMore: offset + results.length < total
        }
      };
    } catch (error) {
      return this.handleError('getSystemMetrics', error);
    }
  }

  /**
   * Get metrics trends over time
   */
  async getMetricsTrends(
    nodeId: string = 'localhost',
    hours: number = 24
  ): Promise<DatabaseOperationResult<MetricsTrend[]>> {
    try {
      const endTime = new Date();
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);

      const results = await preparedQueries.getMetricsByTimeRange.execute({
        nodeId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });

      const trends: MetricsTrend[] = results.map(metric => ({
        timestamp: metric.timestamp,
        cpuUsage: metric.cpuUsagePercent,
        memoryUsage: metric.memoryUsagePercent,
        diskUsage: metric.diskUsagePercent,
        loadAverage1m: metric.loadAverage1m,
        overallHealth: metric.overallHealth as SystemHealthStatus
      }));

      return {
        success: true,
        data: trends
      };
    } catch (error) {
      return this.handleError('getMetricsTrends', error);
    }
  }

  /**
   * Get aggregated health statistics
   */
  async getHealthStatistics(
    nodeId: string = 'localhost',
    hours: number = 24
  ): Promise<DatabaseOperationResult<{
    averages: {
      cpu: number | null;
      memory: number | null;
      disk: number | null;
      load1m: number | null;
      load5m: number | null;
      load15m: number | null;
    };
    maximums: {
      cpu: number | null;
      memory: number | null;
      disk: number | null;
    };
    minimums: {
      cpu: number | null;
      memory: number | null;
      disk: number | null;
    };
    healthDistribution: {
      healthy: number;
      warning: number;
      critical: number;
    };
  }>> {
    try {
      const startTime = new Date();
      startTime.setHours(startTime.getHours() - hours);

      const [stats] = await preparedQueries.getHealthStats.execute({
        nodeId,
        startTime: startTime.toISOString()
      });

      // Get health distribution
      const [healthDist] = await db.select({
        healthy: sql<number>`COUNT(CASE WHEN overall_health = 'healthy' THEN 1 END)`,
        warning: sql<number>`COUNT(CASE WHEN overall_health = 'warning' THEN 1 END)`,
        critical: sql<number>`COUNT(CASE WHEN overall_health = 'critical' THEN 1 END)`,
      })
      .from(systemMetrics)
      .where(and(
        eq(systemMetrics.nodeId, nodeId),
        gte(systemMetrics.timestamp, startTime.toISOString())
      ));

      const statistics = {
        averages: {
          cpu: stats.avgCpu,
          memory: stats.avgMemory,
          disk: stats.avgDisk,
          load1m: stats.avgLoad1m,
          load5m: stats.avgLoad5m,
          load15m: stats.avgLoad15m,
        },
        maximums: {
          cpu: stats.maxCpu,
          memory: stats.maxMemory,
          disk: stats.maxDisk,
        },
        minimums: {
          cpu: stats.minCpu,
          memory: stats.minMemory,
          disk: stats.minDisk,
        },
        healthDistribution: {
          healthy: healthDist.healthy,
          warning: healthDist.warning,
          critical: healthDist.critical,
        }
      };

      return {
        success: true,
        data: statistics
      };
    } catch (error) {
      return this.handleError('getHealthStatistics', error);
    }
  }

  /**
   * Get system uptime information
   */
  async getSystemUptime(nodeId: string = 'localhost'): Promise<DatabaseOperationResult<{
    totalUptimeHours: number;
    healthyUptimePercentage: number;
    lastRestartTime: string | null;
    continuousHealthyMinutes: number;
  }>> {
    try {
      // Get first and latest metrics
      const [firstMetric] = await db.select()
        .from(systemMetrics)
        .where(eq(systemMetrics.nodeId, nodeId))
        .orderBy(asc(systemMetrics.timestamp))
        .limit(1);

      const [latestMetric] = await db.select()
        .from(systemMetrics)
        .where(eq(systemMetrics.nodeId, nodeId))
        .orderBy(desc(systemMetrics.timestamp))
        .limit(1);

      if (!firstMetric || !latestMetric) {
        return {
          success: true,
          data: {
            totalUptimeHours: 0,
            healthyUptimePercentage: 0,
            lastRestartTime: null,
            continuousHealthyMinutes: 0
          }
        };
      }

      const totalUptime = new Date(latestMetric.timestamp).getTime() - new Date(firstMetric.timestamp).getTime();
      const totalUptimeHours = totalUptime / (1000 * 60 * 60);

      // Calculate healthy uptime percentage
      const [healthyStats] = await db.select({
        totalMetrics: sql<number>`COUNT(*)`,
        healthyMetrics: sql<number>`COUNT(CASE WHEN overall_health = 'healthy' THEN 1 END)`,
      })
      .from(systemMetrics)
      .where(eq(systemMetrics.nodeId, nodeId));

      const healthyUptimePercentage = healthyStats.totalMetrics > 0 
        ? (healthyStats.healthyMetrics / healthyStats.totalMetrics) * 100 
        : 0;

      // Calculate continuous healthy minutes (from latest metric backwards)
      const continuousHealthyMetrics = await db.select()
        .from(systemMetrics)
        .where(eq(systemMetrics.nodeId, nodeId))
        .orderBy(desc(systemMetrics.timestamp))
        .limit(1000); // Limit to prevent excessive memory usage

      let continuousHealthyMinutes = 0;
      for (const metric of continuousHealthyMetrics) {
        if (metric.overallHealth === 'healthy') {
          continuousHealthyMinutes += 1; // Assuming metrics are recorded every minute
        } else {
          break;
        }
      }

      return {
        success: true,
        data: {
          totalUptimeHours,
          healthyUptimePercentage,
          lastRestartTime: firstMetric.timestamp, // Approximate
          continuousHealthyMinutes
        }
      };
    } catch (error) {
      return this.handleError('getSystemUptime', error);
    }
  }

  /**
   * Clean up old metrics (retention policy)
   */
  async cleanupOldMetrics(retentionDays: number = 30): Promise<DatabaseOperationResult<{ deletedCount: number }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await db.delete(systemMetrics)
        .where(lte(systemMetrics.timestamp, cutoffDate.toISOString()));

      return {
        success: true,
        data: { deletedCount: result.changes },
        affectedRows: result.changes
      };
    } catch (error) {
      return this.handleError('cleanupOldMetrics', error);
    }
  }

  /**
   * Calculate overall health status based on metrics
   */
  private calculateOverallHealth(data: Omit<NewSystemMetric, 'id' | 'timestamp' | 'overallHealth'>): SystemHealthStatus {
    const issues = [];

    if (data.cpuUsagePercent !== null) {
      if (data.cpuUsagePercent >= HEALTH_THRESHOLDS.cpu.critical) {
        issues.push('critical');
      } else if (data.cpuUsagePercent >= HEALTH_THRESHOLDS.cpu.warning) {
        issues.push('warning');
      }
    }

    if (data.memoryUsagePercent !== null) {
      if (data.memoryUsagePercent >= HEALTH_THRESHOLDS.memory.critical) {
        issues.push('critical');
      } else if (data.memoryUsagePercent >= HEALTH_THRESHOLDS.memory.warning) {
        issues.push('warning');
      }
    }

    if (data.diskUsagePercent !== null) {
      if (data.diskUsagePercent >= HEALTH_THRESHOLDS.disk.critical) {
        issues.push('critical');
      } else if (data.diskUsagePercent >= HEALTH_THRESHOLDS.disk.warning) {
        issues.push('warning');
      }
    }

    if (data.loadAverage1m !== null && data.loadAverage1m !== undefined) {
      if (data.loadAverage1m >= HEALTH_THRESHOLDS.loadAverage.critical) {
        issues.push('critical');
      } else if (data.loadAverage1m >= HEALTH_THRESHOLDS.loadAverage.warning) {
        issues.push('warning');
      }
    }

    if (data.internetConnected === false) {
      issues.push('critical');
    }

    if (issues.includes('critical')) {
      return 'critical';
    }
    if (issues.includes('warning')) {
      return 'warning';
    }
    return 'healthy';
  }

  /**
   * Generate health alerts based on current metrics
   */
  private generateHealthAlerts(metric: SystemMetric): SystemHealthSummary['alerts'] {
    const alerts: SystemHealthSummary['alerts'] = [];

    if (metric.cpuUsagePercent !== null) {
      if (metric.cpuUsagePercent >= HEALTH_THRESHOLDS.cpu.critical) {
        alerts.push({
          type: 'cpu',
          level: 'critical',
          message: `CPU usage critical: ${metric.cpuUsagePercent.toFixed(1)}%`,
          value: metric.cpuUsagePercent,
          threshold: HEALTH_THRESHOLDS.cpu.critical
        });
      } else if (metric.cpuUsagePercent >= HEALTH_THRESHOLDS.cpu.warning) {
        alerts.push({
          type: 'cpu',
          level: 'warning',
          message: `CPU usage high: ${metric.cpuUsagePercent.toFixed(1)}%`,
          value: metric.cpuUsagePercent,
          threshold: HEALTH_THRESHOLDS.cpu.warning
        });
      }
    }

    if (metric.memoryUsagePercent !== null) {
      if (metric.memoryUsagePercent >= HEALTH_THRESHOLDS.memory.critical) {
        alerts.push({
          type: 'memory',
          level: 'critical',
          message: `Memory usage critical: ${metric.memoryUsagePercent.toFixed(1)}%`,
          value: metric.memoryUsagePercent,
          threshold: HEALTH_THRESHOLDS.memory.critical
        });
      } else if (metric.memoryUsagePercent >= HEALTH_THRESHOLDS.memory.warning) {
        alerts.push({
          type: 'memory',
          level: 'warning',
          message: `Memory usage high: ${metric.memoryUsagePercent.toFixed(1)}%`,
          value: metric.memoryUsagePercent,
          threshold: HEALTH_THRESHOLDS.memory.warning
        });
      }
    }

    if (metric.diskUsagePercent !== null) {
      if (metric.diskUsagePercent >= HEALTH_THRESHOLDS.disk.critical) {
        alerts.push({
          type: 'disk',
          level: 'critical',
          message: `Disk usage critical: ${metric.diskUsagePercent.toFixed(1)}%`,
          value: metric.diskUsagePercent,
          threshold: HEALTH_THRESHOLDS.disk.critical
        });
      } else if (metric.diskUsagePercent >= HEALTH_THRESHOLDS.disk.warning) {
        alerts.push({
          type: 'disk',
          level: 'warning',
          message: `Disk usage high: ${metric.diskUsagePercent.toFixed(1)}%`,
          value: metric.diskUsagePercent,
          threshold: HEALTH_THRESHOLDS.disk.warning
        });
      }
    }

    if (metric.loadAverage1m !== null) {
      if (metric.loadAverage1m >= HEALTH_THRESHOLDS.loadAverage.critical) {
        alerts.push({
          type: 'load',
          level: 'critical',
          message: `System load critical: ${metric.loadAverage1m.toFixed(2)}`,
          value: metric.loadAverage1m,
          threshold: HEALTH_THRESHOLDS.loadAverage.critical
        });
      } else if (metric.loadAverage1m >= HEALTH_THRESHOLDS.loadAverage.warning) {
        alerts.push({
          type: 'load',
          level: 'warning',
          message: `System load high: ${metric.loadAverage1m.toFixed(2)}`,
          value: metric.loadAverage1m,
          threshold: HEALTH_THRESHOLDS.loadAverage.warning
        });
      }
    }

    if (metric.internetConnected === false) {
      alerts.push({
        type: 'connectivity',
        level: 'critical',
        message: 'Internet connection unavailable',
        value: 0,
        threshold: 1
      });
    }

    return alerts;
  }

  /**
   * Build WHERE conditions for metrics queries
   */
  private buildMetricsConditions(filter: MetricsFilter): any[] {
    const conditions = [];

    if (filter.nodeId) {
      conditions.push(eq(systemMetrics.nodeId, filter.nodeId));
    }

    if (filter.dateFrom) {
      conditions.push(gte(systemMetrics.timestamp, filter.dateFrom.toISOString()));
    }

    if (filter.dateTo) {
      conditions.push(lte(systemMetrics.timestamp, filter.dateTo.toISOString()));
    }

    if (filter.healthStatus) {
      conditions.push(eq(systemMetrics.overallHealth, filter.healthStatus));
    }

    return conditions;
  }

  /**
   * Validate metrics data
   */
  private validateMetricsData(data: Omit<NewSystemMetric, 'id' | 'timestamp'>): void {
    if (data.cpuUsagePercent !== null && data.cpuUsagePercent !== undefined) {
      if (data.cpuUsagePercent < 0 || data.cpuUsagePercent > 100) {
        throw new ValidationError('cpuUsagePercent must be between 0 and 100', 'cpuUsagePercent', data.cpuUsagePercent);
      }
    }

    if (data.memoryUsagePercent !== null && data.memoryUsagePercent !== undefined) {
      if (data.memoryUsagePercent < 0 || data.memoryUsagePercent > 100) {
        throw new ValidationError('memoryUsagePercent must be between 0 and 100', 'memoryUsagePercent', data.memoryUsagePercent);
      }
    }

    if (data.diskUsagePercent !== null && data.diskUsagePercent !== undefined) {
      if (data.diskUsagePercent < 0 || data.diskUsagePercent > 100) {
        throw new ValidationError('diskUsagePercent must be between 0 and 100', 'diskUsagePercent', data.diskUsagePercent);
      }
    }

    if (data.loadAverage1m !== null && data.loadAverage1m !== undefined) {
      if (data.loadAverage1m < 0) {
        throw new ValidationError('loadAverage1m cannot be negative', 'loadAverage1m', data.loadAverage1m);
      }
    }

    if (data.claudeApiLatencyMs !== null && data.claudeApiLatencyMs !== undefined) {
      if (data.claudeApiLatencyMs < 0) {
        throw new ValidationError('claudeApiLatencyMs cannot be negative', 'claudeApiLatencyMs', data.claudeApiLatencyMs);
      }
    }

    if (data.diskFreeBytes !== null && data.diskFreeBytes !== undefined) {
      if (data.diskFreeBytes < 0) {
        throw new ValidationError('diskFreeBytes cannot be negative', 'diskFreeBytes', data.diskFreeBytes);
      }
    }

    if (data.diskTotalBytes !== null && data.diskTotalBytes !== undefined) {
      if (data.diskTotalBytes <= 0) {
        throw new ValidationError('diskTotalBytes must be positive', 'diskTotalBytes', data.diskTotalBytes);
      }
    }
  }

  /**
   * Handle service errors
   */
  private handleError(operation: string, error: unknown): DatabaseOperationResult<never> {
    console.error(`MetricsService.${operation} error:`, error);

    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return {
        success: false,
        error: error.message
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error'
    };
  }
}

// Export singleton instance
export const metricsService = new MetricsService();