import { promisify } from 'util';
import { exec } from 'child_process';
import { 
  ServiceInformationCollector,
  ServiceCollectorResult,
  ServiceStatus
} from '../../types/agent';

const execAsync = promisify(exec);

/**
 * System service information collector for health monitoring
 */
export class ServiceCollector implements ServiceInformationCollector {
  private readonly TIMEOUT_MS = 30000; // 30 second timeout for commands

  /**
   * Collect comprehensive service health information
   */
  async collectServiceHealth(): Promise<ServiceCollectorResult> {
    try {
      const services = await this.collectSystemServices();
      
      const failedServices = services.filter(s => s.status === 'failed').length;
      const disabledServices = services.filter(s => !s.enabled).length;

      return {
        services,
        system_services_count: services.length,
        failed_services_count: failedServices,
        disabled_services_count: disabledServices,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Service collection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Collect system services information
   */
  async collectSystemServices(): Promise<ServiceStatus[]> {
    try {
      const services: ServiceStatus[] = [];

      // Collect services based on platform
      if (process.platform === 'linux') {
        const systemdServices = await this.getSystemdServices();
        services.push(...systemdServices);
      } else {
        // For non-Linux systems, return basic process information
        const processServices = await this.getProcessBasedServices();
        services.push(...processServices);
      }

      return services;
    } catch (error) {
      console.warn('System service collection failed:', error);
      return [];
    }
  }

  // Private helper methods

  private async getSystemdServices(): Promise<ServiceStatus[]> {
    try {
      // Get all systemd services with their status
      const { stdout } = await execAsync(
        'systemctl list-units --type=service --all --no-pager --output=json',
        { timeout: this.TIMEOUT_MS }
      );

      let services: ServiceStatus[] = [];

      try {
        // Parse JSON output if available (newer systemd versions)
        const serviceData = JSON.parse(stdout);
        services = await this.parseSystemdJsonOutput(serviceData);
      } catch {
        // Fallback to plain text parsing
        services = await this.parseSystemdTextOutput();
      }

      // Get additional details for important services
      services = await this.enrichServiceDetails(services);

      return services;
    } catch (error) {
      console.warn('Systemd service collection failed:', error);
      return await this.getBasicSystemdServices();
    }
  }

  private async parseSystemdJsonOutput(serviceData: any[]): Promise<ServiceStatus[]> {
    const services: ServiceStatus[] = [];

    for (const service of serviceData) {
      if (!service.unit || !service.unit.endsWith('.service')) {
        continue;
      }

      const serviceName = service.unit.replace('.service', '');
      const status = this.mapSystemdStatus(service.active, service.sub);

      services.push({
        name: serviceName,
        status,
        enabled: await this.isServiceEnabled(serviceName),
        description: service.description || 'No description available'
      });
    }

    return services;
  }

  private async parseSystemdTextOutput(): Promise<ServiceStatus[]> {
    try {
      const { stdout } = await execAsync(
        'systemctl list-units --type=service --all --no-pager',
        { timeout: this.TIMEOUT_MS }
      );

      const lines = stdout.split('\n');
      const services: ServiceStatus[] = [];

      for (const line of lines) {
        if (!line.includes('.service') || line.includes('UNIT')) {
          continue;
        }

        const parts = line.trim().split(/\s+/);
        if (parts.length < 4) continue;

        const serviceName = parts[0].replace('.service', '');
        const load = parts[1];
        const active = parts[2];
        const sub = parts[3];
        const description = parts.slice(4).join(' ');

        if (load === 'loaded') {
          const status = this.mapSystemdStatus(active, sub);
          services.push({
            name: serviceName,
            status,
            enabled: await this.isServiceEnabled(serviceName),
            description: description || 'No description available'
          });
        }
      }

      return services;
    } catch {
      return [];
    }
  }

  private async getBasicSystemdServices(): Promise<ServiceStatus[]> {
    try {
      // Simplified approach for basic service info
      const { stdout } = await execAsync(
        'systemctl list-unit-files --type=service --no-pager | grep -E "\\.service\\s+(enabled|disabled)"',
        { timeout: this.TIMEOUT_MS }
      );

      const lines = stdout.split('\n');
      const services: ServiceStatus[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const serviceName = parts[0].replace('.service', '');
          const enabled = parts[1] === 'enabled';

          // Get current status
          const status = await this.getServiceStatus(serviceName);

          services.push({
            name: serviceName,
            status,
            enabled,
            description: 'Service description not available'
          });
        }
      }

      return services.slice(0, 100); // Limit to first 100 services
    } catch {
      return [];
    }
  }

  private async getServiceStatus(serviceName: string): Promise<'active' | 'inactive' | 'failed' | 'unknown'> {
    try {
      const { stdout } = await execAsync(
        `systemctl is-active ${serviceName}`,
        { timeout: this.TIMEOUT_MS }
      );
      const status = stdout.trim().toLowerCase();
      return this.mapSystemdStatus(status, '');
    } catch {
      return 'unknown';
    }
  }

  private mapSystemdStatus(active: string, sub: string): 'active' | 'inactive' | 'failed' | 'unknown' {
    const activeStatus = active.toLowerCase();
    const subStatus = sub.toLowerCase();

    if (activeStatus === 'active') {
      return 'active';
    } else if (activeStatus === 'inactive') {
      return 'inactive';
    } else if (activeStatus === 'failed' || subStatus === 'failed') {
      return 'failed';
    } else {
      return 'unknown';
    }
  }

  private async isServiceEnabled(serviceName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `systemctl is-enabled ${serviceName}`,
        { timeout: this.TIMEOUT_MS }
      );
      return stdout.trim().toLowerCase() === 'enabled';
    } catch {
      return false;
    }
  }

