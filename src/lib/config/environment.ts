/**
 * Environment-Specific Settings for Development and Production
 * Centralized configuration management for ClaudeOps environments
 */

import type { 
  EnvironmentConfig,
  AgentConfigSchema,
  ResolvedAgentConfig,
  ConfigurationSource
} from '../types/config';

/**
 * Environment configuration interface with enhanced settings
 */
export interface ClaudeOpsEnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'staging' | 'test';
  APP_URL: string;
  DATABASE_URL: string;
  WEBSOCKET_PORT: number;
  WEBSOCKET_HOST: string;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  
  // Claude Configuration
  ANTHROPIC_API_KEY: string;
  
  // Cost Management
  COST_ALERT_THRESHOLD: number;
  MONTHLY_BUDGET_LIMIT: number;
  COST_BUDGET_DAILY?: number;
  COST_BUDGET_MONTHLY?: number;
  
  // Agent Limits
  MAX_CONCURRENT_EXECUTIONS: number;
  MAX_CONCURRENT_AGENTS: number;
  DEFAULT_AGENT_TIMEOUT: number;
  AGENT_MEMORY_LIMIT?: number;
  AGENT_CPU_LIMIT?: number;
  
  // Performance
  CONFIG_CACHE_TTL?: number;
  DISABLE_HOT_RELOAD?: boolean;
  
  // Health Monitoring
  HEALTH_CHECK_INTERVAL?: number;
  HEALTH_CHECK_TIMEOUT?: number;
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS?: number;
  RATE_LIMIT_MAX_REQUESTS?: number;
  
  // SSL/Security
  SSL_CERT_PATH?: string;
  SSL_KEY_PATH?: string;
  NEXTAUTH_SECRET?: string;
  
  // Monitoring
  ENABLE_METRICS?: boolean;
  METRICS_PORT?: number;
  
  // Backup
  BACKUP_ENABLED?: boolean;
  BACKUP_INTERVAL_HOURS?: number;
  BACKUP_RETENTION_DAYS?: number;
}

/**
 * Environment variable patterns for configuration injection
 */
const ENV_PATTERNS = {
  // Core
  NODE_ENV: process.env.NODE_ENV as 'development' | 'production' | 'staging' | 'test' || 'development',
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL || 'sqlite:./data/development.db',
  
  // API
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
  
  // WebSocket
  WEBSOCKET_PORT: parseInt(process.env.WEBSOCKET_PORT || '3001'),
  WEBSOCKET_HOST: process.env.WEBSOCKET_HOST || 'localhost',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' || 'info',
  LOG_FILE_PATH: process.env.LOG_FILE_PATH,
  
  // Cost Management
  COST_ALERT_THRESHOLD: parseFloat(process.env.COST_ALERT_THRESHOLD || '10.00'),
  MONTHLY_BUDGET_LIMIT: parseFloat(process.env.MONTHLY_BUDGET_LIMIT || '100.00'),
  COST_BUDGET_DAILY: process.env.COST_BUDGET_DAILY ? parseFloat(process.env.COST_BUDGET_DAILY) : undefined,
  COST_BUDGET_MONTHLY: process.env.COST_BUDGET_MONTHLY ? parseFloat(process.env.COST_BUDGET_MONTHLY) : undefined,
  
  // Agent Configuration
  MAX_CONCURRENT_EXECUTIONS: parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '3'),
  MAX_CONCURRENT_AGENTS: parseInt(process.env.MAX_CONCURRENT_AGENTS || '3'),
  DEFAULT_AGENT_TIMEOUT: parseInt(process.env.DEFAULT_AGENT_TIMEOUT || '300000'),
  AGENT_MEMORY_LIMIT: process.env.AGENT_MEMORY_LIMIT ? parseInt(process.env.AGENT_MEMORY_LIMIT) : undefined,
  AGENT_CPU_LIMIT: process.env.AGENT_CPU_LIMIT ? parseInt(process.env.AGENT_CPU_LIMIT) : undefined,
  
  // Performance
  CONFIG_CACHE_TTL: process.env.CONFIG_CACHE_TTL ? parseInt(process.env.CONFIG_CACHE_TTL) : undefined,
  DISABLE_HOT_RELOAD: process.env.DISABLE_HOT_RELOAD === 'true',
  
  // Health Check
  HEALTH_CHECK_INTERVAL: process.env.HEALTH_CHECK_INTERVAL ? parseInt(process.env.HEALTH_CHECK_INTERVAL) : undefined,
  HEALTH_CHECK_TIMEOUT: process.env.HEALTH_CHECK_TIMEOUT ? parseInt(process.env.HEALTH_CHECK_TIMEOUT) : undefined,
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS ? parseInt(process.env.RATE_LIMIT_WINDOW_MS) : undefined,
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : undefined,
  
  // Security
  SSL_CERT_PATH: process.env.SSL_CERT_PATH,
  SSL_KEY_PATH: process.env.SSL_KEY_PATH,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
  
  // Monitoring
  ENABLE_METRICS: process.env.ENABLE_METRICS === 'true',
  METRICS_PORT: process.env.METRICS_PORT ? parseInt(process.env.METRICS_PORT) : undefined,
  
  // Backup
  BACKUP_ENABLED: process.env.BACKUP_ENABLED === 'true',
  BACKUP_INTERVAL_HOURS: process.env.BACKUP_INTERVAL_HOURS ? parseInt(process.env.BACKUP_INTERVAL_HOURS) : undefined,
  BACKUP_RETENTION_DAYS: process.env.BACKUP_RETENTION_DAYS ? parseInt(process.env.BACKUP_RETENTION_DAYS) : undefined,
};

