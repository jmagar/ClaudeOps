import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { createId } from '@paralleldrive/cuid2';

import type {
  IProcessPool,
  ProcessPoolConfig,
  ProcessPoolWorker,
  ProcessPoolHealth,
  ProcessPoolExhaustionError,
  FrameworkError
} from '../types/framework';

/**
 * Process Pool - Manages a pool of reusable worker processes for agent execution
 * Provides process lifecycle management, health monitoring, and scaling
 */
export class ProcessPool extends EventEmitter implements IProcessPool {
  private config: Required<ProcessPoolConfig>;
  private workers: Map<string, ProcessPoolWorkerState> = new Map();
  private availableWorkers: string[] = [];
  private busyWorkers: string[] = [];
  private healthCheckInterval?: NodeJS.Timeout;
  private maintenanceInterval?: NodeJS.Timeout;
  private isShuttingDown: boolean = false;
  private health: ProcessPoolHealth;

  constructor(config: Partial<ProcessPoolConfig> = {}) {
    super();

    this.config = {
      minProcesses: config.minProcesses ?? 2,
      maxProcesses: config.maxProcesses ?? 10,
      processIdleTimeoutMs: config.processIdleTimeoutMs ?? 300000, // 5 minutes
      processStartupTimeoutMs: config.processStartupTimeoutMs ?? 30000, // 30 seconds
      processShutdownTimeoutMs: config.processShutdownTimeoutMs ?? 10000, // 10 seconds
      processRecycleThreshold: config.processRecycleThreshold ?? 100,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 10000, // 10 seconds
      enableProcessReuse: config.enableProcessReuse ?? true,
      processEnvironment: config.processEnvironment ?? {}
    };

    this.initializeHealth();
    this.startHealthChecking();
    this.startMaintenance();
    this.initializePool();
  }

  /**
   * Get an available worker from the pool
   */
  async getWorker(): Promise<ProcessPoolWorker> {
    if (this.isShuttingDown) {
      throw new FrameworkError('Process pool is shutting down', 'ProcessPool', 'getWorker');
    }

    // Try to get an available worker
    let workerId = this.availableWorkers.shift();
    
    if (workerId) {
      return await this.assignWorker(workerId);
    }

    // No available worker, try to create a new one
    if (this.workers.size < this.config.maxProcesses) {
      workerId = await this.createWorker();
      return await this.assignWorker(workerId);
    }

    // Pool exhausted, wait or fail
    if (this.config.maxProcesses <= 0) {
      throw new ProcessPoolExhaustionError(
        'Process pool exhausted and cannot create new workers',
        this.workers.size,
        this.config.maxProcesses
      );
    }

    // Wait for a worker to become available (with timeout)
    return await this.waitForAvailableWorker();
  }

  /**
   * Release a worker back to the pool
   */
  async releaseWorker(workerId: string): Promise<void> {
    const workerState = this.workers.get(workerId);
    
    if (!workerState || workerState.worker.state !== 'busy') {
      console.warn(`Worker ${workerId} is not busy or doesn't exist`);
      return;
    }

    // Update worker state
    workerState.worker.state = 'idle';
    workerState.worker.lastUsed = new Date();
    workerState.worker.currentExecutionId = undefined;

    // Move from busy to available
    const busyIndex = this.busyWorkers.indexOf(workerId);
    if (busyIndex !== -1) {
      this.busyWorkers.splice(busyIndex, 1);
    }
    
    this.availableWorkers.push(workerId);

    // Update health
    this.updateHealth();

    // Emit event
    this.emit('worker:released', {
      workerId,
      worker: { ...workerState.worker }
    });

    await this.logPool(`Released worker ${workerId}`, 'info');

    // Check if worker should be recycled
    if (workerState.worker.executionCount >= this.config.processRecycleThreshold) {
      await this.recycleWorker(workerId);
    }
  }

  /**
   * Get list of available workers
   */
  getAvailableWorkers(): ProcessPoolWorker[] {
    return this.availableWorkers
      .map(id => this.workers.get(id)?.worker)
      .filter((worker): worker is ProcessPoolWorker => worker !== undefined);
  }

  /**
   * Get list of busy workers
   */
  getBusyWorkers(): ProcessPoolWorker[] {
    return this.busyWorkers
      .map(id => this.workers.get(id)?.worker)
      .filter((worker): worker is ProcessPoolWorker => worker !== undefined);
  }

  /**
   * Get total worker count
   */
  getWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Get health status
   */
  getHealthStatus(): ProcessPoolHealth {
    return { ...this.health };
  }