  private async enrichServiceDetails(services: ServiceStatus[]): Promise<ServiceStatus[]> {
    const enrichedServices: ServiceStatus[] = [];

    for (const service of services) {
      try {
        const enrichedService = { ...service };

        // Get additional service details
        const details = await this.getServiceDetails(service.name);
        
        enrichedService.uptime = details.uptime;
        enrichedService.memory_usage = details.memory_usage;
        enrichedService.cpu_usage = details.cpu_usage;
        enrichedService.pid = details.pid;
        enrichedService.restart_count = details.restart_count;

        enrichedServices.push(enrichedService);
      } catch {
        // If enrichment fails, keep the original service
        enrichedServices.push(service);
      }
    }

    return enrichedServices;
  }

  private async getServiceDetails(serviceName: string): Promise<{
    uptime?: string;
    memory_usage?: number;
    cpu_usage?: number;
    pid?: number;
    restart_count?: number;
  }> {
    try {
      const [statusOutput, statsOutput] = await Promise.allSettled([
        execAsync(`systemctl show ${serviceName} --property=ActiveEnterTimestamp,MainPID`, { timeout: this.TIMEOUT_MS }),
        execAsync(`systemctl show ${serviceName} --property=CPUUsageNSec,MemoryCurrent`, { timeout: this.TIMEOUT_MS })
      ]);

      const details: {
        uptime?: string;
        memory_usage?: number;
        cpu_usage?: number;
        pid?: number;
        restart_count?: number;
      } = {};

      // Parse status information
      if (statusOutput.status === 'fulfilled') {
        const statusLines = statusOutput.value.stdout.split('\n');
        for (const line of statusLines) {
          const [key, value] = line.split('=');
          if (key === 'MainPID' && value && value !== '0') {
            details.pid = parseInt(value);
          } else if (key === 'ActiveEnterTimestamp' && value) {
            const startTime = new Date(value);
            const uptime = Date.now() - startTime.getTime();
            if (uptime > 0) {
              details.uptime = this.formatUptime(uptime);
            }
          }
        }
      }

      // Parse resource usage
      if (statsOutput.status === 'fulfilled') {
        const statsLines = statsOutput.value.stdout.split('\n');
        for (const line of statsLines) {
          const [key, value] = line.split('=');
          if (key === 'MemoryCurrent' && value && value !== '[not set]') {
            const memoryBytes = parseInt(value);
            if (!isNaN(memoryBytes) && memoryBytes > 0) {
              details.memory_usage = Math.round(memoryBytes / (1024 * 1024)); // Convert to MB
            }
          } else if (key === 'CPUUsageNSec' && value && value !== '[not set]') {
            const cpuNanoseconds = parseInt(value);
            if (!isNaN(cpuNanoseconds) && cpuNanoseconds > 0) {
              // Convert to approximate CPU percentage (very rough estimate)
              details.cpu_usage = Math.round((cpuNanoseconds / 1000000000) / 60 * 100) / 100; // Assuming 1 minute uptime
            }
          }
        }
      }

      // Get restart count if available
      try {
        const { stdout: restartOutput } = await execAsync(
          `systemctl show ${serviceName} --property=NRestarts`,
          { timeout: this.TIMEOUT_MS }
        );
        const restartMatch = restartOutput.match(/NRestarts=(\d+)/);
        if (restartMatch) {
          details.restart_count = parseInt(restartMatch[1]);
        }
      } catch {
        // Restart count not available
      }

      return details;
    } catch {
      return {};
    }
  }

