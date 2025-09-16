/**
 * Deployment Configuration Management
 * Handles deployment-specific settings, optimization configurations,
 * and environment-specific deployment strategies for ClaudeOps
 */

import { 
  getEnvironmentConfig, 
  isDevelopment, 
  isProduction, 
  isStaging, 
  isTesting,
  type ClaudeOpsEnvironmentConfig 
} from './environment';

/**
 * Deployment-specific configuration interface
 */
export interface DeploymentConfig {
  // Environment
  environment: 'development' | 'production' | 'staging' | 'test';
  
  // Server Configuration
  server: {
    port: number;
    host: string;
    protocol: 'http' | 'https';
    trustedProxies?: string[];
    compression: boolean;
    helmet: boolean;
  };
  
  // Next.js Configuration
  nextjs: {
    compress: boolean;
    productionBrowserSourceMaps: boolean;
    optimizeFonts: boolean;
    optimizeImages: boolean;
    experimental?: {
      optimizePackageImports?: string[];
      turbo?: boolean;
      serverComponentsExternalPackages?: string[];
    };
    compiler?: {
      removeConsole?: boolean | { exclude?: string[] };
      reactRemoveProperties?: boolean;
      styledComponents?: boolean;
    };
  };
  
  // Database Configuration
  database: {
    url: string;
    poolSize: number;
    connectionTimeout: number;
    queryTimeout: number;
    pragmas: Record<string, string | number>;
    backup: {
      enabled: boolean;
      intervalHours?: number;
      retentionDays?: number;
      location?: string;
    };
  };
  
  // Logging Configuration
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableConsole: boolean;
    enableFile: boolean;
    filePath?: string;
    maxFileSize: string;
    maxFiles: number;
    format: 'json' | 'text';
    includeMetadata: boolean;
  };
  
  // Security Configuration
  security: {
    cors: {
      enabled: boolean;
      origin: string | string[] | boolean;
      credentials: boolean;
    };
    rateLimit: {
      enabled: boolean;
      windowMs: number;
      maxRequests: number;
      skipSuccessfulRequests: boolean;
    };
    helmet: {
      enabled: boolean;
      contentSecurityPolicy: boolean;
      crossOriginEmbedderPolicy: boolean;
    };
    ssl: {
      enabled: boolean;
      certPath?: string;
      keyPath?: string;
      enforceHttps: boolean;
    };
  };
  
  // Performance Configuration
  performance: {
    cache: {
      enabled: boolean;
      ttl: number;
      maxSize: number;
      compression: boolean;
    };
    compression: {
      enabled: boolean;
      level: number;
      threshold: number;
    };
    clustering: {
      enabled: boolean;
      workers?: number;
    };
    monitoring: {
      enabled: boolean;
      metricsPort?: number;
      healthCheckInterval: number;
      memoryThreshold: number;
      cpuThreshold: number;
    };
  };
  
  // WebSocket Configuration
  websocket: {
    enabled: boolean;
    port: number;
    host: string;
    maxConnections: number;
    heartbeatInterval: number;
    messageRateLimit: number;
    backpressureLimit: number;
  };
  
  // Agent Execution Configuration
  agents: {
    maxConcurrent: number;
    defaultTimeout: number;
    memoryLimit?: number;
    cpuLimit?: number;
    sandboxEnabled: boolean;
    tempDirectory: string;
    cleanupInterval: number;
  };
  
  // Cost Management
  costs: {
    tracking: {
      enabled: boolean;
      precision: number;
      currency: string;
    };
    budgets: {
      dailyLimit?: number;
      monthlyLimit: number;
      alertThreshold: number;
      enforceLimit: boolean;
    };
    optimization: {
      cacheResponses: boolean;
      batchRequests: boolean;
      modelFallback: boolean;
    };
  };
}

/**
 * Base deployment configuration
 */
