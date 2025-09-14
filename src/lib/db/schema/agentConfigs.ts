import { 
  sqliteTable, 
  text, 
  integer, 
  real,
  index 
} from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

export const agentConfigurations = sqliteTable('agent_configurations', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  // Agent identification
  agentType: text('agent_type').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  
  // Configuration
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  config: text('config'), // JSON configuration
  
  // Cost and resource limits
  maxCostPerExecution: real('max_cost_per_execution'),
  maxDurationMs: integer('max_duration_ms'),
  timeoutMs: integer('timeout_ms').default(300000), // 5 minutes default
  
  // Execution constraints
  maxConcurrentExecutions: integer('max_concurrent_executions').default(1),
  cooldownMs: integer('cooldown_ms').default(0),
  
  // Metadata
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  configAgentTypeIdx: index('config_agent_type_idx').on(table.agentType),
  configEnabledIdx: index('config_enabled_idx').on(table.enabled),
}));