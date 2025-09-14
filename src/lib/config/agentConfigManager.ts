/**
 * Agent Configuration Manager
 * Central service for managing agent configurations with database persistence,
 * validation, environment overrides, and hot-reloading capabilities
 */

import { EventEmitter } from 'events';
import type {
  AgentConfigSchema,
  ResolvedAgentConfig,
  ConfigurationEvent,
  ConfigurationChange,
  ConfigurationState,
  ConfigurationWatcher,
  ConfigManagerOptions,
  ConfigurationDiff,
  ValidationResult
} from '../types/config';
import type { AgentConfiguration, DatabaseOperationResult } from '../types/database';
import { agentService } from '../services/agentService';
import { environmentManager } from './environmentConfig';
import { ConfigValidator, validateConfig } from './configValidator';
import { defaultConfigs, getDefaultConfig } from './defaultConfigs';

/**
 * Default configuration manager options
 */
const DEFAULT_OPTIONS: ConfigManagerOptions = {
  enableHotReload: true,
  reloadIntervalMs: 30000, // 30 seconds
  validateOnLoad: true,
  strictMode: false,
  environmentPriority: ['development', 'staging', 'production'],
  cacheConfigs: true,
  watchFiles: false,
  backupConfigs: true,
};

/**
 * Agent Configuration Manager Class
 */
export class AgentConfigManager extends EventEmitter {
  private state: ConfigurationState;
  private options: ConfigManagerOptions;
  private validator: ConfigValidator;
  private reloadTimer?: NodeJS.Timeout;
  private configCache: Map<string, { config: ResolvedAgentConfig; timestamp: number }>;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor(options: Partial<ConfigManagerOptions> = {}) {
    super();
    
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.validator = new ConfigValidator([], this.options.strictMode);
    this.configCache = new Map();
    
    this.state = {
      configs: new Map(),
      environments: new Map(),
      watchers: new Set(),
      lastReload: new Date().toISOString(),
      hotReloadEnabled: this.options.enableHotReload,
    };

    this.initialize();
  }

