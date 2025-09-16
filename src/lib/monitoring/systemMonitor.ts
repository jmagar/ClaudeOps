import { EventEmitter } from 'events';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { metricsService } from '../services/metricsService';
import { getWebSocketManager } from '../websocket/server';
import type { NewSystemMetric, SystemHealthStatus } from '../types/database';

const execAsync = promisify(exec);

export interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  loadAverage: [number, number, number];
  uptime: number;
  diskSpace: {
    free: number;
    total: number;
  };
  networkConnectivity: {
    internet: boolean;
    latency?: number;
  };
}

export interface SystemThresholds {
  cpu: { warning: number; critical: number };
  memory: { warning: number; critical: number };
  disk: { warning: number; critical: number };
  load: { warning: number; critical: number };
}

export interface SystemMonitorConfig {
  nodeId: string;
  collectionInterval: number;
  thresholds: SystemThresholds;
  enabledMetrics: {
    cpu: boolean;
    memory: boolean;
    disk: boolean;
    network: boolean;
  };
}

export class SystemMonitor extends EventEmitter {
  private config: SystemMonitorConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastStats: SystemStats | null = null;
  private previousCpuInfo: os.CpuInfo[] | null = null;

  constructor(config: Partial<SystemMonitorConfig> = {}) {
    super();
    
    this.config = {
      nodeId: 'localhost',
      collectionInterval: 30000, // 30 seconds
      thresholds: {
        cpu: { warning: 70, critical: 90 },
        memory: { warning: 80, critical: 95 },
        disk: { warning: 85, critical: 95 },
        load: { warning: 2.0, critical: 4.0 }
      },
      enabledMetrics: {
        cpu: true,
        memory: true,
        disk: true,
        network: true
      },
      ...config
    };

    // Bind event handlers
    this.handleThresholdBreach = this.handleThresholdBreach.bind(this);
    this.handleHealthStatusChange = this.handleHealthStatusChange.bind(this);
  }

  /**
   * Start monitoring system metrics
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('System monitor is already running');
    }

    this.isRunning = true;
    this.emit('started', { nodeId: this.config.nodeId });

    // Collect initial metrics
    await this.collectMetrics();

    // Schedule periodic collection
    this.intervalId = setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.collectionInterval);

    console.log(`System monitor started for node ${this.config.nodeId}, collecting every ${this.config.collectionInterval}ms`);
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.emit('stopped', { nodeId: this.config.nodeId });
    console.log(`System monitor stopped for node ${this.config.nodeId}`);
  }

  /**
   * Get current configuration
   */
  getConfig(): SystemMonitorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SystemMonitorConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    // Restart monitoring if interval changed and we're running
    if (this.isRunning && oldConfig.collectionInterval !== this.config.collectionInterval) {
      this.restart();
    }