/**
 * Environment-specific configuration presets
 */
const ENVIRONMENT_CONFIGS: Record<string, Partial<ClaudeOpsEnvironmentConfig>> = {
  development: {
    NODE_ENV: 'development',
    APP_URL: 'http://localhost:3000',
    DATABASE_URL: 'sqlite:./data/development.db',
    WEBSOCKET_HOST: 'localhost',
    LOG_LEVEL: 'debug',
    MAX_CONCURRENT_EXECUTIONS: 2,
    MAX_CONCURRENT_AGENTS: 2,
    DEFAULT_AGENT_TIMEOUT: 120000,
    COST_ALERT_THRESHOLD: 5.00,
    MONTHLY_BUDGET_LIMIT: 50.00,
    CONFIG_CACHE_TTL: 0,
    DISABLE_HOT_RELOAD: false,
    HEALTH_CHECK_INTERVAL: 30000,
    HEALTH_CHECK_TIMEOUT: 5000,
    ENABLE_METRICS: false,
    BACKUP_ENABLED: false,
  },
  
  staging: {
    NODE_ENV: 'staging',
    APP_URL: 'https://claudeops-staging.yourdomain.com',
    DATABASE_URL: 'sqlite:./data/staging.db',
    WEBSOCKET_HOST: '0.0.0.0',
    LOG_LEVEL: 'info',
    MAX_CONCURRENT_EXECUTIONS: 3,
    MAX_CONCURRENT_AGENTS: 3,
    DEFAULT_AGENT_TIMEOUT: 180000,
    COST_ALERT_THRESHOLD: 25.00,
    MONTHLY_BUDGET_LIMIT: 250.00,
    CONFIG_CACHE_TTL: 30000,
    DISABLE_HOT_RELOAD: true,
    HEALTH_CHECK_INTERVAL: 45000,
    HEALTH_CHECK_TIMEOUT: 8000,
    ENABLE_METRICS: true,
    BACKUP_ENABLED: true,
    BACKUP_INTERVAL_HOURS: 12,
    BACKUP_RETENTION_DAYS: 14,
  },
  
  production: {
    NODE_ENV: 'production',
    APP_URL: 'https://claudeops.yourdomain.com',
    DATABASE_URL: 'sqlite:./data/production.db',
    WEBSOCKET_HOST: '0.0.0.0',
    LOG_LEVEL: 'warn',
    MAX_CONCURRENT_EXECUTIONS: 5,
    MAX_CONCURRENT_AGENTS: 5,
    DEFAULT_AGENT_TIMEOUT: 300000,
    AGENT_MEMORY_LIMIT: 1024,
    AGENT_CPU_LIMIT: 80,
    COST_ALERT_THRESHOLD: 50.00,
    MONTHLY_BUDGET_LIMIT: 500.00,
    COST_BUDGET_DAILY: 25.00,
    COST_BUDGET_MONTHLY: 500.00,
    CONFIG_CACHE_TTL: 300000,
    DISABLE_HOT_RELOAD: true,
    HEALTH_CHECK_INTERVAL: 60000,
    HEALTH_CHECK_TIMEOUT: 10000,
    RATE_LIMIT_WINDOW_MS: 900000,
    RATE_LIMIT_MAX_REQUESTS: 1000,
    ENABLE_METRICS: true,
    METRICS_PORT: 9090,
    BACKUP_ENABLED: true,
    BACKUP_INTERVAL_HOURS: 24,
    BACKUP_RETENTION_DAYS: 30,
  },
  
  test: {
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:3000',
    DATABASE_URL: 'sqlite:./data/test.db',
    WEBSOCKET_HOST: 'localhost',
    LOG_LEVEL: 'error',
    MAX_CONCURRENT_EXECUTIONS: 1,
    MAX_CONCURRENT_AGENTS: 1,
    DEFAULT_AGENT_TIMEOUT: 10000,
    COST_ALERT_THRESHOLD: 1.00,
    MONTHLY_BUDGET_LIMIT: 10.00,
    CONFIG_CACHE_TTL: 0,
    DISABLE_HOT_RELOAD: true,
    HEALTH_CHECK_INTERVAL: 10000,
    HEALTH_CHECK_TIMEOUT: 3000,
    ENABLE_METRICS: false,
    BACKUP_ENABLED: false,
  },
};