const baseDeploymentConfig: Omit<DeploymentConfig, 'environment'> = {
  server: {
    port: 3000,
    host: 'localhost',
    protocol: 'http',
    compression: true,
    helmet: true,
  },
  
  nextjs: {
    compress: true,
    productionBrowserSourceMaps: false,
    optimizeFonts: true,
    optimizeImages: true,
  },
  
  database: {
    url: 'sqlite:./data/development.db',
    poolSize: 10,
    connectionTimeout: 30000,
    queryTimeout: 10000,
    pragmas: {
      journal_mode: 'WAL',
      cache_size: 1000,
      temp_store: 'memory',
      synchronous: 'NORMAL',
      mmap_size: 268435456, // 256MB
    },
    backup: {
      enabled: false,
    },
  },
  
  logging: {
    level: 'info',
    enableConsole: true,
    enableFile: false,
    maxFileSize: '10m',
    maxFiles: 5,
    format: 'text',
    includeMetadata: false,
  },
  
  security: {
    cors: {
      enabled: true,
      origin: true,
      credentials: true,
    },
    rateLimit: {
      enabled: false,
      windowMs: 900000, // 15 minutes
      maxRequests: 100,
      skipSuccessfulRequests: false,
    },
    helmet: {
      enabled: true,
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    },
    ssl: {
      enabled: false,
      enforceHttps: false,
    },
  },
  
  performance: {
    cache: {
      enabled: true,
      ttl: 300000, // 5 minutes
      maxSize: 100,
      compression: false,
    },
    compression: {
      enabled: true,
      level: 6,
      threshold: 1024,
    },
    clustering: {
      enabled: false,
    },
    monitoring: {
      enabled: false,
      healthCheckInterval: 30000,
      memoryThreshold: 0.8,
      cpuThreshold: 0.8,
    },
  },
  
  websocket: {
    enabled: true,
    port: 3001,
    host: 'localhost',
    maxConnections: 100,
    heartbeatInterval: 30000,
    messageRateLimit: 60,
    backpressureLimit: 1000,
  },
  
  agents: {
    maxConcurrent: 3,
    defaultTimeout: 300000,
    sandboxEnabled: false,
    tempDirectory: './temp/agents',
    cleanupInterval: 3600000, // 1 hour
  },
  
  costs: {
    tracking: {
      enabled: true,
      precision: 4,
      currency: 'USD',
    },
    budgets: {
      monthlyLimit: 100.00,
      alertThreshold: 10.00,
      enforceLimit: false,
    },
    optimization: {
      cacheResponses: true,
      batchRequests: false,
      modelFallback: true,
    },
  },
};

/**
 * Environment-specific deployment configurations
 */
