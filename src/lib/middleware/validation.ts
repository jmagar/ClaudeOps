import { z } from 'zod';

// Common validation schemas
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const DateRangeSchema = z.object({
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
});

export const ExecutionFilterSchema = PaginationSchema.extend({
  agentType: z.string().optional(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
  nodeId: z.string().optional(),
  triggeredBy: z.enum(['manual', 'schedule', 'webhook']).optional(),
}).merge(DateRangeSchema);

// Execution API Schemas
export const CreateExecutionSchema = z.object({
  agentType: z.string().min(1, 'Agent type is required'),
  nodeId: z.string().optional(),
  triggeredBy: z.enum(['manual', 'schedule', 'webhook']).default('manual'),
  config: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const UpdateExecutionSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  resultSummary: z.string().optional(),
  errorMessage: z.string().optional(),
  exitCode: z.number().int().optional(),
  logs: z.string().optional(), // JSON string of log entries
  aiAnalysis: z.string().optional(), // JSON string of analysis data
  rawOutput: z.string().optional(),
});

export const ExecutionDetailQuerySchema = z.object({
  includeSteps: z.boolean().default(false),
  includeCosts: z.boolean().default(false),
  includeConfig: z.boolean().default(false),
  includeLogs: z.boolean().default(false),
});

// Agent Configuration Schemas
export const CreateAgentConfigSchema = z.object({
  agentType: z.string()
    .min(1, 'Agent type is required')
    .regex(/^[a-z][a-z0-9-]*[a-z0-9]$/, 'Agent type must be lowercase, alphanumeric with hyphens'),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning (e.g., 1.0.0)').optional(),
  enabled: z.boolean().default(true),
  config: z.string().optional(), // JSON string of config data
  maxCostPerExecution: z.number().nonnegative().optional(),
  maxDurationMs: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxConcurrentExecutions: z.number().int().min(1).optional(),
  cooldownMs: z.number().int().nonnegative().optional(),
});

export const UpdateAgentConfigSchema = CreateAgentConfigSchema.partial().omit({ agentType: true });

export const AgentListQuerySchema = z.object({
  enabled: z.boolean().optional(),
  orderBy: z.enum(['name', 'agentType', 'createdAt', 'updatedAt']).default('name'),
  orderDirection: z.enum(['asc', 'desc']).default('asc'),
}).merge(PaginationSchema);

// Cost Tracking Schemas
export const RecordCostSchema = z.object({
  executionId: z.string().min(1, 'Execution ID is required'),
  modelUsed: z.string().min(1, 'Model is required'),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  inputCostUsd: z.number().nonnegative(),
  outputCostUsd: z.number().nonnegative(),
  totalCostUsd: z.number().nonnegative(),
  requestId: z.string().optional(),
  responseTime: z.number().nonnegative().optional(),
  cacheHit: z.boolean().optional(),
});

export const CostAnalysisQuerySchema = z.object({
  agentType: z.string().optional(),
  modelUsed: z.string().optional(),
  executionId: z.string().optional(),
  groupBy: z.enum(['day', 'week', 'month', 'agent', 'model']).optional(),
  includeBreakdown: z.boolean().default(false),
  includeProjections: z.boolean().default(false),
}).merge(DateRangeSchema).merge(PaginationSchema);

export const CostTrendsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month']).default('day'),
  days: z.number().int().positive().max(365).default(30),
});

// Schedule Schemas
export const CreateScheduleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  agentType: z.string().min(1, 'Agent type is required'),
  cronExpression: z.string().min(1, 'Cron expression is required'),
  timezone: z.string().default('UTC'),
  enabled: z.boolean().default(true),
  nodeIds: z.array(z.string()).optional(),
  executionConfig: z.record(z.string(), z.any()).optional(),
  maxExecutions: z.number().int().positive().optional(),
});

export const UpdateScheduleSchema = CreateScheduleSchema.partial().omit({ agentType: true });

