// import { Query, NonNullableUsage } from '@anthropic/claude-code-sdk';
import { Query, NonNullableUsage, CostTracker, CostMetrics, BudgetAlert, BudgetConfig } from '../types/claude';
import { dbConnection } from '../db/connection';
import { costTracking, executions } from '../db/schema';
import { sql, eq, desc } from 'drizzle-orm';

export class CostMonitoringService {
  private costTracker: CostTracker = {
    totalCost: 0,
    monthlyCost: 0,
    executionCosts: new Map(),
    tokenUsage: new Map()
  };

  private listeners: Set<(cost: CostTracker) => void> = new Set();
  private budgetListeners: Set<(alert: BudgetAlert) => void> = new Set();

  constructor() {
    this.initializeMonthlyTracking();
  }

  /**
   * Initialize monthly cost tracking from database
   */
  private async initializeMonthlyTracking(): Promise<void> {
    try {
      const db = dbConnection.getDb();
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format

      const monthlyData = await db
        .select()
        .from(costTracking)
        .where(sql`strftime('%Y-%m', ${costTracking.timestamp}) = ${currentMonth}`)
        .all();

      this.costTracker.monthlyCost = monthlyData.reduce((sum: number, record: any) => sum + record.cost, 0);
      this.costTracker.totalCost = this.costTracker.monthlyCost; // For MVP, total = monthly
    } catch (error) {
      console.error('Failed to initialize monthly cost tracking:', error);
    }
  }

  /**
   * Track execution costs in real-time
   */
  async trackExecution(executionId: string, queryResult: Query): Promise<void> {
    try {
      // TODO: Implement actual Claude SDK integration when package is available
      // For now, use placeholder cost tracking
      
      // Simulate a basic cost calculation
      const mockCost = 0.001; // $0.001 per execution as placeholder
      const mockUsage = {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      };
      
      // Update in-memory tracking
      this.updateCostTracking(executionId, mockCost, mockUsage);

      // Persist to database - only for successful executions
      await this.persistCostData(executionId, mockCost, mockUsage, 0);

      // Notify listeners of cost updates
      this.notifyListeners();
    } catch (error) {
      console.error(`Error tracking execution ${executionId}:`, error);
      throw error;
    }
  }

  /**
   * Update in-memory cost tracking
   */
  private updateCostTracking(executionId: string, cost: number, usage: NonNullableUsage): void {
    this.costTracker.totalCost += cost;
    this.costTracker.monthlyCost += cost;
    this.costTracker.executionCosts.set(executionId, cost);
    this.costTracker.tokenUsage.set(executionId, usage);
  }

  /**
   * Persist cost data to database
   */
  private async persistCostData(
    executionId: string,
    cost: number,
    usage: NonNullableUsage,
    duration: number
  ): Promise<void> {
    try {
      const db = dbConnection.getDb();

      const costMetric: CostMetrics = {
        executionId,
        cost,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheCreationTokens: usage.cache_creation_input_tokens || 0,
        cacheReadTokens: usage.cache_read_input_tokens || 0,
        duration,
        timestamp: new Date().toISOString()
      };

      const now = new Date();
      await db
        .insert(costTracking)
        .values({
          executionId: costMetric.executionId,
          modelUsed: 'claude-3-5-sonnet-20241022',
          inputTokens: costMetric.inputTokens,
          outputTokens: costMetric.outputTokens,
          totalCostUsd: costMetric.cost,
          inputCostUsd: costMetric.cost * 0.6, // Approximate split
          outputCostUsd: costMetric.cost * 0.4,
          responseTime: costMetric.duration,
          timestamp: costMetric.timestamp,
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate()
        })
        .run();
    } catch (error) {
      console.error('Failed to persist cost data:', error);
      throw error;
    }
  }

  /**
   * Notify all cost update listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getCostSnapshot());
      } catch (error) {
        console.error('Error in cost listener:', error);
      }
    });
  }

  /**
   * Get current cost snapshot
   */
  getCostSnapshot(): CostTracker {
    return {
      totalCost: this.costTracker.totalCost,
      monthlyCost: this.costTracker.monthlyCost,
      executionCosts: new Map(this.costTracker.executionCosts),
      tokenUsage: new Map(this.costTracker.tokenUsage)
    };
  }

