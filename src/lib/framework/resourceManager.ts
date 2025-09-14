import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { createId } from '@paralleldrive/cuid2';
import * as os from 'os';

import type {
  IResourceManager,
  ResourceAllocation,
  ResourceAllocationRequest,
  ResourceLimits,
  SystemResources,
  ResourceMetrics,
  ResourceAllocationError,
  FrameworkError
} from '../types/framework';

/**
 * Resource Manager - Handles resource allocation and monitoring
 * Manages CPU, memory, disk space, and execution limits
 */
export class ResourceManager extends EventEmitter implements IResourceManager {
  private allocations: Map<string, ResourceAllocation> = new Map();
  private resourceLimits: ResourceLimits;
  private monitoringInterval?: NodeJS.Timeout;
  private systemResources: SystemResources;
  private metrics: ResourceMetrics;
  private isShuttingDown: boolean = false;

  constructor(initialLimits?: Partial<ResourceLimits>) {
    super();

    // Set default resource limits
    this.resourceLimits = {
      maxCpuCores: initialLimits?.maxCpuCores ?? Math.max(1, os.cpus().length - 1),
      maxMemoryMB: initialLimits?.maxMemoryMB ?? Math.floor(os.totalmem() / (1024 * 1024) * 0.8), // 80% of system memory
      maxDiskSpaceMB: initialLimits?.maxDiskSpaceMB ?? 10240, // 10GB default
      maxConcurrentExecutions: initialLimits?.maxConcurrentExecutions ?? 10,
      maxExecutionTimeMs: initialLimits?.maxExecutionTimeMs ?? 600000, // 10 minutes
      maxCostUsd: initialLimits?.maxCostUsd ?? 1.0
    };

    this.initializeMetrics();
    this.startMonitoring();
  }

  /**
   * Allocate resources for an execution
   */
  async allocateResources(request: ResourceAllocationRequest): Promise<ResourceAllocation> {
    if (this.isShuttingDown) {
      throw new FrameworkError('Resource manager is shutting down', 'ResourceManager', 'allocateResources');
    }

    // Validate request
    this.validateAllocationRequest(request);

    // Check if resources are available
    const canAllocate = await this.checkResourceAvailability(request);
    if (!canAllocate) {
      throw new ResourceAllocationError(
        'Insufficient resources available',
        request
      );
    }

    // Create allocation
    const allocation: ResourceAllocation = {
      executionId: request.executionId,
      cpuCores: request.estimatedCpuCores,
      memoryMB: request.estimatedMemoryMB,
      diskSpaceMB: 100, // Default small amount for logs/temp files
      priority: request.priority,
      reservedUntil: new Date(Date.now() + request.estimatedDurationMs)
    };

    // Apply resource optimization
    this.optimizeAllocation(allocation, request);

    // Store allocation
    this.allocations.set(request.executionId, allocation);

    // Update metrics
    this.updateMetricsOnAllocation(allocation);

    // Emit event
    this.emit('resource:allocated', {
      executionId: request.executionId,
      allocation,
      remainingResources: await this.getAvailableResources()
    });

    await this.logResource(`Allocated resources for ${request.executionId}: ${allocation.cpuCores} CPU cores, ${allocation.memoryMB}MB memory`, 'info');

    return allocation;
  }

  /**
   * Release resources for an execution
   */
  async releaseResources(executionId: string): Promise<void> {
    const allocation = this.allocations.get(executionId);
    
    if (!allocation) {
      console.warn(`No allocation found for execution ${executionId}`);
      return;
    }

    // Remove allocation
    this.allocations.delete(executionId);

    // Update metrics
    this.updateMetricsOnRelease(allocation);

    // Emit event
    this.emit('resource:released', {
      executionId,
      allocation,
      remainingResources: await this.getAvailableResources()
    });

    await this.logResource(`Released resources for ${executionId}`, 'info');

    // Trigger optimization if needed
    await this.optimizeResourceAllocation();
  }

  /**
   * Get current system resources
   */
  async getSystemResources(): Promise<SystemResources> {
    await this.updateSystemResources();
    return { ...this.systemResources };
  }

  /**
   * Get all current resource allocations
   */
  getResourceAllocations(): ResourceAllocation[] {
    return Array.from(this.allocations.values());
  }