// System Health Schemas
export const HealthCheckQuerySchema = z.object({
  includeDatabase: z.boolean().default(true),
  includeFileSystem: z.boolean().default(true),
  includeExternalServices: z.boolean().default(true),
});

export const RecordSystemMetricSchema = z.object({
  nodeId: z.string().default('localhost'),
  cpuUsagePercent: z.number().min(0).max(100).optional(),
  memoryUsagePercent: z.number().min(0).max(100).optional(),
  diskUsagePercent: z.number().min(0).max(100).optional(),
  loadAverage1m: z.number().nonnegative().optional(),
  loadAverage5m: z.number().nonnegative().optional(),
  loadAverage15m: z.number().nonnegative().optional(),
  diskFreeBytes: z.number().nonnegative().optional(),
  diskTotalBytes: z.number().positive().optional(),
  internetConnected: z.boolean().optional(),
  claudeApiLatencyMs: z.number().nonnegative().optional(),
  overallHealth: z.enum(['healthy', 'degraded', 'unhealthy']).optional(),
});

// Metrics Query Schema
export const MetricsQuerySchema = z.object({
  nodeId: z.string().default('localhost'),
  timeframe: z.enum(['hour', 'day', 'week', 'month']).default('day'),
  metrics: z.string().optional(), // comma-separated list
  healthStatus: z.enum(['healthy', 'warning', 'critical']).optional(),
  limit: z.number().int().positive().max(1000).default(100),
  offset: z.number().int().nonnegative().default(0),
}).merge(DateRangeSchema);

// Bulk Operations Schemas
export const BulkExecutionSchema = z.object({
  operations: z.array(z.object({
    action: z.enum(['create', 'update', 'delete']),
    data: z.union([CreateExecutionSchema, UpdateExecutionSchema]),
    id: z.string().optional(),
  })).min(1).max(100),
});

// Search Schemas
export const SearchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  type: z.enum(['executions', 'agents', 'schedules', 'logs']).optional(),
  filters: z.record(z.string(), z.any()).optional(),
}).merge(PaginationSchema);

// Export/Import Schemas
export const ExportQuerySchema = z.object({
  type: z.enum(['executions', 'costs', 'config', 'all']),
  format: z.enum(['json', 'csv', 'excel']),
  filters: z.record(z.string(), z.any()).optional(),
}).merge(DateRangeSchema);

// Validation helper types
export type PaginationParams = z.infer<typeof PaginationSchema>;
export type ExecutionFilterParams = z.infer<typeof ExecutionFilterSchema>;
export type CreateExecutionRequest = z.infer<typeof CreateExecutionSchema>;
export type UpdateExecutionRequest = z.infer<typeof UpdateExecutionSchema>;
export type ExecutionDetailQuery = z.infer<typeof ExecutionDetailQuerySchema>;
export type CreateAgentConfigRequest = z.infer<typeof CreateAgentConfigSchema>;
export type UpdateAgentConfigRequest = z.infer<typeof UpdateAgentConfigSchema>;
export type AgentListQuery = z.infer<typeof AgentListQuerySchema>;
export type RecordCostRequest = z.infer<typeof RecordCostSchema>;
export type CostAnalysisQuery = z.infer<typeof CostAnalysisQuerySchema>;
export type CostTrendsQuery = z.infer<typeof CostTrendsQuerySchema>;
export type CreateScheduleRequest = z.infer<typeof CreateScheduleSchema>;
export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleSchema>;
export type HealthCheckQuery = z.infer<typeof HealthCheckQuerySchema>;
export type RecordSystemMetricRequest = z.infer<typeof RecordSystemMetricSchema>;
export type MetricsQuery = z.infer<typeof MetricsQuerySchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type ExportQuery = z.infer<typeof ExportQuerySchema>;

// Custom validation helpers
export function validateCronExpression(expression: string): boolean {
  // Basic cron validation - you might want to use a dedicated library for more thorough validation
  const parts = expression.split(' ');
  return parts.length >= 5 && parts.length <= 6;
}

export function validateAgentType(agentType: string): boolean {
  return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(agentType);
}

export function validateSemanticVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}