  private formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private async getProcessBasedServices(): Promise<ServiceStatus[]> {
    try {
      // For non-Linux systems, identify services based on common process names
      const { stdout } = await execAsync('ps aux', { timeout: this.TIMEOUT_MS });
      const lines = stdout.split('\n').slice(1); // Skip header

      const serviceProcesses: Map<string, ServiceStatus> = new Map();

      // Common service process patterns
      const servicePatterns = [
        { pattern: /nginx/, name: 'nginx', description: 'Web server' },
        { pattern: /apache|httpd/, name: 'apache', description: 'Apache web server' },
        { pattern: /mysql|mysqld/, name: 'mysql', description: 'MySQL database server' },
        { pattern: /postgres/, name: 'postgresql', description: 'PostgreSQL database server' },
        { pattern: /redis-server/, name: 'redis', description: 'Redis key-value store' },
        { pattern: /mongodb|mongod/, name: 'mongodb', description: 'MongoDB database server' },
        { pattern: /docker/, name: 'docker', description: 'Docker container runtime' },
        { pattern: /ssh/, name: 'ssh', description: 'SSH daemon' },
        { pattern: /cron/, name: 'cron', description: 'Cron scheduler' }
      ];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 11) continue;

        const pid = parts[1];
        const cpu = parseFloat(parts[2]) || 0;
        const memory = parseFloat(parts[3]) || 0;
        const command = parts.slice(10).join(' ');

        for (const { pattern, name, description } of servicePatterns) {
          if (pattern.test(command.toLowerCase())) {
            if (!serviceProcesses.has(name)) {
              serviceProcesses.set(name, {
                name,
                status: 'active',
                enabled: true, // Assume running processes are enabled
                description,
                pid: parseInt(pid),
                cpu_usage: cpu,
                memory_usage: Math.round(memory * (process.platform === 'darwin' ? 1 : 1024) / 1024) // Rough conversion
              });
            }
            break;
          }
        }
      }

