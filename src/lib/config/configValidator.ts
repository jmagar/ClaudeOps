/**
 * Configuration Validation Service
 * Validates agent configurations with comprehensive rules and type checking
 */

import type { 
  AgentConfigSchema,
  ValidationRule,
  ValidationResult,
  ValidationError,
  ValidationWarning
} from '../types/config';

/**
 * Base validation rules for all agent configurations
 */
const baseValidationRules: ValidationRule[] = [
  // Basic metadata validation
  {
    field: 'type',
    type: 'required',
    message: 'Agent type is required',
  },
  {
    field: 'type',
    type: 'pattern',
    message: 'Agent type must be lowercase, alphanumeric with hyphens',
    constraint: /^[a-z][a-z0-9-]*[a-z0-9]$/,
  },
  {
    field: 'name',
    type: 'required',
    message: 'Agent name is required',
  },
  {
    field: 'version',
    type: 'pattern',
    message: 'Version must follow semantic versioning (e.g., 1.0.0)',
    constraint: /^\d+\.\d+\.\d+$/,
  },

  // Execution constraints validation
  {
    field: 'execution.maxCostPerExecution',
    type: 'range',
    message: 'Max cost per execution must be positive',
    constraint: { min: 0, max: 100 },
  },
  {
    field: 'execution.maxDurationMs',
    type: 'range',
    message: 'Max duration must be between 1 second and 1 hour',
    constraint: { min: 1000, max: 3600000 },
  },
  {
    field: 'execution.timeoutMs',
    type: 'range',
    message: 'Timeout must be between 1 second and 1 hour',
    constraint: { min: 1000, max: 3600000 },
  },
  {
    field: 'execution.maxConcurrentExecutions',
    type: 'range',
    message: 'Max concurrent executions must be between 1 and 10',
    constraint: { min: 1, max: 10 },
  },
  {
    field: 'execution.cooldownMs',
    type: 'range',
    message: 'Cooldown must be non-negative',
    constraint: { min: 0, max: 86400000 }, // Max 24 hours
  },

  // Retry policy validation
  {
    field: 'execution.retryPolicy.maxRetries',
    type: 'range',
    message: 'Max retries must be between 0 and 10',
    constraint: { min: 0, max: 10 },
  },
  {
    field: 'execution.retryPolicy.initialDelayMs',
    type: 'range',
    message: 'Initial delay must be positive',
    constraint: { min: 100, max: 60000 },
  },
  {
    field: 'execution.retryPolicy.maxDelayMs',
    type: 'range',
    message: 'Max delay must be greater than initial delay',
    constraint: { min: 1000, max: 300000 },
  },

  // Runtime validation
  {
    field: 'runtime.memoryLimitMB',
    type: 'range',
    message: 'Memory limit must be between 64MB and 4GB',
    constraint: { min: 64, max: 4096 },
  },
  {
    field: 'runtime.cpuLimitPercent',
    type: 'range',
    message: 'CPU limit must be between 1% and 100%',
    constraint: { min: 1, max: 100 },
  },

  // Claude configuration validation
  {
    field: 'claude.model',
    type: 'required',
    message: 'Claude model is required',
  },
  {
    field: 'claude.maxTokens',
    type: 'range',
    message: 'Max tokens must be between 100 and 200,000',
    constraint: { min: 100, max: 200000 },
  },
  {
    field: 'claude.temperature',
    type: 'range',
    message: 'Temperature must be between 0 and 1',
    constraint: { min: 0, max: 1 },
  },

  // Custom validation rules
  {
    field: 'execution.timeoutMs',
    type: 'custom',
    message: 'Timeout should be greater than max duration',
    validator: (value: number, config: AgentConfigSchema) => {
      if (config.execution.maxDurationMs && value <= config.execution.maxDurationMs) {
        return 'Timeout should be greater than max duration for proper error handling';
      }
      return true;
    },
  },
  {
    field: 'execution.retryPolicy.maxDelayMs',
    type: 'custom',
    message: 'Max delay should be greater than initial delay',
    validator: (value: number, config: AgentConfigSchema) => {
      const initialDelay = config.execution.retryPolicy.initialDelayMs;
      return value > initialDelay || 'Max delay must be greater than initial delay';
    },
  },
];

