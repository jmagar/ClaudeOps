// import { Options } from '@anthropic/claude-code-sdk';
type Options = Record<string, any>; // Placeholder type
import { AgentType, SDKConfigOptions } from '../types/claude';

export class SDKConfigFactory {
  private static readonly DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
  private static readonly DEFAULT_PERMISSION_MODE = 'acceptEdits';
  private static readonly DEFAULT_MAX_TURNS = 10;
  private static readonly DEFAULT_MAX_THINKING_TOKENS = 10000;

  /**
   * Create SDK configuration for a specific agent type
   */
  static createForAgent(agentType: AgentType, overrides?: Partial<SDKConfigOptions>): Options {
    const baseConfig: Options = {
      model: this.DEFAULT_MODEL,
      permissionMode: this.DEFAULT_PERMISSION_MODE,
      cwd: overrides?.workingDirectory || process.cwd(),
      env: process.env,
      maxTurns: overrides?.maxTurns || this.DEFAULT_MAX_TURNS,
      maxThinkingTokens: overrides?.maxThinkingTokens || this.DEFAULT_MAX_THINKING_TOKENS
    };

    // Agent-specific configurations
    switch (agentType) {
      case 'system-health':
        return {
          ...baseConfig,
          allowedTools: [
            'Bash',
            'Read',
            'Grep',
            'LS',
            'Glob'
          ],
          maxTurns: 15,
          appendSystemPrompt: `You are a system health monitoring specialist. Focus on:
- Analyzing disk usage patterns and predicting future needs
- Monitoring memory and CPU utilization trends
- Checking systemd service health status
- Reviewing security aspects like open ports and authentication logs
- Testing network connectivity and performance
- Detecting anomalies in system logs
Provide actionable insights and recommendations based on your analysis.`,
          ...overrides
        };

      case 'docker-janitor':
        return {
          ...baseConfig,
          allowedTools: [
            'Bash',
            'Read',
            'Grep'
          ],
          maxTurns: 12,
          appendSystemPrompt: `You are a Docker cleanup specialist. Focus on:
- Identifying unused images, containers, and volumes
- Analyzing resource consumption by Docker objects
- Checking container health and performance metrics
- Reviewing Docker Compose stack configurations
- Suggesting optimization strategies for resource usage
- Providing safe cleanup commands with size estimates
Always verify before suggesting destructive operations.`,
          ...overrides
        };

      case 'backup-validator':
        return {
          ...baseConfig,
          allowedTools: [
            'Bash',
            'Read',
            'LS',
            'Grep'
          ],
          maxTurns: 10,
          appendSystemPrompt: `You are a backup validation expert. Focus on:
- Verifying backup integrity and completeness
- Testing restore procedures in dry-run mode when possible
- Analyzing backup age and retention policy compliance
- Checking storage efficiency and compression ratios
- Identifying potential backup failures or gaps
- Recommending backup strategy improvements
Ensure all operations are read-only unless explicitly requested.`,
          ...overrides
        };

      case 'custom':
        return {
          ...baseConfig,
          allowedTools: [
            'Bash',
            'Read',
            'Write',
            'Edit',
            'Grep',
            'LS',
            'Glob'
          ],
          maxTurns: overrides?.maxTurns || 20,
          appendSystemPrompt: overrides?.appendSystemPrompt || 'You are a general-purpose AI assistant capable of performing various system administration tasks.',
          ...overrides
        };

      default:
        return {
          ...baseConfig,
          ...overrides
        };
    }
  }

  /**
   * Create configuration for development/testing
   */
  static createDevelopmentConfig(overrides?: Partial<Options>): Options {
    return {
      model: this.DEFAULT_MODEL,
      permissionMode: 'plan', // Safer for development
      cwd: process.cwd(),
      env: process.env,
      maxTurns: 5, // Reduced for testing
      maxThinkingTokens: 5000, // Reduced for cost control
      allowedTools: [
        'Read',
        'LS',
        'Grep'
      ], // Read-only tools for safety
      ...overrides
    };
  }

  /**
   * Create configuration for production with enhanced security
   */
  static createProductionConfig(agentType: AgentType, overrides?: Partial<Options>): Options {
    const baseConfig = this.createForAgent(agentType, overrides);
    
    return {
      ...baseConfig,
      permissionMode: 'default', // Require explicit permission for operations
      executableArgs: ['--no-warnings'], // Cleaner logs in production
      ...overrides
    };
  }

  /**
   * Create streaming configuration for interactive sessions
   */
  static createStreamingConfig(agentType: AgentType, overrides?: Partial<Options>): Options {
    const baseConfig = this.createForAgent(agentType, overrides);
    
    return {
      ...baseConfig,
      permissionMode: 'default', // Allow dynamic permission changes
      maxTurns: 50, // Extended for interactive sessions
      ...overrides
    };
  }

  /**
   * Validate configuration before use
   */
  static validateConfig(config: Options): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.model) {
      errors.push('Model is required');
    }

    if (config.maxTurns && config.maxTurns < 1) {
      errors.push('maxTurns must be at least 1');
    }

    if (config.maxThinkingTokens && config.maxThinkingTokens < 0) {
      errors.push('maxThinkingTokens cannot be negative');
    }

    if (config.cwd && typeof config.cwd !== 'string') {
      errors.push('cwd must be a string path');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get estimated cost per execution for an agent type
   */
  static getEstimatedCost(agentType: AgentType): number {
    switch (agentType) {
      case 'system-health':
        return 0.05; // ~$0.05 per execution
      case 'docker-janitor':
        return 0.10; // ~$0.10 per execution (more analysis)
      case 'backup-validator':
        return 0.03; // ~$0.03 per execution (simpler checks)
      case 'custom':
        return 0.15; // ~$0.15 per execution (variable complexity)
      default:
        return 0.05; // Default estimate
    }
  }

  /**
   * Get recommended timeout for an agent type
   */
  static getRecommendedTimeout(agentType: AgentType): number {
    switch (agentType) {
      case 'system-health':
        return 300000; // 5 minutes
      case 'docker-janitor':
        return 600000; // 10 minutes (can involve large operations)
      case 'backup-validator':
        return 180000; // 3 minutes
      case 'custom':
        return 900000; // 15 minutes (variable complexity)
      default:
        return 300000; // 5 minutes default
    }
  }
}