// API Request and Response Types for ClaudeOps

import { 
  ExecutionStatus, 
  ExecutionStepStatus, 
  SystemHealthStatus,
  ExecutionFilter,
  CostAnalysisFilter,
  MetricsFilter,
  QueryOptions,
  PaginatedResult,
  DatabaseOperationResult
} from './database';

// Base API Response Structure
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  timestamp: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  stack?: string;
}

// Execution API Types
export interface CreateExecutionRequest {
  agentType: string;
  nodeId?: string;
  triggeredBy?: 'manual' | 'schedule' | 'webhook';
  config?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface UpdateExecutionRequest {
  status?: ExecutionStatus;
  completedAt?: string;
  durationMs?: number;
  costUsd?: number;
  tokensUsed?: number;
  resultSummary?: string;
  errorMessage?: string;
  exitCode?: number;
  logs?: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    stepNumber?: number;
    metadata?: Record<string, any>;
  }>;
  aiAnalysis?: Record<string, any>;
  rawOutput?: string;
}

export interface ExecutionListRequest extends ExecutionFilter, QueryOptions {
  includeSteps?: boolean;
  includeCosts?: boolean;
  includeConfig?: boolean;
}

export interface ExecutionDetailRequest {
  id: string;
  includeSteps?: boolean;
  includeCosts?: boolean;
  includeConfig?: boolean;
  includeLogs?: boolean;
}

// Execution Step API Types
export interface CreateExecutionStepRequest {
  executionId: string;
  stepNumber: number;
  stepName: string;
  stepType?: 'command' | 'analysis' | 'cleanup' | 'validation';
  status?: ExecutionStepStatus;
  metadata?: Record<string, any>;
}

export interface UpdateExecutionStepRequest {
  status?: ExecutionStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

// Cost Tracking API Types
export interface RecordCostRequest {
  executionId: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  requestId?: string;
  responseTime?: number;
  cacheHit?: boolean;
}

export interface CostAnalysisRequest extends CostAnalysisFilter {
  groupBy?: 'day' | 'week' | 'month' | 'agent' | 'model';
  includeBreakdown?: boolean;
  includeProjections?: boolean;
}

export interface CostBudgetRequest {
  monthly?: number;
  daily?: number;
  perExecution?: number;
  alertThresholds?: {
    monthly?: number;
    daily?: number;
    perExecution?: number;
  };
}

// Agent Configuration API Types
export interface CreateAgentConfigRequest {
  agentType: string;
  name: string;
  description?: string;
  version?: string;
  enabled?: boolean;
  config?: Record<string, any>;
  maxCostPerExecution?: number;
  maxDurationMs?: number;
  timeoutMs?: number;
  maxConcurrentExecutions?: number;
  cooldownMs?: number;
}

export interface UpdateAgentConfigRequest {
  name?: string;
  description?: string;
  version?: string;
  enabled?: boolean;
  config?: Record<string, any>;
  maxCostPerExecution?: number;
  maxDurationMs?: number;
  timeoutMs?: number;
  maxConcurrentExecutions?: number;
  cooldownMs?: number;
}

// Schedule API Types
export interface CreateScheduleRequest {
  name: string;
  agentType: string;
  cronExpression: string;
  timezone?: string;
  enabled?: boolean;
  nodeIds?: string[];
  executionConfig?: Record<string, any>;
  maxExecutions?: number;
}

export interface UpdateScheduleRequest {
  name?: string;
  cronExpression?: string;
  timezone?: string;
  enabled?: boolean;
  nodeIds?: string[];
  executionConfig?: Record<string, any>;
  maxExecutions?: number;
}

// System Metrics API Types
export interface RecordSystemMetricRequest {
  nodeId?: string;
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  diskUsagePercent?: number;
  loadAverage1m?: number;
  loadAverage5m?: number;
  loadAverage15m?: number;
  diskFreeBytes?: number;
  diskTotalBytes?: number;
  internetConnected?: boolean;
  claudeApiLatencyMs?: number;
  overallHealth?: SystemHealthStatus;
}

export interface SystemHealthRequest extends MetricsFilter {
  includeHistory?: boolean;
  includeTrends?: boolean;
}

// Dashboard API Types
export interface DashboardDataRequest {
  includeRecentActivity?: boolean;
  includeAgentPerformance?: boolean;
  includeCostTrends?: boolean;
  includeSystemHealth?: boolean;
  recentActivityLimit?: number;
  costTrendDays?: number;
}

export interface AnalyticsRequest {
  type: 'executions' | 'costs' | 'performance' | 'health';
  period: 'hour' | 'day' | 'week' | 'month' | 'year';
  dateFrom?: string;
  dateTo?: string;
  agentType?: string;
  nodeId?: string;
  groupBy?: string[];
  includeComparisons?: boolean;
}

// Bulk Operations API Types
export interface BulkExecutionRequest {
  operations: Array<{
    action: 'create' | 'update' | 'delete';
    data: CreateExecutionRequest | UpdateExecutionRequest;
    id?: string;
  }>;
}

export interface BulkAgentConfigRequest {
  operations: Array<{
    action: 'create' | 'update' | 'delete';
    data: CreateAgentConfigRequest | UpdateAgentConfigRequest;
    agentType?: string;
  }>;
}

// WebSocket Message Types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string;
  requestId?: string;
}

