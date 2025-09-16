import { and, eq, desc, asc, count, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../db/connection';
import { schedules, agentConfigurations } from '../db/schema';
import type {
  Schedule,
  NewSchedule,
  ScheduleUpdate,
  DatabaseOperationResult,
  PaginatedResult
} from '../types/database';
import { ValidationError, NotFoundError } from '../types/database';

// Cron validation regex patterns
const CRON_PATTERNS = {
  second: '([0-5]?[0-9]|\\*)',
  minute: '([0-5]?[0-9]|\\*)',
  hour: '([01]?[0-9]|2[0-3]|\\*)',
  day: '([01]?[0-9]|2[0-9]|3[01]|\\*)',
  month: '([01]?[0-9]|1[0-2]|\\*)',
  dayOfWeek: '([0-6]|\\*)'
} as const;

// Common cron expressions for validation and suggestions
const COMMON_CRONS = {
  'every-minute': '* * * * *',
  'every-5-minutes': '*/5 * * * *',
  'every-15-minutes': '*/15 * * * *',
  'every-30-minutes': '*/30 * * * *',
  'hourly': '0 * * * *',
  'daily-midnight': '0 0 * * *',
  'daily-noon': '0 12 * * *',
  'weekly-sunday': '0 0 * * 0',
  'monthly-first': '0 0 1 * *'
} as const;

// Prepared statements for performance optimization
const preparedQueries = {
  getById: db.select()
    .from(schedules)
    .where(eq(schedules.id, sql.placeholder('id')))
    .prepare(),

  getByAgentType: db.select()
    .from(schedules)
    .where(eq(schedules.agentType, sql.placeholder('agentType')))
    .prepare(),

  getEnabledSchedules: db.select()
    .from(schedules)
    .where(eq(schedules.enabled, true))
    .prepare(),

  updateNextRun: db.update(schedules)
    .set({
      nextRun: sql.placeholder('nextRun') as any,
      updatedAt: sql.placeholder('updatedAt') as any
    })
    .where(eq(schedules.id, sql.placeholder('id')))
    .prepare(),

  updateLastRun: db.update(schedules)
    .set({
      lastRun: sql.placeholder('lastRun') as any,
      executionsCount: sql.placeholder('executionsCount') as any,
      updatedAt: sql.placeholder('updatedAt') as any
    })
    .where(eq(schedules.id, sql.placeholder('id')))
    .prepare(),
};

interface ScheduleWithAgent extends Schedule {
  agentConfig: {
    name: string;
    enabled: boolean;
    maxConcurrentExecutions: number | null;
  } | null;
}

interface ScheduleValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  nextRuns: string[];
  suggestions?: string[];
}

