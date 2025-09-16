import { 
  sqliteTable, 
  text, 
  integer,
  index 
} from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';
import { executions } from './executions';

// Execution steps for detailed tracking
export const executionSteps = sqliteTable('execution_steps', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  executionId: text('execution_id').notNull()
    .references(() => executions.id, { onDelete: 'cascade' }),
  
  stepNumber: integer('step_number').notNull(),
  stepName: text('step_name').notNull(),
  stepType: text('step_type'), // 'command', 'analysis', 'cleanup'
  
  status: text('status', { 
    enum: ['pending', 'running', 'completed', 'failed', 'skipped'] 
  }).notNull().default('pending'),
  
  startedAt: text('started_at')
    .$defaultFn(() => new Date().toISOString()),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
  
  output: text('output'),
  errorMessage: text('error_message'),
  metadata: text('metadata'), // JSON
  
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  stepsExecutionIdx: index('steps_execution_idx').on(table.executionId),
  stepsNumberIdx: index('steps_number_idx').on(table.executionId, table.stepNumber),
}));