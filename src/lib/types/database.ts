import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { 
  executions,
  executionSteps,
  costTracking,
  monthlyCostSummaries,
  agentConfigurations,
  schedules,
  systemMetrics
} from '../db/schema';

// Inferred types from schema
export type Execution = InferSelectModel<typeof executions>;
export type NewExecution = InferInsertModel<typeof executions>;
export type ExecutionUpdate = Partial<Omit<NewExecution, 'id' | 'createdAt'>>;

export type ExecutionStep = InferSelectModel<typeof executionSteps>;
export type NewExecutionStep = InferInsertModel<typeof executionSteps>;
export type ExecutionStepUpdate = Partial<Omit<NewExecutionStep, 'id' | 'createdAt'>>;

export type CostTracking = InferSelectModel<typeof costTracking>;
export type NewCostTracking = InferInsertModel<typeof costTracking>;

export type MonthlyCostSummary = InferSelectModel<typeof monthlyCostSummaries>;
export type NewMonthlyCostSummary = InferInsertModel<typeof monthlyCostSummaries>;

export type AgentConfiguration = InferSelectModel<typeof agentConfigurations>;
export type NewAgentConfiguration = InferInsertModel<typeof agentConfigurations>;
export type AgentConfigurationUpdate = Partial<Omit<NewAgentConfiguration, 'id' | 'createdAt'>>;

export type Schedule = InferSelectModel<typeof schedules>;
export type NewSchedule = InferInsertModel<typeof schedules>;
export type ScheduleUpdate = Partial<Omit<NewSchedule, 'id' | 'createdAt' | 'updatedAt'>>;

export type SystemMetric = InferSelectModel<typeof systemMetrics>;
export type NewSystemMetric = InferInsertModel<typeof systemMetrics>;

// Execution Status Enum
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

// Execution Step Status Enum  
export type ExecutionStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// System Health Status Enum
export type SystemHealthStatus = 'healthy' | 'warning' | 'critical';

// Filter and Query Types
export interface ExecutionFilter {
  agentType?: string;
  status?: ExecutionStatus;
  dateFrom?: Date;
  dateTo?: Date;
  nodeId?: string;
  triggeredBy?: string;
  limit?: number;
  offset?: number;
}

export interface CostAnalysisFilter {
  dateFrom?: Date;
  dateTo?: Date;
  agentType?: string;
  modelUsed?: string;
  executionId?: string;
}

export interface MetricsFilter {
  nodeId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  healthStatus?: SystemHealthStatus;
  limit?: number;
}

// Aggregation Types
export interface ExecutionStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  pending: number;
  completionRate: number;
  averageDuration: number | null;
  totalCost: number | null;
}

export interface CostStats {
  currentMonth: number;
  lastMonth: number;
  yearToDate: number;
  averagePerExecution: number;
  totalTokens: number;
  mostExpensiveExecution: {
    id: string;
    cost: number;
    agentType: string;
  } | null;
}

export interface AgentPerformance {
  agentType: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number | null;
  totalCost: number | null;
  averageCost: number | null;
  lastExecuted: string | null;
  successRate: number;
}

// Detailed Execution with Relations
export interface ExecutionWithDetails extends Execution {
  steps: ExecutionStep[];
  costBreakdown: CostTracking[];
  agentConfig: AgentConfiguration | null;
  parsedLogs: LogEntry[] | null;
  parsedAiAnalysis: Record<string, any> | null;
  parsedExecutionContext: Record<string, any> | null;
}

// Log Entry Structure
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  stepNumber?: number;
  metadata?: Record<string, any>;
}

// Cost Breakdown by Period
export interface CostTrendData {
  period: string; // Date string (YYYY-MM-DD or YYYY-MM)
  totalCost: number;
  executionCount: number;
  averageCostPerExecution: number;
  tokenUsage: number;
}

// Dashboard Summary Types
export interface DashboardSummary {
  executionStats: ExecutionStats;
  costStats: CostStats;
  systemHealth: {
    status: SystemHealthStatus;
    cpuUsage: number | null;
    memoryUsage: number | null;
    diskUsage: number | null;
    lastUpdated: string | null;
  };
  recentActivity: Array<{
    id: string;
    agentType: string;
    status: ExecutionStatus;
    startedAt: string;
    completedAt: string | null;
    duration: number | null;
    cost: number | null;
    summary: string | null;
  }>;
  agentPerformance: AgentPerformance[];
}

// Database Operation Result Types
export interface DatabaseOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  affectedRows?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Query Builder Helper Types
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface BulkOperationResult {
  successful: number;
  failed: number;
  errors: Array<{
    index: number;
    error: string;
  }>;
}

// Cost Budget Types
export interface CostBudget {
  monthly: number;
  daily: number;
  perExecution: number;
}

export interface CostAlert {
  type: 'monthly' | 'daily' | 'per_execution';
  threshold: number;
  currentAmount: number;
  triggered: boolean;
  message: string;
}

// Execution Context Types
export interface ExecutionContext {
  agentType: string;
  nodeId?: string;
  triggeredBy?: 'manual' | 'schedule' | 'webhook' | 'retry';
  config?: Record<string, any>;
  metadata?: Record<string, any>;
  parentExecutionId?: string;
  retryCount?: number;
}

// Error Types
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, identifier: string) {
    super(`${resource} with identifier '${identifier}' not found`);
    this.name = 'NotFoundError';
  }
}