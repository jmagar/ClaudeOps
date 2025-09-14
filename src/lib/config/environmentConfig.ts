/**
 * Environment Configuration Management
 * Handles environment-specific configuration overrides and variable resolution
 */

import type { 
  EnvironmentConfig,
  AgentConfigSchema,
  ResolvedAgentConfig,
  ConfigurationSource
} from '../types/config';

/**
 * Environment variable patterns for configuration injection
 */
const ENV_PATTERNS = {
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY,
  NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test' | 'staging') || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL,
  MAX_CONCURRENT_AGENTS: process.env.MAX_CONCURRENT_AGENTS,
  DEFAULT_AGENT_TIMEOUT: process.env.DEFAULT_AGENT_TIMEOUT,
  COST_BUDGET_MONTHLY: process.env.COST_BUDGET_MONTHLY,
  COST_BUDGET_DAILY: process.env.COST_BUDGET_DAILY,
  AGENT_MEMORY_LIMIT: process.env.AGENT_MEMORY_LIMIT,
  AGENT_CPU_LIMIT: process.env.AGENT_CPU_LIMIT,
  DISABLE_HOT_RELOAD: process.env.DISABLE_HOT_RELOAD,
  CONFIG_CACHE_TTL: process.env.CONFIG_CACHE_TTL,
};

/**
 * Default environment configurations
 */
const defaultEnvironments: Record<string, EnvironmentConfig> = {
  development: {
    name: 'development',
    priority: 10,
    active: ENV_PATTERNS.NODE_ENV === 'development',
    variables: {
      logLevel: 'debug',
      maxConcurrentExecutions: 2,
      timeoutMs: 30000,
      enableHotReload: true,
      strictValidation: false,
      cacheTTL: 0,
      costBudgetMultiplier: 0.1,
      modelOverride: 'claude-3-haiku-20240307',
    },
  },

  staging: {
    name: 'staging', 
    priority: 20,
    active: ENV_PATTERNS.NODE_ENV === 'staging',
    variables: {
      logLevel: 'info',
      maxConcurrentExecutions: 3,
      timeoutMs: 120000,
      enableHotReload: true,
      strictValidation: true,
      cacheTTL: 30000,
      costBudgetMultiplier: 0.5,
    },
  },

  production: {
    name: 'production',
    priority: 30,
    active: ENV_PATTERNS.NODE_ENV === 'production',
    variables: {
      logLevel: 'warn',
      maxConcurrentExecutions: 5,
      timeoutMs: 300000,
      enableHotReload: false,
      strictValidation: true,
      cacheTTL: 300000,
      costBudgetMultiplier: 1.0,
      retryMultiplier: 2,
    },
  },

  testing: {
    name: 'testing',
    priority: 5,
    active: ENV_PATTERNS.NODE_ENV === 'test',
    variables: {
      logLevel: 'error',
      maxConcurrentExecutions: 1,
      timeoutMs: 10000,
      enableHotReload: false,
      strictValidation: false,
      cacheTTL: 0,
      costBudgetMultiplier: 0.01,
      modelOverride: 'claude-3-haiku-20240307',
    },
  },
};

/**
 * Environment Configuration Manager
 */
export class EnvironmentConfigManager {
  private environments: Map<string, EnvironmentConfig>;
  private activeEnvironments: EnvironmentConfig[];
  private envVariableCache: Map<string, any>;

  constructor() {
    this.environments = new Map();
    this.activeEnvironments = [];
    this.envVariableCache = new Map();
    
    this.initializeDefaultEnvironments();
    this.loadEnvironmentVariables();
    this.refreshActiveEnvironments();
  }

  /**
   * Initialize default environments
   */
  private initializeDefaultEnvironments(): void {
    for (const [name, config] of Object.entries(defaultEnvironments)) {
      this.environments.set(name, { ...config });
    }
  }

  /**
   * Load and cache environment variables
   */
  private loadEnvironmentVariables(): void {
    this.envVariableCache.clear();
    
    // Load and parse environment variables
    for (const [key, value] of Object.entries(ENV_PATTERNS)) {
      if (value !== undefined) {
        this.envVariableCache.set(key, this.parseEnvironmentValue(value));
      }
    }
  }

  /**
   * Parse environment variable value to appropriate type
   */
  private parseEnvironmentValue(value: string): any {
    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Numeric values
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    
    // JSON values (arrays, objects)
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    
    return value;
  }