const environmentOverrides: Record<string, Partial<DeploymentConfig>> = {
  development: {
    environment: 'development',
    server: {
      ...baseDeploymentConfig.server,
      port: 3000,
      host: 'localhost',
      protocol: 'http',
      compression: false,
      helmet: false,
    },
    nextjs: {
      ...baseDeploymentConfig.nextjs,
      compress: false,
      productionBrowserSourceMaps: true,
      experimental: {
        turbo: true,
        optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
      },
      compiler: {
        removeConsole: false,
        reactRemoveProperties: false,
      },
    },
    logging: {
      ...baseDeploymentConfig.logging,
      level: 'debug',
      enableConsole: true,
      enableFile: false,
      format: 'text',
    },
    security: {
      ...baseDeploymentConfig.security,
      cors: {
        enabled: true,
        origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
        credentials: true,
      },
      rateLimit: {
        enabled: false,
        windowMs: 60000,
        maxRequests: 1000,
        skipSuccessfulRequests: true,
      },
      helmet: {
        enabled: false,
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      },
    },
    performance: {
      ...baseDeploymentConfig.performance,
      cache: {
        enabled: false,
        ttl: 0,
        maxSize: 10,
        compression: false,
      },
      monitoring: {
        enabled: false,
        healthCheckInterval: 10000,
        memoryThreshold: 0.9,
        cpuThreshold: 0.9,
      },
    },
    agents: {
      ...baseDeploymentConfig.agents,
      maxConcurrent: 2,
      defaultTimeout: 120000,
      sandboxEnabled: false,
    },
    costs: {
      ...baseDeploymentConfig.costs,
      budgets: {
        monthlyLimit: 50.00,
        alertThreshold: 5.00,
        enforceLimit: false,
      },
    },
  },

  staging: {
    environment: 'staging',
    server: {
      ...baseDeploymentConfig.server,
      port: 3000,
      host: '0.0.0.0',
      protocol: 'https',
      trustedProxies: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
      compression: true,
      helmet: true,
    },
    nextjs: {
      ...baseDeploymentConfig.nextjs,
      compress: true,
      productionBrowserSourceMaps: false,
      experimental: {
        optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'recharts'],
        serverComponentsExternalPackages: ['better-sqlite3'],
      },
      compiler: {
        removeConsole: { exclude: ['error', 'warn'] },
        reactRemoveProperties: true,
      },
    },
    database: {
      ...baseDeploymentConfig.database,
      url: 'sqlite:./data/staging.db',
      pragmas: {
        ...baseDeploymentConfig.database.pragmas,
        synchronous: 'FULL',
        cache_size: 2000,
      },
      backup: {
        enabled: true,
        intervalHours: 12,
        retentionDays: 14,
        location: './backups/staging',
      },
    },
    logging: {
      ...baseDeploymentConfig.logging,
      level: 'info',
      enableConsole: true,
      enableFile: true,
      filePath: './logs/claudeops-staging.log',
      format: 'json',
      includeMetadata: true,
    },
    security: {
      ...baseDeploymentConfig.security,
      cors: {
        enabled: true,
        origin: ['https://claudeops-staging.yourdomain.com'],
        credentials: true,
      },
      rateLimit: {
        enabled: true,
        windowMs: 900000,
        maxRequests: 500,
        skipSuccessfulRequests: false,
      },
      ssl: {
        enabled: true,
        enforceHttps: true,
      },
    },
    performance: {
      ...baseDeploymentConfig.performance,
      cache: {
        enabled: true,
        ttl: 120000, // 2 minutes
        maxSize: 200,
        compression: true,
      },
      monitoring: {
        enabled: true,
        healthCheckInterval: 45000,
        memoryThreshold: 0.75,
        cpuThreshold: 0.75,
      },
    },
    agents: {
      ...baseDeploymentConfig.agents,
      maxConcurrent: 3,
      defaultTimeout: 180000,
      sandboxEnabled: true,
    },
    costs: {
      ...baseDeploymentConfig.costs,
      budgets: {
        dailyLimit: 15.00,
        monthlyLimit: 250.00,
        alertThreshold: 25.00,
        enforceLimit: true,
      },
    },
  },

  production: {
    environment: 'production',
    server: {
      ...baseDeploymentConfig.server,
      port: 3000,
      host: '0.0.0.0',
      protocol: 'https',
      trustedProxies: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
      compression: true,
      helmet: true,
    },
    nextjs: {
      ...baseDeploymentConfig.nextjs,
      compress: true,
      productionBrowserSourceMaps: false,
      optimizeFonts: true,
      optimizeImages: true,
      experimental: {
        optimizePackageImports: ['lucide-react', '@radix-ui/react-icons', 'recharts'],
        serverComponentsExternalPackages: ['better-sqlite3', 'ws'],
      },
      compiler: {
        removeConsole: { exclude: ['error'] },
        reactRemoveProperties: true,
        styledComponents: false,
      },
    },
    database: {
      ...baseDeploymentConfig.database,
      url: 'sqlite:./data/production.db',
      poolSize: 20,
      connectionTimeout: 60000,
      queryTimeout: 30000,
      pragmas: {
        ...baseDeploymentConfig.database.pragmas,
        journal_mode: 'WAL',
        synchronous: 'NORMAL',
        cache_size: 5000,
        mmap_size: 536870912, // 512MB
        temp_store: 'memory',
        wal_autocheckpoint: 1000,
      },
      backup: {
        enabled: true,
        intervalHours: 24,
        retentionDays: 30,
        location: './backups/production',
      },
    },
    logging: {
      ...baseDeploymentConfig.logging,
      level: 'warn',
      enableConsole: false,
      enableFile: true,
      filePath: './logs/claudeops-production.log',
      maxFileSize: '50m',
      maxFiles: 10,
      format: 'json',
      includeMetadata: true,
    },
    security: {
      ...baseDeploymentConfig.security,
      cors: {
        enabled: true,
        origin: ['https://claudeops.yourdomain.com'],
        credentials: true,
      },
      rateLimit: {
        enabled: true,
        windowMs: 900000, // 15 minutes
        maxRequests: 1000,
        skipSuccessfulRequests: false,
      },
      helmet: {
        enabled: true,
        contentSecurityPolicy: true,
        crossOriginEmbedderPolicy: false,
      },
      ssl: {
        enabled: true,
        enforceHttps: true,
      },
    },
    performance: {
      ...baseDeploymentConfig.performance,
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
        compression: true,
      },
      compression: {
        enabled: true,
        level: 9,
        threshold: 1024,
      },
      clustering: {
        enabled: true,
        workers: undefined, // Will use CPU count
      },
      monitoring: {
        enabled: true,
        metricsPort: 9090,
        healthCheckInterval: 60000,
        memoryThreshold: 0.7,
        cpuThreshold: 0.7,
      },
    },
    websocket: {
      ...baseDeploymentConfig.websocket,
      port: 3001,
      host: '0.0.0.0',
      maxConnections: 500,
      heartbeatInterval: 60000,
      messageRateLimit: 120,
      backpressureLimit: 5000,
    },
    agents: {
      ...baseDeploymentConfig.agents,
      maxConcurrent: 5,
      defaultTimeout: 300000,
      memoryLimit: 1024,
      cpuLimit: 80,
      sandboxEnabled: true,
      cleanupInterval: 1800000, // 30 minutes
    },
    costs: {
      ...baseDeploymentConfig.costs,
      budgets: {
        dailyLimit: 25.00,
        monthlyLimit: 500.00,
        alertThreshold: 50.00,
        enforceLimit: true,
      },
      optimization: {
        cacheResponses: true,
        batchRequests: true,
        modelFallback: true,
      },
    },
  },

  test: {
    environment: 'test',
    server: {
      ...baseDeploymentConfig.server,
      port: 3000,
      host: 'localhost',
      compression: false,
      helmet: false,
    },
    nextjs: {
      ...baseDeploymentConfig.nextjs,
      compress: false,
      productionBrowserSourceMaps: false,
      optimizeFonts: false,
      optimizeImages: false,
    },
    database: {
      ...baseDeploymentConfig.database,
      url: 'sqlite:./data/test.db',
      poolSize: 1,
      connectionTimeout: 5000,
      queryTimeout: 3000,
      pragmas: {
        journal_mode: 'MEMORY',
        synchronous: 'OFF',
        cache_size: 100,
        temp_store: 'memory',
      },
      backup: {
        enabled: false,
      },
    },
    logging: {
      ...baseDeploymentConfig.logging,
      level: 'error',
      enableConsole: false,
      enableFile: false,
    },
    security: {
      ...baseDeploymentConfig.security,
      cors: {
        enabled: false,
        origin: false,
        credentials: false,
      },
      rateLimit: {
        enabled: false,
        windowMs: 60000,
        maxRequests: 10000,
        skipSuccessfulRequests: true,
      },
      helmet: {
        enabled: false,
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      },
    },
    performance: {
      ...baseDeploymentConfig.performance,
      cache: {
        enabled: false,
        ttl: 0,
        maxSize: 1,
        compression: false,
      },
      monitoring: {
        enabled: false,
        healthCheckInterval: 5000,
        memoryThreshold: 0.95,
        cpuThreshold: 0.95,
      },
    },
    agents: {
      ...baseDeploymentConfig.agents,
      maxConcurrent: 1,
      defaultTimeout: 10000,
      sandboxEnabled: false,
    },
    costs: {
      ...baseDeploymentConfig.costs,
      budgets: {
        monthlyLimit: 10.00,
        alertThreshold: 1.00,
        enforceLimit: false,
      },
      optimization: {
        cacheResponses: false,
        batchRequests: false,
        modelFallback: false,
      },
    },
  },
};

