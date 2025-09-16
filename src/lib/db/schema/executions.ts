import { 
  sqliteTable, 
  text, 
  integer, 
  real,
  index 
} from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const executions = sqliteTable('executions', {
  // Primary identification
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  // Execution metadata
  agentType: text('agent_type').notNull(),
  status: text('status', { 
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] 
  }).notNull().default('pending'),
  
  // Timing information
  startedAt: text('started_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
  
  // Cost tracking
  costUsd: real('cost_usd'),
  tokensUsed: integer('tokens_used'),
  
  // Execution context
  nodeId: text('node_id'), // For future remote execution
  triggeredBy: text('triggered_by'), // 'manual', 'schedule', 'webhook'
  
  // Results and logs
  resultSummary: text('result_summary'),
  errorMessage: text('error_message'),
  exitCode: integer('exit_code'),
  
  // Large data stored as JSON
  logs: text('logs'), // JSON array of log entries
  aiAnalysis: text('ai_analysis'), // JSON object from Claude
  rawOutput: text('raw_output'), // Complete execution output
  executionContext: text('execution_context'), // JSON metadata
  
  // Metadata
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  execStatusIdx: index('exec_status_idx').on(table.status),
  execAgentTypeIdx: index('exec_agent_type_idx').on(table.agentType),
  execStartedAtIdx: index('exec_started_at_idx').on(table.startedAt),
  execCostIdx: index('exec_cost_idx').on(table.costUsd),
  execNodeIdx: index('exec_node_idx').on(table.nodeId),
  
  // Composite indexes for common queries
  execStatusAgentIdx: index('exec_status_agent_idx').on(table.status, table.agentType),
  execDateRangeIdx: index('exec_date_range_idx').on(table.startedAt, table.completedAt),
}));