  /**
   * Refresh active environments based on current state
   */
  private refreshActiveEnvironments(): void {
    this.activeEnvironments = Array.from(this.environments.values())
      .filter(env => env.active)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Apply environment overrides to configuration
   */
  applyEnvironmentOverrides(
    baseConfig: AgentConfigSchema,
    environmentNames?: string[]
  ): ResolvedAgentConfig {
    const targetEnvs = environmentNames || this.activeEnvironments.map(env => env.name);
    const appliedOverrides: Array<{
      source: ConfigurationSource;
      field: string;
      value: any;
    }> = [];

    let mergedConfig = JSON.parse(JSON.stringify(baseConfig)) as AgentConfigSchema;

    // Apply environment-specific overrides in priority order
    for (const envName of targetEnvs) {
      const environment = this.environments.get(envName);
      if (!environment || !environment.active) continue;

      // Apply built-in environment variables
      const envOverrides = this.buildEnvironmentOverrides(environment);
      mergedConfig = this.mergeConfiguration(mergedConfig, envOverrides, appliedOverrides, 'environment');

      // Apply config-specific environment overrides
      if (baseConfig.environments?.[envName]) {
        mergedConfig = this.mergeConfiguration(
          mergedConfig, 
          baseConfig.environments[envName] as AgentConfigSchema, 
          appliedOverrides, 
          'environment'
        );
      }
    }

    // Apply direct environment variable overrides
    const directOverrides = this.buildDirectEnvironmentOverrides();
    mergedConfig = this.mergeConfiguration(mergedConfig, directOverrides, appliedOverrides, 'environment');

    return {
      ...mergedConfig,
      metadata: {
        source: 'database',
        priority: 100,
        lastModified: new Date().toISOString(),
        validated: false,
      },
      merged: true,
      sources: ['database', 'environment'],
      overrides: appliedOverrides,
    };
  }

  /**
   * Build environment-specific overrides from environment configuration
   */
  private buildEnvironmentOverrides(environment: EnvironmentConfig): Partial<AgentConfigSchema> {
    const overrides: Partial<AgentConfigSchema> = {};
    const vars = environment.variables;

    // Map environment variables to configuration paths
    if (vars.logLevel) {
      overrides.runtime = { 
        ...overrides.runtime, 
        logLevel: vars.logLevel as 'debug' | 'info' | 'warn' | 'error' 
      };
    }

    if (vars.maxConcurrentExecutions) {
      overrides.execution = {
        ...overrides.execution,
        maxConcurrentExecutions: vars.maxConcurrentExecutions as number,
      };
    }

    if (vars.timeoutMs) {
      overrides.execution = {
        ...overrides.execution,
        timeoutMs: vars.timeoutMs as number,
      };
    }

    if (vars.modelOverride) {
      overrides.claude = {
        ...overrides.claude,
        model: vars.modelOverride as string,
      };
    }

    if (vars.costBudgetMultiplier) {
      const multiplier = vars.costBudgetMultiplier as number;
      overrides.claude = {
        ...overrides.claude,
        costBudget: {
          daily: (overrides.claude?.costBudget?.daily || 1.0) * multiplier,
          monthly: (overrides.claude?.costBudget?.monthly || 30.0) * multiplier,
          perExecution: (overrides.claude?.costBudget?.perExecution || 0.1) * multiplier,
        },
      };
    }

    if (vars.retryMultiplier) {
      const multiplier = vars.retryMultiplier as number;
      overrides.execution = {
        ...overrides.execution,
        retryPolicy: {
          maxRetries: Math.floor((overrides.execution?.retryPolicy?.maxRetries || 3) * multiplier),
          backoffStrategy: 'exponential' as const,
          initialDelayMs: (overrides.execution?.retryPolicy?.initialDelayMs || 1000) * multiplier,
          maxDelayMs: (overrides.execution?.retryPolicy?.maxDelayMs || 30000) * multiplier,
        },
      };
    }

    return overrides;
  }

  /**
   * Build direct environment variable overrides
   */
  private buildDirectEnvironmentOverrides(): Partial<AgentConfigSchema> {
    const overrides: Partial<AgentConfigSchema> = {};

    // Direct environment variable mappings
    const logLevel = this.envVariableCache.get('LOG_LEVEL');
    if (logLevel) {
      overrides.runtime = { ...overrides.runtime, logLevel };
    }

    const maxConcurrent = this.envVariableCache.get('MAX_CONCURRENT_AGENTS');
    if (maxConcurrent) {
      overrides.execution = {
        ...overrides.execution,
        maxConcurrentExecutions: maxConcurrent,
      };
    }

    const timeout = this.envVariableCache.get('DEFAULT_AGENT_TIMEOUT');
    if (timeout) {
      overrides.execution = {
        ...overrides.execution,
        timeoutMs: timeout,
      };
    }

    const monthlyBudget = this.envVariableCache.get('COST_BUDGET_MONTHLY');
    const dailyBudget = this.envVariableCache.get('COST_BUDGET_DAILY');
    if (monthlyBudget || dailyBudget) {
      overrides.claude = {
        ...overrides.claude,
        costBudget: {
          monthly: monthlyBudget || undefined,
          daily: dailyBudget || undefined,
        },
      };
    }

    const memoryLimit = this.envVariableCache.get('AGENT_MEMORY_LIMIT');
    if (memoryLimit) {
      overrides.runtime = {
        ...overrides.runtime,
        memoryLimitMB: memoryLimit,
      };
    }

    const cpuLimit = this.envVariableCache.get('AGENT_CPU_LIMIT');
    if (cpuLimit) {
      overrides.runtime = {
        ...overrides.runtime,
        cpuLimitPercent: cpuLimit,
      };
    }

    return overrides;
  }

  /**
   * Deep merge configurations with override tracking
   */
  private mergeConfiguration(
    base: AgentConfigSchema,
    override: Partial<AgentConfigSchema>,
    appliedOverrides: Array<{ source: ConfigurationSource; field: string; value: any }>,
    source: ConfigurationSource
  ): AgentConfigSchema {
    const merged = JSON.parse(JSON.stringify(base)) as AgentConfigSchema;
    this.deepMerge(merged, override, '', appliedOverrides, source);
    return merged;
  }

  /**
   * Recursive deep merge with path tracking
   */
  private deepMerge(
    target: any,
    source: any,
    path: string,
    appliedOverrides: Array<{ source: ConfigurationSource; field: string; value: any }>,
    sourceType: ConfigurationSource
  ): void {
    for (const [key, value] of Object.entries(source)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMerge(target[key], value, currentPath, appliedOverrides, sourceType);
      } else {
        if (target[key] !== value) {
          appliedOverrides.push({
            source: sourceType,
            field: currentPath,
            value,
          });
        }
        target[key] = value;
      }
    }
  }