/**
 * Known Claude models with their capabilities
 */
const supportedModels = {
  'claude-3-5-sonnet-20241022': { maxTokens: 200000, cost: 'high', capability: 'advanced' },
  'claude-3-5-haiku-20241022': { maxTokens: 200000, cost: 'low', capability: 'basic' },
  'claude-3-opus-20240229': { maxTokens: 200000, cost: 'highest', capability: 'advanced' },
  'claude-3-sonnet-20240229': { maxTokens: 200000, cost: 'medium', capability: 'standard' },
  'claude-3-haiku-20240307': { maxTokens: 200000, cost: 'lowest', capability: 'basic' },
};

/**
 * Configuration Validator Class
 */
export class ConfigValidator {
  private rules: ValidationRule[];
  private strictMode: boolean;

  constructor(additionalRules: ValidationRule[] = [], strictMode: boolean = false) {
    this.rules = [...baseValidationRules, ...additionalRules];
    this.strictMode = strictMode;
  }

  /**
   * Validate a complete agent configuration
   */
  validate(config: AgentConfigSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Apply validation rules
    for (const rule of this.rules) {
      const result = this.applyRule(rule, config);
      if (result.error) {
        errors.push(result.error);
      }
      if (result.warning) {
        warnings.push(result.warning);
      }
    }

    // Additional semantic validations
    this.validateModelConfiguration(config, errors, warnings);
    this.validateCostBudgets(config, errors, warnings);
    this.validateScheduling(config, errors, warnings);
    this.validateEnvironmentOverrides(config, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate specific field value
   */
  validateField(field: string, value: any, config: AgentConfigSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const relevantRules = this.rules.filter(rule => rule.field === field);
    
    for (const rule of relevantRules) {
      const result = this.applyRule(rule, config, value);
      if (result.error) {
        errors.push(result.error);
      }
      if (result.warning) {
        warnings.push(result.warning);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Apply a single validation rule
   */
  private applyRule(
    rule: ValidationRule, 
    config: AgentConfigSchema, 
    fieldValue?: any
  ): { error?: ValidationError; warning?: ValidationWarning } {
    const value = fieldValue ?? this.getFieldValue(config, rule.field);

    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          return {
            error: {
              field: rule.field,
              message: rule.message,
              value,
              constraint: rule.constraint,
            },
          };
        }
        break;

      case 'type':
        if (value !== undefined && typeof value !== rule.constraint) {
          return {
            error: {
              field: rule.field,
              message: rule.message,
              value,
              constraint: rule.constraint,
            },
          };
        }
        break;

      case 'range':
        if (value !== undefined && typeof value === 'number') {
          const { min, max } = rule.constraint;
          if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
            return {
              error: {
                field: rule.field,
                message: rule.message,
                value,
                constraint: rule.constraint,
              },
            };
          }
        }
        break;

      case 'pattern':
        if (value !== undefined && typeof value === 'string') {
          if (!rule.constraint.test(value)) {
            return {
              error: {
                field: rule.field,
                message: rule.message,
                value,
                constraint: rule.constraint,
              },
            };
          }
        }
        break;

      case 'custom':
        if (rule.validator && value !== undefined) {
          const result = rule.validator(value, config);
          if (result !== true) {
            return {
              error: {
                field: rule.field,
                message: typeof result === 'string' ? result : rule.message,
                value,
              },
            };
          }
        }
        break;
    }

    return {};
  }

  /**
   * Validate Claude model configuration
   */
  private validateModelConfiguration(
    config: AgentConfigSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const modelInfo = supportedModels[config.claude.model as keyof typeof supportedModels];
    
    if (!modelInfo) {
      errors.push({
        field: 'claude.model',
        message: `Unsupported model: ${config.claude.model}`,
        value: config.claude.model,
      });
      return;
    }

    // Check token limits
    if (config.claude.maxTokens > modelInfo.maxTokens) {
      errors.push({
        field: 'claude.maxTokens',
        message: `Max tokens (${config.claude.maxTokens}) exceeds model limit (${modelInfo.maxTokens})`,
        value: config.claude.maxTokens,
        constraint: { max: modelInfo.maxTokens },
      });
    }

    // Warning for high-cost models with high token limits
    if (modelInfo.cost === 'high' || modelInfo.cost === 'highest') {
      if (config.claude.maxTokens > 10000) {
        warnings.push({
          field: 'claude.maxTokens',
          message: `High token limit with expensive model may result in high costs`,
          value: config.claude.maxTokens,
          suggestion: 'Consider reducing maxTokens or using a less expensive model',
        });
      }
    }
  }

  /**
   * Validate cost budget configuration
   */
  private validateCostBudgets(
    config: AgentConfigSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const budget = config.claude.costBudget;
    if (!budget) return;

    // Validate budget relationships
    if (budget.perExecution && config.execution.maxCostPerExecution) {
      if (budget.perExecution < config.execution.maxCostPerExecution) {
        errors.push({
          field: 'claude.costBudget.perExecution',
          message: 'Cost budget per execution is less than max cost per execution',
          value: budget.perExecution,
        });
      }
    }

    if (budget.daily && budget.monthly) {
      if (budget.daily * 30 < budget.monthly) {
        warnings.push({
          field: 'claude.costBudget.monthly',
          message: 'Monthly budget seems low compared to daily budget',
          value: budget.monthly,
          suggestion: 'Consider adjusting monthly budget to be at least 30x daily budget',
        });
      }
    }
  }

  /**
   * Validate scheduling configuration
   */
  private validateScheduling(
    config: AgentConfigSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    const scheduling = config.scheduling;
    if (!scheduling || !scheduling.enabled) return;

    // Validate cron expression (basic validation)
    if (scheduling.cronExpression) {
      const cronParts = scheduling.cronExpression.split(' ');
      if (cronParts.length !== 5 && cronParts.length !== 6) {
        errors.push({
          field: 'scheduling.cronExpression',
          message: 'Invalid cron expression format',
          value: scheduling.cronExpression,
        });
      }
    }

    // Warning for frequent execution with high costs
    if (config.execution.maxCostPerExecution && config.execution.maxCostPerExecution > 0.05) {
      if (scheduling.cronExpression?.includes('*')) {
        warnings.push({
          field: 'scheduling.cronExpression',
          message: 'Frequent execution with high cost per execution may exceed budgets',
          value: scheduling.cronExpression,
          suggestion: 'Consider less frequent scheduling or lower cost limits',
        });
      }
    }
  }

  /**
   * Validate environment-specific overrides
   */
  private validateEnvironmentOverrides(
    config: AgentConfigSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): void {
    if (!config.environments) return;

    for (const [envName, envConfig] of Object.entries(config.environments)) {
      if (!envConfig) continue;

      // Recursively validate environment overrides
      const envValidation = this.validate({ ...config, ...envConfig });
      
      for (const error of envValidation.errors) {
        errors.push({
          ...error,
          field: `environments.${envName}.${error.field}`,
        });
      }

      for (const warning of envValidation.warnings) {
        warnings.push({
          ...warning,
          field: `environments.${envName}.${warning.field}`,
        });
      }
    }
  }

  /**
   * Get nested field value from configuration object
   */
  private getFieldValue(config: any, field: string): any {
    const parts = field.split('.');
    let value = config;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return value;
  }

  /**
   * Add custom validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove validation rule by field
   */
  removeRule(field: string): void {
    this.rules = this.rules.filter(rule => rule.field !== field);
  }

  /**
   * Get all validation rules
   */
  getRules(): ValidationRule[] {
    return [...this.rules];
  }
}

/**
 * Quick validation function for external use
 */
export function validateConfig(
  config: AgentConfigSchema, 
  strictMode: boolean = false
): ValidationResult {
  const validator = new ConfigValidator([], strictMode);
  return validator.validate(config);
}

/**
 * Validate field value quickly
 */
export function validateField(
  field: string, 
  value: any, 
  config: AgentConfigSchema
): ValidationResult {
  const validator = new ConfigValidator();
  return validator.validateField(field, value, config);
}

/**
 * Check if a Claude model is supported
 */
export function isSupportedModel(model: string): boolean {
  return model in supportedModels;
}

/**
 * Get supported models list
 */
export function getSupportedModels(): Array<{ model: string; info: any }> {
  return Object.entries(supportedModels).map(([model, info]) => ({ model, info }));
}