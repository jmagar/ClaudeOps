import { promisify } from 'util';
import { exec } from 'child_process';
import { 
  DockerInformationCollector,
  DockerCollectorResult,
  DockerMetrics,
  DockerContainer
} from '../../types/agent';

const execAsync = promisify(exec);

/**
 * Docker information collector for container ecosystem monitoring
 */
export class DockerCollector implements DockerInformationCollector {
  private readonly TIMEOUT_MS = 30000; // 30 second timeout for commands

  /**
   * Check if Docker is available and accessible
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker version', { timeout: this.TIMEOUT_MS });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Collect comprehensive Docker information
   */
  async collectDockerInfo(): Promise<DockerCollectorResult> {
    try {
      const available = await this.isDockerAvailable();
      
      if (!available) {
        return {
          available: false,
          error: 'Docker is not available or accessible',
          timestamp: new Date().toISOString()
        };
      }

      const metrics = await this.collectContainerMetrics();
      
      return {
        available: true,
        metrics,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown Docker error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Collect detailed container metrics
   */
  async collectContainerMetrics(): Promise<DockerMetrics> {
    try {
      const [containerInfo, systemInfo, diskUsage] = await Promise.allSettled([
        this.getContainerInformation(),
        this.getDockerSystemInfo(),
        this.getDockerDiskUsage()
      ]);

      const containers = containerInfo.status === 'fulfilled' ? containerInfo.value : [];
      const systemData = systemInfo.status === 'fulfilled' ? systemInfo.value : {
        images_count: 0,
        volumes_count: 0,
        networks_count: 0
      };
      const diskUsageGB = diskUsage.status === 'fulfilled' ? diskUsage.value : 0;

      const runningContainers = containers.filter(c => c.state === 'running').length;
      const stoppedContainers = containers.filter(c => c.state !== 'running').length;

      return {
        docker_available: true,
        total_containers: containers.length,
        running_containers: runningContainers,
        stopped_containers: stoppedContainers,
        containers,
        images_count: systemData.images_count,
        volumes_count: systemData.volumes_count,
        networks_count: systemData.networks_count,
        disk_usage_gb: diskUsageGB
      };
    } catch (error) {
      throw new Error(`Docker metrics collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Private helper methods

  private async getContainerInformation(): Promise<DockerContainer[]> {
    try {
      // Get basic container info
      const { stdout: listOutput } = await execAsync(
        'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.CreatedAt}}|{{.Ports}}"',
        { timeout: this.TIMEOUT_MS }
      );

      if (!listOutput.trim()) {
        return [];
      }

      const containerLines = listOutput.trim().split('\n');
      const containers: DockerContainer[] = [];

      for (const line of containerLines) {
        const [id, name, image, status, state, created, ports] = line.split('|');
        
        // Get detailed stats for running containers
        let stats = null;
        if (state === 'running') {
          try {
            const { stdout: statsOutput } = await execAsync(
              `docker stats ${id} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}"`,
              { timeout: this.TIMEOUT_MS }
            );
            stats = this.parseContainerStats(statsOutput.trim());
          } catch {
            // Stats not available, continue without them
          }
        }

        // Get restart count
        const restartCount = await this.getRestartCount(id);

        const container: DockerContainer = {
          id: id.substring(0, 12), // Short ID
          name: name.startsWith('/') ? name.substring(1) : name,
          image,
          status,
          state,
          created,
          ports: ports ? ports.split(',').map(p => p.trim()).filter(Boolean) : [],
          restart_count: restartCount,
          ...stats
        };

        containers.push(container);
      }

      return containers;
    } catch (error) {
      console.warn('Container information collection failed:', error);
      return [];
    }
  }

  private parseContainerStats(statsOutput: string): {
    cpu_usage_percent?: number;
    memory_usage_mb?: number;
    memory_limit_mb?: number;
    network_rx_mb?: number;
    network_tx_mb?: number;
  } {
    try {
      const [cpuPerc, memUsage, netIO] = statsOutput.split('|');

      // Parse CPU percentage (remove % sign)
      const cpu = parseFloat(cpuPerc.replace('%', ''));

      // Parse memory usage (format: "used / limit")
      const memMatch = memUsage.match(/([\d.]+)(\w+)\s*\/\s*([\d.]+)(\w+)/);
      let memoryUsageMB = 0;
      let memoryLimitMB = 0;

      if (memMatch) {
        const [, usedValue, usedUnit, limitValue, limitUnit] = memMatch;
        memoryUsageMB = this.convertToMB(parseFloat(usedValue), usedUnit);
        memoryLimitMB = this.convertToMB(parseFloat(limitValue), limitUnit);
      }

      // Parse network I/O (format: "rx / tx")
      const netMatch = netIO.match(/([\d.]+)(\w+)\s*\/\s*([\d.]+)(\w+)/);
      let networkRxMB = 0;
      let networkTxMB = 0;

      if (netMatch) {
        const [, rxValue, rxUnit, txValue, txUnit] = netMatch;
        networkRxMB = this.convertToMB(parseFloat(rxValue), rxUnit);
        networkTxMB = this.convertToMB(parseFloat(txValue), txUnit);
      }

      return {
        cpu_usage_percent: isNaN(cpu) ? undefined : Math.round(cpu * 100) / 100,
        memory_usage_mb: memoryUsageMB > 0 ? Math.round(memoryUsageMB * 100) / 100 : undefined,
        memory_limit_mb: memoryLimitMB > 0 ? Math.round(memoryLimitMB * 100) / 100 : undefined,
        network_rx_mb: networkRxMB > 0 ? Math.round(networkRxMB * 100) / 100 : undefined,
        network_tx_mb: networkTxMB > 0 ? Math.round(networkTxMB * 100) / 100 : undefined
      };
    } catch {
      return {};
    }
  }

  private convertToMB(value: number, unit: string): number {
    const unitLower = unit.toLowerCase();
    
    switch (unitLower) {
      case 'b':
        return value / (1024 * 1024);
      case 'kb':
      case 'kib':
        return value / 1024;
      case 'mb':
      case 'mib':
        return value;
      case 'gb':
      case 'gib':
        return value * 1024;
      case 'tb':
      case 'tib':
        return value * 1024 * 1024;
      default:
        return value; // Assume MB if unknown
    }
  }

  private async getRestartCount(containerId: string): Promise<number> {
    try {
      const { stdout } = await execAsync(
        `docker inspect ${containerId} --format "{{.RestartCount}}"`,
        { timeout: this.TIMEOUT_MS }
      );
      return parseInt(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  }

  private async getDockerSystemInfo(): Promise<{
    images_count: number;
    volumes_count: number;
    networks_count: number;
  }> {
    try {
      const [images, volumes, networks] = await Promise.allSettled([
        execAsync('docker images --format "{{.Repository}}" | wc -l', { timeout: this.TIMEOUT_MS }),
        execAsync('docker volume ls --format "{{.Name}}" | wc -l', { timeout: this.TIMEOUT_MS }),
        execAsync('docker network ls --format "{{.Name}}" | wc -l', { timeout: this.TIMEOUT_MS })
      ]);

      return {
        images_count: images.status === 'fulfilled' ? parseInt(images.value.stdout.trim()) || 0 : 0,
        volumes_count: volumes.status === 'fulfilled' ? parseInt(volumes.value.stdout.trim()) || 0 : 0,
        networks_count: networks.status === 'fulfilled' ? Math.max(0, (parseInt(networks.value.stdout.trim()) || 0) - 3) : 0 // Subtract default networks
      };
    } catch {
      return {
        images_count: 0,
        volumes_count: 0,
        networks_count: 0
      };
    }
  }

  private async getDockerDiskUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync(
        'docker system df --format "table {{.Type}}\\t{{.Size}}" | tail -n +2',
        { timeout: this.TIMEOUT_MS }
      );

      let totalSizeGB = 0;
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const sizeStr = parts[1];
          const size = this.parseSizeToGB(sizeStr);
          totalSizeGB += size;
        }
      }

      return Math.round(totalSizeGB * 100) / 100;
    } catch {
      return 0;
    }
  }

  private parseSizeToGB(sizeStr: string): number {
    const match = sizeStr.match(/([\d.]+)\s*([KMGT]?B)/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
      case 'B':
        return value / (1024 ** 3);
      case 'KB':
        return value / (1024 ** 2);
      case 'MB':
        return value / 1024;
      case 'GB':
        return value;
      case 'TB':
        return value * 1024;
      default:
        return value; // Assume GB if unknown
    }
  }

  /**
   * Get Docker container logs (helper method)
   */
  async getContainerLogs(containerId: string, lines: number = 100): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `docker logs --tail ${lines} ${containerId}`,
        { timeout: this.TIMEOUT_MS }
      );
      
      return stdout.split('\n').filter(line => line.trim());
    } catch {
      return [];
    }
  }

  /**
   * Get Docker events (helper method for monitoring)
   */
  async getRecentDockerEvents(since: string = '1h'): Promise<string[]> {
    try {
      const { stdout } = await execAsync(
        `docker events --since ${since} --format "{{.Time}} {{.Action}} {{.Type}} {{.Actor.Attributes.name}}"`,
        { timeout: this.TIMEOUT_MS }
      );
      
      return stdout.split('\n').filter(line => line.trim());
    } catch {
      return [];
    }
  }

  /**
   * Check for container health issues
   */
  async getContainerHealthIssues(): Promise<Array<{
    container_id: string;
    container_name: string;
    issue: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>> {
    try {
      const containers = await this.getContainerInformation();
      const healthIssues: Array<{
        container_id: string;
        container_name: string;
        issue: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
      }> = [];

      for (const container of containers) {
        // Check for high restart count
        if (container.restart_count > 10) {
          healthIssues.push({
            container_id: container.id,
            container_name: container.name,
            issue: `High restart count: ${container.restart_count} restarts`,
            severity: container.restart_count > 50 ? 'critical' : 'high'
          });
        }

        // Check for high CPU usage
        if (container.cpu_usage_percent && container.cpu_usage_percent > 80) {
          healthIssues.push({
            container_id: container.id,
            container_name: container.name,
            issue: `High CPU usage: ${container.cpu_usage_percent.toFixed(1)}%`,
            severity: container.cpu_usage_percent > 95 ? 'critical' : 'high'
          });
        }

        // Check for high memory usage
        if (container.memory_usage_mb && container.memory_limit_mb) {
          const memoryPercent = (container.memory_usage_mb / container.memory_limit_mb) * 100;
          if (memoryPercent > 85) {
            healthIssues.push({
              container_id: container.id,
              container_name: container.name,
              issue: `High memory usage: ${memoryPercent.toFixed(1)}%`,
              severity: memoryPercent > 95 ? 'critical' : 'high'
            });
          }
        }

        // Check for stopped containers that should be running
        if (container.state !== 'running' && !container.status.includes('Exited (0)')) {
          healthIssues.push({
            container_id: container.id,
            container_name: container.name,
            issue: `Container not running: ${container.status}`,
            severity: 'medium'
          });
        }
      }

      return healthIssues;
    } catch {
      return [];
    }
  }

  /**
   * Get Docker compose services status (if available)
   */
  async getDockerComposeStatus(composePath?: string): Promise<Array<{
    service_name: string;
    status: string;
    health: 'healthy' | 'unhealthy' | 'unknown';
  }>> {
    try {
      const composeCmd = composePath ? 
        `docker-compose -f ${composePath} ps --format json` :
        'docker-compose ps --format json';

      const { stdout } = await execAsync(composeCmd, { timeout: this.TIMEOUT_MS });
      
      if (!stdout.trim()) {
        return [];
      }

      const services = stdout.split('\n').filter(line => line.trim()).map(line => {
        try {
          const service = JSON.parse(line);
          return {
            service_name: service.Service || service.Name,
            status: service.State || 'unknown',
            health: this.determineServiceHealth(service.State, service.Health)
          };
        } catch {
          return null;
        }
      }).filter(Boolean) as Array<{
        service_name: string;
        status: string;
        health: 'healthy' | 'unhealthy' | 'unknown';
      }>;

      return services;
    } catch {
      return [];
    }
  }

  private determineServiceHealth(state: string, health?: string): 'healthy' | 'unhealthy' | 'unknown' {
    if (health) {
      if (health.toLowerCase().includes('healthy')) return 'healthy';
      if (health.toLowerCase().includes('unhealthy')) return 'unhealthy';
    }

    if (state === 'running' || state === 'Up') return 'healthy';
    if (state === 'exited' || state === 'dead' || state === 'restarting') return 'unhealthy';
    
    return 'unknown';
  }
}