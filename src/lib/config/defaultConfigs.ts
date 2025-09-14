/**
 * Default Agent Configurations
 * Provides baseline configurations for different agent types
 */

import type { DefaultAgentConfigs } from '../types/config';

/**
 * System Health Agent Default Configuration
 */
const systemHealthConfig = {
  name: 'System Health Reporter',
  description: 'Comprehensive system analysis with AI-powered insights and trend detection',
  version: '1.0.0',
  
  execution: {
    maxCostPerExecution: 0.10,
    maxDurationMs: 300000, // 5 minutes
    timeoutMs: 300000,
    maxConcurrentExecutions: 1,
    cooldownMs: 900000, // 15 minutes
    retryPolicy: {
      maxRetries: 3,
      backoffStrategy: 'exponential' as const,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
    },
  },

  runtime: {
    memoryLimitMB: 512,
    cpuLimitPercent: 50,
    logLevel: 'info' as const,
  },

  claude: {
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.1,
    systemPrompt: `You are a system health analysis expert. Analyze the provided system metrics and logs to provide comprehensive health insights, trend analysis, and actionable recommendations. Focus on:
- Disk space usage trends and predictions
- Memory/CPU utilization patterns  
- Service health monitoring
- Security audit findings
- Network connectivity issues
- System log anomalies
Provide clear, prioritized recommendations with estimated impact and urgency levels.`,
    costBudget: {
      daily: 1.0,
      monthly: 25.0,
      perExecution: 0.10,
    },
  },

  config: {
    metrics: {
      collectCpuStats: true,
      collectMemoryStats: true,
      collectDiskStats: true,
      collectNetworkStats: true,
      collectServiceStats: true,
      collectSecurityStats: true,
      historyDays: 30,
      thresholds: {
        diskUsage: { warning: 80, critical: 90 },
        memoryUsage: { warning: 85, critical: 95 },
        cpuUsage: { warning: 80, critical: 95 },
        loadAverage: { warning: 2.0, critical: 5.0 },
      },
    },
    reporting: {
      includeRecommendations: true,
      includeTrends: true,
      includeAnomalies: true,
      detailLevel: 'standard', // 'minimal', 'standard', 'detailed'
      outputFormat: 'json',
    },
    security: {
      checkOpenPorts: true,
      checkAuthLogs: true,
      checkPackageUpdates: true,
      checkFirewallStatus: true,
      auditDays: 7,
    },
  },

  scheduling: {
    enabled: true,
    cronExpression: '0 6,18 * * *', // 6 AM and 6 PM daily
    timezone: 'UTC',
    maxMissedRuns: 3,
  },
};

/**
 * Docker Janitor Agent Default Configuration
 */
const dockerJanitorConfig = {
  name: 'Docker Janitor',
  description: 'Automated Docker resource cleanup and optimization with intelligent recommendations',
  version: '1.0.0',
  
  execution: {
    maxCostPerExecution: 0.15,
    maxDurationMs: 600000, // 10 minutes
    timeoutMs: 600000,
    maxConcurrentExecutions: 1,
    cooldownMs: 3600000, // 1 hour
    retryPolicy: {
      maxRetries: 2,
      backoffStrategy: 'exponential' as const,
      initialDelayMs: 2000,
      maxDelayMs: 60000,
    },
  },

  runtime: {
    memoryLimitMB: 256,
    cpuLimitPercent: 30,
    logLevel: 'info' as const,
  },

  claude: {
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.1,
    systemPrompt: `You are a Docker optimization expert. Analyze Docker resource usage and provide intelligent cleanup recommendations. Focus on:
- Unused image identification with size impact analysis
- Container resource optimization recommendations  
- Volume cleanup suggestions with safety checks
- Registry optimization strategies
- Compose stack health verification
Prioritize recommendations by storage savings and safety level.`,
    costBudget: {
      daily: 2.0,
      monthly: 50.0,
      perExecution: 0.15,
    },
  },

  config: {
    cleanup: {
      removeUnusedImages: false, // Start with analysis only
      removeStoppedContainers: false,
      removeUnusedVolumes: false,
      removeUnusedNetworks: true,
      pruneBuilderCache: false,
      dryRun: true, // Always start in dry-run mode
    },
    thresholds: {
      imageAgeMinutes: 10080, // 7 days
      containerStoppedMinutes: 1440, // 1 day
      volumeUnusedMinutes: 10080, // 7 days
      minimumFreeSpaceGB: 10,
    },
    safety: {
      preserveLabels: ['production', 'critical', 'backup'],
      preserveImages: ['postgres', 'redis', 'nginx'],
      requireConfirmation: true,
      backupBeforeCleanup: false,
    },
    analysis: {
      includeComposeStacks: true,
      analyzeDiskUsage: true,
      checkRegistryHealth: true,
      reportSavingsEstimate: true,
    },
  },

  scheduling: {
    enabled: true,
    cronExpression: '0 2 * * 0', // 2 AM every Sunday
    timezone: 'UTC',
    maxMissedRuns: 2,
  },
};

/**
 * Backup Validator Agent Default Configuration
 */