export interface ExecutionProgressMessage extends WebSocketMessage {
  type: 'execution.progress';
  payload: {
    executionId: string;
    agentType: string;
    status: ExecutionStatus;
    progress?: {
      currentStep: number;
      totalSteps: number;
      stepName: string;
    };
    cost?: {
      current: number;
      budget: number;
    };
  };
}

export interface ExecutionLogMessage extends WebSocketMessage {
  type: 'execution.log';
  payload: {
    executionId: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    message: string;
    stepNumber?: number;
    metadata?: Record<string, any>;
  };
}

export interface SystemHealthMessage extends WebSocketMessage {
  type: 'system.health';
  payload: {
    nodeId: string;
    status: SystemHealthStatus;
    metrics: {
      cpu: number;
      memory: number;
      disk: number;
    };
    alerts?: Array<{
      type: string;
      message: string;
      severity: 'low' | 'medium' | 'high';
    }>;
  };
}

// Search and Filter API Types
export interface SearchRequest {
  query: string;
  type?: 'executions' | 'agents' | 'schedules' | 'logs';
  filters?: Record<string, any>;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  type: 'execution' | 'agent' | 'schedule' | 'log';
  id: string;
  title: string;
  description: string;
  relevanceScore: number;
  metadata: Record<string, any>;
}

// Export/Import API Types
export interface ExportRequest {
  type: 'executions' | 'costs' | 'config' | 'all';
  format: 'json' | 'csv' | 'excel';
  dateFrom?: string;
  dateTo?: string;
  filters?: Record<string, any>;
}

export interface ImportRequest {
  type: 'config' | 'schedules';
  format: 'json' | 'csv';
  data: string; // Base64 encoded file data
  options?: {
    overwrite?: boolean;
    validate?: boolean;
    dryRun?: boolean;
  };
}

// Validation API Types
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
  warnings: Array<{
    field: string;
    message: string;
    suggestion?: string;
  }>;
}

// Health Check API Types
export interface HealthCheckRequest {
  includeDatabase?: boolean;
  includeFileSystem?: boolean;
  includeExternalServices?: boolean;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: 'up' | 'down';
      responseTime?: number;
      error?: string;
    };
    fileSystem: {
      status: 'up' | 'down';
      freeSpace?: number;
      totalSpace?: number;
      error?: string;
    };
    externalServices: {
      claude: {
        status: 'up' | 'down';
        responseTime?: number;
        error?: string;
      };
    };
  };
  version: string;
  uptime: number;
}

// Pagination Helper Types
export interface PaginationRequest {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

// Rate Limiting Types
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

// Response Wrapper Types
export type ApiSuccess<T> = ApiResponse<T> & { success: true };
export type ApiFailure = ApiResponse<never> & { success: false };
export type PaginatedApiResponse<T> = ApiSuccess<PaginationResponse<T>>;

// Type Guards
export function isApiError(response: ApiResponse): response is ApiFailure {
  return !response.success;
}

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccess<T> {
  return response.success;
}

export function isPaginatedResponse<T>(
  response: ApiResponse
): response is PaginatedApiResponse<T> {
  return response.success && 'pagination' in (response.data || {});
}