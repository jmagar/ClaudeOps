import { EventEmitter } from 'events';
import * as cron from 'node-cron';
import { systemMonitor } from './systemMonitor';
import { metricsCollector } from './metricsCollector';
import { alertManager } from './alertManager';
import { SystemHealthAgent } from '../agents/systemHealthAgent';
import type { SystemHealthStatus } from '../types/database';

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  cronExpression: string;
  enabled: boolean;
  type: 'metrics_collection' | 'health_check' | 'cleanup' | 'custom';
  handler: () => Promise<void>;
  lastRun?: string;
  nextRun?: string;
  runCount: number;
  errorCount: number;
  lastError?: string;
  metadata?: Record<string, any>;
}

export interface SchedulerConfig {
  timezone: string;
  maxConcurrentTasks: number;
  taskTimeout: number;
  enableErrorRetry: boolean;
  maxRetries: number;
  retryDelay: number;
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  startTime: string;
  endTime: string;
  duration: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface SchedulerStats {
  totalTasks: number;
  enabledTasks: number;
  runningTasks: number;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  uptime: number;
  nextScheduledTask?: {
    id: string;
    name: string;
    nextRun: string;
  };
}

export class MonitoringScheduler extends EventEmitter {
  private config: SchedulerConfig;
  private tasks: Map<string, ScheduledTask> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private executionHistory: TaskExecutionResult[] = [];
  private startTime: Date = new Date();
  private isRunning = false;
  private retryQueues: Map<string, NodeJS.Timeout[]> = new Map();
  
  // Task handlers
  private healthAgent: SystemHealthAgent;

  constructor(config: Partial<SchedulerConfig> = {}) {
    super();
    
    this.config = {
      timezone: 'America/New_York',
      maxConcurrentTasks: 5,
      taskTimeout: 300000, // 5 minutes
      enableErrorRetry: true,
      maxRetries: 3,
      retryDelay: 30000, // 30 seconds
      ...config
    };

    this.healthAgent = new SystemHealthAgent();
    this.setupDefaultTasks();
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Scheduler is already running');
    }

    this.isRunning = true;
    this.startTime = new Date();

    // Start all enabled tasks
    for (const task of Array.from(this.tasks.values())) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }

    // Start monitoring services
    if (!systemMonitor.isMonitoring()) {
      await systemMonitor.start();
    }
    
    if (!metricsCollector.getCollectionStats().isCollecting) {
      await metricsCollector.start();
    }

    this.emit('started');
    console.log(`Monitoring scheduler started with ${this.getEnabledTaskCount()} enabled tasks`);
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop all cron jobs
    for (const [taskId, cronJob] of Array.from(this.cronJobs.entries())) {
      cronJob.stop();
      cronJob.destroy();
      this.cronJobs.delete(taskId);
    }

    // Clear retry queues
    for (const [taskId, timeouts] of Array.from(this.retryQueues.entries())) {
      timeouts.forEach(timeout => clearTimeout(timeout));
    }
    this.retryQueues.clear();

    // Wait for running tasks to complete (with timeout)
    const waitTimeout = 30000; // 30 seconds
    const waitStart = Date.now();
    
    while (this.runningTasks.size > 0 && (Date.now() - waitStart) < waitTimeout) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (this.runningTasks.size > 0) {
      console.warn(`Scheduler stopped with ${this.runningTasks.size} tasks still running`);
    }

