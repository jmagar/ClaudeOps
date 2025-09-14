import { and, eq, desc, asc, gte, lte, isNull, count, sum, avg, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db/connection';
import { executions, executionSteps } from '../db/schema';
import type {
  Execution,
  NewExecution,
  ExecutionUpdate,
  ExecutionStep,
  NewExecutionStep,
  ExecutionStepUpdate,
  ExecutionWithDetails,
  ExecutionFilter,
  ExecutionStats,
  DatabaseOperationResult,
  PaginatedResult,
  LogEntry
} from '../types/database';
import { ValidationError, NotFoundError } from '../types/database';

// Prepared statements for performance optimization
const preparedQueries = {
  getById: db.select().from(executions).where(eq(executions.id, sql.placeholder('id'))).prepare(),
  getByStatus: db.select().from(executions).where(eq(executions.status, sql.placeholder('status'))).prepare(),
  getRecentExecutions: db.select().from(executions).orderBy(desc(executions.startedAt)).limit(sql.placeholder('limit')).prepare(),
  updateStatus: db.update(executions).set({ 
    status: sql.placeholder('status') as any,
    updatedAt: sql.placeholder('updatedAt') as any
  }).where(eq(executions.id, sql.placeholder('id'))).prepare(),
};

export class ExecutionService {
  /**
   * Create a new execution record
   */
  async createExecution(data: Omit<NewExecution, 'id'>): Promise<DatabaseOperationResult<Execution>> {
    try {
      this.validateExecutionData(data);

      const executionData: NewExecution = {
        id: createId(),
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const [result] = await db.insert(executions).values(executionData).returning();
      
      return {
        success: true,
        data: result,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('createExecution', error);
    }
  }

  /**
   * Get execution by ID with optional related data
   */
  async getExecutionById(
    id: string,
    options: {
      includeSteps?: boolean;
      includeCosts?: boolean;
      includeConfig?: boolean;
      includeParsedData?: boolean;
    } = {}
  ): Promise<DatabaseOperationResult<ExecutionWithDetails | Execution>> {
    try {
      if (options.includeSteps || options.includeCosts || options.includeConfig) {
        const result = await db.query.executions.findFirst({
          where: eq(executions.id, id),
          with: {
            steps: options.includeSteps ? {
              orderBy: (steps, { asc }) => [asc(steps.stepNumber)],
            } : undefined,
            costBreakdown: options.includeCosts,
            agentConfig: options.includeConfig,
          },
        });

        if (!result) {
          throw new NotFoundError('Execution', id);
        }

        const detailedResult: ExecutionWithDetails = {
          ...result,
          steps: result.steps || [],
          costBreakdown: result.costBreakdown || [],
          agentConfig: result.agentConfig || null,
          parsedLogs: options.includeParsedData && result.logs ? JSON.parse(result.logs) : null,
          parsedAiAnalysis: options.includeParsedData && result.aiAnalysis ? JSON.parse(result.aiAnalysis) : null,
          parsedExecutionContext: options.includeParsedData && result.executionContext ? JSON.parse(result.executionContext) : null,
        };

        return {
          success: true,
          data: detailedResult
        };
      } else {
        const [result] = await preparedQueries.getById.execute({ id });
        
        if (!result) {
          throw new NotFoundError('Execution', id);
        }

        return {
          success: true,
          data: result
        };
      }
    } catch (error) {
      return this.handleError('getExecutionById', error);
    }
  }

  /**
   * Update execution record
   */
  async updateExecution(id: string, updates: ExecutionUpdate): Promise<DatabaseOperationResult<Execution>> {
    try {
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      // Handle JSON stringification for complex fields
      if (updates.logs && Array.isArray(updates.logs)) {
        updateData.logs = JSON.stringify(updates.logs);
      }
      if (updates.aiAnalysis && typeof updates.aiAnalysis === 'object') {
        updateData.aiAnalysis = JSON.stringify(updates.aiAnalysis);
      }

      const [result] = await db.update(executions)
        .set(updateData)
        .where(eq(executions.id, id))
        .returning();

      if (!result) {
        throw new NotFoundError('Execution', id);
      }

      return {
        success: true,
        data: result,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('updateExecution', error);
    }
  }

  /**
   * Delete execution record (soft delete by marking as cancelled)
   */
  async deleteExecution(id: string, hardDelete: boolean = false): Promise<DatabaseOperationResult<void>> {
    try {
      if (hardDelete) {
        const result = await db.delete(executions).where(eq(executions.id, id));
        return {
          success: true,
          affectedRows: result.changes
        };
      } else {
        const [result] = await db.update(executions)
          .set({ 
            status: 'cancelled',
            updatedAt: new Date().toISOString()
          })
          .where(eq(executions.id, id))
          .returning();

        if (!result) {
          throw new NotFoundError('Execution', id);
        }

        return {
          success: true,
          affectedRows: 1
        };
      }
    } catch (error) {
      return this.handleError('deleteExecution', error);
    }
  }

  /**
   * Get executions with filtering and pagination
   */
  async getExecutions(
    filter: ExecutionFilter = {},
    options: { includeSteps?: boolean; includeCosts?: boolean } = {}
  ): Promise<DatabaseOperationResult<PaginatedResult<Execution>>> {
    try {
      const conditions = this.buildExecutionConditions(filter);
      const { limit = 50, offset = 0 } = filter;

      // Build the base query
      let query = db.select().from(executions);
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      query = query.orderBy(desc(executions.startedAt));
      
      // Get total count for pagination
      let countQuery = db.select({ count: count() }).from(executions);
      if (conditions.length > 0) {
        countQuery = countQuery.where(and(...conditions));
      }
      
      const [{ count: total }] = await countQuery;
      const results = await query.limit(limit).offset(offset);

      return {
        success: true,
        data: {
          data: results,
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          hasMore: offset + results.length < total
        }
      };
    } catch (error) {
      return this.handleError('getExecutions', error);
    }
  }

  /**
   * Get running executions
   */
  async getRunningExecutions(): Promise<DatabaseOperationResult<Execution[]>> {
    try {
      const results = await preparedQueries.getByStatus.execute({ status: 'running' });
      
      return {
        success: true,
        data: results
      };
    } catch (error) {
      return this.handleError('getRunningExecutions', error);
    }
  }

  /**
   * Get execution statistics
   */
  async getExecutionStats(agentType?: string): Promise<DatabaseOperationResult<ExecutionStats>> {
    try {
      let query = db.select({
        total: count(),
        running: sql<number>`COUNT(CASE WHEN status = 'running' THEN 1 END)`,
        completed: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
        failed: sql<number>`COUNT(CASE WHEN status = 'failed' THEN 1 END)`,
        cancelled: sql<number>`COUNT(CASE WHEN status = 'cancelled' THEN 1 END)`,
        pending: sql<number>`COUNT(CASE WHEN status = 'pending' THEN 1 END)`,
        avgDuration: sql<number>`AVG(duration_ms)`,
        totalCost: sql<number>`SUM(cost_usd)`,
      }).from(executions);

      if (agentType) {
        query = query.where(eq(executions.agentType, agentType));
      }

      const [result] = await query;
      
      const completionRate = result.total > 0 
        ? (result.completed / result.total) * 100 
        : 0;

      const stats: ExecutionStats = {
        total: result.total,
        running: result.running,
        completed: result.completed,
        failed: result.failed,
        cancelled: result.cancelled,
        pending: result.pending,
        completionRate,
        averageDuration: result.avgDuration,
        totalCost: result.totalCost
      };

      return {
        success: true,
        data: stats
      };
    } catch (error) {
      return this.handleError('getExecutionStats', error);
    }
  }

  /**
   * Add execution step
   */
  async addExecutionStep(stepData: Omit<NewExecutionStep, 'id'>): Promise<DatabaseOperationResult<ExecutionStep>> {
    try {
      this.validateStepData(stepData);

      const newStep: NewExecutionStep = {
        id: createId(),
        ...stepData,
        createdAt: new Date().toISOString(),
        metadata: stepData.metadata ? JSON.stringify(stepData.metadata) : undefined
      };

      const [result] = await db.insert(executionSteps).values(newStep).returning();

      return {
        success: true,
        data: result,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('addExecutionStep', error);
    }
  }

  /**
   * Update execution step
   */
  async updateExecutionStep(stepId: string, updates: ExecutionStepUpdate): Promise<DatabaseOperationResult<ExecutionStep>> {
    try {
      const updateData = {
        ...updates,
        metadata: updates.metadata ? JSON.stringify(updates.metadata) : undefined
      };

      const [result] = await db.update(executionSteps)
        .set(updateData)
        .where(eq(executionSteps.id, stepId))
        .returning();

      if (!result) {
        throw new NotFoundError('ExecutionStep', stepId);
      }

      return {
        success: true,
        data: result,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('updateExecutionStep', error);
    }
  }

  /**
   * Get execution steps for an execution
   */
  async getExecutionSteps(executionId: string): Promise<DatabaseOperationResult<ExecutionStep[]>> {
    try {
      const results = await db.select()
        .from(executionSteps)
        .where(eq(executionSteps.executionId, executionId))
        .orderBy(asc(executionSteps.stepNumber));

      return {
        success: true,
        data: results
      };
    } catch (error) {
      return this.handleError('getExecutionSteps', error);
    }
  }

  /**
   * Cancel execution (update status and mark as cancelled)
   */
  async cancelExecution(id: string, reason?: string): Promise<DatabaseOperationResult<Execution>> {
    try {
      const [result] = await db.update(executions)
        .set({ 
          status: 'cancelled',
          completedAt: new Date().toISOString(),
          errorMessage: reason || 'Execution cancelled by user',
          exitCode: 130, // SIGINT
          updatedAt: new Date().toISOString()
        })
        .where(eq(executions.id, id))
        .returning();

      if (!result) {
        throw new NotFoundError('Execution', id);
      }

      return {
        success: true,
        data: result,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('cancelExecution', error);
    }
  }

  /**
   * Get recent activity (last N executions with summary data)
   */
  async getRecentActivity(limit: number = 10): Promise<DatabaseOperationResult<Array<{
    id: string;
    agentType: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    duration: number | null;
    cost: number | null;
    summary: string | null;
  }>>> {
    try {
      const results = await db.select({
        id: executions.id,
        agentType: executions.agentType,
        status: executions.status,
        startedAt: executions.startedAt,
        completedAt: executions.completedAt,
        duration: executions.durationMs,
        cost: executions.costUsd,
        summary: executions.resultSummary,
      })
      .from(executions)
      .orderBy(desc(executions.startedAt))
      .limit(limit);

      return {
        success: true,
        data: results
      };
    } catch (error) {
      return this.handleError('getRecentActivity', error);
    }
  }

  /**
   * Get execution trends (percentage changes compared to previous period)
   */
  async getExecutionTrends(periodDays: number = 7): Promise<DatabaseOperationResult<{
    totalChange: number;
    completionRateChange: number;
    averageDurationChange: number;
    costChange: number;
  }>> {
    try {
      const now = new Date();
      const currentPeriodStart = new Date(now.getTime() - (periodDays * 24 * 60 * 60 * 1000));
      const previousPeriodStart = new Date(currentPeriodStart.getTime() - (periodDays * 24 * 60 * 60 * 1000));

      // Get current period stats
      const [currentStats] = await db.select({
        total: count(),
        completed: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
        avgDuration: sql<number>`AVG(duration_ms)`,
        totalCost: sql<number>`SUM(cost_usd)`,
      })
      .from(executions)
      .where(gte(executions.startedAt, currentPeriodStart.toISOString()));

      // Get previous period stats
      const [previousStats] = await db.select({
        total: count(),
        completed: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
        avgDuration: sql<number>`AVG(duration_ms)`,
        totalCost: sql<number>`SUM(cost_usd)`,
      })
      .from(executions)
      .where(
        and(
          gte(executions.startedAt, previousPeriodStart.toISOString()),
          lte(executions.startedAt, currentPeriodStart.toISOString())
        )
      );

      // Calculate percentage changes
      const calculateChange = (current: number, previous: number): number => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const currentCompletionRate = currentStats.total > 0 ? (currentStats.completed / currentStats.total) * 100 : 0;
      const previousCompletionRate = previousStats.total > 0 ? (previousStats.completed / previousStats.total) * 100 : 0;

      const trends = {
        totalChange: calculateChange(currentStats.total, previousStats.total),
        completionRateChange: calculateChange(currentCompletionRate, previousCompletionRate),
        averageDurationChange: calculateChange(currentStats.avgDuration || 0, previousStats.avgDuration || 0),
        costChange: calculateChange(currentStats.totalCost || 0, previousStats.totalCost || 0)
      };

      return {
        success: true,
        data: trends
      };
    } catch (error) {
      return this.handleError('getExecutionTrends', error);
    }
  }

  /**
   * Build WHERE conditions for execution queries
   */
  private buildExecutionConditions(filter: ExecutionFilter): any[] {
    const conditions = [];

    if (filter.agentType) {
      conditions.push(eq(executions.agentType, filter.agentType));
    }

    if (filter.status) {
      conditions.push(eq(executions.status, filter.status));
    }

    if (filter.dateFrom) {
      conditions.push(gte(executions.startedAt, filter.dateFrom.toISOString()));
    }

    if (filter.dateTo) {
      conditions.push(lte(executions.startedAt, filter.dateTo.toISOString()));
    }

    if (filter.nodeId) {
      conditions.push(eq(executions.nodeId, filter.nodeId));
    }

    if (filter.triggeredBy) {
      conditions.push(eq(executions.triggeredBy, filter.triggeredBy));
    }

    return conditions;
  }

  /**
   * Validate execution data
   */
  private validateExecutionData(data: Omit<NewExecution, 'id'>): void {
    if (!data.agentType) {
      throw new ValidationError('agentType is required', 'agentType');
    }

    if (data.status && !['pending', 'running', 'completed', 'failed', 'cancelled'].includes(data.status)) {
      throw new ValidationError('Invalid status value', 'status', data.status);
    }

    if (data.costUsd !== undefined && data.costUsd < 0) {
      throw new ValidationError('Cost cannot be negative', 'costUsd', data.costUsd);
    }

    if (data.tokensUsed !== undefined && data.tokensUsed < 0) {
      throw new ValidationError('Tokens used cannot be negative', 'tokensUsed', data.tokensUsed);
    }

    if (data.durationMs !== undefined && data.durationMs < 0) {
      throw new ValidationError('Duration cannot be negative', 'durationMs', data.durationMs);
    }
  }

  /**
   * Validate step data
   */
  private validateStepData(data: Omit<NewExecutionStep, 'id'>): void {
    if (!data.executionId) {
      throw new ValidationError('executionId is required', 'executionId');
    }

    if (!data.stepName) {
      throw new ValidationError('stepName is required', 'stepName');
    }

    if (data.stepNumber < 1) {
      throw new ValidationError('stepNumber must be positive', 'stepNumber', data.stepNumber);
    }

    if (data.status && !['pending', 'running', 'completed', 'failed', 'skipped'].includes(data.status)) {
      throw new ValidationError('Invalid step status', 'status', data.status);
    }
  }

  /**
   * Handle service errors
   */
  private handleError(operation: string, error: unknown): DatabaseOperationResult<never> {
    console.error(`ExecutionService.${operation} error:`, error);

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
export const executionService = new ExecutionService();