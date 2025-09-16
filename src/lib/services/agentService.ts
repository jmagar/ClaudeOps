import { and, eq, desc, asc, count, sum, avg, sql, gte, lte } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db/connection';
import { agentConfigurations } from '../db/schema/agentConfigs';
import { executions } from '../db/schema/executions';
import type {
  AgentConfiguration,
  NewAgentConfiguration,
  AgentConfigurationUpdate,
  AgentPerformance,
  DatabaseOperationResult,
  PaginatedResult,
  ExecutionStatus
} from '../types/database';
import { ValidationError, NotFoundError } from '../types/database';

// Prepared statements for performance optimization
const preparedQueries = {
  getByAgentType: db.select()
    .from(agentConfigurations)
    .where(eq(agentConfigurations.agentType, sql.placeholder('agentType')))
    .prepare(),

  getEnabledAgents: db.select()
    .from(agentConfigurations)
    .where(eq(agentConfigurations.enabled, true))
    .prepare(),

  updateEnabled: db.update(agentConfigurations)
    .set({ 
      enabled: sql.placeholder('enabled'),
      updatedAt: sql.placeholder('updatedAt')
    } as any)
    .where(eq(agentConfigurations.agentType, sql.placeholder('agentType')))
    .prepare(),

  getAgentExecutionCount: db.select({ count: count() })
    .from(executions)
    .where(eq(executions.agentType, sql.placeholder('agentType')))
    .prepare(),
};