  /**
   * Subscribe to cost updates
   */
  onCostUpdate(callback: (cost: CostTracker) => void): () => void {
    this.listeners.add(callback);
    
    // Immediately notify with current state
    callback(this.getCostSnapshot());
    
    return () => this.listeners.delete(callback);
  }

  /**
   * Subscribe to budget alerts
   */
  onBudgetAlert(callback: (alert: BudgetAlert) => void): () => void {
    this.budgetListeners.add(callback);
    return () => this.budgetListeners.delete(callback);
  }

  /**
   * Get execution cost by ID
   */
  getExecutionCost(executionId: string): number {
    return this.costTracker.executionCosts.get(executionId) || 0;
  }

  /**
   * Get token usage for execution
   */
  getExecutionTokens(executionId: string): NonNullableUsage | undefined {
    return this.costTracker.tokenUsage.get(executionId);
  }

  /**
   * Get monthly cost breakdown from database
   */
  async getMonthlyCostBreakdown(): Promise<{
    total: number;
    byAgent: Record<string, number>;
    byDay: Record<string, number>;
  }> {
    try {
      const db = dbConnection.getDb();
      const currentMonth = new Date().toISOString().slice(0, 7);

      const monthlyData = await db
        .select()
        .from(costTracking)
        .innerJoin(executions, eq(costTracking.executionId, executions.id))
        .where(sql`strftime('%Y-%m', ${costTracking.timestamp}) = ${currentMonth}`)
        .all();

      const total = monthlyData.reduce((sum: number, record: any) => sum + record.cost_tracking.cost, 0);
      
      const byAgent: Record<string, number> = {};
      const byDay: Record<string, number> = {};

      monthlyData.forEach((record: any) => {
        const agentType = record.executions.agentType;
        const day = record.cost_tracking.timestamp.slice(0, 10); // YYYY-MM-DD
        const cost = record.cost_tracking.cost;

        byAgent[agentType] = (byAgent[agentType] || 0) + cost;
        byDay[day] = (byDay[day] || 0) + cost;
      });

      return { total, byAgent, byDay };
    } catch (error) {
      console.error('Failed to get monthly cost breakdown:', error);
      return { total: 0, byAgent: {}, byDay: {} };
    }
  }

  /**
   * Get cost history for specified period
   */
  async getCostHistory(days: number = 30): Promise<CostMetrics[]> {
    try {
      const db = dbConnection.getDb();
      const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const history = await db
        .select()
        .from(costTracking)
        .where(sql`timestamp >= ${sinceDate.toISOString()}`)
        .orderBy(desc(costTracking.timestamp))
        .all();

      return history.map((record: any) => ({
        executionId: record.executionId,
        cost: record.cost,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheCreationTokens: record.cacheCreationTokens,
        cacheReadTokens: record.cacheReadTokens,
        duration: record.duration,
        timestamp: record.timestamp
      }));
    } catch (error) {
      console.error('Failed to get cost history:', error);
      return [];
    }
  }

  /**
   * Estimate cost for execution before running
   */
  estimateCost(agentType: string, promptLength: number): number {
    // Base cost estimation - this is approximate
    const baseTokenCost = 0.0015; // per 1K tokens for Claude 3.5 Sonnet
    const estimatedInputTokens = Math.ceil(promptLength / 4); // rough tokens estimate
    const estimatedOutputTokens = 500; // typical response length
    
    return (estimatedInputTokens + estimatedOutputTokens) * baseTokenCost / 1000;
  }

  /**
   * Reset monthly tracking (typically called at month boundary)
   */
  async resetMonthlyTracking(): Promise<void> {
    this.costTracker.monthlyCost = 0;
    this.notifyListeners();
  }

