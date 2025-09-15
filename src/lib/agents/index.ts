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
import { InfrastructureAnalysisAgent } from './infrastructureAnalysisAgent';
import { ServiceResearchAgent } from './serviceResearchAgent';
import { ConfigGeneratorAgent } from './configGeneratorAgent';
import { SecurityCredentialsAgent } from './securityCredentialsAgent';
import { DeploymentExecutorAgent } from './deploymentExecutorAgent';
import { VerificationAgent } from './verificationAgent';

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
export { InfrastructureAnalysisAgent } from './infrastructureAnalysisAgent';
export { ServiceResearchAgent } from './serviceResearchAgent';
export { ConfigGeneratorAgent } from './configGeneratorAgent';
export { SecurityCredentialsAgent } from './securityCredentialsAgent';
export { DeploymentExecutorAgent } from './deploymentExecutorAgent';
export { VerificationAgent } from './verificationAgent';

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
  static create<T extends BaseAgent>(
    type: AgentType,
    options: BaseAgentOptions = {}
  ): T {
    const mergedOptions = {
      ...this.defaultOptions,
      ...options
    };

    switch (type) {
      case 'system-health':
        return new SystemHealthAgent() as T;
      case 'docker-deployment':
        return new DockerDeploymentAgent() as T;
      case 'infrastructure-analysis':
        return new InfrastructureAnalysisAgent() as T;
      case 'service-research':
        return new ServiceResearchAgent() as T;
      case 'config-generator':
        return new ConfigGeneratorAgent() as T;
      case 'security-credentials':
        return new SecurityCredentialsAgent() as T;
      case 'deployment-executor':
        return new DeploymentExecutorAgent() as T;
      case 'verification':
        return new VerificationAgent() as T;
      
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
      'infrastructure-analysis',
      'service-research',
      'config-generator',
      'security-credentials',
      'deployment-executor',
      'verification'
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
  static createWithDefaults<T extends BaseAgent>(
    type: AgentType,
    options: BaseAgentOptions = {},
    setupDefaults: boolean = true
  ): T {
    const agent = this.create<T>(type, options);

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