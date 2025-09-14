/**
 * Agent Configuration Management Types
 * Defines types for agent configuration system with environment overrides,
 * validation, and hot-reloading capabilities
 */

import type { AgentConfiguration } from './database';

// Core Configuration Types
export interface AgentConfigSchema {
  // Basic metadata
  type: string;
  name: string;
  description?: string;
  version: string;

  // Execution constraints
  execution: {
    maxCostPerExecution?: number;
    maxDurationMs?: number;
    timeoutMs: number;
    maxConcurrentExecutions: number;
    cooldownMs: number;
    retryPolicy: {
      maxRetries: number;
      backoffStrategy: 'exponential' | 'linear' | 'fixed';
      initialDelayMs: number;
      maxDelayMs: number;
    };
  };

  // Runtime configuration
  runtime: {
    nodeVersion?: string;
    memoryLimitMB?: number;
    cpuLimitPercent?: number;
    tempDirPath?: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };

  // Claude SDK configuration
  claude: {
    model: string;
    maxTokens: number;
    temperature?: number;
    systemPrompt?: string;
    costBudget?: {
      daily?: number;
      monthly?: number;
      perExecution?: number;
    };
  };

  // Agent-specific configuration
  config: Record<string, any>;

  // Scheduling configuration
  scheduling?: {
    enabled: boolean;
    cronExpression?: string;
    timezone?: string;
    maxMissedRuns?: number;
  };

  // Environment-specific overrides
  environments?: {
    [environment: string]: Partial<Omit<AgentConfigSchema, 'environments'>>;
  };
}

// Environment Configuration
export interface EnvironmentConfig {
  name: string;
  priority: number;
  variables: Record<string, string | number | boolean>;
  active: boolean;
}

// Configuration Validation
export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'range' | 'pattern' | 'custom';
  message: string;
  constraint?: any;
  validator?: (value: any, config: AgentConfigSchema) => boolean | string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  value: any;
  constraint?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
  value: any;
  suggestion?: string;
}

// Configuration Events for Hot-Reloading
export interface ConfigurationEvent {
  type: 'created' | 'updated' | 'deleted' | 'enabled' | 'disabled';
  agentType: string;
  timestamp: string;
  changes?: ConfigurationChange[];
  source: 'api' | 'file' | 'schedule' | 'environment';
}

export interface ConfigurationChange {
  field: string;
  oldValue: any;
  newValue: any;
  path: string[];
}

// Configuration Sources
export type ConfigurationSource = 'database' | 'file' | 'environment' | 'default';

export interface ConfigurationMetadata {
  source: ConfigurationSource;
  priority: number;
  lastModified: string;
  checksum?: string;
  filePath?: string;
  validated: boolean;
  validationTimestamp?: string;
}

// Merged Configuration with Metadata
export interface ResolvedAgentConfig extends AgentConfigSchema {
  metadata: ConfigurationMetadata;
  merged: boolean;
  sources: ConfigurationSource[];
  overrides: Array<{
    source: ConfigurationSource;
    field: string;
    value: any;
  }>;
}

// Configuration Manager State
export interface ConfigurationState {
  configs: Map<string, ResolvedAgentConfig>;
  environments: Map<string, EnvironmentConfig>;
  watchers: Set<ConfigurationWatcher>;
  lastReload: string;
  hotReloadEnabled: boolean;
}

// Hot-Reloading
export interface ConfigurationWatcher {
  id: string;
  agentType?: string;
  callback: (event: ConfigurationEvent) => void | Promise<void>;
  filter?: (event: ConfigurationEvent) => boolean;
}

// Default Configurations
export interface DefaultAgentConfigs {
  [agentType: string]: Omit<AgentConfigSchema, 'type'>;
}

// Configuration Manager Options
export interface ConfigManagerOptions {
  enableHotReload: boolean;
  reloadIntervalMs: number;
  validateOnLoad: boolean;
  strictMode: boolean;
  environmentPriority: string[];
  cacheConfigs: boolean;
  watchFiles: boolean;
  backupConfigs: boolean;
}

// Configuration Template
export interface ConfigurationTemplate {
  name: string;
  description: string;
  category: 'system' | 'monitoring' | 'maintenance' | 'security' | 'custom';
  template: Partial<AgentConfigSchema>;
  requiredFields: string[];
  examples: Record<string, any>;
}

// Configuration Diff
export interface ConfigurationDiff {
  agentType: string;
  changes: ConfigurationChange[];
  summary: {
    added: number;
    modified: number;
    removed: number;
  };
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresRestart: boolean;
}

// Configuration Backup
export interface ConfigurationBackup {
  id: string;
  timestamp: string;
  configs: Record<string, AgentConfigSchema>;
  environment: string;
  metadata: {
    version: string;
    reason: string;
    createdBy: string;
  };
}

// Export Types
export type {
  AgentConfigSchema as Config,
  ResolvedAgentConfig as ResolvedConfig,
  ConfigurationEvent as ConfigEvent,
  ConfigurationChange as ConfigChange,
  ValidationResult as Validation
};