/**
 * Get current environment configuration
 */
export function getEnvironmentConfig(): ClaudeOpsEnvironmentConfig {
  const currentEnv = ENV_PATTERNS.NODE_ENV;
  const envDefaults = ENVIRONMENT_CONFIGS[currentEnv] || ENVIRONMENT_CONFIGS.development;
  
  return {
    // Start with environment defaults
    ...envDefaults,
    
    // Override with actual environment variables
    NODE_ENV: ENV_PATTERNS.NODE_ENV,
    APP_URL: ENV_PATTERNS.NEXT_PUBLIC_APP_URL,
    DATABASE_URL: ENV_PATTERNS.DATABASE_URL,
    WEBSOCKET_PORT: ENV_PATTERNS.WEBSOCKET_PORT,
    WEBSOCKET_HOST: ENV_PATTERNS.WEBSOCKET_HOST,
    LOG_LEVEL: ENV_PATTERNS.LOG_LEVEL,
    
    // API
    ANTHROPIC_API_KEY: ENV_PATTERNS.ANTHROPIC_API_KEY || '',
    
    // Cost Management
    COST_ALERT_THRESHOLD: ENV_PATTERNS.COST_ALERT_THRESHOLD,
    MONTHLY_BUDGET_LIMIT: ENV_PATTERNS.MONTHLY_BUDGET_LIMIT,
    ...(ENV_PATTERNS.COST_BUDGET_DAILY && { COST_BUDGET_DAILY: ENV_PATTERNS.COST_BUDGET_DAILY }),
    ...(ENV_PATTERNS.COST_BUDGET_MONTHLY && { COST_BUDGET_MONTHLY: ENV_PATTERNS.COST_BUDGET_MONTHLY }),
    
    // Agent Configuration
    MAX_CONCURRENT_EXECUTIONS: ENV_PATTERNS.MAX_CONCURRENT_EXECUTIONS,
    MAX_CONCURRENT_AGENTS: ENV_PATTERNS.MAX_CONCURRENT_AGENTS,
    DEFAULT_AGENT_TIMEOUT: ENV_PATTERNS.DEFAULT_AGENT_TIMEOUT,
    ...(ENV_PATTERNS.AGENT_MEMORY_LIMIT && { AGENT_MEMORY_LIMIT: ENV_PATTERNS.AGENT_MEMORY_LIMIT }),
    ...(ENV_PATTERNS.AGENT_CPU_LIMIT && { AGENT_CPU_LIMIT: ENV_PATTERNS.AGENT_CPU_LIMIT }),
    
    // Performance
    ...(ENV_PATTERNS.CONFIG_CACHE_TTL && { CONFIG_CACHE_TTL: ENV_PATTERNS.CONFIG_CACHE_TTL }),
    ...(ENV_PATTERNS.DISABLE_HOT_RELOAD && { DISABLE_HOT_RELOAD: ENV_PATTERNS.DISABLE_HOT_RELOAD }),
    
    // Health Check
    ...(ENV_PATTERNS.HEALTH_CHECK_INTERVAL && { HEALTH_CHECK_INTERVAL: ENV_PATTERNS.HEALTH_CHECK_INTERVAL }),
    ...(ENV_PATTERNS.HEALTH_CHECK_TIMEOUT && { HEALTH_CHECK_TIMEOUT: ENV_PATTERNS.HEALTH_CHECK_TIMEOUT }),
    
    // Rate Limiting
    ...(ENV_PATTERNS.RATE_LIMIT_WINDOW_MS && { RATE_LIMIT_WINDOW_MS: ENV_PATTERNS.RATE_LIMIT_WINDOW_MS }),
    ...(ENV_PATTERNS.RATE_LIMIT_MAX_REQUESTS && { RATE_LIMIT_MAX_REQUESTS: ENV_PATTERNS.RATE_LIMIT_MAX_REQUESTS }),
    
    // Security
    ...(ENV_PATTERNS.SSL_CERT_PATH && { SSL_CERT_PATH: ENV_PATTERNS.SSL_CERT_PATH }),
    ...(ENV_PATTERNS.SSL_KEY_PATH && { SSL_KEY_PATH: ENV_PATTERNS.SSL_KEY_PATH }),
    ...(ENV_PATTERNS.NEXTAUTH_SECRET && { NEXTAUTH_SECRET: ENV_PATTERNS.NEXTAUTH_SECRET }),
    
    // Monitoring
    ...(ENV_PATTERNS.ENABLE_METRICS && { ENABLE_METRICS: ENV_PATTERNS.ENABLE_METRICS }),
    ...(ENV_PATTERNS.METRICS_PORT && { METRICS_PORT: ENV_PATTERNS.METRICS_PORT }),
    
    // Backup
    ...(ENV_PATTERNS.BACKUP_ENABLED && { BACKUP_ENABLED: ENV_PATTERNS.BACKUP_ENABLED }),
    ...(ENV_PATTERNS.BACKUP_INTERVAL_HOURS && { BACKUP_INTERVAL_HOURS: ENV_PATTERNS.BACKUP_INTERVAL_HOURS }),
    ...(ENV_PATTERNS.BACKUP_RETENTION_DAYS && { BACKUP_RETENTION_DAYS: ENV_PATTERNS.BACKUP_RETENTION_DAYS }),
  } as ClaudeOpsEnvironmentConfig;
}

