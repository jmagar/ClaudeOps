import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import type { 
  ProcessInfo, 
  ProcessLifecycleState, 
  ProcessManagerConfig,
  IProcessManager,
  ExecutionEvent
} from '../types/execution';

/**
 * Process Manager for handling agent execution processes
 * Provides process lifecycle management, monitoring, and cleanup
 */
export class ProcessManager extends EventEmitter implements IProcessManager {
  private processes: Map<string, ProcessInfo> = new Map();
  private childProcesses: Map<string, ChildProcess> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private config: Required<ProcessManagerConfig>;
  private shutdownInProgress: boolean = false;

  constructor(config: Partial<ProcessManagerConfig> = {}) {
    super();
    
    this.config = {
      maxConcurrentProcesses: config.maxConcurrentProcesses ?? 10,
      processTimeoutMs: config.processTimeoutMs ?? 300000, // 5 minutes
      killSignal: config.killSignal ?? 'SIGTERM',
      killTimeoutMs: config.killTimeoutMs ?? 5000,
      monitoringIntervalMs: config.monitoringIntervalMs ?? 1000,
      autoCleanupOnExit: config.autoCleanupOnExit ?? true
    };

    // Setup graceful shutdown
    if (this.config.autoCleanupOnExit) {
      process.on('SIGTERM', () => this.gracefulShutdown());
      process.on('SIGINT', () => this.gracefulShutdown());
      process.on('exit', () => this.cleanup());
    }

    // Periodic cleanup of completed processes
    setInterval(() => this.performMaintenance(), 30000); // Every 30 seconds
  }

  /**
   * Start a new process for agent execution
   */
  async startProcess(
    executionId: string, 
    command: string, 
    args: string[] = [], 
    options: any = {}
  ): Promise<ProcessInfo> {
    // Check if we can start more processes
    if (this.getRunningProcessCount() >= this.config.maxConcurrentProcesses) {
      throw new Error(`Maximum concurrent processes reached (${this.config.maxConcurrentProcesses})`);
    }

    // Check if process already exists
    if (this.processes.has(executionId)) {
      throw new Error(`Process for execution ${executionId} already exists`);
    }

    const startTime = new Date();
    
    // Create process info
    const processInfo: ProcessInfo = {
      executionId,
      agentType: options.agentType || 'unknown',
      startTime,
      state: 'initializing'
    };

    this.processes.set(executionId, processInfo);
    this.emitProcessEvent('process:state:changed', { 
      executionId, 
      state: 'initializing', 
      processInfo 
    });

    try {
      // Spawn the process
      const childProcess = spawn(command, args, {
        cwd: options.cwd || process.cwd(),
        env: { ...process.env, ...options.env },
        stdio: options.stdio || 'pipe',
        detached: false,
        ...options
      });

      // Update process info with PID
      processInfo.pid = childProcess.pid;
      processInfo.state = 'starting';
      this.childProcesses.set(executionId, childProcess);

      // Set up process event handlers
      this.setupProcessHandlers(executionId, childProcess);

      // Start monitoring
      await this.monitorProcess(executionId);

      // Set process timeout
      setTimeout(() => {
        if (this.isProcessRunning(executionId)) {
          console.warn(`Process ${executionId} timed out after ${this.config.processTimeoutMs}ms`);
          this.killProcess(executionId, 'SIGTERM').catch(error => {
            console.error(`Failed to kill timed out process ${executionId}:`, error);
          });
        }
      }, this.config.processTimeoutMs);

      processInfo.state = 'running';
      this.emitProcessEvent('process:state:changed', { 
        executionId, 
        state: 'running', 
        processInfo 
      });

      console.log(`Started process for execution ${executionId}: PID ${childProcess.pid}`);
      return processInfo;

    } catch (error) {
      processInfo.state = 'failed';
      this.emitProcessEvent('process:state:changed', { 
        executionId, 
        state: 'failed', 
        processInfo 
      });
      
      this.cleanup(executionId);
      throw error;
    }
  }

  /**
   * Kill a process
   */
  async killProcess(executionId: string, signal: 'SIGTERM' | 'SIGKILL' = this.config.killSignal): Promise<boolean> {
    const processInfo = this.processes.get(executionId);
    const childProcess = this.childProcesses.get(executionId);

    if (!processInfo || !childProcess) {
      return false;
    }

    try {
      processInfo.state = 'stopping';
      this.emitProcessEvent('process:state:changed', { 
        executionId, 
        state: 'stopping', 
        processInfo 
      });

      if (childProcess.killed || !childProcess.pid) {
        return false;
      }

      // Send the signal
      const killed = childProcess.kill(signal);
      
      if (killed) {
        // If using SIGTERM, wait a bit and then use SIGKILL if needed
        if (signal === 'SIGTERM') {
          setTimeout(() => {
            if (this.isProcessRunning(executionId)) {
              console.log(`Escalating to SIGKILL for process ${executionId}`);
              childProcess.kill('SIGKILL');
            }
          }, this.config.killTimeoutMs);
        }

        console.log(`Sent ${signal} to process ${executionId} (PID ${childProcess.pid})`);
      }

      return killed;

    } catch (error) {
      console.error(`Error killing process ${executionId}:`, error);
      return false;
    }
  }

