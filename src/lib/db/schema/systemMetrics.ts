import { 
  sqliteTable, 
  text, 
  integer, 
  real,
  index 
} from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

// System health metrics
export const systemMetrics = sqliteTable('system_metrics', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  nodeId: text('node_id').notNull().default('localhost'),
  
  // Resource metrics
  cpuUsagePercent: real('cpu_usage_percent'),
  memoryUsagePercent: real('memory_usage_percent'),
  diskUsagePercent: real('disk_usage_percent'),
  
  // System load
  loadAverage1m: real('load_average_1m'),
  loadAverage5m: real('load_average_5m'),
  loadAverage15m: real('load_average_15m'),
  
  // Storage metrics
  diskFreeBytes: integer('disk_free_bytes'),
  diskTotalBytes: integer('disk_total_bytes'),
  
  // Network connectivity
  internetConnected: integer('internet_connected', { mode: 'boolean' }),
  claudeApiLatencyMs: integer('claude_api_latency_ms'),
  
  // Health status
  overallHealth: text('overall_health', { 
    enum: ['healthy', 'warning', 'critical'] 
  }).notNull().default('healthy'),
  
  timestamp: text('timestamp').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  metricsNodeTimestampIdx: index('metrics_node_timestamp_idx').on(table.nodeId, table.timestamp),
  metricsHealthIdx: index('metrics_health_idx').on(table.overallHealth),
  metricsTimestampIdx: index('metrics_timestamp_idx').on(table.timestamp),
}));

// Application configuration and settings
export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  
  // Type information for validation
  valueType: text('value_type', { 
    enum: ['string', 'number', 'boolean', 'json'] 
  }).notNull().default('string'),
  
  // Configuration category
  category: text('category').notNull().default('general'),
  
  // Access control
  isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
  isReadonly: integer('is_readonly', { mode: 'boolean' }).notNull().default(false),
  
  createdAt: text('created_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull()
    .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
  settingsKeyIdx: index('settings_key_idx').on(table.key),
  settingsCategoryIdx: index('settings_category_idx').on(table.category),
}));