/**
 * Validate environment configuration
 */
export function validateEnvironmentConfig(config: ClaudeOpsEnvironmentConfig): Array<{
  field: string;
  message: string;
  severity: 'error' | 'warning';
}> {
  const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = [];
  
  // Required fields
  if (!config.ANTHROPIC_API_KEY || config.ANTHROPIC_API_KEY === '' || config.ANTHROPIC_API_KEY.includes('your_') || config.ANTHROPIC_API_KEY.includes('_here')) {
    errors.push({
      field: 'ANTHROPIC_API_KEY',
      message: 'Anthropic API key is required and must be set to a valid key',
      severity: 'error'
    });
  }
  
  if (!config.DATABASE_URL) {
    errors.push({
      field: 'DATABASE_URL',
      message: 'Database URL is required',
      severity: 'error'
    });
  }
  
  // Production-specific validations
  if (config.NODE_ENV === 'production') {
    if (!config.NEXTAUTH_SECRET || config.NEXTAUTH_SECRET.includes('your_')) {
      errors.push({
        field: 'NEXTAUTH_SECRET',
        message: 'NextAuth secret must be set for production',
        severity: 'error'
      });
    }
    
    if (config.APP_URL?.includes('localhost') || config.APP_URL?.includes('yourdomain.com')) {
      errors.push({
        field: 'APP_URL',
        message: 'Production APP_URL should be set to your actual domain',
        severity: 'warning'
      });
    }
    
    if (config.WEBSOCKET_HOST === 'localhost') {
      errors.push({
        field: 'WEBSOCKET_HOST',
        message: 'Production WebSocket host should be 0.0.0.0 for external access',
        severity: 'warning'
      });
    }
  }
  
  // Numeric validations
  if (config.MAX_CONCURRENT_EXECUTIONS < 1) {
    errors.push({
      field: 'MAX_CONCURRENT_EXECUTIONS',
      message: 'MAX_CONCURRENT_EXECUTIONS must be at least 1',
      severity: 'error'
    });
  }
  
  if (config.WEBSOCKET_PORT < 1024 || config.WEBSOCKET_PORT > 65535) {
    errors.push({
      field: 'WEBSOCKET_PORT',
      message: 'WEBSOCKET_PORT must be between 1024 and 65535',
      severity: 'warning'
    });
  }
  
  return errors;
}