  /**
   * Scale up the pool by adding workers
   */
  async scaleUp(count: number = 1): Promise<void> {
    const targetSize = Math.min(this.workers.size + count, this.config.maxProcesses);
    const workersToAdd = targetSize - this.workers.size;

    if (workersToAdd <= 0) {
      return;
    }

    const createPromises = Array(workersToAdd).fill(0).map(() => this.createWorker());
    
    try {
      await Promise.all(createPromises);
      this.emit('pool:scaled:up', {
        added: workersToAdd,
        totalWorkers: this.workers.size
      });
    } catch (error) {
      console.error('Failed to scale up process pool:', error);
    }
  }

  /**
   * Scale down the pool by removing idle workers
   */
  async scaleDown(count: number = 1): Promise<void> {
    const targetSize = Math.max(this.workers.size - count, this.config.minProcesses);
    const workersToRemove = this.workers.size - targetSize;

    if (workersToRemove <= 0) {
      return;
    }

    // Remove idle workers first
    const idleWorkers = this.availableWorkers.slice(0, workersToRemove);
    const shutdownPromises = idleWorkers.map(workerId => this.shutdownWorker(workerId));

    try {
      await Promise.all(shutdownPromises);
      this.emit('pool:scaled:down', {
        removed: idleWorkers.length,
        totalWorkers: this.workers.size
      });
    } catch (error) {
      console.error('Failed to scale down process pool:', error);
    }
  }

  /**
   * Recycle a worker (shutdown and create new one)
   */
  async recycleWorker(workerId: string): Promise<void> {
    const workerState = this.workers.get(workerId);
    
    if (!workerState) {
      return;
    }

    const executionCount = workerState.worker.executionCount;

    // Shutdown old worker
    await this.shutdownWorker(workerId);

    // Create new worker if within limits
    if (this.workers.size < this.config.maxProcesses && !this.isShuttingDown) {
      try {
        await this.createWorker();
      } catch (error) {
        console.error('Failed to create replacement worker:', error);
      }
    }

    this.emit('worker:recycled', {
      workerId,
      executionCount
    });

    await this.logPool(`Recycled worker ${workerId} after ${executionCount} executions`, 'info');
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    console.log('ProcessPool cleanup initiated...');
    
    this.isShuttingDown = true;
    this.stopHealthChecking();
    this.stopMaintenance();

    // Shutdown all workers
    const shutdownPromises = Array.from(this.workers.keys()).map(
      workerId => this.shutdownWorker(workerId)
    );

    await Promise.allSettled(shutdownPromises);

    // Remove all listeners
    this.removeAllListeners();

    console.log('ProcessPool cleanup completed');
  }

  // Private methods

  private async initializePool(): Promise<void> {
    // Create minimum number of workers
    const createPromises = Array(this.config.minProcesses).fill(0).map(() => this.createWorker());
    
    try {
      await Promise.all(createPromises);
      await this.logPool(`Initialized pool with ${this.config.minProcesses} workers`, 'info');
    } catch (error) {
      console.error('Failed to initialize process pool:', error);
    }
  }