/**
 * Get deployment configuration for current environment
 */
export function getDeploymentConfig(): DeploymentConfig {
  const envConfig = getEnvironmentConfig();
  const environment = envConfig.NODE_ENV;
  
  // Merge base config with environment-specific overrides
  const envOverride = environmentOverrides[environment] || environmentOverrides.development;
  
  // Deep merge configurations
  const deploymentConfig: DeploymentConfig = {
    ...baseDeploymentConfig,
    ...envOverride,
    environment,
  } as DeploymentConfig;
  
  // Apply environment variable overrides
  applyEnvironmentVariableOverrides(deploymentConfig, envConfig);
  
  return deploymentConfig;
}

/**
 * Apply environment variable overrides to deployment config
 */
function applyEnvironmentVariableOverrides(
  deploymentConfig: DeploymentConfig, 
  envConfig: ClaudeOpsEnvironmentConfig
): void {
  // Server overrides
  if (envConfig.WEBSOCKET_PORT) {
    deploymentConfig.websocket.port = envConfig.WEBSOCKET_PORT;
  }
  
  if (envConfig.WEBSOCKET_HOST) {
    deploymentConfig.websocket.host = envConfig.WEBSOCKET_HOST;
  }
  
  // Database overrides
  if (envConfig.DATABASE_URL) {
    deploymentConfig.database.url = envConfig.DATABASE_URL;
  }
  
  // Agent overrides
  if (envConfig.MAX_CONCURRENT_AGENTS) {
    deploymentConfig.agents.maxConcurrent = envConfig.MAX_CONCURRENT_AGENTS;
  }
  
  if (envConfig.DEFAULT_AGENT_TIMEOUT) {
    deploymentConfig.agents.defaultTimeout = envConfig.DEFAULT_AGENT_TIMEOUT;
  }
  
  if (envConfig.AGENT_MEMORY_LIMIT) {
    deploymentConfig.agents.memoryLimit = envConfig.AGENT_MEMORY_LIMIT;
  }
  
  if (envConfig.AGENT_CPU_LIMIT) {
    deploymentConfig.agents.cpuLimit = envConfig.AGENT_CPU_LIMIT;
  }
  
  // Cost overrides
  if (envConfig.MONTHLY_BUDGET_LIMIT) {
    deploymentConfig.costs.budgets.monthlyLimit = envConfig.MONTHLY_BUDGET_LIMIT;
  }
  
  if (envConfig.COST_ALERT_THRESHOLD) {
    deploymentConfig.costs.budgets.alertThreshold = envConfig.COST_ALERT_THRESHOLD;
  }
  
  if (envConfig.COST_BUDGET_DAILY) {
    deploymentConfig.costs.budgets.dailyLimit = envConfig.COST_BUDGET_DAILY;
  }
  
  // Performance overrides
  if (envConfig.CONFIG_CACHE_TTL) {
    deploymentConfig.performance.cache.ttl = envConfig.CONFIG_CACHE_TTL;
  }
  
  // Rate limiting overrides
  if (envConfig.RATE_LIMIT_WINDOW_MS) {
    deploymentConfig.security.rateLimit.windowMs = envConfig.RATE_LIMIT_WINDOW_MS;
  }
  
  if (envConfig.RATE_LIMIT_MAX_REQUESTS) {
    deploymentConfig.security.rateLimit.maxRequests = envConfig.RATE_LIMIT_MAX_REQUESTS;
  }
  
  // SSL overrides
  if (envConfig.SSL_CERT_PATH && envConfig.SSL_KEY_PATH) {
    deploymentConfig.security.ssl.enabled = true;
    deploymentConfig.security.ssl.certPath = envConfig.SSL_CERT_PATH;
    deploymentConfig.security.ssl.keyPath = envConfig.SSL_KEY_PATH;
  }
  
  // Monitoring overrides
  if (envConfig.ENABLE_METRICS) {
    deploymentConfig.performance.monitoring.enabled = envConfig.ENABLE_METRICS;
  }
  
  if (envConfig.METRICS_PORT) {
    deploymentConfig.performance.monitoring.metricsPort = envConfig.METRICS_PORT;
  }
  
  // Health check overrides
  if (envConfig.HEALTH_CHECK_INTERVAL) {
    deploymentConfig.performance.monitoring.healthCheckInterval = envConfig.HEALTH_CHECK_INTERVAL;
  }
  
  // Backup overrides
  if (envConfig.BACKUP_ENABLED) {
    deploymentConfig.database.backup.enabled = envConfig.BACKUP_ENABLED;
  }
  
  if (envConfig.BACKUP_INTERVAL_HOURS) {
    deploymentConfig.database.backup.intervalHours = envConfig.BACKUP_INTERVAL_HOURS;
  }
  
  if (envConfig.BACKUP_RETENTION_DAYS) {
    deploymentConfig.database.backup.retentionDays = envConfig.BACKUP_RETENTION_DAYS;
  }
}

