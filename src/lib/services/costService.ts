import { and, eq, desc, gte, lte, sum, count, avg, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db/connection';
import { costTracking, monthlyCostSummaries, executions } from '../db/schema';
import type {
  CostTracking,
  NewCostTracking,
  MonthlyCostSummary,
  NewMonthlyCostSummary,
  CostAnalysisFilter,
  CostStats,
  CostTrendData,
  CostAlert,
  DatabaseOperationResult
} from '../types/database';
import { ValidationError, NotFoundError } from '../types/database';

// Cost calculation constants
const COST_MODELS = {
  'claude-3-5-sonnet-20241022': {
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00
  },
  'claude-3-5-haiku-20241022': {
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25
  },
  'claude-3-opus-20240229': {
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00
  }
} as const;

type ModelName = keyof typeof COST_MODELS;

// Prepared statements for performance optimization
const preparedQueries = {
  getCurrentMonthCost: db.select({
    totalCost: sum(costTracking.totalCostUsd),
    totalExecutions: count(),
    totalTokens: sql<number>`SUM(input_tokens + output_tokens)`,
  })
  .from(costTracking)
  .where(and(
    eq(costTracking.year, sql.placeholder('year') as any),
    eq(costTracking.month, sql.placeholder('month') as any)
  )).prepare(),

  getCostsByExecution: db.select()
    .from(costTracking)
    .where(eq(costTracking.executionId, sql.placeholder('executionId')))
    .prepare(),

  getDailyCosts: db.select({
    date: sql<string>`year || '-' || printf('%02d', month) || '-' || printf('%02d', day)`,
    totalCost: sum(costTracking.totalCostUsd),
    executionCount: count(),
    avgCostPerExecution: avg(costTracking.totalCostUsd),
    tokenUsage: sql<number>`SUM(input_tokens + output_tokens)`,
  })
  .from(costTracking)
  .groupBy(costTracking.year, costTracking.month, costTracking.day)
  .orderBy(costTracking.year, costTracking.month, costTracking.day)
  .prepare(),
};

export class CostService {
  /**
   * Record cost data for an execution
   */
  async recordCost(data: Omit<NewCostTracking, 'id' | 'timestamp' | 'year' | 'month' | 'day'>): Promise<DatabaseOperationResult<CostTracking>> {
    try {
      this.validateCostData(data);

      const now = new Date();
      const costData: NewCostTracking = {
        id: createId(),
        ...data,
        timestamp: now.toISOString(),
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
      };

      const [result] = await db.insert(costTracking).values(costData).returning();
      
      // Update monthly summary asynchronously
      this.updateMonthlySummary(costData.year, costData.month).catch(error => {
        console.error('Failed to update monthly summary:', error);
      });

      return {
        success: true,
        data: result,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('recordCost', error);
    }
  }

  /**
   * Calculate cost from token usage
   */
  calculateCost(modelUsed: string, inputTokens: number, outputTokens: number): {
    inputCostUsd: number;
    outputCostUsd: number;
    totalCostUsd: number;
  } {
    const model = COST_MODELS[modelUsed as ModelName];
    if (!model) {
      throw new ValidationError(`Unknown model: ${modelUsed}`, 'modelUsed', modelUsed);
    }

    const inputCostUsd = (inputTokens / 1_000_000) * model.inputCostPer1M;
    const outputCostUsd = (outputTokens / 1_000_000) * model.outputCostPer1M;
    const totalCostUsd = inputCostUsd + outputCostUsd;

    return {
      inputCostUsd: Math.round(inputCostUsd * 100000) / 100000, // Round to 5 decimal places
      outputCostUsd: Math.round(outputCostUsd * 100000) / 100000,
      totalCostUsd: Math.round(totalCostUsd * 100000) / 100000,
    };
  }

  /**
   * Record cost with automatic calculation
   */
  async recordCostFromTokens(data: {
    executionId: string;
    modelUsed: string;
    inputTokens: number;
    outputTokens: number;
    requestId?: string;
    responseTime?: number;
    cacheHit?: boolean;
  }): Promise<DatabaseOperationResult<CostTracking>> {
    try {
      const costs = this.calculateCost(data.modelUsed, data.inputTokens, data.outputTokens);
      
      return await this.recordCost({
        ...data,
        ...costs,
      });
    } catch (error) {
      return this.handleError('recordCostFromTokens', error);
    }
  }

  /**
   * Get current month cost summary
   */
  async getCurrentMonthCost(): Promise<DatabaseOperationResult<{
    totalCost: number;
    totalExecutions: number;
    totalTokens: number;
  }>> {
    try {
      const now = new Date();
      const [result] = await preparedQueries.getCurrentMonthCost.execute({
        year: now.getFullYear(),
        month: now.getMonth() + 1
      });

      const data = {
        totalCost: result.totalCost || 0,
        totalExecutions: result.totalExecutions || 0,
        totalTokens: result.totalTokens || 0,
      };

      return {
        success: true,
        data
      };
    } catch (error) {
      return this.handleError('getCurrentMonthCost', error);
    }
  }

  /**
   * Get comprehensive cost statistics
   */
  async getCostStats(): Promise<DatabaseOperationResult<CostStats>> {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

      // Current month cost
      const [currentMonthResult] = await preparedQueries.getCurrentMonthCost.execute({
        year: currentYear,
        month: currentMonth
      });

      // Last month cost
      const [lastMonthResult] = await preparedQueries.getCurrentMonthCost.execute({
        year: lastMonthYear,
        month: lastMonth
      });

      // Year to date cost
      const [ytdResult] = await db.select({
        totalCost: sum(costTracking.totalCostUsd),
        totalTokens: sql<number>`SUM(input_tokens + output_tokens)`,
      })
      .from(costTracking)
      .where(eq(costTracking.year, currentYear));

      // Average per execution
      const [avgResult] = await db.select({
        avgCost: avg(costTracking.totalCostUsd),
      })
      .from(costTracking)
      .where(and(
        eq(costTracking.year, currentYear),
        eq(costTracking.month, currentMonth)
      ));

      // Most expensive execution
      const mostExpensiveResult = await db.select({
        executionId: costTracking.executionId,
        totalCost: costTracking.totalCostUsd,
        agentType: executions.agentType,
      })
      .from(costTracking)
      .leftJoin(executions, eq(costTracking.executionId, executions.id))
      .orderBy(desc(costTracking.totalCostUsd))
      .limit(1);

      const stats: CostStats = {
        currentMonth: currentMonthResult.totalCost || 0,
        lastMonth: lastMonthResult.totalCost || 0,
        yearToDate: ytdResult.totalCost || 0,
        averagePerExecution: avgResult.avgCost || 0,
        totalTokens: ytdResult.totalTokens || 0,
        mostExpensiveExecution: mostExpensiveResult[0] ? {
          id: mostExpensiveResult[0].executionId || '',
          cost: mostExpensiveResult[0].totalCost || 0,
          agentType: mostExpensiveResult[0].agentType || 'unknown'
        } : null
      };

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return this.handleError('getCostStats', error);
    }
  }

  /**
   * Get cost analysis with filtering
   */
  async getCostAnalysis(filter: CostAnalysisFilter = {}): Promise<DatabaseOperationResult<CostTracking[]>> {
    try {
      const conditions = this.buildCostConditions(filter);

      let query = db.select({
        id: costTracking.id,
        executionId: costTracking.executionId,
        modelUsed: costTracking.modelUsed,
        inputTokens: costTracking.inputTokens,
        outputTokens: costTracking.outputTokens,
        inputCostUsd: costTracking.inputCostUsd,
        outputCostUsd: costTracking.outputCostUsd,
        totalCostUsd: costTracking.totalCostUsd,
        timestamp: costTracking.timestamp,
        agentType: executions.agentType,
        cacheHit: costTracking.cacheHit,
        responseTime: costTracking.responseTime,
      })
      .from(costTracking)
      .leftJoin(executions, eq(costTracking.executionId, executions.id));

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const results = await query.orderBy(desc(costTracking.timestamp));

      return {
        success: true,
        data: results as CostTracking[]
      };
    } catch (error) {
      return this.handleError('getCostAnalysis', error);
    }
  }

  /**
   * Get cost trends over time
   */
  async getCostTrends(
    period: 'day' | 'week' | 'month' = 'day',
    days: number = 30
  ): Promise<DatabaseOperationResult<CostTrendData[]>> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let groupByClause: any;
      let selectClause: any;

      switch (period) {
        case 'day':
          groupByClause = sql`year, month, day`;
          selectClause = sql<string>`year || '-' || printf('%02d', month) || '-' || printf('%02d', day)`;
          break;
        case 'week':
          groupByClause = sql`year, strftime('%W', timestamp)`;
          selectClause = sql<string>`year || '-W' || strftime('%W', timestamp)`;
          break;
        case 'month':
          groupByClause = sql`year, month`;
          selectClause = sql<string>`year || '-' || printf('%02d', month)`;
          break;
      }

      const results = await db.select({
        period: selectClause,
        totalCost: sum(costTracking.totalCostUsd),
        executionCount: count(),
        averageCostPerExecution: avg(costTracking.totalCostUsd),
        tokenUsage: sql<number>`SUM(input_tokens + output_tokens)`,
      })
      .from(costTracking)
      .where(and(
        gte(costTracking.timestamp, startDate.toISOString()),
        lte(costTracking.timestamp, endDate.toISOString())
      ))
      .groupBy(groupByClause)
      .orderBy(selectClause);

      const trendData: CostTrendData[] = results.map(row => ({
        period: row.period,
        totalCost: row.totalCost || 0,
        executionCount: row.executionCount || 0,
        averageCostPerExecution: row.averageCostPerExecution || 0,
        tokenUsage: row.tokenUsage || 0,
      }));

      return {
        success: true,
        data: trendData
      };
    } catch (error) {
      return this.handleError('getCostTrends', error);
    }
  }

  /**
   * Get costs for a specific execution
   */
  async getExecutionCosts(executionId: string): Promise<DatabaseOperationResult<CostTracking[]>> {
    try {
      const results = await preparedQueries.getCostsByExecution.execute({ executionId });
      
      return {
        success: true,
        data: results
      };
    } catch (error) {
      return this.handleError('getExecutionCosts', error);
    }
  }

  /**
   * Check cost alerts against budget thresholds
   */
  async checkCostAlerts(budgets: {
    monthly?: number;
    daily?: number;
    perExecution?: number;
  }): Promise<DatabaseOperationResult<CostAlert[]>> {
    try {
      const alerts: CostAlert[] = [];
      const now = new Date();

      // Check monthly budget
      if (budgets.monthly) {
        const monthlyResult = await this.getCurrentMonthCost();
        if (monthlyResult.success && monthlyResult.data) {
          const currentAmount = monthlyResult.data.totalCost;
          const threshold = budgets.monthly * 0.8; // Alert at 80%

          if (currentAmount > threshold) {
            alerts.push({
              type: 'monthly',
              threshold: budgets.monthly,
              currentAmount,
              triggered: currentAmount > budgets.monthly,
              message: currentAmount > budgets.monthly 
                ? `Monthly budget exceeded: $${currentAmount.toFixed(4)} / $${budgets.monthly.toFixed(4)}`
                : `Monthly budget warning: $${currentAmount.toFixed(4)} / $${budgets.monthly.toFixed(4)} (${Math.round((currentAmount / budgets.monthly) * 100)}%)`
            });
          }
        }
      }

      // Check daily budget
      if (budgets.daily) {
        const [dailyResult] = await db.select({
          totalCost: sum(costTracking.totalCostUsd),
        })
        .from(costTracking)
        .where(and(
          eq(costTracking.year, now.getFullYear()),
          eq(costTracking.month, now.getMonth() + 1),
          eq(costTracking.day, now.getDate())
        ));

        const currentAmount = dailyResult.totalCost || 0;
        const threshold = budgets.daily * 0.8;

        if (currentAmount > threshold) {
          alerts.push({
            type: 'daily',
            threshold: budgets.daily,
            currentAmount,
            triggered: currentAmount > budgets.daily,
            message: currentAmount > budgets.daily
              ? `Daily budget exceeded: $${currentAmount.toFixed(4)} / $${budgets.daily.toFixed(4)}`
              : `Daily budget warning: $${currentAmount.toFixed(4)} / $${budgets.daily.toFixed(4)} (${Math.round((currentAmount / budgets.daily) * 100)}%)`
          });
        }
      }

      return {
        success: true,
        data: alerts
      };
    } catch (error) {
      return this.handleError('checkCostAlerts', error);
    }
  }

  /**
   * Update monthly cost summary (internal method)
   */
  async updateMonthlySummary(year: number, month: number): Promise<void> {
    try {
      // Calculate monthly aggregates
      const [stats] = await db.select({
        totalCost: sum(costTracking.totalCostUsd),
        totalExecutions: count(),
        totalTokens: sql<number>`SUM(input_tokens + output_tokens)`,
        avgCostPerExecution: avg(costTracking.totalCostUsd),
        avgTokensPerExecution: sql<number>`AVG(input_tokens + output_tokens)`,
      })
      .from(costTracking)
      .where(and(
        eq(costTracking.year, year),
        eq(costTracking.month, month)
      ));

      // Get cost breakdown by agent type
      const agentCosts = await db.select({
        agentType: executions.agentType,
        totalCost: sum(costTracking.totalCostUsd),
      })
      .from(costTracking)
      .leftJoin(executions, eq(costTracking.executionId, executions.id))
      .where(and(
        eq(costTracking.year, year),
        eq(costTracking.month, month)
      ))
      .groupBy(executions.agentType);

      const costByAgentType = Object.fromEntries(
        agentCosts.map(ac => [ac.agentType || 'unknown', ac.totalCost || 0])
      );

      const summary: NewMonthlyCostSummary = {
        id: createId(),
        year,
        month,
        totalCostUsd: stats.totalCost || 0,
        totalExecutions: stats.totalExecutions || 0,
        totalTokens: stats.totalTokens || 0,
        avgCostPerExecution: stats.avgCostPerExecution || 0,
        avgTokensPerExecution: stats.avgTokensPerExecution || 0,
        costByAgentType: JSON.stringify(costByAgentType),
        lastUpdated: new Date().toISOString(),
      };

      // Upsert monthly summary
      const existing = await db.select()
        .from(monthlyCostSummaries)
        .where(and(
          eq(monthlyCostSummaries.year, year),
          eq(monthlyCostSummaries.month, month)
        ));

      if (existing.length > 0) {
        await db.update(monthlyCostSummaries)
          .set(summary)
          .where(and(
            eq(monthlyCostSummaries.year, year),
            eq(monthlyCostSummaries.month, month)
          ));
      } else {
        await db.insert(monthlyCostSummaries).values(summary);
      }
    } catch (error) {
      console.error('Failed to update monthly summary:', error);
      throw error;
    }
  }

  /**
   * Build WHERE conditions for cost queries
   */
  private buildCostConditions(filter: CostAnalysisFilter): any[] {
    const conditions = [];

    if (filter.dateFrom) {
      conditions.push(gte(costTracking.timestamp, filter.dateFrom.toISOString()));
    }

    if (filter.dateTo) {
      conditions.push(lte(costTracking.timestamp, filter.dateTo.toISOString()));
    }

    if (filter.agentType) {
      conditions.push(eq(executions.agentType, filter.agentType));
    }

    if (filter.modelUsed) {
      conditions.push(eq(costTracking.modelUsed, filter.modelUsed));
    }

    if (filter.executionId) {
      conditions.push(eq(costTracking.executionId, filter.executionId));
    }

    return conditions;
  }

  /**
   * Validate cost data
   */
  private validateCostData(data: Omit<NewCostTracking, 'id' | 'timestamp' | 'year' | 'month' | 'day'>): void {
    if (!data.executionId) {
      throw new ValidationError('executionId is required', 'executionId');
    }

    if (!data.modelUsed) {
      throw new ValidationError('modelUsed is required', 'modelUsed');
    }

    if (data.inputTokens < 0) {
      throw new ValidationError('inputTokens cannot be negative', 'inputTokens', data.inputTokens);
    }

    if (data.outputTokens < 0) {
      throw new ValidationError('outputTokens cannot be negative', 'outputTokens', data.outputTokens);
    }

    if (data.totalCostUsd < 0) {
      throw new ValidationError('totalCostUsd cannot be negative', 'totalCostUsd', data.totalCostUsd);
    }

    if (data.responseTime !== undefined && data.responseTime < 0) {
      throw new ValidationError('responseTime cannot be negative', 'responseTime', data.responseTime);
    }
  }

  /**
   * Handle service errors
   */
  private handleError(operation: string, error: unknown): DatabaseOperationResult<never> {
    console.error(`CostService.${operation} error:`, error);

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
export const costService = new CostService();