  /**
   * Set resource limits
   */
  setResourceLimits(limits: Partial<ResourceLimits>): void {
    const previousLimits = { ...this.resourceLimits };
    Object.assign(this.resourceLimits, limits);

    this.emit('limits:updated', {
      previousLimits,
      newLimits: this.resourceLimits
    });

    this.logResource(`Resource limits updated`, 'info');

    // Check if current allocations exceed new limits
    this.validateCurrentAllocations();
  }

  /**
   * Get current resource limits
   */
  getResourceLimits(): ResourceLimits {
    return { ...this.resourceLimits };
  }

  /**
   * Check if resources are available for a request
   */
  async checkResourceAvailability(request: ResourceAllocationRequest): Promise<boolean> {
    const available = await this.getAvailableResources();
    
    // Check CPU availability
    if (request.estimatedCpuCores > available.availableCpuCores) {
      return false;
    }

    // Check memory availability
    if (request.estimatedMemoryMB > available.availableMemoryMB) {
      return false;
    }

    // Check concurrent execution limit
    if (this.allocations.size >= this.resourceLimits.maxConcurrentExecutions) {
      return false;
    }

    // Check system load
    if (available.cpuUsagePercent > 90 || available.memoryUsagePercent > 90) {
      return false;
    }

    return true;
  }

  /**
   * Optimize resource allocation across all executions
   */
  async optimizeResourceAllocation(): Promise<void> {
    const totalAllocations = this.allocations.size;
    if (totalAllocations === 0) {
      return;
    }

    const systemResources = await this.getSystemResources();
    
    // Calculate optimal distribution
    const allocations = Array.from(this.allocations.values());
    
    // Sort by priority
    allocations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Redistribute resources based on priority and availability
    let availableCpu = systemResources.availableCpuCores;
    let availableMemory = systemResources.availableMemoryMB;

    for (const allocation of allocations) {
      // Ensure high priority executions get preferred resources
      if (allocation.priority === 'critical' || allocation.priority === 'high') {
        // Give them up to 25% more resources if available
        const bonusCpu = Math.min(allocation.cpuCores * 0.25, availableCpu * 0.1);
        const bonusMemory = Math.min(allocation.memoryMB * 0.25, availableMemory * 0.1);
        
        allocation.cpuCores += bonusCpu;
        allocation.memoryMB += bonusMemory;
        
        availableCpu -= bonusCpu;
        availableMemory -= bonusMemory;
      }
    }

    this.emit('resources:optimized', {
      totalAllocations,
      optimizedAllocations: allocations.length
    });

    await this.logResource('Resource allocation optimized', 'info');
  }

  /**
   * Get resource metrics
   */
  getResourceMetrics(): ResourceMetrics {
    return { ...this.metrics };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    console.log('ResourceManager cleanup initiated...');
    
    this.isShuttingDown = true;
    this.stopMonitoring();

    // Release all allocations
    const executionIds = Array.from(this.allocations.keys());
    for (const executionId of executionIds) {
      await this.releaseResources(executionId);
    }

    // Remove all listeners
    this.removeAllListeners();

    console.log('ResourceManager cleanup completed');
  }

  // Private methods