  /**
   * Get process information
   */
  getProcessInfo(executionId: string): ProcessInfo | null {
    return this.processes.get(executionId) || null;
  }

  /**
   * Get all running processes
   */
  getRunningProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values()).filter(
      proc => proc.state === 'running' || proc.state === 'starting'
    );
  }

  /**
   * Monitor process resource usage and health
   */
  async monitorProcess(executionId: string): Promise<void> {
    const processInfo = this.processes.get(executionId);
    const childProcess = this.childProcesses.get(executionId);

    if (!processInfo || !childProcess || !childProcess.pid) {
      return;
    }

    // Clear existing monitoring
    const existingInterval = this.monitoringIntervals.get(executionId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const interval = setInterval(() => {
      if (!this.isProcessRunning(executionId)) {
        clearInterval(interval);
        this.monitoringIntervals.delete(executionId);
        return;
      }

      this.updateResourceUsage(executionId);
    }, this.config.monitoringIntervalMs);

    this.monitoringIntervals.set(executionId, interval);
  }

  /**
   * Check if process is currently running
   */
  private isProcessRunning(executionId: string): boolean {
    const processInfo = this.processes.get(executionId);
    const childProcess = this.childProcesses.get(executionId);
    
    return processInfo?.state === 'running' && 
           childProcess && 
           !childProcess.killed && 
           childProcess.pid !== undefined;
  }

  /**
   * Get count of currently running processes
   */
  private getRunningProcessCount(): number {
    return this.getRunningProcesses().length;
  }

  /**
   * Set up event handlers for child process
   */
  private setupProcessHandlers(executionId: string, childProcess: ChildProcess): void {
    const processInfo = this.processes.get(executionId)!;

    childProcess.on('spawn', () => {
      console.log(`Process spawned: ${executionId} (PID ${childProcess.pid})`);
    });

    childProcess.on('exit', (code, signal) => {
      processInfo.exitCode = code || undefined;
      processInfo.signal = signal || undefined;
      processInfo.state = code === 0 ? 'completed' : 'failed';

      this.emitProcessEvent('process:state:changed', { 
        executionId, 
        state: processInfo.state, 
        processInfo 
      });

      console.log(`Process exited: ${executionId} (Code: ${code}, Signal: ${signal})`);
      this.cleanup(executionId);
    });

    childProcess.on('error', (error) => {
      console.error(`Process error for ${executionId}:`, error);
      processInfo.state = 'failed';
      
      this.emitProcessEvent('process:state:changed', { 
        executionId, 
        state: 'failed', 
        processInfo 
      });
      
      this.emit('process:error', { executionId, error });
      this.cleanup(executionId);
    });

    childProcess.on('disconnect', () => {
      console.log(`Process disconnected: ${executionId}`);
    });

    // Handle stdio streams if available
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        this.emit('process:stdout', { executionId, data: data.toString() });
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        this.emit('process:stderr', { executionId, data: data.toString() });
      });
    }
  }

  /**
   * Update resource usage for a process
   */
  private updateResourceUsage(executionId: string): void {
    const processInfo = this.processes.get(executionId);
    const childProcess = this.childProcesses.get(executionId);

    if (!processInfo || !childProcess || !childProcess.pid) {
      return;
    }

    try {
      // Note: Basic resource monitoring - could be enhanced with psutil-like library
      const uptime = Date.now() - processInfo.startTime.getTime();
      
      processInfo.resourceUsage = {
        memoryMB: 0, // Would need process.memoryUsage() or external tool
        cpuPercent: 0, // Would need system-level monitoring
        uptime: uptime
      };

      // Emit resource update event
      this.emit('process:resource:updated', {
        executionId,
        resourceUsage: processInfo.resourceUsage
      });

    } catch (error) {
      console.warn(`Failed to update resource usage for ${executionId}:`, error);
    }
  }

  /**
   * Emit process lifecycle events
   */
  private emitProcessEvent(type: ExecutionEvent['type'], data: any): void {
    this.emit(type, data);
    this.emit('process:event', { type, data });
  }

  /**
   * Clean up process resources
   */
  cleanup(executionId?: string): Promise<void> {
    if (executionId) {
      // Clean up specific process
      const processInfo = this.processes.get(executionId);
      const childProcess = this.childProcesses.get(executionId);
      const interval = this.monitoringIntervals.get(executionId);

      if (interval) {
        clearInterval(interval);
        this.monitoringIntervals.delete(executionId);
      }

      if (childProcess && !childProcess.killed) {
        try {
          childProcess.kill('SIGKILL');
        } catch (error) {
          // Process may already be dead
        }
      }

      this.childProcesses.delete(executionId);
      
      if (processInfo && processInfo.state !== 'completed' && processInfo.state !== 'failed') {
        processInfo.state = 'stopped';
        this.emitProcessEvent('process:state:changed', { 
          executionId, 
          state: 'stopped', 
          processInfo 
        });
      }
    } else {
      // Clean up all processes
      for (const execId of Array.from(this.processes.keys())) {
        this.cleanup(execId);
      }
    }

    return Promise.resolve();
  }

  /**
   * Perform periodic maintenance
   */
  private performMaintenance(): void {
    if (this.shutdownInProgress) return;

    const now = Date.now();
    const processesToCleanup: string[] = [];

    // Find processes that have been completed/failed for a while
    for (const [executionId, processInfo] of Array.from(this.processes.entries())) {
      if (['completed', 'failed', 'stopped'].includes(processInfo.state)) {
        const timeSinceCompletion = now - processInfo.startTime.getTime();
        
        // Clean up processes that completed more than 5 minutes ago
        if (timeSinceCompletion > 5 * 60 * 1000) {
          processesToCleanup.push(executionId);
        }
      }
    }

    // Clean up old processes
    for (const executionId of processesToCleanup) {
      this.processes.delete(executionId);
      console.log(`Cleaned up old process info for execution ${executionId}`);
    }

    // Log statistics
    const stats = this.getStats();
    if (stats.runningProcesses > 0) {
      console.debug(`ProcessManager: ${stats.runningProcesses} running, ${stats.totalProcesses} total`);
    }
  }

  /**
   * Get process manager statistics
   */
  getStats(): {
    totalProcesses: number;
    runningProcesses: number;
    completedProcesses: number;
    failedProcesses: number;
    averageUptime: number;
    memoryUsage: number;
    processByAgent: Record<string, number>;
  } {
    const stats = {
      totalProcesses: this.processes.size,
      runningProcesses: 0,
      completedProcesses: 0,
      failedProcesses: 0,
      averageUptime: 0,
      memoryUsage: 0,
      processByAgent: {} as Record<string, number>
    };

    let totalUptime = 0;
    const now = Date.now();

    for (const processInfo of Array.from(this.processes.values())) {
      // Count by state
      switch (processInfo.state) {
        case 'running':
        case 'starting':
          stats.runningProcesses++;
          break;
        case 'completed':
          stats.completedProcesses++;
          break;
        case 'failed':
          stats.failedProcesses++;
          break;
      }

      // Calculate uptime
      const uptime = now - processInfo.startTime.getTime();
      totalUptime += uptime;

      // Track memory usage
      if (processInfo.resourceUsage) {
        stats.memoryUsage += processInfo.resourceUsage.memoryMB;
      }

      // Count by agent type
      if (!stats.processByAgent[processInfo.agentType]) {
        stats.processByAgent[processInfo.agentType] = 0;
      }
      stats.processByAgent[processInfo.agentType]++;
    }

    stats.averageUptime = stats.totalProcesses > 0 ? totalUptime / stats.totalProcesses : 0;

    return stats;
  }

  /**
   * Graceful shutdown of process manager
   */
  private async gracefulShutdown(): Promise<void> {
    if (this.shutdownInProgress) return;
    
    this.shutdownInProgress = true;
    console.log('ProcessManager graceful shutdown initiated...');

    // Stop accepting new processes by setting max to 0
    this.config.maxConcurrentProcesses = 0;

    // Get all running processes
    const runningProcesses = this.getRunningProcesses();
    
    if (runningProcesses.length > 0) {
      console.log(`Terminating ${runningProcesses.length} running processes...`);
      
      // Send SIGTERM to all processes
      const terminatePromises = runningProcesses.map(proc => 
        this.killProcess(proc.executionId, 'SIGTERM')
      );
      
      await Promise.allSettled(terminatePromises);
      
      // Wait a bit for graceful termination
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Force kill any remaining processes
      const stillRunning = this.getRunningProcesses();
      if (stillRunning.length > 0) {
        console.log(`Force killing ${stillRunning.length} remaining processes...`);
        const killPromises = stillRunning.map(proc => 
          this.killProcess(proc.executionId, 'SIGKILL')
        );
        await Promise.allSettled(killPromises);
      }
    }

    // Clean up all resources
    await this.cleanup();
    
    console.log('ProcessManager shutdown complete');
  }
}

// Export singleton instance
export const processManager = new ProcessManager();