/**
 * Validate deployment configuration
 */
export function validateDeploymentConfig(config: DeploymentConfig): Array<{
  field: string;
  message: string;
  severity: 'error' | 'warning';
}> {
  const errors: Array<{ field: string; message: string; severity: 'error' | 'warning' }> = [];
  
  // Production-specific validations
  if (config.environment === 'production') {
    if (!config.security.ssl.enabled) {
      errors.push({
        field: 'security.ssl.enabled',
        message: 'SSL should be enabled in production',
        severity: 'warning'
      });
    }
    
    if (!config.performance.monitoring.enabled) {
      errors.push({
        field: 'performance.monitoring.enabled',
        message: 'Monitoring should be enabled in production',
        severity: 'warning'
      });
    }
    
    if (!config.database.backup.enabled) {
      errors.push({
        field: 'database.backup.enabled',
        message: 'Database backup should be enabled in production',
        severity: 'error'
      });
    }
    
    if (config.logging.enableConsole) {
      errors.push({
        field: 'logging.enableConsole',
        message: 'Console logging should be disabled in production',
        severity: 'warning'
      });
    }
  }
  
  // Port validations
  if (config.server.port < 1024 && config.server.port !== 80 && config.server.port !== 443) {
    errors.push({
      field: 'server.port',
      message: 'Server port below 1024 requires elevated privileges',
      severity: 'warning'
    });
  }
  
  if (config.websocket.port === config.server.port) {
    errors.push({
      field: 'websocket.port',
      message: 'WebSocket port should be different from server port',
      severity: 'error'
    });
  }
  
  // Resource limit validations
  if (config.agents.maxConcurrent < 1) {
    errors.push({
      field: 'agents.maxConcurrent',
      message: 'Maximum concurrent agents must be at least 1',
      severity: 'error'
    });
  }
  
  if (config.agents.defaultTimeout < 1000) {
    errors.push({
      field: 'agents.defaultTimeout',
      message: 'Agent timeout should be at least 1000ms',
      severity: 'warning'
    });
  }
  
  return errors;
}

/**
 * Get Next.js configuration object
 */
export function getNextJsConfig(): any {
  const config = getDeploymentConfig();
  
  return {
    compress: config.nextjs.compress,
    productionBrowserSourceMaps: config.nextjs.productionBrowserSourceMaps,
    optimizeFonts: config.nextjs.optimizeFonts,
    images: {
      formats: ['image/webp', 'image/avif'],
      deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
      imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
      unoptimized: !config.nextjs.optimizeImages,
    },
    experimental: config.nextjs.experimental,
    compiler: config.nextjs.compiler,
    poweredByHeader: false,
    generateEtags: true,
    distDir: '.next',
    cleanDistDir: true,
  };
}

/**
 * Export singleton instances
 */
export const deploymentConfig = getDeploymentConfig();
export const deploymentValidation = validateDeploymentConfig(deploymentConfig);