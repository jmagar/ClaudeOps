// Core framework exports
export { BaseAgent } from './core/BaseAgent';
export { HookManager } from './core/HookManager';
export { ErrorHandler } from './core/ErrorHandler';
export { SessionManager } from './core/SessionManager';
export { StreamHandler, StreamUtils } from './core/StreamHandler';
export { PermissionManager } from './core/PermissionManager';

// Import agent implementations for factory
import { SystemHealthAgent } from './systemHealthAgent';
import { DockerDeploymentAgent } from './dockerDeploymentAgent';
import { DockerComposerAgent } from './dockerComposerAgent';

// Import types needed for factory
import type { BaseAgentOptions, AgentType, AgentConfig, LogCallback, ProgressCallback, ProgressUpdate } from './core/types';
import { BaseAgent } from './core/BaseAgent';

// Types and interfaces
export type {
  BaseAgentOptions,
  BaseAgentResult,
  IBaseAgent,
  AgentConfig,
  AgentError,
  ErrorContext,
  ErrorRecovery,
  ProgressUpdate,
  StreamUpdate,
  SessionState,
  SessionCheckpoint,
  AgentHooks,
  LogCallback,
  ProgressCallback,
  ErrorHook,
  CompleteHook,
  CanUseToolCallback,
  ToolContext,
  AgentType,
  AgentFactoryOptions,
  TokenUsage
} from './core/types';

// Specific agent implementations
export { SystemHealthAgent } from './systemHealthAgent';
export { DockerDeploymentAgent } from './dockerDeploymentAgent';
export { DockerComposerAgent } from './dockerComposerAgent';

// Agent factory for creating different agent types
export class AgentFactory {
  private static defaultOptions: Partial<BaseAgentOptions> = {
    timeout_ms: 300000,  // 5 minutes
    maxTurns: 50,
    permissionMode: 'acceptEdits',
    includePartialMessages: true
  };

  /**
   * Create an agent of the specified type
   */
  static create(
    type: AgentType,
    options: BaseAgentOptions = {}
  ): BaseAgent {
    // Merge with default options for future use
    const mergedOptions = {
      ...this.defaultOptions,
      ...options
    };

    switch (type) {
      case 'system-health':
        return new SystemHealthAgent();
      case 'docker-deployment':
        return new DockerDeploymentAgent();
      case 'docker-composer':
        return new DockerComposerAgent();
      
      default:
        throw new Error(`Unknown agent type: ${type}. Available types: ${this.getAvailableTypes().join(', ')}`);
    }
  }

  /**
   * Get available agent types
   */
  static getAvailableTypes(): AgentType[] {
    return [
      'system-health',
      'docker-deployment',
      'docker-composer'
    ];
  }

  /**
   * Get agent configuration without creating an instance
   */
  static getAgentConfig(type: AgentType): AgentConfig {
    const tempAgent = this.create(type);
    return tempAgent.getConfig();
  }

  /**
   * Create an agent with pre-configured hooks and utilities
   */
  static createWithDefaults(
    type: AgentType,
    options: BaseAgentOptions = {},
    setupDefaults: boolean = true
  ): BaseAgent {
    const agent = this.create(type, options);

    if (setupDefaults) {
      // You could set up default hooks, error handlers, etc. here
      // This is where you'd configure common behavior across all agents
    }

    return agent;
  }
}

// Utility functions for common agent operations
export class AgentUtils {
  /**
   * Create a standard logging function with consistent formatting
   */
  static createLogger(prefix: string = ''): LogCallback {
    return (message: string, level: string = 'info') => {
      const timestamp = new Date().toISOString();
      const levelIcon = this.getLevelIcon(level);
      const formattedPrefix = prefix ? `[${prefix}] ` : '';
      console.log(`${timestamp} ${levelIcon} ${formattedPrefix}${message}`);
    };
  }

  /**
   * Create a progress callback that logs to console
   */
  static createProgressLogger(prefix: string = ''): ProgressCallback {
    return (progress: ProgressUpdate) => {
      const timestamp = new Date().toISOString();
      const percentage = progress.percentage ? ` (${progress.percentage}%)` : '';
      const cost = progress.cost ? ` [$${progress.cost.toFixed(4)}]` : '';
      const formattedPrefix = prefix ? `[${prefix}] ` : '';
      
      console.log(`${timestamp} 📈 ${formattedPrefix}${progress.message}${percentage}${cost}`);
    };
  }

  /**
   * Create a combined logger and progress tracker
   */
  static createCombinedCallbacks(prefix: string = ''): {
    onLog: LogCallback;
    onProgress: ProgressCallback;
  } {
    return {
      onLog: this.createLogger(prefix),
      onProgress: this.createProgressLogger(prefix)
    };
  }

  /**
   * Get icon for log level
   */
  private static getLevelIcon(level: string): string {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'info': return 'ℹ️';
      case 'debug': return '🔍';
      default: return 'ℹ️';
    }
  }
}

// Example usage:
/*
import { AgentFactory, AgentUtils } from './lib/agents';

// Create a system health agent with default configuration
const agent = AgentFactory.create('system-health');

// Or create with custom options and callbacks
const { onLog, onProgress } = AgentUtils.createCombinedCallbacks('Health');
const customAgent = AgentFactory.create('system-health', {
  timeout_ms: 600000,
  maxTurns: 100,
  onLog,
  onProgress
});

// Execute the agent
const result = await customAgent.execute({
  include_docker: true,
  include_security_scan: true,
  ai_analysis_depth: 'comprehensive'
});
*/