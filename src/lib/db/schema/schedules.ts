import { 
  sqliteTable, 
  text, 
  integer,
  index 
} from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { agentConfigurations } from './agentConfigs';

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  // Schedule identification
  name: text('name').notNull(),
  agentType: text('agent_type').notNull()
    .references(() => agentConfigurations.agentType),
  
  // Cron configuration
  cronExpression: text('cron_expression').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  
  // Schedule state
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  nextRun: text('next_run'),
  lastRun: text('last_run'),
  
  // Execution context
  nodeIds: text('node_ids'), // JSON array for future multi-node
  executionConfig: text('execution_config'), // JSON override config
  
  // Limits and controls
  maxExecutions: integer('max_executions'), // null = unlimited
  executionsCount: integer('executions_count').notNull().default(0),
  
  // Metadata
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  scheduleAgentTypeIdx: index('schedule_agent_type_idx').on(table.agentType),
  scheduleEnabledIdx: index('schedule_enabled_idx').on(table.enabled),
  scheduleNextRunIdx: index('schedule_next_run_idx').on(table.nextRun),
}));