export class ScheduleService {
  /**
   * Create a new schedule
   */
  async createSchedule(data: Omit<NewSchedule, 'id'>): Promise<DatabaseOperationResult<Schedule>> {
    try {
      await this.validateScheduleData(data);

      // Calculate next run time
      const nextRun = this.calculateNextRun(data.cronExpression, data.timezone);

      const scheduleData: NewSchedule = {
        id: createId(),
        ...data,
        nextRun: nextRun.toISOString(),
        nodeIds: data.nodeIds ? JSON.stringify(data.nodeIds) : undefined,
        executionConfig: data.executionConfig ? JSON.stringify(data.executionConfig) : undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const [result] = await db.insert(schedules).values(scheduleData).returning();

      // Parse JSON fields
      const parsedResult = this.parseScheduleJson(result);

      return {
        success: true,
        data: parsedResult,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('createSchedule', error);
    }
  }

  /**
   * Get schedule by ID
   */
  async getScheduleById(id: string, includeAgent: boolean = false): Promise<DatabaseOperationResult<Schedule | ScheduleWithAgent>> {
    try {
      if (includeAgent) {
        const result = await db.select()
          .from(schedules)
          .where(eq(schedules.id, id))
          .limit(1);
        
        const schedule = result[0];
        if (!schedule) {
          throw new NotFoundError('Schedule', id);
        }

        // Get agent config separately
        const agentConfig = await db.select({
          name: agentConfigurations.name,
          enabled: agentConfigurations.enabled,
          maxConcurrentExecutions: agentConfigurations.maxConcurrentExecutions,
        })
        .from(agentConfigurations)
        .where(eq(agentConfigurations.agentType, schedule.agentType))
        .limit(1);

        const parsedResult = this.parseScheduleJson(schedule) as ScheduleWithAgent;
        parsedResult.agentConfig = agentConfig[0] || null;

        return {
          success: true,
          data: parsedResult
        };
      } else {
        const [result] = await preparedQueries.getById.execute({ id });

        if (!result) {
          throw new NotFoundError('Schedule', id);
        }

        const parsedResult = this.parseScheduleJson(result);

        return {
          success: true,
          data: parsedResult
        };
      }
    } catch (error) {
      return this.handleError('getScheduleById', error);
    }
  }

  /**
   * Update schedule
   */
  async updateSchedule(id: string, updates: ScheduleUpdate): Promise<DatabaseOperationResult<Schedule>> {
    try {
      if (updates.cronExpression || updates.timezone) {
        await this.validateCronExpression(updates.cronExpression || '');
      }

      const updateData = {
        ...updates,
        nodeIds: updates.nodeIds ? JSON.stringify(updates.nodeIds) : undefined,
        executionConfig: updates.executionConfig ? JSON.stringify(updates.executionConfig) : undefined,
        updatedAt: new Date().toISOString()
      };

      // Recalculate next run if cron or timezone changed
      if (updates.cronExpression || updates.timezone) {
        const currentSchedule = await this.getScheduleById(id);
        if (currentSchedule.success && currentSchedule.data) {
          const cronExpression = updates.cronExpression || currentSchedule.data.cronExpression;
          const timezone = updates.timezone || currentSchedule.data.timezone;
          const nextRun = this.calculateNextRun(cronExpression, timezone);
          updateData.nextRun = nextRun.toISOString();
        }
      }

      const [result] = await db.update(schedules)
        .set(updateData)
        .where(eq(schedules.id, id))
        .returning();

      if (!result) {
        throw new NotFoundError('Schedule', id);
      }

      const parsedResult = this.parseScheduleJson(result);

      return {
        success: true,
        data: parsedResult,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('updateSchedule', error);
    }
  }

  /**
   * Delete schedule
   */
  async deleteSchedule(id: string): Promise<DatabaseOperationResult<void>> {
    try {
      const result = await db.delete(schedules).where(eq(schedules.id, id));

      if (result.changes === 0) {
        throw new NotFoundError('Schedule', id);
      }

      return {
        success: true,
        affectedRows: result.changes
      };
    } catch (error) {
      return this.handleError('deleteSchedule', error);
    }
  }

  /**
   * Get schedules with filtering and pagination
   */
  async getSchedules(options: {
    agentType?: string;
    enabled?: boolean;
    includeAgent?: boolean;
    limit?: number;
    offset?: number;
    orderBy?: 'name' | 'nextRun' | 'lastRun' | 'createdAt';
    orderDirection?: 'asc' | 'desc';
  } = {}): Promise<DatabaseOperationResult<PaginatedResult<Schedule | ScheduleWithAgent>>> {
    try {
      const {
        agentType,
        enabled,
        includeAgent = false,
        limit = 50,
        offset = 0,
        orderBy = 'nextRun',
        orderDirection = 'asc'
      } = options;

      // Build conditions
      const conditions = [];
      if (agentType) {
        conditions.push(eq(schedules.agentType, agentType));
      }
      if (enabled !== undefined) {
        conditions.push(eq(schedules.enabled, enabled));
      }

      // Build query with conditions and ordering
      const whereCondition = conditions.length > 0 ? and(...conditions) : undefined;
      
      // Select order column based on orderBy parameter
      let orderColumn;
      switch (orderBy) {
        case 'name':
          orderColumn = orderDirection === 'asc' ? asc(schedules.name) : desc(schedules.name);
          break;
        case 'nextRun':
          orderColumn = orderDirection === 'asc' ? asc(schedules.nextRun) : desc(schedules.nextRun);
          break;
        case 'lastRun':
          orderColumn = orderDirection === 'asc' ? asc(schedules.lastRun) : desc(schedules.lastRun);
          break;
        case 'createdAt':
          orderColumn = orderDirection === 'asc' ? asc(schedules.createdAt) : desc(schedules.createdAt);
          break;
        default:
          orderColumn = asc(schedules.nextRun);
      }
      
      // Build the query
      const baseQuery = db.select().from(schedules);
      const query = whereCondition 
        ? baseQuery.where(whereCondition).orderBy(orderColumn)
        : baseQuery.orderBy(orderColumn);
      
      // Get total count
      const baseCountQuery = db.select({ count: count() }).from(schedules);
      const countQuery = whereCondition 
        ? baseCountQuery.where(whereCondition)
        : baseCountQuery;

      const [{ count: total }] = await countQuery;
      const results = await query.limit(limit).offset(offset);

      // Parse JSON fields
      const parsedResults = results.map(result => this.parseScheduleJson(result));

      // Include agent data if requested
      let finalResults: (Schedule | ScheduleWithAgent)[];
      if (includeAgent) {
        finalResults = await Promise.all(
          parsedResults.map(async (schedule) => {
            const agentResult = await db.select({
              name: agentConfigurations.name,
              enabled: agentConfigurations.enabled,
              maxConcurrentExecutions: agentConfigurations.maxConcurrentExecutions,
            })
            .from(agentConfigurations)
            .where(eq(agentConfigurations.agentType, schedule.agentType));

            return {
              ...schedule,
              agentConfig: agentResult[0] || null
            } as ScheduleWithAgent;
          })
        );
      } else {
        finalResults = parsedResults;
      }

      return {
        success: true,
        data: {
          data: finalResults,
          total,
          page: Math.floor(offset / limit) + 1,
          pageSize: limit,
          hasMore: offset + results.length < total
        }
      };
    } catch (error) {
      return this.handleError('getSchedules', error);
    }
  }

  /**
   * Get enabled schedules ready for execution
   */
  async getReadySchedules(): Promise<DatabaseOperationResult<Schedule[]>> {
    try {
      const now = new Date().toISOString();
      
      const results = await db.select()
        .from(schedules)
        .where(and(
          eq(schedules.enabled, true),
          sql`next_run <= ${now}`
        ))
        .orderBy(asc(schedules.nextRun));

      const parsedResults = results.map(result => this.parseScheduleJson(result));

      return {
        success: true,
        data: parsedResults
      };
    } catch (error) {
      return this.handleError('getReadySchedules', error);
    }
  }

  /**
   * Update schedule's next run time
   */
  async updateNextRun(id: string, nextRun?: Date): Promise<DatabaseOperationResult<void>> {
    try {
      let nextRunTime: Date;
      
      if (nextRun) {
        nextRunTime = nextRun;
      } else {
        // Recalculate next run based on current cron expression
        const scheduleResult = await this.getScheduleById(id);
        if (!scheduleResult.success || !scheduleResult.data) {
          throw new NotFoundError('Schedule', id);
        }
        
        nextRunTime = this.calculateNextRun(
          scheduleResult.data.cronExpression,
          scheduleResult.data.timezone
        );
      }

      await preparedQueries.updateNextRun.execute({
        id,
        nextRun: nextRunTime.toISOString(),
        updatedAt: new Date().toISOString()
      });

      return {
        success: true,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('updateNextRun', error);
    }
  }

  /**
   * Record schedule execution
   */
  async recordExecution(id: string): Promise<DatabaseOperationResult<void>> {
    try {
      // Get current schedule
      const scheduleResult = await this.getScheduleById(id);
      if (!scheduleResult.success || !scheduleResult.data) {
        throw new NotFoundError('Schedule', id);
      }

      const schedule = scheduleResult.data;
      const newExecutionCount = schedule.executionsCount + 1;

      // Calculate next run
      const nextRun = this.calculateNextRun(schedule.cronExpression, schedule.timezone);

      await preparedQueries.updateLastRun.execute({
        id,
        lastRun: new Date().toISOString(),
        executionsCount: newExecutionCount,
        updatedAt: new Date().toISOString()
      });

      // Update next run
      await this.updateNextRun(id, nextRun);

      // Disable schedule if max executions reached
      if (schedule.maxExecutions && newExecutionCount >= schedule.maxExecutions) {
        await this.updateSchedule(id, { enabled: false });
      }

      return {
        success: true,
        affectedRows: 1
      };
    } catch (error) {
      return this.handleError('recordExecution', error);
    }
  }

  /**
   * Validate cron expression and return detailed validation result
   */
  async validateCronExpression(cronExpression: string, timezone: string = 'UTC'): Promise<ScheduleValidation> {
    const validation: ScheduleValidation = {
      isValid: false,
      errors: [],
      warnings: [],
      nextRuns: [],
      suggestions: []
    };

    try {
      // Basic format validation
      const parts = cronExpression.trim().split(/\s+/);
      if (parts.length !== 5) {
        validation.errors.push(`Cron expression must have exactly 5 parts, got ${parts.length}`);
        validation.suggestions = Object.keys(COMMON_CRONS).map(key => 
          `${key}: ${COMMON_CRONS[key as keyof typeof COMMON_CRONS]}`
        );
        return validation;
      }

      // Validate each part
      const [minute, hour, day, month, dayOfWeek] = parts;
      
      if (!this.isValidCronPart(minute, 'minute')) {
        validation.errors.push('Invalid minute part');
      }
      if (!this.isValidCronPart(hour, 'hour')) {
        validation.errors.push('Invalid hour part');
      }
      if (!this.isValidCronPart(day, 'day')) {
        validation.errors.push('Invalid day part');
      }
      if (!this.isValidCronPart(month, 'month')) {
        validation.errors.push('Invalid month part');
      }
      if (!this.isValidCronPart(dayOfWeek, 'dayOfWeek')) {
        validation.errors.push('Invalid day of week part');
      }

      if (validation.errors.length === 0) {
        validation.isValid = true;

        // Generate next few run times for preview
        try {
          const nextRuns: Date[] = [];
          let currentTime = new Date();
          
          for (let i = 0; i < 5; i++) {
            const nextRun = this.calculateNextRun(cronExpression, timezone, currentTime);
            nextRuns.push(nextRun);
            currentTime = new Date(nextRun.getTime() + 60000); // Add 1 minute
          }

          validation.nextRuns = nextRuns.map(date => date.toISOString());
        } catch (error) {
          validation.warnings.push('Could not calculate next run times');
        }

        // Add warnings for potentially problematic expressions
        if (cronExpression.includes('* * * * *')) {
          validation.warnings.push('This will run every minute - consider if this is intended');
        }
        if (minute === '*' && hour === '*') {
          validation.warnings.push('This will run every minute - very frequent execution');
        }
      }

      return validation;
    } catch (error) {
      validation.errors.push(`Invalid cron expression: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return validation;
    }
  }

  /**
   * Calculate the next run time for a cron expression
   */
  private calculateNextRun(cronExpression: string, timezone: string = 'UTC', fromTime?: Date): Date {
    // This is a simplified implementation
    // In production, you would use a proper cron parsing library like 'cron-parser'
    
    const now = fromTime || new Date();
    const nextRun = new Date(now.getTime() + 60000); // Simple: add 1 minute
    
    // TODO: Implement proper cron parsing
    // For now, return a simple next minute increment
    // This should be replaced with proper cron calculation logic
    
    return nextRun;
  }

  /**
   * Validate individual cron part
   */
  private isValidCronPart(part: string, type: keyof typeof CRON_PATTERNS): boolean {
    if (part === '*') return true;
    
    // Handle ranges (e.g., "1-5")
    if (part.includes('-')) {
      const [start, end] = part.split('-');
      return this.isValidCronNumber(start, type) && this.isValidCronNumber(end, type);
    }
    
    // Handle steps (e.g., "*/5")
    if (part.includes('/')) {
      const [base, step] = part.split('/');
      return (base === '*' || this.isValidCronNumber(base, type)) && 
             !isNaN(Number(step)) && Number(step) > 0;
    }
    
    // Handle lists (e.g., "1,3,5")
    if (part.includes(',')) {
      return part.split(',').every(p => this.isValidCronNumber(p.trim(), type));
    }
    
    return this.isValidCronNumber(part, type);
  }

  /**
   * Validate cron number against type constraints
   */
  private isValidCronNumber(value: string, type: keyof typeof CRON_PATTERNS): boolean {
    const num = Number(value);
    if (isNaN(num)) return false;

    switch (type) {
      case 'minute':
        return num >= 0 && num <= 59;
      case 'hour':
        return num >= 0 && num <= 23;
      case 'day':
        return num >= 1 && num <= 31;
      case 'month':
        return num >= 1 && num <= 12;
      case 'dayOfWeek':
        return num >= 0 && num <= 6;
      default:
        return false;
    }
  }

  /**
   * Parse JSON fields in schedule
   */
  private parseScheduleJson(schedule: any): Schedule {
    return {
      ...schedule,
      nodeIds: schedule.nodeIds ? JSON.parse(schedule.nodeIds) : null,
      executionConfig: schedule.executionConfig ? JSON.parse(schedule.executionConfig) : null,
    };
  }

  /**
   * Validate schedule data
   */
  private async validateScheduleData(data: Omit<NewSchedule, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Schedule name is required', 'name');
    }

    if (!data.agentType) {
      throw new ValidationError('Agent type is required', 'agentType');
    }

    if (!data.cronExpression) {
      throw new ValidationError('Cron expression is required', 'cronExpression');
    }

    // Validate agent exists and is enabled
    const agentResult = await db.select({ enabled: agentConfigurations.enabled })
      .from(agentConfigurations)
      .where(eq(agentConfigurations.agentType, data.agentType))
      .limit(1);

    if (agentResult.length === 0) {
      throw new ValidationError(`Agent type '${data.agentType}' does not exist`, 'agentType');
    }

    if (!agentResult[0].enabled) {
      throw new ValidationError(`Agent type '${data.agentType}' is disabled`, 'agentType');
    }

    // Validate cron expression
    const cronValidation = await this.validateCronExpression(data.cronExpression, data.timezone);
    if (!cronValidation.isValid) {
      throw new ValidationError(
        `Invalid cron expression: ${cronValidation.errors.join(', ')}`,
        'cronExpression'
      );
    }

    if (data.maxExecutions !== undefined && data.maxExecutions !== null && data.maxExecutions < 1) {
      throw new ValidationError('maxExecutions must be at least 1', 'maxExecutions');
    }

    if (data.timezone && !this.isValidTimezone(data.timezone)) {
      throw new ValidationError('Invalid timezone', 'timezone', data.timezone);
    }
  }

  /**
   * Validate timezone
   */
  private isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle service errors
   */
  private handleError(operation: string, error: unknown): DatabaseOperationResult<never> {
    console.error(`ScheduleService.${operation} error:`, error);

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
export const scheduleService = new ScheduleService();