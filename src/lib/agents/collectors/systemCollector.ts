import { promisify } from 'util';
import { exec } from 'child_process';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  SystemInformationCollector,
  SystemCollectorResult,
  CpuMetrics,
  MemoryMetrics,
  DiskMetrics,
  NetworkTests,
  ServiceStatus,
  SecurityAudit,
  ConnectivityTest,
  NetworkInterface,
  MountPointInfo,
  PortInfo,
  SecurityVulnerability
} from '../../types/agent';

const execAsync = promisify(exec);

/**
 * System information collector for comprehensive system metrics
 */
export class SystemCollector implements SystemInformationCollector {
  private readonly TIMEOUT_MS = 30000; // 30 second timeout for commands

  /**
   * Collect all system information
   */
  async collectSystemInfo(): Promise<SystemCollectorResult> {
    try {
      const [cpu, memory, disk, network, services, security] = await Promise.allSettled([
        this.collectCpuMetrics(),
        this.collectMemoryMetrics(),
        this.collectDiskMetrics(),
        this.collectNetworkMetrics(),
        this.collectBasicServices(),
        this.collectSecurityInfo()
      ]);

      return {
        cpu: cpu.status === 'fulfilled' ? cpu.value : this.getDefaultCpuMetrics(),
        memory: memory.status === 'fulfilled' ? memory.value : this.getDefaultMemoryMetrics(),
        disk: disk.status === 'fulfilled' ? disk.value : this.getDefaultDiskMetrics(),
        network: network.status === 'fulfilled' ? network.value : this.getDefaultNetworkTests(),
        services: services.status === 'fulfilled' ? services.value : [],
        security: security.status === 'fulfilled' ? security.value : this.getDefaultSecurityAudit(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`System collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Collect CPU metrics
   */
  async collectCpuMetrics(): Promise<CpuMetrics> {
    try {
      const cpus = os.cpus();
      const loadAvg = os.loadavg();
      
      // Get current CPU usage by sampling over time
      const usage = await this.getCpuUsage();
      
      // Try to get CPU temperature (Linux only)
      const temperature = await this.getCpuTemperature();
      
      // Get process/thread counts
      const { processes, threads } = await this.getProcessCounts();

      return {
        usage_percent: Math.round(usage * 100) / 100,
        load_average: {
          one_minute: Math.round(loadAvg[0] * 100) / 100,
          five_minutes: Math.round(loadAvg[1] * 100) / 100,
          fifteen_minutes: Math.round(loadAvg[2] * 100) / 100
        },
        core_count: cpus.length,
        cores_usage: await this.getPerCoreUsage(),
        temperature_celsius: temperature,
        frequency_mhz: cpus.map(cpu => cpu.speed),
        processes_count: processes,
        threads_count: threads
      };
    } catch (error) {
      console.warn('CPU metrics collection failed:', error);
      return this.getDefaultCpuMetrics();
    }
  }

  /**
   * Collect memory metrics
   */
  async collectMemoryMetrics(): Promise<MemoryMetrics> {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      
      // Get detailed memory info on Linux
      const memInfo = await this.getDetailedMemoryInfo();
      
      return {
        total_gb: Math.round((totalMem / (1024 ** 3)) * 100) / 100,
        free_gb: Math.round((freeMem / (1024 ** 3)) * 100) / 100,
        used_gb: Math.round((usedMem / (1024 ** 3)) * 100) / 100,
        usage_percent: Math.round((usedMem / totalMem * 100) * 100) / 100,
        cached_gb: memInfo.cached || 0,
        buffers_gb: memInfo.buffers || 0,
        swap_total_gb: memInfo.swapTotal || 0,
        swap_used_gb: memInfo.swapUsed || 0,
        swap_usage_percent: memInfo.swapTotal > 0 ? 
          Math.round((memInfo.swapUsed / memInfo.swapTotal * 100) * 100) / 100 : 0,
        memory_pressure: this.calculateMemoryPressure(usedMem / totalMem)
      };
    } catch (error) {
      console.warn('Memory metrics collection failed:', error);
      return this.getDefaultMemoryMetrics();
    }
  }

  /**
   * Collect disk metrics
   */
  async collectDiskMetrics(): Promise<DiskMetrics> {
    try {
      const mountPoints = await this.getMountPoints();
      
      let totalSpace = 0;
      let usedSpace = 0;
      let freeSpace = 0;
      
      for (const mount of mountPoints) {
        totalSpace += mount.total_gb;
        usedSpace += mount.used_gb;
        freeSpace += mount.free_gb;
      }
      
      const usagePercent = totalSpace > 0 ? (usedSpace / totalSpace) * 100 : 0;
      const ioStats = await this.getDiskIOStats();
      
      return {
        total_space_gb: Math.round(totalSpace * 100) / 100,
        free_space_gb: Math.round(freeSpace * 100) / 100,
        used_space_gb: Math.round(usedSpace * 100) / 100,
        usage_percent: Math.round(usagePercent * 100) / 100,
        mount_points: mountPoints,
        disk_health: this.assessDiskHealth(usagePercent, ioStats.io_wait_percent),
        predicted_full_date: this.predictDiskFull(usagePercent),
        io_stats: ioStats
      };
    } catch (error) {
      console.warn('Disk metrics collection failed:', error);
      return this.getDefaultDiskMetrics();
    }
  }

  /**
   * Collect network metrics
   */
  async collectNetworkMetrics(): Promise<NetworkTests> {
    try {
      const [internetConnected, dnsTests, interfaces, connectivity] = await Promise.allSettled([
        this.testInternetConnection(),
        this.testDNSResolution(),
        this.getNetworkInterfaces(),
        this.runConnectivityTests()
      ]);

      return {
        internet_connected: internetConnected.status === 'fulfilled' ? internetConnected.value : false,
        dns_resolution: dnsTests.status === 'fulfilled' ? dnsTests.value : {
          google_dns: false,
          cloudflare_dns: false,
          response_time_ms: 0
        },
        network_interfaces: interfaces.status === 'fulfilled' ? interfaces.value : [],
        connectivity_tests: connectivity.status === 'fulfilled' ? connectivity.value : [],
        bandwidth_mbps: await this.getBandwidthEstimate()
      };
    } catch (error) {
      console.warn('Network metrics collection failed:', error);
      return this.getDefaultNetworkTests();
    }
  }

  // Private helper methods

  private async getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startMeasure = this.cpuMeasure();
      
      setTimeout(() => {
        const endMeasure = this.cpuMeasure();
        const idleDifference = endMeasure.idle - startMeasure.idle;
        const totalDifference = endMeasure.total - startMeasure.total;
        const cpuPercentage = 100 - (100 * idleDifference / totalDifference);
        resolve(Math.max(0, Math.min(100, cpuPercentage)));
      }, 1000);
    });
  }

  private cpuMeasure(): { idle: number; total: number } {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
      }
      idle += cpu.times.idle;
    });

    return { idle, total };
  }

  private async getPerCoreUsage(): Promise<number[]> {
    try {
      const { stdout } = await execAsync('top -bn1 | grep "Cpu" | head -1', { timeout: this.TIMEOUT_MS });
      // This is a simplified implementation - actual per-core usage would need more complex parsing
      const cpuCount = os.cpus().length;
      const overallUsage = await this.getCpuUsage();
      
      // Return estimated per-core usage (in a real implementation, you'd parse /proc/stat)
      return new Array(cpuCount).fill(overallUsage);
    } catch {
      return os.cpus().map(() => 0);
    }
  }

  private async getCpuTemperature(): Promise<number | undefined> {
    try {
      if (process.platform !== 'linux') {
        return undefined;
      }
      
      const { stdout } = await execAsync('cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo "0"', { timeout: this.TIMEOUT_MS });
      const tempMicroCelsius = parseInt(stdout.trim());
      return tempMicroCelsius > 0 ? Math.round(tempMicroCelsius / 1000) : undefined;
    } catch {
      return undefined;
    }
  }

  private async getProcessCounts(): Promise<{ processes: number; threads: number }> {
    try {
      const { stdout } = await execAsync('ps -eo pid,nlwp | tail -n +2', { timeout: this.TIMEOUT_MS });
      const lines = stdout.trim().split('\n');
      const processes = lines.length;
      const threads = lines.reduce((total, line) => {
        const parts = line.trim().split(/\s+/);
        return total + (parseInt(parts[1]) || 1);
      }, 0);
      
      return { processes, threads };
    } catch {
      return { processes: 0, threads: 0 };
    }
  }

  private async getDetailedMemoryInfo(): Promise<{
    cached: number;
    buffers: number;
    swapTotal: number;
    swapUsed: number;
  }> {
    try {
      if (process.platform !== 'linux') {
        return { cached: 0, buffers: 0, swapTotal: 0, swapUsed: 0 };
      }

      const meminfo = await fs.readFile('/proc/meminfo', 'utf-8');
      const lines = meminfo.split('\n');
      
      const getValue = (key: string): number => {
        const line = lines.find(l => l.startsWith(key));
        if (!line) return 0;
        const match = line.match(/(\d+)/);
        return match ? parseInt(match[1]) * 1024 : 0; // Convert from KB to bytes
      };

      return {
        cached: Math.round((getValue('Cached') / (1024 ** 3)) * 100) / 100,
        buffers: Math.round((getValue('Buffers') / (1024 ** 3)) * 100) / 100,
        swapTotal: Math.round((getValue('SwapTotal') / (1024 ** 3)) * 100) / 100,
        swapUsed: Math.round(((getValue('SwapTotal') - getValue('SwapFree')) / (1024 ** 3)) * 100) / 100
      };
    } catch {
      return { cached: 0, buffers: 0, swapTotal: 0, swapUsed: 0 };
    }
  }

  private calculateMemoryPressure(usageRatio: number): 'low' | 'medium' | 'high' {
    if (usageRatio < 0.7) return 'low';
    if (usageRatio < 0.85) return 'medium';
    return 'high';
  }

  private async getMountPoints(): Promise<MountPointInfo[]> {
    try {
      const { stdout } = await execAsync('df -h', { timeout: this.TIMEOUT_MS });
      const lines = stdout.split('\n').slice(1);
      
      const mountPoints: MountPointInfo[] = [];
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;
        
        const device = parts[0];
        const total = this.parseSize(parts[1]);
        const used = this.parseSize(parts[2]);
        const free = this.parseSize(parts[3]);
        const mountPath = parts[5];
        
        if (total > 0) {
          mountPoints.push({
            path: mountPath,
            total_gb: total,
            used_gb: used,
            free_gb: free,
            usage_percent: Math.round((used / total * 100) * 100) / 100,
            filesystem: 'unknown', // Would need additional parsing
            device
          });
        }
      }
      
      return mountPoints;
    } catch {
      return [];
    }
  }

  private parseSize(sizeStr: string): number {
    const size = parseFloat(sizeStr);
    if (isNaN(size)) return 0;
    
    if (sizeStr.includes('T')) return size * 1024;
    if (sizeStr.includes('G')) return size;
    if (sizeStr.includes('M')) return size / 1024;
    if (sizeStr.includes('K')) return size / (1024 * 1024);
    
    return size / (1024 ** 3); // Assume bytes
  }

  private async getDiskIOStats(): Promise<{
    reads_per_sec: number;
    writes_per_sec: number;
    io_wait_percent: number;
  }> {
    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('iostat -x 1 2 | tail -n +4', { timeout: this.TIMEOUT_MS });
        const lines = stdout.trim().split('\n');
        const dataLines = lines.filter(line => line.trim() && !line.includes('Device'));
        
        if (dataLines.length > 0) {
          const avgLine = dataLines[dataLines.length - 1];
          const parts = avgLine.trim().split(/\s+/);
          
          return {
            reads_per_sec: parseFloat(parts[3]) || 0,
            writes_per_sec: parseFloat(parts[4]) || 0,
            io_wait_percent: parseFloat(parts[9]) || 0
          };
        }
      }
      
      return { reads_per_sec: 0, writes_per_sec: 0, io_wait_percent: 0 };
    } catch {
      return { reads_per_sec: 0, writes_per_sec: 0, io_wait_percent: 0 };
    }
  }

  private assessDiskHealth(usagePercent: number, ioWait: number): 'good' | 'warning' | 'critical' {
    if (usagePercent > 95 || ioWait > 50) return 'critical';
    if (usagePercent > 85 || ioWait > 25) return 'warning';
    return 'good';
  }

  private predictDiskFull(usagePercent: number): string | undefined {
    if (usagePercent > 90) {
      const daysUntilFull = Math.ceil((100 - usagePercent) * 30); // Rough estimate
      const date = new Date();
      date.setDate(date.getDate() + daysUntilFull);
      return date.toISOString().split('T')[0];
    }
    return undefined;
  }

  private async testInternetConnection(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('ping -c 1 -W 5 8.8.8.8', { timeout: this.TIMEOUT_MS });
      return stdout.includes('1 received');
    } catch {
      return false;
    }
  }

  private async testDNSResolution(): Promise<{
    google_dns: boolean;
    cloudflare_dns: boolean;
    response_time_ms: number;
  }> {
    try {
      const start = Date.now();
      const [google, cloudflare] = await Promise.allSettled([
        execAsync('nslookup google.com 8.8.8.8', { timeout: this.TIMEOUT_MS }),
        execAsync('nslookup google.com 1.1.1.1', { timeout: this.TIMEOUT_MS })
      ]);
      const responseTime = Date.now() - start;

      return {
        google_dns: google.status === 'fulfilled',
        cloudflare_dns: cloudflare.status === 'fulfilled',
        response_time_ms: responseTime
      };
    } catch {
      return {
        google_dns: false,
        cloudflare_dns: false,
        response_time_ms: 0
      };
    }
  }

  private async getNetworkInterfaces(): Promise<NetworkInterface[]> {
    try {
      const interfaces = os.networkInterfaces();
      const result: NetworkInterface[] = [];

      for (const [name, addresses] of Object.entries(interfaces)) {
        if (!addresses) continue;

        const ipAddresses = addresses
          .filter(addr => !addr.internal)
          .map(addr => addr.address);

        if (ipAddresses.length > 0) {
          result.push({
            name,
            type: 'ethernet', // Simplified - would need more detection logic
            status: ipAddresses.length > 0 ? 'up' : 'down',
            ip_addresses: ipAddresses,
            mac_address: addresses[0]?.mac,
            mtu: 1500, // Default - would need to fetch actual value
            rx_bytes: 0, // Would need to parse /proc/net/dev on Linux
            tx_bytes: 0,
            rx_packets: 0,
            tx_packets: 0,
            rx_errors: 0,
            tx_errors: 0
          });
        }
      }

      return result;
    } catch {
      return [];
    }
  }

  private async runConnectivityTests(): Promise<ConnectivityTest[]> {
    const tests = [
      { target: 'google.com', port: 80 },
      { target: 'github.com', port: 443 },
      { target: '8.8.8.8', port: 53 }
    ];

    const results: ConnectivityTest[] = [];

    for (const test of tests) {
      try {
        const start = Date.now();
        await execAsync(`timeout 5 bash -c "</dev/tcp/${test.target}/${test.port}"`, { timeout: this.TIMEOUT_MS });
        const responseTime = Date.now() - start;
        
        results.push({
          target: test.target,
          port: test.port,
          status: 'success',
          response_time_ms: responseTime
        });
      } catch (error) {
        results.push({
          target: test.target,
          port: test.port,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  private async getBandwidthEstimate(): Promise<{ download: number; upload: number } | undefined> {
    // Bandwidth testing would require external tools like speedtest-cli
    // For now, return undefined as it's an expensive operation
    return undefined;
  }

  private async collectBasicServices(): Promise<ServiceStatus[]> {
    try {
      if (process.platform !== 'linux') {
        return [];
      }

      const { stdout } = await execAsync('systemctl list-units --type=service --state=running --no-pager', { timeout: this.TIMEOUT_MS });
      const lines = stdout.split('\n').slice(1);
      
      const services: ServiceStatus[] = [];
      
      for (const line of lines) {
        if (!line.trim() || line.includes('UNIT')) continue;
        
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          services.push({
            name: parts[0].replace('.service', ''),
            status: parts[2] === 'active' ? 'active' : 'inactive',
            enabled: true, // Would need additional check
            description: parts.slice(4).join(' ')
          });
        }
      }
      
      return services.slice(0, 50); // Limit to first 50 services
    } catch {
      return [];
    }
  }

  private async collectSecurityInfo(): Promise<SecurityAudit> {
    try {
      const [openPorts, securityUpdates] = await Promise.allSettled([
        this.scanBasicPorts(),
        this.checkSecurityUpdates()
      ]);

      return {
        open_ports: openPorts.status === 'fulfilled' ? openPorts.value : [],
        failed_logins: await this.getFailedLoginCount(),
        security_updates_available: securityUpdates.status === 'fulfilled' ? securityUpdates.value : 0,
        firewall_status: await this.getFirewallStatus(),
        vulnerabilities: [] // Would require vulnerability scanner
      };
    } catch {
      return this.getDefaultSecurityAudit();
    }
  }

  private async scanBasicPorts(): Promise<PortInfo[]> {
    try {
      const { stdout } = await execAsync('netstat -tuln', { timeout: this.TIMEOUT_MS });
      const lines = stdout.split('\n').slice(2);
      
      const ports: PortInfo[] = [];
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const protocol = parts[0].toLowerCase().includes('tcp') ? 'tcp' : 'udp';
          const address = parts[3];
          const portMatch = address.match(/:(\d+)$/);
          
          if (portMatch) {
            const port = parseInt(portMatch[1]);
            if (!isNaN(port)) {
              ports.push({
                port,
                protocol,
                state: 'open'
              });
            }
          }
        }
      }
      
      return ports;
    } catch {
      return [];
    }
  }

  private async checkSecurityUpdates(): Promise<number> {
    try {
      if (process.platform === 'linux') {
        // Check for updates based on distribution
        const { stdout } = await execAsync('apt list --upgradable 2>/dev/null | wc -l || yum check-update --security 2>/dev/null | wc -l || echo "0"', { timeout: this.TIMEOUT_MS });
        return Math.max(0, parseInt(stdout.trim()) - 1); // Subtract header line
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private async getFailedLoginCount(): Promise<number> {
    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('grep "Failed password" /var/log/auth.log 2>/dev/null | tail -n 100 | wc -l || echo "0"', { timeout: this.TIMEOUT_MS });
        return parseInt(stdout.trim()) || 0;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private async getFirewallStatus(): Promise<'active' | 'inactive' | 'unknown'> {
    try {
      const { stdout } = await execAsync('ufw status 2>/dev/null | grep "Status:" | awk "{print $2}" || echo "unknown"', { timeout: this.TIMEOUT_MS });
      const status = stdout.trim().toLowerCase();
      return status === 'active' ? 'active' : status === 'inactive' ? 'inactive' : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Default fallback methods

  private getDefaultCpuMetrics(): CpuMetrics {
    return {
      usage_percent: 0,
      load_average: { one_minute: 0, five_minutes: 0, fifteen_minutes: 0 },
      core_count: os.cpus().length,
      cores_usage: new Array(os.cpus().length).fill(0),
      frequency_mhz: os.cpus().map(cpu => cpu.speed),
      processes_count: 0,
      threads_count: 0
    };
  }

  private getDefaultMemoryMetrics(): MemoryMetrics {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      total_gb: Math.round((totalMem / (1024 ** 3)) * 100) / 100,
      free_gb: Math.round((freeMem / (1024 ** 3)) * 100) / 100,
      used_gb: Math.round((usedMem / (1024 ** 3)) * 100) / 100,
      usage_percent: Math.round((usedMem / totalMem * 100) * 100) / 100,
      cached_gb: 0,
      buffers_gb: 0,
      swap_total_gb: 0,
      swap_used_gb: 0,
      swap_usage_percent: 0,
      memory_pressure: 'low'
    };
  }

  private getDefaultDiskMetrics(): DiskMetrics {
    return {
      total_space_gb: 0,
      free_space_gb: 0,
      used_space_gb: 0,
      usage_percent: 0,
      mount_points: [],
      disk_health: 'good',
      io_stats: {
        reads_per_sec: 0,
        writes_per_sec: 0,
        io_wait_percent: 0
      }
    };
  }

  private getDefaultNetworkTests(): NetworkTests {
    return {
      internet_connected: false,
      dns_resolution: {
        google_dns: false,
        cloudflare_dns: false,
        response_time_ms: 0
      },
      connectivity_tests: [],
      network_interfaces: []
    };
  }

  private getDefaultSecurityAudit(): SecurityAudit {
    return {
      open_ports: [],
      failed_logins: 0,
      security_updates_available: 0,
      firewall_status: 'unknown',
      vulnerabilities: []
    };
  }
}