const backupValidatorConfig = {
  name: 'Backup Validator',
  description: 'Automated backup integrity verification with restoration testing',
  version: '1.0.0',
  
  execution: {
    maxCostPerExecution: 0.08,
    maxDurationMs: 900000, // 15 minutes
    timeoutMs: 900000,
    maxConcurrentExecutions: 1,
    cooldownMs: 21600000, // 6 hours
    retryPolicy: {
      maxRetries: 2,
      backoffStrategy: 'linear' as const,
      initialDelayMs: 5000,
      maxDelayMs: 30000,
    },
  },

  runtime: {
    memoryLimitMB: 256,
    cpuLimitPercent: 25,
    logLevel: 'info' as const,
  },

  claude: {
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: 3072,
    temperature: 0.05,
    systemPrompt: `You are a backup and disaster recovery expert. Analyze backup integrity results and provide comprehensive validation reports. Focus on:
- Backup file integrity verification
- Restoration test results analysis
- Backup age and retention policy compliance
- Storage efficiency recommendations
- Recovery time objective (RTO) analysis
Provide clear pass/fail status with detailed remediation steps for any issues.`,
    costBudget: {
      daily: 0.5,
      monthly: 15.0,
      perExecution: 0.08,
    },
  },

  config: {
    validation: {
      checkFileIntegrity: true,
      testRestoration: true,
      verifyEncryption: true,
      validateMetadata: true,
      performanceBenchmark: false,
    },
    backupSources: {
      databases: {
        enabled: true,
        testSampleRestore: true,
        maxRestoreTestMB: 100,
      },
      fileSystem: {
        enabled: true,
        checksumValidation: true,
        sampleFileRestore: false,
      },
      containers: {
        enabled: false,
        validateImages: false,
        testVolumeRestore: false,
      },
    },
    retention: {
      checkRetentionPolicy: true,
      alertOnExpiredBackups: true,
      alertOnMissingBackups: true,
      expectedFrequency: 'daily',
    },
    reporting: {
      detailedResults: true,
      includePerformanceMetrics: false,
      alertOnFailures: true,
      storageAnalysis: true,
    },
  },

  scheduling: {
    enabled: true,
    cronExpression: '0 4 * * *', // 4 AM daily
    timezone: 'UTC',
    maxMissedRuns: 2,
  },
};

/**
 * Development/Test Agent Configuration
 */
const testAgentConfig = {
  name: 'Test Agent',
  description: 'Development and testing agent with minimal constraints',
  version: '1.0.0',
  
  execution: {
    maxCostPerExecution: 0.01,
    maxDurationMs: 60000, // 1 minute
    timeoutMs: 60000,
    maxConcurrentExecutions: 5,
    cooldownMs: 0,
    retryPolicy: {
      maxRetries: 1,
      backoffStrategy: 'fixed' as const,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
    },
  },

  runtime: {
    memoryLimitMB: 128,
    cpuLimitPercent: 10,
    logLevel: 'debug' as const,
  },

  claude: {
    model: 'claude-3-haiku-20240307',
    maxTokens: 1024,
    temperature: 0.3,
    systemPrompt: 'You are a test agent. Respond briefly to verify the system is working correctly.',
    costBudget: {
      daily: 0.1,
      monthly: 2.0,
      perExecution: 0.01,
    },
  },

  config: {
    mode: 'test',
    outputFormat: 'json',
    includeTimestamp: true,
    echoInput: false,
  },
};

/**
 * Default configurations by agent type
 */
export const defaultConfigs: Record<string, any> = {
  'system-health': systemHealthConfig,
  'docker-janitor': dockerJanitorConfig,
  'backup-validator': backupValidatorConfig,
  'test-agent': testAgentConfig,
};

/**
 * Environment-specific overrides
 */
export const environmentOverrides = {
  development: {
    execution: {
      maxCostPerExecution: 0.01,
      timeoutMs: 30000,
      cooldownMs: 0,
    },
    runtime: {
      logLevel: 'debug' as const,
    },
    claude: {
      model: 'claude-3-haiku-20240307',
      maxTokens: 1024,
    },
  },
  
  staging: {
    execution: {
      maxCostPerExecution: 0.05,
      cooldownMs: 60000, // 1 minute
    },
    runtime: {
      logLevel: 'info' as const,
    },
  },

  production: {
    execution: {
      retryPolicy: {
        maxRetries: 5,
        backoffStrategy: 'exponential' as const,
        initialDelayMs: 2000,
        maxDelayMs: 300000, // 5 minutes
      },
    },
    runtime: {
      logLevel: 'warn' as const,
    },
    claude: {
      costBudget: {
        daily: 5.0,
        monthly: 150.0,
      },
    },
  },
};

/**
 * Get default configuration for agent type
 */
export function getDefaultConfig(agentType: string): typeof systemHealthConfig | undefined {
  return defaultConfigs[agentType];
}

/**
 * Get environment-specific overrides
 */
export function getEnvironmentOverrides(environment: string) {
  return environmentOverrides[environment as keyof typeof environmentOverrides];
}

/**
 * List all available default agent types
 */
export function getAvailableAgentTypes(): string[] {
  return Object.keys(defaultConfigs);
}