/**
 * Get database connection string for current environment
 */
export function getDatabaseConfig(): { url: string; filename: string } {
  const config = getEnvironmentConfig();
  const url = config.DATABASE_URL;
  
  // Extract filename from SQLite URL
  const match = url.match(/sqlite:(.+)/);
  const filename = match ? match[1] : './data/development.db';
  
  return {
    url,
    filename
  };
}

/**
 * Environment helper functions
 */
export function isDevelopment(): boolean {
  return ENV_PATTERNS.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return ENV_PATTERNS.NODE_ENV === 'production';
}

export function isStaging(): boolean {
  return ENV_PATTERNS.NODE_ENV === 'staging';
}

export function isTesting(): boolean {
  return ENV_PATTERNS.NODE_ENV === 'test';
}

export function getCurrentEnvironment(): string {
  return ENV_PATTERNS.NODE_ENV;
}

/**
 * Get logging configuration
 */
export function getLoggingConfig(): {
  level: string;
  filePath?: string;
  enableConsole: boolean;
} {
  const config = getEnvironmentConfig();
  
  return {
    level: config.LOG_LEVEL,
    filePath: ENV_PATTERNS.LOG_FILE_PATH,
    enableConsole: !isProduction(),
  };
}

/**
 * Get SSL configuration
 */
export function getSSLConfig(): {
  enabled: boolean;
  certPath?: string;
  keyPath?: string;
} {
  const config = getEnvironmentConfig();
  
  return {
    enabled: !!(config.SSL_CERT_PATH && config.SSL_KEY_PATH),
    certPath: config.SSL_CERT_PATH,
    keyPath: config.SSL_KEY_PATH,
  };
}

/**
 * Get cost management configuration
 */
export function getCostConfig(): {
  alertThreshold: number;
  monthlyLimit: number;
  dailyLimit?: number;
  perExecutionLimit?: number;
} {
  const config = getEnvironmentConfig();
  
  return {
    alertThreshold: config.COST_ALERT_THRESHOLD,
    monthlyLimit: config.MONTHLY_BUDGET_LIMIT,
    dailyLimit: config.COST_BUDGET_DAILY,
    perExecutionLimit: config.COST_BUDGET_MONTHLY ? config.COST_BUDGET_MONTHLY / 30 : undefined,
  };
}

/**
 * Get performance configuration
 */
export function getPerformanceConfig(): {
  cacheTTL: number;
  hotReloadDisabled: boolean;
  maxConcurrentAgents: number;
  defaultTimeout: number;
  memoryLimit?: number;
  cpuLimit?: number;
} {
  const config = getEnvironmentConfig();
  
  return {
    cacheTTL: config.CONFIG_CACHE_TTL || 30000,
    hotReloadDisabled: config.DISABLE_HOT_RELOAD || false,
    maxConcurrentAgents: config.MAX_CONCURRENT_AGENTS,
    defaultTimeout: config.DEFAULT_AGENT_TIMEOUT,
    memoryLimit: config.AGENT_MEMORY_LIMIT,
    cpuLimit: config.AGENT_CPU_LIMIT,
  };
}

/**
 * Export singleton instance
 */
export const environmentConfig = getEnvironmentConfig();

/**
 * Export validation result for startup checks
 */
export const environmentValidation = validateEnvironmentConfig(environmentConfig);