  /**
   * Get cost efficiency metrics
   */
  async getCostEfficiencyMetrics(): Promise<{
    averageCostPerExecution: number;
    averageDuration: number;
    costPerMinute: number;
    totalExecutions: number;
  }> {
    try {
      const db = dbConnection.getDb();
      const currentMonth = new Date().toISOString().slice(0, 7);

      const metrics = await db
        .select({
          avgCost: sql<number>`AVG(cost)`,
          avgDuration: sql<number>`AVG(duration)`,
          totalCost: sql<number>`SUM(cost)`,
          totalExecutions: sql<number>`COUNT(*)`
        })
        .from(costTracking)
        .where(sql`strftime('%Y-%m', ${costTracking.timestamp}) = ${currentMonth}`)
        .get();

      const averageCostPerExecution = metrics?.avgCost || 0;
      const averageDuration = metrics?.avgDuration || 0;
      const totalExecutions = metrics?.totalExecutions || 0;
      const costPerMinute = averageDuration > 0 ? (averageCostPerExecution / (averageDuration / 60000)) : 0;

      return {
        averageCostPerExecution,
        averageDuration,
        costPerMinute,
        totalExecutions
      };
    } catch (error) {
      console.error('Failed to get cost efficiency metrics:', error);
      return {
        averageCostPerExecution: 0,
        averageDuration: 0,
        costPerMinute: 0,
        totalExecutions: 0
      };
    }
  }
}

/**
 * Budget management with threshold monitoring
 */
export class BudgetManager {
  private budgetConfig: BudgetConfig;
  private budgetListeners: Set<(alert: BudgetAlert) => void> = new Set();

  constructor(
    config: BudgetConfig,
    private costTracker: CostMonitoringService
  ) {
    this.budgetConfig = config;
    
    // Monitor cost changes for budget alerts
    this.costTracker.onCostUpdate(this.checkBudgetThresholds.bind(this));
  }

  /**
   * Check if execution would exceed budget
   */
  canExecute(estimatedCost: number): Promise<boolean> {
    const snapshot = this.costTracker.getCostSnapshot();
    const projectedTotal = snapshot.monthlyCost + estimatedCost;
    return Promise.resolve(projectedTotal <= this.budgetConfig.monthlyLimit);
  }

  /**
   * Update budget configuration
   */
  updateBudgetConfig(config: Partial<BudgetConfig>): void {
    this.budgetConfig = { ...this.budgetConfig, ...config };
  }

  /**
   * Subscribe to budget alerts
   */
  onBudgetAlert(callback: (alert: BudgetAlert) => void): () => void {
    this.budgetListeners.add(callback);
    return () => this.budgetListeners.delete(callback);
  }

  /**
   * Get current budget status
   */
  getBudgetStatus(): {
    limit: number;
    current: number;
    remaining: number;
    percentage: number;
    status: 'healthy' | 'warning' | 'critical';
  } {
    const snapshot = this.costTracker.getCostSnapshot();
    const percentage = (snapshot.monthlyCost / this.budgetConfig.monthlyLimit) * 100;
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (percentage >= this.budgetConfig.criticalThreshold) {
      status = 'critical';
    } else if (percentage >= this.budgetConfig.warningThreshold) {
      status = 'warning';
    }

    return {
      limit: this.budgetConfig.monthlyLimit,
      current: snapshot.monthlyCost,
      remaining: Math.max(0, this.budgetConfig.monthlyLimit - snapshot.monthlyCost),
      percentage,
      status
    };
  }

  /**
   * Check budget thresholds and trigger alerts
   */
  private checkBudgetThresholds(costs: CostTracker): void {
    const percentage = (costs.monthlyCost / this.budgetConfig.monthlyLimit) * 100;

    if (percentage >= this.budgetConfig.criticalThreshold) {
      this.triggerBudgetAlert('critical', costs.monthlyCost, percentage);
    } else if (percentage >= this.budgetConfig.warningThreshold) {
      this.triggerBudgetAlert('warning', costs.monthlyCost, percentage);
    }
  }

  /**
   * Trigger budget alert
   */
  private triggerBudgetAlert(
    level: 'warning' | 'critical',
    currentCost: number,
    percentage: number
  ): void {
    const alert: BudgetAlert = {
      level,
      currentCost,
      budgetLimit: this.budgetConfig.monthlyLimit,
      percentage,
      timestamp: new Date().toISOString()
    };

    console.warn(`Budget ${level}: ${percentage.toFixed(1)}% of monthly limit used ($${currentCost.toFixed(4)} / $${this.budgetConfig.monthlyLimit})`);
    
    // Emit to budget listeners
    this.budgetListeners.forEach(listener => {
      try {
        listener(alert);
      } catch (error) {
        console.error('Budget alert listener error:', error);
      }
    });
  }
}