    this.emit('configUpdated', { oldConfig, newConfig: this.config });
  }

  /**
   * Get the latest collected stats
   */
  getLastStats(): SystemStats | null {
    return this.lastStats ? { ...this.lastStats } : null;
  }

  /**
   * Force an immediate metrics collection
   */
  async collectNow(): Promise<SystemStats> {
    return await this.collectMetrics();
  }

  /**
   * Check if monitoring is running
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Restart monitoring
   */
  private async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<SystemStats> {
    const stats: SystemStats = {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      loadAverage: [0, 0, 0],
      uptime: 0,
      diskSpace: { free: 0, total: 0 },
      networkConnectivity: { internet: false }
    };

    try {
      // Collect enabled metrics in parallel
      const promises: Promise<void>[] = [];

      if (this.config.enabledMetrics.cpu) {
        promises.push(this.collectCpuStats(stats));
      }

      if (this.config.enabledMetrics.memory) {
        promises.push(this.collectMemoryStats(stats));
      }

      if (this.config.enabledMetrics.disk) {
        promises.push(this.collectDiskStats(stats));
      }

      if (this.config.enabledMetrics.network) {
        promises.push(this.collectNetworkStats(stats));
      }

      await Promise.allSettled(promises);

      // Collect system load and uptime
      stats.loadAverage = os.loadavg() as [number, number, number];
      stats.uptime = os.uptime();

      this.lastStats = stats;

      // Store metrics in database
      await this.storeMetrics(stats);

      // Check for threshold breaches
      this.checkThresholds(stats);

      // Broadcast to WebSocket clients
      this.broadcastStats(stats);

      this.emit('metricsCollected', stats);

      return stats;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Collect CPU statistics
   */
  private async collectCpuStats(stats: SystemStats): Promise<void> {
    try {
      const cpus = os.cpus();
      const currentCpuInfo = cpus;

      if (this.previousCpuInfo) {
        let totalIdle = 0;
        let totalTick = 0;

        for (let i = 0; i < currentCpuInfo.length; i++) {
          const current = currentCpuInfo[i];
          const previous = this.previousCpuInfo[i];

          const currentTotal = Object.values(current.times).reduce((acc: number, time: number) => acc + time, 0);
          const previousTotal = Object.values(previous.times).reduce((acc: number, time: number) => acc + time, 0);

          const totalDiff = currentTotal - previousTotal;
          const idleDiff = current.times.idle - previous.times.idle;

          totalTick += totalDiff;
          totalIdle += idleDiff;
        }

        const cpuUsage = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 0;
        stats.cpuUsage = Math.max(0, Math.min(100, cpuUsage));
      } else {
        // First run, estimate CPU usage
        stats.cpuUsage = 0;
      }

      this.previousCpuInfo = currentCpuInfo;

    } catch (error) {
      console.error('Error collecting CPU stats:', error);
      stats.cpuUsage = 0;
    }
  }

  /**
   * Collect memory statistics
   */
  private async collectMemoryStats(stats: SystemStats): Promise<void> {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      stats.memoryUsage = (usedMem / totalMem) * 100;
    } catch (error) {
      console.error('Error collecting memory stats:', error);
      stats.memoryUsage = 0;
    }
  }

  /**
   * Collect disk statistics
   */
  private async collectDiskStats(stats: SystemStats): Promise<void> {
    try {
      // Use df command to get disk usage for the root filesystem
      const { stdout } = await execAsync('df / | tail -1');
      const parts = stdout.trim().split(/\s+/);
      
      if (parts.length >= 5) {
        const total = parseInt(parts[1]) * 1024; // Convert from KB to bytes
        const used = parseInt(parts[2]) * 1024;
        const available = parseInt(parts[3]) * 1024;
        
        stats.diskSpace.total = total;
        stats.diskSpace.free = available;
        stats.diskUsage = (used / total) * 100;
      }
    } catch (error) {
      console.error('Error collecting disk stats:', error);
      stats.diskUsage = 0;
      stats.diskSpace = { free: 0, total: 0 };
    }
  }

  /**
   * Collect network connectivity statistics
   */
  private async collectNetworkStats(stats: SystemStats): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Test internet connectivity with a quick ping to a reliable service
      try {
        await execAsync('ping -c 1 -W 5000 8.8.8.8', { timeout: 10000 });
        stats.networkConnectivity.internet = true;
        stats.networkConnectivity.latency = Date.now() - startTime;
      } catch (error) {
        stats.networkConnectivity.internet = false;
      }
      
    } catch (error) {
      console.error('Error collecting network stats:', error);
      stats.networkConnectivity.internet = false;
    }
  }

  /**
   * Store metrics in database
   */
  private async storeMetrics(stats: SystemStats): Promise<void> {
    try {
      const metricsData: Omit<NewSystemMetric, 'id' | 'timestamp' | 'overallHealth'> = {
        nodeId: this.config.nodeId,
        cpuUsagePercent: stats.cpuUsage,
        memoryUsagePercent: stats.memoryUsage,
        diskUsagePercent: stats.diskUsage,
        loadAverage1m: stats.loadAverage[0],
        loadAverage5m: stats.loadAverage[1],
        loadAverage15m: stats.loadAverage[2],
        diskFreeBytes: stats.diskSpace.free,
        diskTotalBytes: stats.diskSpace.total,
        internetConnected: stats.networkConnectivity.internet,
        claudeApiLatencyMs: stats.networkConnectivity.latency || null
      };

      await metricsService.recordSystemMetrics(metricsData);
    } catch (error) {
      console.error('Error storing metrics:', error);
      this.emit('error', error);
    }
  }

  /**
   * Check if any thresholds are breached
   */
  private checkThresholds(stats: SystemStats): void {
    const breaches: Array<{
      metric: string;
      level: 'warning' | 'critical';
      value: number;
      threshold: number;
    }> = [];

    // Check CPU threshold
    if (stats.cpuUsage >= this.config.thresholds.cpu.critical) {
      breaches.push({
        metric: 'cpu',
        level: 'critical',
        value: stats.cpuUsage,
        threshold: this.config.thresholds.cpu.critical
      });
    } else if (stats.cpuUsage >= this.config.thresholds.cpu.warning) {
      breaches.push({
        metric: 'cpu',
        level: 'warning',
        value: stats.cpuUsage,
        threshold: this.config.thresholds.cpu.warning
      });
    }

    // Check memory threshold
    if (stats.memoryUsage >= this.config.thresholds.memory.critical) {
      breaches.push({
        metric: 'memory',
        level: 'critical',
        value: stats.memoryUsage,
        threshold: this.config.thresholds.memory.critical
      });
    } else if (stats.memoryUsage >= this.config.thresholds.memory.warning) {
      breaches.push({
        metric: 'memory',
        level: 'warning',
        value: stats.memoryUsage,
        threshold: this.config.thresholds.memory.warning
      });
    }

    // Check disk threshold
    if (stats.diskUsage >= this.config.thresholds.disk.critical) {
      breaches.push({
        metric: 'disk',
        level: 'critical',
        value: stats.diskUsage,
        threshold: this.config.thresholds.disk.critical
      });
    } else if (stats.diskUsage >= this.config.thresholds.disk.warning) {
      breaches.push({
        metric: 'disk',
        level: 'warning',
        value: stats.diskUsage,
        threshold: this.config.thresholds.disk.warning
      });
    }

    // Check load average threshold
    if (stats.loadAverage[0] >= this.config.thresholds.load.critical) {
      breaches.push({
        metric: 'load',
        level: 'critical',
        value: stats.loadAverage[0],
        threshold: this.config.thresholds.load.critical
      });
    } else if (stats.loadAverage[0] >= this.config.thresholds.load.warning) {
      breaches.push({
        metric: 'load',
        level: 'warning',
        value: stats.loadAverage[0],
        threshold: this.config.thresholds.load.warning
      });
    }

    if (breaches.length > 0) {
      this.emit('thresholdBreach', breaches);
    }
  }

  /**
   * Handle threshold breaches
   */
  private handleThresholdBreach(breaches: Array<{ metric: string; level: 'warning' | 'critical'; value: number; threshold: number }>): void {
    for (const breach of breaches) {
      console.warn(`Threshold breach: ${breach.metric} ${breach.level} - ${breach.value.toFixed(2)}% (threshold: ${breach.threshold}%)`);
    }
  }

  /**
   * Handle health status changes
   */
  private handleHealthStatusChange(status: SystemHealthStatus): void {
    console.log(`System health status changed to: ${status}`);
    
    // Broadcast health status change via WebSocket
    const wsManager = getWebSocketManager();
    if (wsManager) {
      wsManager.broadcastSystemStatus(status === 'healthy' ? 'healthy' : status === 'warning' ? 'warning' : 'error');
    }
  }

  /**
   * Broadcast stats via WebSocket
   */
  private broadcastStats(stats: SystemStats): void {
    const wsManager = getWebSocketManager();
    if (wsManager) {
      const status = this.calculateHealthStatus(stats);
      wsManager.broadcastSystemStatus(
        status === 'healthy' ? 'healthy' : status === 'warning' ? 'warning' : 'error',
        {
          cpu: stats.cpuUsage,
          memory: stats.memoryUsage,
          disk: stats.diskUsage
        }
      );
    }
  }

  /**
   * Calculate overall health status based on current stats
   */
  private calculateHealthStatus(stats: SystemStats): SystemHealthStatus {
    // Check for critical thresholds first
    if (
      stats.cpuUsage >= this.config.thresholds.cpu.critical ||
      stats.memoryUsage >= this.config.thresholds.memory.critical ||
      stats.diskUsage >= this.config.thresholds.disk.critical ||
      stats.loadAverage[0] >= this.config.thresholds.load.critical ||
      !stats.networkConnectivity.internet
    ) {
      return 'critical';
    }

    // Check for warning thresholds
    if (
      stats.cpuUsage >= this.config.thresholds.cpu.warning ||
      stats.memoryUsage >= this.config.thresholds.memory.warning ||
      stats.diskUsage >= this.config.thresholds.disk.warning ||
      stats.loadAverage[0] >= this.config.thresholds.load.warning
    ) {
      return 'warning';
    }

    return 'healthy';
  }
}

// Export a singleton instance
export const systemMonitor = new SystemMonitor();