  /**
   * Initialize the configuration manager
   */
  private async initialize(): Promise<void> {
    try {
      // Load configurations from database
      await this.loadConfigurations();

      // Start hot-reload if enabled
      if (this.options.enableHotReload) {
        this.startHotReload();
      }

      this.emit('initialized');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Load all configurations from database
   */
  private async loadConfigurations(): Promise<void> {
    try {
      const result = await agentService.getAgentConfigurations({
        enabled: undefined, // Load all configurations
        limit: 1000,
      });

      if (!result.success || !result.data) {
        throw new Error(`Failed to load configurations: ${result.error}`);
      }

      this.state.configs.clear();

      for (const dbConfig of result.data.data) {
        try {
          const agentConfig = this.convertDbConfigToSchema(dbConfig);
          const resolvedConfig = await this.resolveConfiguration(agentConfig);
          
          // Validate if required
          if (this.options.validateOnLoad) {
            const validation = this.validator.validate(agentConfig);
            if (!validation.valid && this.options.strictMode) {
              console.warn(`Configuration validation failed for ${dbConfig.agentType}:`, validation.errors);
              continue;
            }
          }

          this.state.configs.set(dbConfig.agentType, resolvedConfig);
        } catch (error) {
          console.error(`Failed to load configuration for ${dbConfig.agentType}:`, error);
        }
      }

      this.state.lastReload = new Date().toISOString();
      this.emit('configurations-loaded', this.state.configs.size);
    } catch (error) {
      console.error('Failed to load configurations:', error);
      throw error;
    }
  }

  /**
   * Convert database configuration to schema format
   */
  private convertDbConfigToSchema(dbConfig: AgentConfiguration): AgentConfigSchema {
    const config = dbConfig.config ? JSON.parse(dbConfig.config) : {};
    
    // Get default configuration as base
    const defaultConfig = getDefaultConfig(dbConfig.agentType);
    
    return {
      type: dbConfig.agentType,
      name: dbConfig.name,
      description: dbConfig.description || defaultConfig?.description,
      version: dbConfig.version,
      
      execution: {
        maxCostPerExecution: dbConfig.maxCostPerExecution || defaultConfig?.execution.maxCostPerExecution,
        maxDurationMs: dbConfig.maxDurationMs || defaultConfig?.execution.maxDurationMs,
        timeoutMs: dbConfig.timeoutMs || defaultConfig?.execution.timeoutMs || 300000,
        maxConcurrentExecutions: dbConfig.maxConcurrentExecutions || defaultConfig?.execution.maxConcurrentExecutions || 1,
        cooldownMs: dbConfig.cooldownMs || defaultConfig?.execution.cooldownMs || 0,
        retryPolicy: config.retryPolicy || defaultConfig?.execution.retryPolicy || {
          maxRetries: 3,
          backoffStrategy: 'exponential' as const,
          initialDelayMs: 1000,
          maxDelayMs: 30000,
        },
      },

      runtime: config.runtime || defaultConfig?.runtime || {
        logLevel: 'info' as const,
      },

      claude: config.claude || defaultConfig?.claude || {
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
      },

      config: config.agentConfig || {},
      
      scheduling: config.scheduling,
      environments: config.environments,
    };
  }

  /**
   * Resolve configuration with environment overrides
   */
  private async resolveConfiguration(baseConfig: AgentConfigSchema): Promise<ResolvedAgentConfig> {
    // Apply environment overrides
    const resolvedConfig = environmentManager.applyEnvironmentOverrides(baseConfig);
    
    // Set metadata
    resolvedConfig.metadata = {
      source: 'database',
      priority: 100,
      lastModified: new Date().toISOString(),
      validated: this.options.validateOnLoad,
      validationTimestamp: this.options.validateOnLoad ? new Date().toISOString() : undefined,
    };

    return resolvedConfig;
  }

  /**
   * Get agent configuration by type
   */
  async getConfiguration(agentType: string, useCache: boolean = true): Promise<ResolvedAgentConfig | null> {
    // Check cache first
    if (useCache && this.options.cacheConfigs) {
      const cached = this.configCache.get(agentType);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.config;
      }
    }

    // Check in-memory state
    const config = this.state.configs.get(agentType);
    if (config) {
      this.updateCache(agentType, config);
      return config;
    }

    // Try to load from database
    const result = await agentService.getAgentByType(agentType);
    if (result.success && result.data) {
      const agentConfig = this.convertDbConfigToSchema(result.data);
      const resolvedConfig = await this.resolveConfiguration(agentConfig);
      
      this.state.configs.set(agentType, resolvedConfig);
      this.updateCache(agentType, resolvedConfig);
      
      return resolvedConfig;
    }

    return null;
  }

  /**
   * Create new agent configuration
   */
  async createConfiguration(config: AgentConfigSchema): Promise<DatabaseOperationResult<ResolvedAgentConfig>> {
    try {
      // Validate configuration
      const validation = this.validator.validate(config);
      if (!validation.valid) {
        return {
          success: false,
          error: `Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        };
      }

      // Convert to database format
      const dbConfig = this.convertSchemaToDbConfig(config);
      
      // Create in database
      const result = await agentService.createAgentConfiguration(dbConfig as any);
      if (!result.success) {
        return {
          success: false,
          error: result.error
        };
      }

      // Resolve and cache the configuration
      const resolvedConfig = await this.resolveConfiguration(config);
      this.state.configs.set(config.type, resolvedConfig);
      this.updateCache(config.type, resolvedConfig);

      // Emit event
      const event: ConfigurationEvent = {
        type: 'created',
        agentType: config.type,
        timestamp: new Date().toISOString(),
        source: 'api',
      };
      this.emitConfigurationEvent(event);

      return {
        success: true,
        data: resolvedConfig,
        affectedRows: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Update agent configuration
   */
  async updateConfiguration(
    agentType: string,
    updates: Partial<AgentConfigSchema>
  ): Promise<DatabaseOperationResult<ResolvedAgentConfig>> {
    try {
      // Get current configuration
      const currentConfig = await this.getConfiguration(agentType, false);
      if (!currentConfig) {
        return {
          success: false,
          error: `Configuration not found: ${agentType}`,
        };
      }

      // Merge updates
      const updatedConfig: AgentConfigSchema = {
        ...currentConfig,
        ...updates,
        type: agentType, // Preserve type
      };

      // Validate merged configuration
      const validation = this.validator.validate(updatedConfig);
      if (!validation.valid) {
        return {
          success: false,
          error: `Configuration validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        };
      }

      // Calculate changes
      const changes = this.calculateConfigurationChanges(currentConfig, updatedConfig);

      // Convert to database format and update
      const dbUpdates = this.convertSchemaToDbConfig(updatedConfig, true);
      const result = await agentService.updateAgentConfiguration(agentType, dbUpdates);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error
        };
      }

      // Resolve and update cached configuration
      const resolvedConfig = await this.resolveConfiguration(updatedConfig);
      this.state.configs.set(agentType, resolvedConfig);
      this.updateCache(agentType, resolvedConfig);
      this.clearRelatedCache(agentType);

      // Emit event
      const event: ConfigurationEvent = {
        type: 'updated',
        agentType,
        timestamp: new Date().toISOString(),
        changes,
        source: 'api',
      };
      this.emitConfigurationEvent(event);

      return {
        success: true,
        data: resolvedConfig,
        affectedRows: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete agent configuration
   */
  async deleteConfiguration(agentType: string, force: boolean = false): Promise<DatabaseOperationResult<void>> {
    try {
      const result = await agentService.deleteAgentConfiguration(agentType, force);
      
      if (result.success) {
        this.state.configs.delete(agentType);
        this.configCache.delete(agentType);

        // Emit event
        const event: ConfigurationEvent = {
          type: 'deleted',
          agentType,
          timestamp: new Date().toISOString(),
          source: 'api',
        };
        this.emitConfigurationEvent(event);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Enable/disable agent configuration
   */
  async toggleConfiguration(agentType: string, enabled: boolean): Promise<DatabaseOperationResult<ResolvedAgentConfig>> {
    try {
      const result = await agentService.toggleAgentEnabled(agentType, enabled);
      
      if (!result.success || !result.data) {
        return {
          success: false,
          error: result.error || 'Failed to toggle agent configuration'
        };
      }

      // Update in-memory state
      const config = this.state.configs.get(agentType);
      if (config) {
        // Note: enabled state is managed at database level, not in schema
        this.updateCache(agentType, config);
      }

      // Emit event
      const event: ConfigurationEvent = {
        type: enabled ? 'enabled' : 'disabled',
        agentType,
        timestamp: new Date().toISOString(),
        source: 'api',
      };
      this.emitConfigurationEvent(event);

      const agentConfig = this.convertDbConfigToSchema(result.data);
      const resolvedConfig = await this.resolveConfiguration(agentConfig);

      return {
        success: true,
        data: resolvedConfig,
        affectedRows: 1,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get all configurations
   */
  async getAllConfigurations(includeDisabled: boolean = false): Promise<ResolvedAgentConfig[]> {
    const result = await agentService.getAgentConfigurations({
      enabled: includeDisabled ? undefined : true,
      limit: 1000,
    });

    if (!result.success || !result.data) {
      return [];
    }

    const configurations: ResolvedAgentConfig[] = [];
    
    for (const dbConfig of result.data.data) {
      try {
        const agentConfig = this.convertDbConfigToSchema(dbConfig);
        const resolvedConfig = await this.resolveConfiguration(agentConfig);
        configurations.push(resolvedConfig);
      } catch (error) {
        console.error(`Failed to resolve configuration for ${dbConfig.agentType}:`, error);
      }
    }

    return configurations;
  }

  /**
   * Validate configuration
   */
  validateConfiguration(config: AgentConfigSchema): ValidationResult {
    return this.validator.validate(config);
  }

  /**
   * Register configuration change watcher
   */
  watch(
    callback: (event: ConfigurationEvent) => void | Promise<void>,
    options: {
      agentType?: string;
      filter?: (event: ConfigurationEvent) => boolean;
    } = {}
  ): string {
    const watcherId = `watcher_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const watcher: ConfigurationWatcher = {
      id: watcherId,
      agentType: options.agentType,
      callback,
      filter: options.filter,
    };

    this.state.watchers.add(watcher);

    return watcherId;
  }

  /**
   * Remove configuration watcher
   */
  unwatch(watcherId: string): boolean {
    for (const watcher of Array.from(this.state.watchers)) {
      if (watcher.id === watcherId) {
        this.state.watchers.delete(watcher);
        return true;
      }
    }
    return false;
  }

  /**
   * Reload all configurations
   */
  async reloadConfigurations(): Promise<void> {
    await this.loadConfigurations();
    this.configCache.clear();

    const event: ConfigurationEvent = {
      type: 'updated',
      agentType: 'all',
      timestamp: new Date().toISOString(),
      source: 'api',
    };
    this.emitConfigurationEvent(event);
  }

  /**
   * Start hot-reload monitoring
   */
  private startHotReload(): void {
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
    }

    this.reloadTimer = setInterval(async () => {
      try {
        await this.loadConfigurations();
      } catch (error) {
        console.error('Hot-reload failed:', error);
        this.emit('hot-reload-error', error);
      }
    }, this.options.reloadIntervalMs);
  }

  /**
   * Stop hot-reload monitoring
   */
  private stopHotReload(): void {
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
      this.reloadTimer = undefined;
    }
  }

  /**
   * Convert schema to database config format
   */
  private convertSchemaToDbConfig(
    config: AgentConfigSchema, 
    isUpdate: boolean = false
  ): Partial<AgentConfiguration> {
    const dbConfig: Partial<AgentConfiguration> = {
      agentType: config.type,
      name: config.name,
      description: config.description,
      version: config.version,
      maxCostPerExecution: config.execution.maxCostPerExecution,
      maxDurationMs: config.execution.maxDurationMs,
      timeoutMs: config.execution.timeoutMs,
      maxConcurrentExecutions: config.execution.maxConcurrentExecutions,
      cooldownMs: config.execution.cooldownMs,
      config: JSON.stringify({
        retryPolicy: config.execution.retryPolicy,
        runtime: config.runtime,
        claude: config.claude,
        agentConfig: config.config,
        scheduling: config.scheduling,
        environments: config.environments,
      }),
    };

    if (!isUpdate) {
      dbConfig.enabled = true;
    }

    return dbConfig;
  }

  /**
   * Calculate configuration changes between two configs
   */
  private calculateConfigurationChanges(
    oldConfig: ResolvedAgentConfig,
    newConfig: AgentConfigSchema
  ): ConfigurationChange[] {
    const changes: ConfigurationChange[] = [];
    
    // Deep compare configurations
    this.deepCompare(oldConfig, newConfig, [], changes);
    
    return changes;
  }

  /**
   * Deep compare objects for changes
   */
  private deepCompare(
    oldValue: any,
    newValue: any,
    path: string[],
    changes: ConfigurationChange[]
  ): void {
    if (oldValue === newValue) return;

    if (typeof oldValue !== 'object' || typeof newValue !== 'object' || 
        oldValue === null || newValue === null ||
        Array.isArray(oldValue) || Array.isArray(newValue)) {
      changes.push({
        field: path.join('.'),
        oldValue,
        newValue,
        path: [...path],
      });
      return;
    }

    const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    
    for (const key of Array.from(allKeys)) {
      this.deepCompare(
        oldValue[key],
        newValue[key],
        [...path, key],
        changes
      );
    }
  }

  /**
   * Update configuration cache
   */
  private updateCache(agentType: string, config: ResolvedAgentConfig): void {
    if (this.options.cacheConfigs) {
      this.configCache.set(agentType, {
        config,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Clear related cache entries
   */
  private clearRelatedCache(agentType: string): void {
    // Clear any cached data that might be affected by configuration changes
    this.configCache.delete(`${agentType}_performance`);
    this.configCache.delete(`${agentType}_stats`);
  }

  /**
   * Emit configuration event to watchers
   */
  private emitConfigurationEvent(event: ConfigurationEvent): void {
    for (const watcher of Array.from(this.state.watchers)) {
      if (watcher.agentType && watcher.agentType !== event.agentType && event.agentType !== 'all') {
        continue;
      }

      if (watcher.filter && !watcher.filter(event)) {
        continue;
      }

      try {
        const result = watcher.callback(event);
        if (result instanceof Promise) {
          result.catch(error => {
            console.error(`Configuration watcher ${watcher.id} error:`, error);
          });
        }
      } catch (error) {
        console.error(`Configuration watcher ${watcher.id} error:`, error);
      }
    }

    // Also emit as EventEmitter event
    this.emit('configuration-changed', event);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHotReload();
    this.state.watchers.clear();
    this.configCache.clear();
    this.removeAllListeners();
  }
}

/**
 * Singleton instance
 */
export const configManager = new AgentConfigManager();

/**
 * Helper functions for external use
 */
export async function getAgentConfig(agentType: string): Promise<ResolvedAgentConfig | null> {
  return configManager.getConfiguration(agentType);
}

export async function createAgentConfig(config: AgentConfigSchema): Promise<DatabaseOperationResult<ResolvedAgentConfig>> {
  return configManager.createConfiguration(config);
}

export async function updateAgentConfig(
  agentType: string, 
  updates: Partial<AgentConfigSchema>
): Promise<DatabaseOperationResult<ResolvedAgentConfig>> {
  return configManager.updateConfiguration(agentType, updates);
}

export async function deleteAgentConfig(agentType: string, force?: boolean): Promise<DatabaseOperationResult<void>> {
  return configManager.deleteConfiguration(agentType, force);
}

export function watchConfigChanges(
  callback: (event: ConfigurationEvent) => void,
  options?: { agentType?: string; filter?: (event: ConfigurationEvent) => boolean }
): string {
  return configManager.watch(callback, options);
}