  private initializeMetrics(): void {
    this.metrics = {
      currentAllocations: 0,
      totalAllocatedCpu: 0,
      totalAllocatedMemory: 0,
      allocationEfficiency: 0,
      resourceFragmentation: 0,
      averageAllocationTime: 0,
      peakResourceUsage: {
        cpu: 0,
        memory: 0,
        timestamp: new Date()
      }
    };

    // Initialize system resources
    this.systemResources = {
      totalCpuCores: os.cpus().length,
      availableCpuCores: os.cpus().length,
      totalMemoryMB: Math.floor(os.totalmem() / (1024 * 1024)),
      availableMemoryMB: Math.floor(os.freemem() / (1024 * 1024)),
      totalDiskSpaceMB: 100000, // Would need actual disk space check
      availableDiskSpaceMB: 80000, // Would need actual disk space check
      cpuUsagePercent: 0,
      memoryUsagePercent: 0,
      diskUsagePercent: 0,
      networkUsageMbps: 0,
      loadAverage: os.loadavg()
    };
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.updateSystemResources();
        this.updateMetrics();
        this.checkResourcePressure();
      }
    }, 5000); // Update every 5 seconds
  }

  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  private async updateSystemResources(): Promise<void> {
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;

      this.systemResources = {
        ...this.systemResources,
        totalMemoryMB: Math.floor(totalMemory / (1024 * 1024)),
        availableMemoryMB: Math.floor(freeMemory / (1024 * 1024)),
        cpuUsagePercent: this.calculateCpuUsage(),
        memoryUsagePercent: (usedMemory / totalMemory) * 100,
        loadAverage: os.loadavg()
      };

      // Subtract allocated resources
      const totalAllocatedCpu = this.getTotalAllocatedCpu();
      const totalAllocatedMemory = this.getTotalAllocatedMemory();

      this.systemResources.availableCpuCores = Math.max(0, 
        this.resourceLimits.maxCpuCores - totalAllocatedCpu
      );
      
      this.systemResources.availableMemoryMB = Math.max(0,
        Math.min(this.systemResources.availableMemoryMB, this.resourceLimits.maxMemoryMB - totalAllocatedMemory)
      );

    } catch (error) {
      console.error('Failed to update system resources:', error);
    }
  }

  private calculateCpuUsage(): number {
    const loadAvg = os.loadavg()[0]; // 1-minute load average
    const cpuCount = os.cpus().length;
    return Math.min(100, (loadAvg / cpuCount) * 100);
  }

  private updateMetrics(): void {
    this.metrics.currentAllocations = this.allocations.size;
    this.metrics.totalAllocatedCpu = this.getTotalAllocatedCpu();
    this.metrics.totalAllocatedMemory = this.getTotalAllocatedMemory();

    // Calculate efficiency (how much of allocated resources are being used)
    const systemUsage = this.systemResources.cpuUsagePercent + this.systemResources.memoryUsagePercent;
    const allocatedUsage = this.metrics.totalAllocatedCpu + this.metrics.totalAllocatedMemory;
    this.metrics.allocationEfficiency = allocatedUsage > 0 ? (systemUsage / allocatedUsage) * 100 : 0;

    // Calculate fragmentation (unused resources in small chunks)
    this.metrics.resourceFragmentation = this.calculateFragmentation();

    // Update peak usage
    const currentCpuUsage = this.systemResources.cpuUsagePercent;
    const currentMemoryUsage = this.systemResources.memoryUsagePercent;

    if (currentCpuUsage > this.metrics.peakResourceUsage.cpu) {
      this.metrics.peakResourceUsage.cpu = currentCpuUsage;
      this.metrics.peakResourceUsage.timestamp = new Date();
    }

    if (currentMemoryUsage > this.metrics.peakResourceUsage.memory) {
      this.metrics.peakResourceUsage.memory = currentMemoryUsage;
      this.metrics.peakResourceUsage.timestamp = new Date();
    }
  }

  private calculateFragmentation(): number {
    // Simple fragmentation metric: percentage of wasted space due to allocation overhead
    const totalSystemCpu = this.systemResources.totalCpuCores;
    const totalSystemMemory = this.systemResources.totalMemoryMB;
    const allocatedCpu = this.metrics.totalAllocatedCpu;
    const allocatedMemory = this.metrics.totalAllocatedMemory;
    const usedCpu = (this.systemResources.cpuUsagePercent / 100) * totalSystemCpu;
    const usedMemory = ((this.systemResources.memoryUsagePercent / 100) * totalSystemMemory);

    const cpuWaste = Math.max(0, allocatedCpu - usedCpu);
    const memoryWaste = Math.max(0, allocatedMemory - usedMemory);

    const totalWaste = cpuWaste + (memoryWaste / 1000); // Normalize memory to similar scale as CPU
    const totalAllocated = allocatedCpu + (allocatedMemory / 1000);

    return totalAllocated > 0 ? (totalWaste / totalAllocated) * 100 : 0;
  }

  private checkResourcePressure(): void {
    const cpuPressure = this.systemResources.cpuUsagePercent;
    const memoryPressure = this.systemResources.memoryUsagePercent;
    const diskPressure = this.systemResources.diskUsagePercent;

    // Emit pressure events
    if (cpuPressure > 80) {
      this.emit('resource:pressure', {
        resource: 'cpu',
        level: cpuPressure,
        threshold: 80
      });
    }

    if (memoryPressure > 80) {
      this.emit('resource:pressure', {
        resource: 'memory',
        level: memoryPressure,
        threshold: 80
      });
    }

    if (diskPressure > 80) {
      this.emit('resource:pressure', {
        resource: 'disk',
        level: diskPressure,
        threshold: 80
      });
    }
  }

  private validateAllocationRequest(request: ResourceAllocationRequest): void {
    if (!request.executionId) {
      throw new FrameworkError('Execution ID is required', 'ResourceManager', 'validateAllocationRequest');
    }

    if (request.estimatedCpuCores <= 0) {
      throw new FrameworkError('CPU cores must be positive', 'ResourceManager', 'validateAllocationRequest');
    }

    if (request.estimatedMemoryMB <= 0) {
      throw new FrameworkError('Memory must be positive', 'ResourceManager', 'validateAllocationRequest');
    }

    if (request.estimatedDurationMs <= 0) {
      throw new FrameworkError('Duration must be positive', 'ResourceManager', 'validateAllocationRequest');
    }

    // Check against limits
    if (request.estimatedCpuCores > this.resourceLimits.maxCpuCores) {
      throw new ResourceAllocationError(
        `CPU request exceeds limit: ${request.estimatedCpuCores} > ${this.resourceLimits.maxCpuCores}`,
        request
      );
    }

    if (request.estimatedMemoryMB > this.resourceLimits.maxMemoryMB) {
      throw new ResourceAllocationError(
        `Memory request exceeds limit: ${request.estimatedMemoryMB} > ${this.resourceLimits.maxMemoryMB}`,
        request
      );
    }
  }

  private optimizeAllocation(allocation: ResourceAllocation, request: ResourceAllocationRequest): void {
    // Apply minimum requirements
    if (request.requirements?.minCpuCores) {
      allocation.cpuCores = Math.max(allocation.cpuCores, request.requirements.minCpuCores);
    }

    if (request.requirements?.minMemoryMB) {
      allocation.memoryMB = Math.max(allocation.memoryMB, request.requirements.minMemoryMB);
    }

    // Apply maximum limits
    if (request.requirements?.maxCpuCores) {
      allocation.cpuCores = Math.min(allocation.cpuCores, request.requirements.maxCpuCores);
    }

    if (request.requirements?.maxMemoryMB) {
      allocation.memoryMB = Math.min(allocation.memoryMB, request.requirements.maxMemoryMB);
    }

    // Ensure we don't exceed system limits
    allocation.cpuCores = Math.min(allocation.cpuCores, this.resourceLimits.maxCpuCores);
    allocation.memoryMB = Math.min(allocation.memoryMB, this.resourceLimits.maxMemoryMB);
  }

  private async getAvailableResources(): Promise<SystemResources> {
    await this.updateSystemResources();
    return this.systemResources;
  }

  private getTotalAllocatedCpu(): number {
    return Array.from(this.allocations.values())
      .reduce((total, allocation) => total + allocation.cpuCores, 0);
  }

  private getTotalAllocatedMemory(): number {
    return Array.from(this.allocations.values())
      .reduce((total, allocation) => total + allocation.memoryMB, 0);
  }

  private updateMetricsOnAllocation(allocation: ResourceAllocation): void {
    this.metrics.currentAllocations++;
    this.metrics.totalAllocatedCpu += allocation.cpuCores;
    this.metrics.totalAllocatedMemory += allocation.memoryMB;
  }

  private updateMetricsOnRelease(allocation: ResourceAllocation): void {
    this.metrics.currentAllocations--;
    this.metrics.totalAllocatedCpu -= allocation.cpuCores;
    this.metrics.totalAllocatedMemory -= allocation.memoryMB;
  }

  private validateCurrentAllocations(): void {
    const totalAllocatedCpu = this.getTotalAllocatedCpu();
    const totalAllocatedMemory = this.getTotalAllocatedMemory();

    if (totalAllocatedCpu > this.resourceLimits.maxCpuCores) {
      this.emit('limits:exceeded', {
        resource: 'cpu',
        allocated: totalAllocatedCpu,
        limit: this.resourceLimits.maxCpuCores
      });
    }

    if (totalAllocatedMemory > this.resourceLimits.maxMemoryMB) {
      this.emit('limits:exceeded', {
        resource: 'memory',
        allocated: totalAllocatedMemory,
        limit: this.resourceLimits.maxMemoryMB
      });
    }

    if (this.allocations.size > this.resourceLimits.maxConcurrentExecutions) {
      this.emit('limits:exceeded', {
        resource: 'executions',
        allocated: this.allocations.size,
        limit: this.resourceLimits.maxConcurrentExecutions
      });
    }
  }

  private async logResource(message: string, level: 'info' | 'warn' | 'error'): Promise<void> {
    // In a real implementation, this would log to the execution tracking system
    console.log(`[ResourceManager] ${level.toUpperCase()}: ${message}`);
  }
}

// Export singleton instance
export const resourceManager = new ResourceManager();