  private async createWorker(): Promise<string> {
    const workerId = createId();
    
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeoutHandle = setTimeout(() => {
        reject(new FrameworkError(
          `Worker startup timeout after ${this.config.processStartupTimeoutMs}ms`,
          'ProcessPool',
          'createWorker'
        ));
      }, this.config.processStartupTimeoutMs);

      try {
        // Spawn Node.js process for worker
        const childProcess = spawn('node', ['-e', this.getWorkerScript()], {
          cwd: process.cwd(),
          env: { ...process.env, ...this.config.processEnvironment },
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          detached: false
        });

        if (!childProcess.pid) {
          clearTimeout(timeoutHandle);
          reject(new FrameworkError('Failed to spawn worker process', 'ProcessPool', 'createWorker'));
          return;
        }

        // Create worker state
        const worker: ProcessPoolWorker = {
          id: workerId,
          pid: childProcess.pid,
          state: 'starting',
          startTime: new Date(),
          lastUsed: new Date(),
          executionCount: 0,
          memoryUsage: 0,
          cpuUsage: 0,
          healthStatus: 'healthy'
        };

        const workerState: ProcessPoolWorkerState = {
          worker,
          process: childProcess,
          startTime: Date.now()
        };

        this.workers.set(workerId, workerState);

        // Setup process handlers
        this.setupWorkerHandlers(workerId, childProcess);

        // Wait for worker to be ready
        childProcess.once('message', (message: any) => {
          if (message.type === 'ready') {
            clearTimeout(timeoutHandle);
            
            worker.state = 'idle';
            this.availableWorkers.push(workerId);
            this.updateHealth();

            this.emit('worker:started', {
              workerId,
              pid: childProcess.pid,
              startupTime: Date.now() - startTime
            });

            resolve(workerId);
          }
        });

      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  private async assignWorker(workerId: string): Promise<ProcessPoolWorker> {
    const workerState = this.workers.get(workerId);
    
    if (!workerState) {
      throw new FrameworkError(`Worker ${workerId} not found`, 'ProcessPool', 'assignWorker');
    }

    // Update worker state
    workerState.worker.state = 'busy';
    workerState.worker.lastUsed = new Date();
    workerState.worker.executionCount++;

    // Move from available to busy
    const availableIndex = this.availableWorkers.indexOf(workerId);
    if (availableIndex !== -1) {
      this.availableWorkers.splice(availableIndex, 1);
    }
    
    this.busyWorkers.push(workerId);

    // Update health
    this.updateHealth();

    // Emit event
    this.emit('worker:assigned', {
      workerId,
      worker: { ...workerState.worker }
    });

    return { ...workerState.worker };
  }

  private async waitForAvailableWorker(): Promise<ProcessPoolWorker> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new ProcessPoolExhaustionError(
          'Timeout waiting for available worker',
          this.workers.size,
          this.config.maxProcesses
        ));
      }, 30000); // 30 second timeout

      const checkForWorker = () => {
        const workerId = this.availableWorkers.shift();
        if (workerId) {
          clearTimeout(timeout);
          this.assignWorker(workerId).then(resolve).catch(reject);
        } else {
          setTimeout(checkForWorker, 100); // Check every 100ms
        }
      };

      checkForWorker();
    });
  }

  private async shutdownWorker(workerId: string): Promise<void> {
    const workerState = this.workers.get(workerId);
    
    if (!workerState) {
      return;
    }

    // Remove from available/busy lists
    const availableIndex = this.availableWorkers.indexOf(workerId);
    if (availableIndex !== -1) {
      this.availableWorkers.splice(availableIndex, 1);
    }

    const busyIndex = this.busyWorkers.indexOf(workerId);
    if (busyIndex !== -1) {
      this.busyWorkers.splice(busyIndex, 1);
    }

    // Update worker state
    workerState.worker.state = 'stopping';

    try {
      // Send shutdown signal to worker
      workerState.process.send?.({ type: 'shutdown' });

      // Wait for graceful shutdown or force kill
      await new Promise<void>((resolve) => {
        const shutdownTimeout = setTimeout(() => {
          if (!workerState.process.killed) {
            workerState.process.kill('SIGKILL');
          }
          resolve();
        }, this.config.processShutdownTimeoutMs);

        workerState.process.once('exit', () => {
          clearTimeout(shutdownTimeout);
          resolve();
        });
      });

    } catch (error) {
      console.error(`Error shutting down worker ${workerId}:`, error);
      
      // Force kill if still alive
      if (!workerState.process.killed) {
        workerState.process.kill('SIGKILL');
      }
    }

    // Remove from workers map
    this.workers.delete(workerId);
    this.updateHealth();

    this.emit('worker:stopped', {
      workerId,
      reason: this.isShuttingDown ? 'shutdown' : 'maintenance'
    });
  }

  private setupWorkerHandlers(workerId: string, childProcess: ChildProcess): void {
    const workerState = this.workers.get(workerId);
    if (!workerState) return;

    childProcess.on('exit', (code, signal) => {
      workerState.worker.healthStatus = 'error';
      this.updateHealth();

      this.emit('worker:error', {
        workerId,
        error: `Process exited with code ${code}, signal ${signal}`,
        pid: childProcess.pid
      });

      // Clean up
      this.workers.delete(workerId);
      
      // Remove from lists
      const availableIndex = this.availableWorkers.indexOf(workerId);
      if (availableIndex !== -1) {
        this.availableWorkers.splice(availableIndex, 1);
      }
      
      const busyIndex = this.busyWorkers.indexOf(workerId);
      if (busyIndex !== -1) {
        this.busyWorkers.splice(busyIndex, 1);
      }

      // Create replacement worker if needed
      if (!this.isShuttingDown && this.workers.size < this.config.minProcesses) {
        this.createWorker().catch(error => {
          console.error('Failed to create replacement worker:', error);
        });
      }
    });

    childProcess.on('error', (error) => {
      workerState.worker.healthStatus = 'error';
      this.updateHealth();

      this.emit('worker:error', {
        workerId,
        error: error.message,
        pid: childProcess.pid
      });
    });

    // Handle worker messages
    childProcess.on('message', (message: any) => {
      if (message.type === 'heartbeat') {
        workerState.worker.lastUsed = new Date();
        workerState.worker.memoryUsage = message.memoryUsage || 0;
        workerState.worker.cpuUsage = message.cpuUsage || 0;
      }
    });

    // Handle stdio
    childProcess.stdout?.on('data', (data) => {
      // Log worker output if needed
    });

    childProcess.stderr?.on('data', (data) => {
      console.warn(`Worker ${workerId} stderr:`, data.toString());
    });
  }

  private getWorkerScript(): string {
    return `
      // Simple worker process that can be extended for specific tasks
      let isShuttingDown = false;
      
      // Send ready signal
      process.send({ type: 'ready' });
      
      // Send periodic heartbeat
      const heartbeatInterval = setInterval(() => {
        if (!isShuttingDown) {
          const memUsage = process.memoryUsage();
          process.send({
            type: 'heartbeat',
            memoryUsage: Math.floor(memUsage.rss / (1024 * 1024)), // MB
            cpuUsage: process.cpuUsage().user / 1000 // Convert to ms
          });
        }
      }, 5000);
      
      // Handle shutdown
      process.on('message', (message) => {
        if (message.type === 'shutdown') {
          isShuttingDown = true;
          clearInterval(heartbeatInterval);
          process.exit(0);
        }
      });
      
      // Keep process alive
      setInterval(() => {
        if (isShuttingDown) process.exit(0);
      }, 1000);
    `;
  }

  private initializeHealth(): void {
    this.health = {
      status: 'healthy',
      activeWorkers: 0,
      idleWorkers: 0,
      errorWorkers: 0,
      totalProcessedTasks: 0,
      averageTaskTime: 0,
      memoryPressure: 0,
      cpuPressure: 0,
      errors: []
    };
  }

  private updateHealth(): void {
    const workers = Array.from(this.workers.values());
    
    this.health.activeWorkers = this.busyWorkers.length;
    this.health.idleWorkers = this.availableWorkers.length;
    this.health.errorWorkers = workers.filter(w => w.worker.healthStatus === 'error').length;
    
    // Calculate totals
    this.health.totalProcessedTasks = workers.reduce((sum, w) => sum + w.worker.executionCount, 0);
    
    // Calculate memory and CPU pressure
    const totalMemory = workers.reduce((sum, w) => sum + w.worker.memoryUsage, 0);
    const totalCpu = workers.reduce((sum, w) => sum + w.worker.cpuUsage, 0);
    
    this.health.memoryPressure = workers.length > 0 ? totalMemory / workers.length : 0;
    this.health.cpuPressure = workers.length > 0 ? totalCpu / workers.length : 0;

    // Determine overall health status
    const errorRate = workers.length > 0 ? this.health.errorWorkers / workers.length : 0;
    
    if (errorRate > 0.5 || this.health.memoryPressure > 1000 || this.health.cpuPressure > 80) {
      this.health.status = 'critical';
    } else if (errorRate > 0.2 || this.health.memoryPressure > 500 || this.health.cpuPressure > 60) {
      this.health.status = 'degraded';
    } else {
      this.health.status = 'healthy';
    }
  }

  private startHealthChecking(): void {
    this.healthCheckInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.performHealthCheck();
      }
    }, this.config.healthCheckIntervalMs);
  }

  private stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  private startMaintenance(): void {
    this.maintenanceInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.performMaintenance();
      }
    }, 60000); // Every minute
  }

  private stopMaintenance(): void {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = undefined;
    }
  }

  private performHealthCheck(): void {
    this.updateHealth();

    // Emit health status
    this.emit('pool:health', this.health);

    // Check for idle timeout
    const now = Date.now();
    const idleWorkers = this.availableWorkers.filter(workerId => {
      const workerState = this.workers.get(workerId);
      if (!workerState) return false;
      
      const idleTime = now - workerState.worker.lastUsed.getTime();
      return idleTime > this.config.processIdleTimeoutMs;
    });

    // Shutdown idle workers (but keep minimum)
    if (idleWorkers.length > 0 && this.workers.size > this.config.minProcesses) {
      const toShutdown = Math.min(idleWorkers.length, this.workers.size - this.config.minProcesses);
      idleWorkers.slice(0, toShutdown).forEach(workerId => {
        this.shutdownWorker(workerId).catch(error => {
          console.error(`Failed to shutdown idle worker ${workerId}:`, error);
        });
      });
    }
  }

  private performMaintenance(): void {
    // Remove old error entries
    const maxErrors = 10;
    if (this.health.errors.length > maxErrors) {
      this.health.errors = this.health.errors.slice(-maxErrors);
    }

    // Log pool statistics
    const stats = {
      totalWorkers: this.workers.size,
      availableWorkers: this.availableWorkers.length,
      busyWorkers: this.busyWorkers.length,
      healthStatus: this.health.status
    };

    this.emit('pool:stats', stats);
  }

  private async logPool(message: string, level: 'info' | 'warn' | 'error'): Promise<void> {
    // In a real implementation, this would log to the execution tracking system
    console.log(`[ProcessPool] ${level.toUpperCase()}: ${message}`);
  }
}

// Supporting interface
interface ProcessPoolWorkerState {
  worker: ProcessPoolWorker;
  process: ChildProcess;
  startTime: number;
}

// Export singleton instance
export const processPool = new ProcessPool();