      return Array.from(serviceProcesses.values());
    } catch {
      return [];
    }
  }

  /**
   * Get critical system services that should be monitored
   */
  async getCriticalServices(): Promise<ServiceStatus[]> {
    const criticalServiceNames = [
      'sshd',
      'systemd',
      'networkd',
      'resolved',
      'dbus',
      'cron',
      'rsyslog',
      'ufw',
      'fail2ban',
      'nginx',
      'apache2',
      'httpd',
      'mysql',
      'mysqld',
      'postgresql',
      'redis',
      'docker',
      'containerd'
    ];

    try {
      const allServices = await this.collectSystemServices();
      return allServices.filter(service => 
        criticalServiceNames.some(critical => 
          service.name.toLowerCase().includes(critical.toLowerCase())
        )
      );
    } catch {
      return [];
    }
  }

  /**
   * Get services with issues (failed, high resource usage, etc.)
   */
  async getServicesWithIssues(): Promise<Array<{
    service: ServiceStatus;
    issues: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>> {
    try {
      const services = await this.collectSystemServices();
      const servicesWithIssues: Array<{
        service: ServiceStatus;
        issues: string[];
        severity: 'low' | 'medium' | 'high' | 'critical';
      }> = [];

      for (const service of services) {
        const issues: string[] = [];
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

        // Check for failed status
        if (service.status === 'failed') {
          issues.push('Service is in failed state');
          severity = 'critical';
        }

        // Check for high resource usage
        if (service.cpu_usage && service.cpu_usage > 50) {
          issues.push(`High CPU usage: ${service.cpu_usage.toFixed(1)}%`);
          severity = service.cpu_usage > 90 ? 'critical' : 'high';
        }

        if (service.memory_usage && service.memory_usage > 1024) { // > 1GB
          issues.push(`High memory usage: ${service.memory_usage}MB`);
          if (severity === 'low') severity = 'medium';
        }

        // Check for high restart count
        if (service.restart_count && service.restart_count > 5) {
          issues.push(`High restart count: ${service.restart_count} restarts`);
          severity = service.restart_count > 20 ? 'high' : 'medium';
        }

        // Check if critical service is inactive
        const criticalServices = ['sshd', 'networkd', 'systemd'];
        if (criticalServices.includes(service.name) && service.status === 'inactive') {
          issues.push('Critical service is inactive');
          severity = 'high';
        }

        if (issues.length > 0) {
          servicesWithIssues.push({
            service,
            issues,
            severity
          });
        }
      }

      return servicesWithIssues.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });
    } catch {
      return [];
    }
  }

  /**
   * Get service startup times and dependencies
   */
  async getServiceStartupAnalysis(): Promise<Array<{
    service_name: string;
    startup_time_ms?: number;
    dependencies: string[];
    dependents: string[];
  }>> {
    if (process.platform !== 'linux') {
      return [];
    }

    try {
      // Get systemd startup times
      const { stdout } = await execAsync(
        'systemd-analyze blame --no-pager | head -50',
        { timeout: this.TIMEOUT_MS }
      );

      const services = [];
      const lines = stdout.split('\n');

      for (const line of lines) {
        const match = line.match(/^\s*(\d+(?:\.\d+)?)(m?s)\s+(.+\.service)/);
        if (match) {
          const [, time, unit, serviceName] = match;
          const timeMs = unit === 's' ? parseFloat(time) * 1000 : parseFloat(time);

          // Get dependencies for this service
          const dependencies = await this.getServiceDependencies(serviceName);

          services.push({
            service_name: serviceName.replace('.service', ''),
            startup_time_ms: timeMs,
            dependencies: dependencies.requires,
            dependents: dependencies.requiredBy
          });
        }
      }

      return services;
    } catch {
      return [];
    }
  }

  private async getServiceDependencies(serviceName: string): Promise<{
    requires: string[];
    requiredBy: string[];
  }> {
    try {
      const [requires, requiredBy] = await Promise.allSettled([
        execAsync(`systemctl list-dependencies ${serviceName} --plain --no-pager`, { timeout: this.TIMEOUT_MS }),
        execAsync(`systemctl list-dependencies ${serviceName} --reverse --plain --no-pager`, { timeout: this.TIMEOUT_MS })
      ]);

      const parseOutput = (output: string): string[] => {
        return output.split('\n')
          .filter(line => line.includes('.service'))
          .map(line => line.replace(/.*●\s*/, '').replace('.service', '').trim())
          .filter(Boolean)
          .slice(0, 10); // Limit to first 10 dependencies
      };

      return {
        requires: requires.status === 'fulfilled' ? parseOutput(requires.value.stdout) : [],
        requiredBy: requiredBy.status === 'fulfilled' ? parseOutput(requiredBy.value.stdout) : []
      };
    } catch {
      return { requires: [], requiredBy: [] };
    }
  }
}