  /**
   * Register a custom environment
   */
  registerEnvironment(environment: EnvironmentConfig): void {
    this.environments.set(environment.name, environment);
    this.refreshActiveEnvironments();
  }

  /**
   * Activate/deactivate environment
   */
  setEnvironmentActive(name: string, active: boolean): void {
    const environment = this.environments.get(name);
    if (environment) {
      environment.active = active;
      this.refreshActiveEnvironments();
    }
  }

  /**
   * Get environment configuration
   */
  getEnvironment(name: string): EnvironmentConfig | undefined {
    return this.environments.get(name);
  }

  /**
   * Get all environments
   */
  getAllEnvironments(): EnvironmentConfig[] {
    return Array.from(this.environments.values());
  }

  /**
   * Get active environments
   */
  getActiveEnvironments(): EnvironmentConfig[] {
    return [...this.activeEnvironments];
  }

  /**
   * Reload environment variables
   */
  reloadEnvironmentVariables(): void {
    this.loadEnvironmentVariables();
  }

  /**
   * Get environment variable value
   */
  getEnvironmentVariable(key: string): any {
    return this.envVariableCache.get(key);
  }

  /**
   * Check if environment variable is set
   */
  hasEnvironmentVariable(key: string): boolean {
    return this.envVariableCache.has(key);
  }
}

/**
 * Singleton instance
 */
export const environmentManager = new EnvironmentConfigManager();

/**
 * Helper function to get current environment name
 */
export function getCurrentEnvironment(): string {
  return ENV_PATTERNS.NODE_ENV || 'development';
}

/**
 * Helper function to check if running in development
 */
export function isDevelopment(): boolean {
  return getCurrentEnvironment() === 'development';
}

/**
 * Helper function to check if running in production
 */
export function isProduction(): boolean {
  return getCurrentEnvironment() === 'production';
}

/**
 * Helper function to check if running in testing
 */
export function isTesting(): boolean {
  return getCurrentEnvironment() === 'test' || getCurrentEnvironment() === 'testing';
}