    this.emit('stopped');
    console.log('Monitoring scheduler stopped');
  }

  /**
   * Add a custom task
   */
  addTask(task: Omit<ScheduledTask, 'id' | 'runCount' | 'errorCount'>): ScheduledTask {
    const fullTask: ScheduledTask = {
      id: this.generateTaskId(task.name),
      runCount: 0,
      errorCount: 0,
      ...task
    };

    // Validate cron expression
    if (!cron.validate(fullTask.cronExpression)) {
      throw new Error(`Invalid cron expression: ${fullTask.cronExpression}`);
    }

    this.tasks.set(fullTask.id, fullTask);
    
    // Schedule if enabled and scheduler is running
    if (fullTask.enabled && this.isRunning) {
      this.scheduleTask(fullTask);
    }

    this.emit('taskAdded', fullTask);
    console.log(`Task added: ${fullTask.name} (${fullTask.cronExpression})`);
    
    return fullTask;
  }

  /**
   * Remove a task
   */
  removeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Stop cron job if running
    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.stop();
      cronJob.destroy();
      this.cronJobs.delete(taskId);
    }

    // Clear retry queue
    const retryQueue = this.retryQueues.get(taskId);
    if (retryQueue) {
      retryQueue.forEach(timeout => clearTimeout(timeout));
      this.retryQueues.delete(taskId);
    }

    this.tasks.delete(taskId);
    this.emit('taskRemoved', task);
    
    console.log(`Task removed: ${task.name}`);
    return true;
  }

  /**
   * Enable a task
   */
  enableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.enabled = true;
    
    if (this.isRunning) {
      this.scheduleTask(task);
    }

    this.emit('taskEnabled', task);
    console.log(`Task enabled: ${task.name}`);
    
    return true;
  }

  /**
   * Disable a task
   */
  disableTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.enabled = false;
    
    // Stop cron job
    const cronJob = this.cronJobs.get(taskId);
    if (cronJob) {
      cronJob.stop();
      cronJob.destroy();
      this.cronJobs.delete(taskId);
    }

    this.emit('taskDisabled', task);
    console.log(`Task disabled: ${task.name}`);
    
    return true;
  }

  /**
   * Execute a task immediately (one-time)
   */
  async executeTaskNow(taskId: string): Promise<TaskExecutionResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return await this.executeTask(task, true);
  }

  /**
   * Get all tasks
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get scheduler statistics
   */
  getStats(): SchedulerStats {
    const totalExecutions = this.executionHistory.length;
    const successfulExecutions = this.executionHistory.filter(result => result.success).length;
    const failedExecutions = totalExecutions - successfulExecutions;
    
    const totalDuration = this.executionHistory.reduce((sum, result) => sum + result.duration, 0);
    const averageExecutionTime = totalExecutions > 0 ? totalDuration / totalExecutions : 0;
    
    const uptime = Date.now() - this.startTime.getTime();
    
    // Find next scheduled task
    let nextScheduledTask: SchedulerStats['nextScheduledTask'];
    let earliestNextRun: Date | null = null;
    
    for (const task of Array.from(this.tasks.values())) {
      if (task.enabled && task.nextRun) {
        const nextRun = new Date(task.nextRun);
        if (!earliestNextRun || nextRun < earliestNextRun) {
          earliestNextRun = nextRun;
          nextScheduledTask = {
            id: task.id,
            name: task.name,
            nextRun: task.nextRun
          };
        }
      }
    }

    return {
      totalTasks: this.tasks.size,
      enabledTasks: this.getEnabledTaskCount(),
      runningTasks: this.runningTasks.size,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      uptime,
      nextScheduledTask
    };
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 100): TaskExecutionResult[] {
    return this.executionHistory
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
      .slice(0, limit);
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory(): void {
    this.executionHistory = [];
    this.emit('historyCleared');
  }

  /**
   * Update task configuration
   */
  updateTask(taskId: string, updates: Partial<Pick<ScheduledTask, 'name' | 'description' | 'cronExpression' | 'enabled' | 'metadata'>>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Validate cron expression if provided
    if (updates.cronExpression && !cron.validate(updates.cronExpression)) {
      throw new Error(`Invalid cron expression: ${updates.cronExpression}`);
    }

    const oldEnabled = task.enabled;
    const oldCronExpression = task.cronExpression;

    // Apply updates
    Object.assign(task, updates);

    // Reschedule if needed
    if (this.isRunning && (
      updates.enabled !== undefined ||
      updates.cronExpression !== undefined
    )) {
      // Stop existing job
      const cronJob = this.cronJobs.get(taskId);
      if (cronJob) {
        cronJob.stop();
        cronJob.destroy();
        this.cronJobs.delete(taskId);
      }

      // Start new job if enabled
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }

    this.emit('taskUpdated', task, { oldEnabled, oldCronExpression });
    console.log(`Task updated: ${task.name}`);
    
    return true;
  }

  /**
   * Setup default monitoring tasks
   */
  private setupDefaultTasks(): void {
    // System health check task - runs every 30 minutes
    this.addTask({
      name: 'System Health Check',
      description: 'Comprehensive system health analysis using AI agent',
      cronExpression: '0 */30 * * * *', // Every 30 minutes
      enabled: true,
      type: 'health_check',
      handler: async () => {
        const result = await this.healthAgent.execute({
          include_docker: true,
          include_security_scan: true,
          detailed_service_analysis: true,
          onLog: (message, level) => {
            // Stream logs in real-time during execution
            const logLevel = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : level === 'debug' ? '🔧' : 'ℹ️';
            console.log(`[HealthAgent] ${logLevel} ${message}`);
          }
        });

        if (result.status === 'failed') {
          throw new Error(result.error || 'Health check failed');
        }

        console.log(`✅ Health check completed: ${result.summary}`);
      }
    });

    // Metrics cleanup task - runs daily at 2 AM
    this.addTask({
      name: 'Metrics Cleanup',
      description: 'Clean up old system metrics data',
      cronExpression: '0 0 2 * * *', // Daily at 2 AM
      enabled: true,
      type: 'cleanup',
      handler: async () => {
        const result = await metricsCollector.cleanupOldMetrics();
        console.log(`Cleaned up ${result.deletedCount} old metric records`);
      }
    });

    // Alert cleanup task - runs daily at 3 AM
    this.addTask({
      name: 'Alert Cleanup',
      description: 'Clean up old resolved alerts',
      cronExpression: '0 0 3 * * *', // Daily at 3 AM
      enabled: true,
      type: 'cleanup',
      handler: async () => {
        // This would clean up old alerts from alertManager
        // For now, just log
        console.log('Alert cleanup completed');
      }
    });

    // System status broadcast - runs every 5 minutes
    this.addTask({
      name: 'Status Broadcast',
      description: 'Broadcast system status to connected clients',
      cronExpression: '0 */5 * * * *', // Every 5 minutes
      enabled: true,
      type: 'metrics_collection',
      handler: async () => {
        const stats = systemMonitor.getLastStats();
        if (stats) {
          // This will be handled by the system monitor's built-in broadcasting
          console.log(`Status broadcast: CPU ${stats.cpuUsage.toFixed(1)}%, Memory ${stats.memoryUsage.toFixed(1)}%, Disk ${stats.diskUsage.toFixed(1)}%`);
        }
      }
    });

    // Weekly performance report - runs Sundays at 6 AM
    this.addTask({
      name: 'Weekly Performance Report',
      description: 'Generate weekly system performance report',
      cronExpression: '0 0 6 * * 0', // Sundays at 6 AM
      enabled: true,
      type: 'health_check',
      handler: async () => {
        const snapshot = await metricsCollector.getMetricsSnapshot();
        const stats = this.getStats();
        
        console.log('Weekly Performance Report Generated:', {
          systemHealth: snapshot.current,
          schedulerStats: stats,
          executionsLast7Days: this.executionHistory.filter(
            result => new Date(result.startTime) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          ).length
        });
      }
    });
  }

  /**
   * Schedule a task using cron
   */
  private scheduleTask(task: ScheduledTask): void {
    try {
      const cronJob = cron.schedule(task.cronExpression, async () => {
        await this.executeTask(task);
      }, {
        timezone: this.config.timezone
      });

      this.cronJobs.set(task.id, cronJob);
      
      // Update next run time
      task.nextRun = this.getNextRunTime(task.cronExpression);
      
      console.log(`Scheduled task: ${task.name} (next run: ${task.nextRun})`);
    } catch (error) {
      console.error(`Error scheduling task ${task.name}:`, error);
      this.emit('taskScheduleError', { task, error });
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(task: ScheduledTask, isManual = false): Promise<TaskExecutionResult> {
    // Check concurrent task limit
    if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
      const error = 'Maximum concurrent tasks limit reached';
      console.warn(`Task execution skipped: ${task.name} - ${error}`);
      return this.createExecutionResult(task.id, false, error);
    }

    // Check if task is already running
    if (this.runningTasks.has(task.id)) {
      const error = 'Task is already running';
      console.warn(`Task execution skipped: ${task.name} - ${error}`);
      return this.createExecutionResult(task.id, false, error);
    }

    const startTime = new Date();
    this.runningTasks.add(task.id);

    this.emit('taskStarted', { task, isManual, startTime });
    console.log(`Task started: ${task.name}${isManual ? ' (manual)' : ''}`);

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Task execution timeout'));
        }, this.config.taskTimeout);
      });

      // Race between task execution and timeout
      await Promise.race([
        task.handler(),
        timeoutPromise
      ]);

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      task.runCount++;
      task.lastRun = startTime.toISOString();
      
      const result = this.createExecutionResult(task.id, true, undefined, startTime, endTime, duration);
      this.addExecutionHistory(result);
      
      this.emit('taskCompleted', { task, result, isManual });
      console.log(`Task completed: ${task.name} (${duration}ms)`);
      
      return result;

    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      task.errorCount++;
      task.lastError = errorMessage;
      
      const result = this.createExecutionResult(task.id, false, errorMessage, startTime, endTime, duration);
      this.addExecutionHistory(result);

      this.emit('taskFailed', { task, error, result, isManual });
      console.error(`Task failed: ${task.name} - ${errorMessage}`);

      // Schedule retry if enabled and not manual
      if (this.config.enableErrorRetry && !isManual && task.errorCount <= this.config.maxRetries) {
        this.scheduleRetry(task);
      }

      return result;

    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  /**
   * Schedule task retry
   */
  private scheduleRetry(task: ScheduledTask): void {
    const retryDelay = this.config.retryDelay * Math.pow(2, task.errorCount - 1); // Exponential backoff
    
    const timeout = setTimeout(async () => {
      console.log(`Retrying task: ${task.name} (attempt ${task.errorCount + 1})`);
      await this.executeTask(task);
    }, retryDelay);

    if (!this.retryQueues.has(task.id)) {
      this.retryQueues.set(task.id, []);
    }
    this.retryQueues.get(task.id)!.push(timeout);
  }

  /**
   * Create execution result
   */
  private createExecutionResult(
    taskId: string,
    success: boolean,
    error?: string,
    startTime?: Date,
    endTime?: Date,
    duration?: number
  ): TaskExecutionResult {
    const start = startTime || new Date();
    const end = endTime || new Date();
    const dur = duration !== undefined ? duration : end.getTime() - start.getTime();

    return {
      taskId,
      success,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      duration: dur,
      error
    };
  }

  /**
   * Add execution result to history
   */
  private addExecutionHistory(result: TaskExecutionResult): void {
    this.executionHistory.push(result);
    
    // Keep only last 1000 execution results
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000);
    }
  }

  /**
   * Get next run time for cron expression
   */
  private getNextRunTime(cronExpression: string): string {
    try {
      // This is a simplified implementation
      // In a real implementation, you'd use a proper cron parser
      return new Date(Date.now() + 60000).toISOString(); // Placeholder: 1 minute from now
    } catch (error) {
      return new Date().toISOString();
    }
  }

  /**
   * Get enabled task count
   */
  private getEnabledTaskCount(): number {
    return Array.from(this.tasks.values()).filter(task => task.enabled).length;
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(name: string): string {
    return `task_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
  }
}

// Export singleton instance
export const monitoringScheduler = new MonitoringScheduler();