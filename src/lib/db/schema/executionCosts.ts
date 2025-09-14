import { 
  sqliteTable, 
  text, 
  real, 
  integer,
  index 
} from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { executions } from './executions';

export const costTracking = sqliteTable('cost_tracking', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  executionId: text('execution_id')
    .references(() => executions.id, { onDelete: 'cascade' }),
  
  // Cost breakdown
  modelUsed: text('model_used').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  inputCostUsd: real('input_cost_usd').notNull().default(0),
  outputCostUsd: real('output_cost_usd').notNull().default(0),
  totalCostUsd: real('total_cost_usd').notNull().default(0),
  
  // Claude SDK metadata
  requestId: text('request_id'),
  responseTime: integer('response_time_ms'),
  cacheHit: integer('cache_hit', { mode: 'boolean' }).default(false),
  
  // Timestamps
  timestamp: text('timestamp').notNull()
    .$defaultFn(() => new Date().toISOString()),
    
  // Monthly aggregation fields
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  day: integer('day').notNull(),
}, (table) => ({
  costExecutionIdx: index('cost_execution_idx').on(table.executionId),
  costDateIdx: index('cost_date_idx').on(table.year, table.month, table.day),
  costMonthlyIdx: index('cost_monthly_idx').on(table.year, table.month),
  costTotalIdx: index('cost_total_idx').on(table.totalCostUsd),
}));

// Monthly cost summaries for fast dashboard queries
export const monthlyCostSummaries = sqliteTable('monthly_cost_summaries', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  year: integer('year').notNull(),
  month: integer('month').notNull(),
  
  totalCostUsd: real('total_cost_usd').notNull().default(0),
  totalExecutions: integer('total_executions').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  
  avgCostPerExecution: real('avg_cost_per_execution').notNull().default(0),
  avgTokensPerExecution: real('avg_tokens_per_execution').notNull().default(0),
  
  // Agent type breakdown (JSON)
  costByAgentType: text('cost_by_agent_type'), // JSON object
  
  lastUpdated: text('last_updated').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  summaryYearMonthIdx: index('summary_year_month_idx').on(table.year, table.month),
}));