export class AgentService {
  /**
   * Create a new agent configuration
   */
  async createAgentConfiguration(data: any): Promise<DatabaseOperationResult<AgentConfiguration>> {
    try {
      this.validateAgentConfigData(data);

      // Check if agent type already exists
      const existing = await this.getAgentByType(data.agentType);
      if (existing.success && existing.data) {
        throw new ValidationError(`Agent type '${data.agentType}' already exists`, 'agentType', data.agentType);
      }

      const configData = {
        ...data,
        id: data.id || createId(),
        config: data.config ? JSON.stringify(data.config) : undefined,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      };

      const [result] = await db.insert(agentConfigurations).values(configData).returning();

      // Parse config back to object
      const parsedResult = {
        ...result,
        config: result.config ? JSON.parse(result.config) : null,
      };

      return {
        success: true,
        data: parsedResult,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('createAgentConfiguration', error);
    }
  }

  /**
   * Get agent configuration by agent type
   */
  async getAgentByType(agentType: string): Promise<DatabaseOperationResult<AgentConfiguration>> {
    try {
      const [result] = await preparedQueries.getByAgentType.execute({ agentType });

      if (!result) {
        throw new NotFoundError('AgentConfiguration', agentType);
      }

      // Parse config field
      const parsedResult = {
        ...result,
        config: result.config ? JSON.parse(result.config) : null,
      };

      return {
        success: true,
        data: parsedResult
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        return {
          success: false,
          error: error.message
        };
      }
      return this.handleError('getAgentByType', error);
    }
  }

  /**
   * Update agent configuration
   */
  async updateAgentConfiguration(
    agentType: string, 
    updates: any
  ): Promise<DatabaseOperationResult<AgentConfiguration>> {
    try {
      const updateData = {
        ...updates,
        config: updates.config ? JSON.stringify(updates.config) : undefined,
        updatedAt: new Date().toISOString()
      } as any;

      const [result] = await db.update(agentConfigurations)
        .set(updateData)
        .where(eq(agentConfigurations.agentType, agentType))
        .returning();

      if (!result) {
        throw new NotFoundError('AgentConfiguration', agentType);
      }

      // Parse config field
      const parsedResult = {
        ...result,
        config: result.config ? JSON.parse(result.config) : null,
      };

      return {
        success: true,
        data: parsedResult,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('updateAgentConfiguration', error);
    }
  }

  /**
   * Delete agent configuration
   */
  async deleteAgentConfiguration(agentType: string, force: boolean = false): Promise<DatabaseOperationResult<void>> {
    try {
      // Check if there are executions for this agent
      if (!force) {
        const [executionCount] = await preparedQueries.getAgentExecutionCount.execute({ agentType });
        if (executionCount.count > 0) {
          throw new ValidationError(
            `Cannot delete agent '${agentType}' with existing executions. Use force=true to override.`,
            'agentType',
            agentType
          );
        }
      }

      const result = await db.delete(agentConfigurations)
        .where(eq(agentConfigurations.agentType, agentType));

      if (result.changes === 0) {
        throw new NotFoundError('AgentConfiguration', agentType);
      }

      return {
        success: true,
        affectedRows: result.changes
      };
    } catch (error) {
      return this.handleError('deleteAgentConfiguration', error);
    }
  }

  /**
   * Get all agent configurations with filtering
   */
  async getAgentConfigurations(options: {
    enabled?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: 'name' | 'agentType' | 'createdAt' | 'updatedAt';
    orderDirection?: 'asc' | 'desc';
  } = {}): Promise<DatabaseOperationResult<PaginatedResult<AgentConfiguration>>> {
    try {
      const { 
        enabled, 
        limit = 50, 
        offset = 0, 
        orderBy = 'name', 
        orderDirection = 'asc' 
      } = options;

      // Build conditions
      const conditions = [];
      if (enabled !== undefined) {
        conditions.push(eq(agentConfigurations.enabled, enabled));
      }

      // Build the complete query at once to avoid type issues
      const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;
      
      let orderByColumn;
      let orderByDirection;
      
      switch (orderBy) {
        case 'name':
          orderByColumn = agentConfigurations.name;
          break;
        case 'agentType':
          orderByColumn = agentConfigurations.agentType;
          break;
        case 'createdAt':
          orderByColumn = agentConfigurations.createdAt;
          break;
        case 'updatedAt':
          orderByColumn = agentConfigurations.updatedAt;
          break;
        default:
          orderByColumn = agentConfigurations.name;
      }
      
      orderByDirection = orderDirection === 'asc' ? asc(orderByColumn) : desc(orderByColumn);
      
      // Build complete query
      const query = whereCondition
        ? db.select().from(agentConfigurations).where(whereCondition).orderBy(orderByDirection)
        : db.select().from(agentConfigurations).orderBy(orderByDirection);

      // Get total count
      const countQuery = whereCondition 
        ? db.select({ count: count() }).from(agentConfigurations).where(whereCondition)
        : db.select({ count: count() }).from(agentConfigurations);
      
      const [{ count: total }] = await countQuery;
      const results = await query.limit(limit).offset(offset);

      // Parse config fields
      const parsedResults = results.map(result => ({
        ...result,
        config: result.config ? JSON.parse(result.config) : null,
      }));

      return {
        success: true,
        data: {
          data: parsedResults,
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          hasMore: offset + results.length < total
        }
      };
    } catch (error) {
      return this.handleError('getAgentConfigurations', error);
    }
  }

  /**
   * Get enabled agent configurations
   */
  async getEnabledAgents(): Promise<DatabaseOperationResult<AgentConfiguration[]>> {
    try {
      const results = await preparedQueries.getEnabledAgents.execute({});

      // Parse config fields
      const parsedResults = results.map(result => ({
        ...result,
        config: result.config ? JSON.parse(result.config) : null,
      }));

      return {
        success: true,
        data: parsedResults
      };
    } catch (error) {
      return this.handleError('getEnabledAgents', error);
    }
  }

  /**
   * Enable or disable an agent
   */
  async toggleAgentEnabled(agentType: string, enabled: boolean): Promise<DatabaseOperationResult<AgentConfiguration>> {
    try {
      const [result] = await db.update(agentConfigurations)
        .set({ 
          enabled,
          updatedAt: new Date().toISOString()
        } as any)
        .where(eq(agentConfigurations.agentType, agentType))
        .returning();

      if (!result) {
        throw new NotFoundError('AgentConfiguration', agentType);
      }

      // Parse config field
      const parsedResult = {
        ...result,
        config: result.config ? JSON.parse(result.config) : null,
      };

      return {
        success: true,
        data: parsedResult,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('toggleAgentEnabled', error);
    }
  }

  /**
   * Get agent performance statistics
   */
  async getAgentPerformance(agentType?: string): Promise<DatabaseOperationResult<AgentPerformance[]>> {
    try {
      const baseQuery = db.select({
        agentType: executions.agentType,
        totalExecutions: count(),
        successfulExecutions: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
        failedExecutions: sql<number>`COUNT(CASE WHEN status = 'failed' THEN 1 END)`,
        averageDuration: sql<number>`AVG(duration_ms)`,
        totalCost: sum(executions.costUsd),
        averageCost: avg(executions.costUsd),
        lastExecuted: sql<string>`MAX(started_at)`,
      })
      .from(executions)
      .groupBy(executions.agentType);

      const results = agentType 
        ? await baseQuery.where(eq(executions.agentType, agentType)).orderBy(desc(count()))
        : await baseQuery.orderBy(desc(count()));

      const performance: AgentPerformance[] = results.map(result => ({
        agentType: result.agentType,
        totalExecutions: result.totalExecutions,
        successfulExecutions: result.successfulExecutions,
        failedExecutions: result.failedExecutions,
        averageDuration: result.averageDuration,
        totalCost: Number(result.totalCost) || null,
        averageCost: Number(result.averageCost) || null,
        lastExecuted: result.lastExecuted,
        successRate: result.totalExecutions > 0 
          ? (result.successfulExecutions / result.totalExecutions) * 100 
          : 0
      }));

      return {
        success: true,
        data: performance
      };
    } catch (error) {
      return this.handleError('getAgentPerformance', error);
    }
  }

  /**
   * Get agent execution history summary
   */
  async getAgentExecutionSummary(agentType: string, days: number = 30): Promise<DatabaseOperationResult<{
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number | null;
    totalCost: number | null;
    recentTrend: Array<{
      date: string;
      executions: number;
      successRate: number;
    }>;
  }>> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Overall stats
      const [overallStats] = await db.select({
        totalExecutions: count(),
        successfulExecutions: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
        failedExecutions: sql<number>`COUNT(CASE WHEN status = 'failed' THEN 1 END)`,
        averageDuration: sql<number>`AVG(duration_ms)`,
        totalCost: sum(executions.costUsd),
      })
      .from(executions)
      .where(and(
        eq(executions.agentType, agentType),
        gte(executions.startedAt, startDate.toISOString()),
        lte(executions.startedAt, endDate.toISOString())
      ));

      // Daily trend
      const dailyTrend = await db.select({
        date: sql<string>`DATE(started_at)`,
        totalExecutions: count(),
        successfulExecutions: sql<number>`COUNT(CASE WHEN status = 'completed' THEN 1 END)`,
      })
      .from(executions)
      .where(and(
        eq(executions.agentType, agentType),
        gte(executions.startedAt, startDate.toISOString()),
        lte(executions.startedAt, endDate.toISOString())
      ))
      .groupBy(sql`DATE(started_at)`)
      .orderBy(sql`DATE(started_at)`);

      const recentTrend = dailyTrend.map(day => ({
        date: day.date,
        executions: day.totalExecutions,
        successRate: day.totalExecutions > 0 
          ? (day.successfulExecutions / day.totalExecutions) * 100 
          : 0
      }));

      const summary = {
        totalExecutions: overallStats.totalExecutions,
        successfulExecutions: overallStats.successfulExecutions,
        failedExecutions: overallStats.failedExecutions,
        averageDuration: Number(overallStats.averageDuration) || null,
        totalCost: Number(overallStats.totalCost) || null,
        recentTrend
      };

      return {
        success: true,
        data: summary
      };
    } catch (error) {
      return this.handleError('getAgentExecutionSummary', error);
    }
  }

  /**
   * Check if agent can execute based on constraints
   */
  async canExecuteAgent(agentType: string): Promise<DatabaseOperationResult<{
    canExecute: boolean;
    reason?: string;
    currentExecutions?: number;
    lastExecution?: string;
  }>> {
    try {
      const agentResult = await this.getAgentByType(agentType);
      if (!agentResult.success || !agentResult.data) {
        return {
          success: true,
          data: {
            canExecute: false,
            reason: `Agent configuration not found: ${agentType}`
          }
        };
      }

      const agent = agentResult.data;

      // Check if agent is enabled
      if (!agent.enabled) {
        return {
          success: true,
          data: {
            canExecute: false,
            reason: 'Agent is disabled'
          }
        };
      }

      // Check concurrent executions
      const [currentExecutions] = await db.select({ count: count() })
        .from(executions)
        .where(and(
          eq(executions.agentType, agentType),
          eq(executions.status, 'running' as ExecutionStatus)
        ));

      if (agent.maxConcurrentExecutions && currentExecutions.count >= agent.maxConcurrentExecutions) {
        return {
          success: true,
          data: {
            canExecute: false,
            reason: `Maximum concurrent executions reached (${agent.maxConcurrentExecutions})`,
            currentExecutions: currentExecutions.count
          }
        };
      }

      // Check cooldown period
      if (agent.cooldownMs && agent.cooldownMs > 0) {
        const [lastExecution] = await db.select({ startedAt: executions.startedAt })
          .from(executions)
          .where(eq(executions.agentType, agentType))
          .orderBy(desc(executions.startedAt))
          .limit(1);

        if (lastExecution) {
          const timeSinceLastExecution = Date.now() - new Date(lastExecution.startedAt).getTime();
          if (timeSinceLastExecution < agent.cooldownMs) {
            const remainingCooldown = agent.cooldownMs - timeSinceLastExecution;
            return {
              success: true,
              data: {
                canExecute: false,
                reason: `Agent is in cooldown period (${Math.ceil(remainingCooldown / 1000)}s remaining)`,
                lastExecution: lastExecution.startedAt
              }
            };
          }
        }
      }

      return {
        success: true,
        data: {
          canExecute: true,
          currentExecutions: currentExecutions.count
        }
      };
    } catch (error) {
      return this.handleError('canExecuteAgent', error);
    }
  }

  /**
   * Validate agent configuration data
   */
  private validateAgentConfigData(data: any): void {
    if (!data.agentType) {
      throw new ValidationError('agentType is required', 'agentType');
    }

    if (!data.name) {
      throw new ValidationError('name is required', 'name');
    }

    // Agent type should follow naming convention
    const agentTypePattern = /^[a-z][a-z0-9-]*[a-z0-9]$/;
    if (!agentTypePattern.test(data.agentType)) {
      throw new ValidationError(
        'agentType must be lowercase, alphanumeric with hyphens, starting and ending with a letter or number',
        'agentType',
        data.agentType
      );
    }

    // Validate numeric constraints
    if (data.maxCostPerExecution !== undefined && data.maxCostPerExecution !== null && data.maxCostPerExecution < 0) {
      throw new ValidationError('maxCostPerExecution cannot be negative', 'maxCostPerExecution', data.maxCostPerExecution);
    }

    if (data.maxDurationMs !== undefined && data.maxDurationMs !== null && data.maxDurationMs <= 0) {
      throw new ValidationError('maxDurationMs must be positive', 'maxDurationMs', data.maxDurationMs);
    }

    if (data.timeoutMs !== undefined && data.timeoutMs !== null && data.timeoutMs <= 0) {
      throw new ValidationError('timeoutMs must be positive', 'timeoutMs', data.timeoutMs);
    }

    if (data.maxConcurrentExecutions !== undefined && data.maxConcurrentExecutions !== null && data.maxConcurrentExecutions < 1) {
      throw new ValidationError('maxConcurrentExecutions must be at least 1', 'maxConcurrentExecutions', data.maxConcurrentExecutions);
    }

    if (data.cooldownMs !== undefined && data.cooldownMs !== null && data.cooldownMs < 0) {
      throw new ValidationError('cooldownMs cannot be negative', 'cooldownMs', data.cooldownMs);
    }

    // Validate version format (semantic versioning)
    if (data.version) {
      const versionPattern = /^\d+\.\d+\.\d+$/;
      if (!versionPattern.test(data.version)) {
        throw new ValidationError('version must follow semantic versioning (e.g., 1.0.0)', 'version', data.version);
      }
    }
  }

  /**
   * Handle service errors
   */
  private handleError(operation: string, error: unknown): DatabaseOperationResult<never> {
    console.error(`AgentService.${operation} error:`, error);

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
export const agentService = new AgentService();