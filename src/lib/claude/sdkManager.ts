import { 
  Options,
  Query,
  PermissionMode,
  CanUseTool,
  PermissionResult,
  ToolInput,
  PermissionUpdate,
  HookCallbackMatcher,
  HookJSONOutput,
  PreToolUseHookInput,
  PostToolUseHookInput,
  SessionStartHookInput,
  SessionEndHookInput,
  NotificationHookInput
} from '../types/claude'; // Placeholder until SDK is available
import { 
  AgentConfig,
  BudgetConfig,
  AgentExecutionRequest,
  AgentExecutionResult,
  SequentialResult,
  ConcurrentResult,
  StreamingController,
  NotificationEvent,
  AgentType
} from '../types/claude';
import { SDKConfigFactory } from './configFactory';
import { CostMonitoringService, BudgetManager } from './costTracker';
import { ErrorHandler, RetryableExecutor, CircuitBreaker } from './errorHandler';
import { AgentExecutionWrapper } from './executionWrapper';

/**
 * Central SDK manager that orchestrates all Claude Code SDK operations
 */
export class ClaudeSDKManager {
  private costTracker: CostMonitoringService;
  private budgetManager: BudgetManager;
  private retryExecutor: RetryableExecutor;
  private circuitBreaker: CircuitBreaker;
  private executionWrapper: AgentExecutionWrapper;
  private config: AgentConfig;

  // Event tracking
  private metrics: Map<string, any> = new Map();
  private notifications: Array<NotificationEvent> = [];

  constructor(config?: Partial<AgentConfig>) {
    this.config = this.createDefaultConfig(config);
    
    // Initialize components
    this.costTracker = new CostMonitoringService();
    this.budgetManager = new BudgetManager(
      {
        monthlyLimit: this.config.costThresholds.monthlyLimit,
        warningThreshold: this.config.costThresholds.warning,
        criticalThreshold: this.config.costThresholds.critical
      },
      this.costTracker
    );
    this.retryExecutor = new RetryableExecutor(this.config.retryPolicy);
    this.circuitBreaker = new CircuitBreaker(
      ErrorHandler.createDefaultCircuitBreakerConfig()
    );
    this.executionWrapper = new AgentExecutionWrapper(
      this.costTracker,
      this.budgetManager,
      this.retryExecutor,
      this.circuitBreaker
    );

    this.setupEventHandling();
  }

  /**
   * Execute a single agent
   */
  async executeAgent(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    return this.executionWrapper.executeAgent(request);
  }

  /**
   * Execute multiple agents sequentially
   */
  async executeSequential(
    agents: Array<{ type: string; prompt: string }>,
    executionId?: string
  ): Promise<SequentialResult> {
    return this.executionWrapper.executeSequential(agents, executionId);
  }

  /**
   * Execute multiple agents concurrently
   */
  async executeConcurrent(
    agents: Array<{ type: string; prompt: string }>,
    maxConcurrency: number = 3
  ): Promise<ConcurrentResult> {
    return this.executionWrapper.executeConcurrent(agents, maxConcurrency);
  }

  /**
   * Create a streaming controller for interactive sessions
   */
  createStreamingController(agentType: AgentType): StreamingController {
    return this.executionWrapper.createStreamingController(agentType);
  }

  /**
   * Create a configured query for direct SDK usage
   */
  createQuery(prompt: string, agentType?: AgentType, overrides?: Partial<Options>): Query {
    const config = agentType 
      ? SDKConfigFactory.createForAgent(agentType, overrides)
      : { ...this.config.baseOptions, ...overrides };

    // Add comprehensive hooks
    const configWithHooks: Partial<Options> = {
      ...config,
      // TODO: hooks when SDK available
    };

    // TODO: Replace with actual query when SDK is available
    return {} as any; // Placeholder implementation
  }

  /**
   * Get cost monitoring service
   */
  getCostTracker(): CostMonitoringService {
    return this.costTracker;
  }

  /**
   * Get budget manager
   */
  getBudgetManager(): BudgetManager {
    return this.budgetManager;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getMetrics();
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    return {
      notifications: this.notifications,
      metrics: Object.fromEntries(this.metrics),
      circuitBreaker: this.circuitBreaker.getMetrics(),
      costSnapshot: this.costTracker.getCostSnapshot(),
      budgetStatus: this.budgetManager.getBudgetStatus()
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Update budget manager if cost thresholds changed
    if (updates.costThresholds) {
      this.budgetManager.updateBudgetConfig({
        monthlyLimit: updates.costThresholds.monthlyLimit,
        warningThreshold: updates.costThresholds.warning,
        criticalThreshold: updates.costThresholds.critical
      });
    }
  }

  /**
   * Subscribe to execution events
   */
  onExecutionEvent(
    event: 'started' | 'progress' | 'completed' | 'failed' | 'log',
    callback: (data: any) => void
  ): () => void {
    return this.executionWrapper.onExecutionEvent(event, callback);
  }

  /**
   * Subscribe to cost updates
   */
  onCostUpdate(callback: (costs: any) => void): () => void {
    return this.costTracker.onCostUpdate(callback);
  }

  /**
   * Subscribe to budget alerts
   */
  onBudgetAlert(callback: (alert: any) => void): () => void {
    return this.costTracker.onBudgetAlert(callback);
  }

  /**
   * Health check for the SDK manager
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, string>;
    timestamp: string;
  }> {
    const components: Record<string, string> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check circuit breaker
    const cbStatus = this.circuitBreaker.getState();
    components.circuitBreaker = cbStatus;
    if (cbStatus === 'OPEN') {
      overallStatus = 'unhealthy';
    } else if (cbStatus === 'HALF_OPEN') {
      overallStatus = 'degraded';
    }

    // Check budget status
    const budgetStatus = this.budgetManager.getBudgetStatus();
    components.budget = budgetStatus.status;
    if (budgetStatus.status === 'critical' && overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }

    // Check cost tracker
    try {
      const costSnapshot = this.costTracker.getCostSnapshot();
      components.costTracker = 'healthy';
    } catch (error) {
      components.costTracker = 'unhealthy';
      overallStatus = 'unhealthy';
    }

    return {
      status: overallStatus,
      components,
      timestamp: new Date().toISOString()
    };
  }

  // Private methods

  private createDefaultConfig(overrides?: Partial<AgentConfig>): AgentConfig {
    const defaultConfig: AgentConfig = {
      baseOptions: {
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'acceptEdits',
        cwd: process.cwd(),
        env: process.env,
        maxTurns: 10,
        maxThinkingTokens: 10000
      },
      costThresholds: {
        warning: 50, // 50% of monthly limit
        critical: 90, // 90% of monthly limit
        monthlyLimit: 50 // $50 monthly limit
      },
      retryPolicy: {
        maxAttempts: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
        maxDelay: 10000,
        retryableErrors: [
          'rate limit',
          'timeout',
          'network',
          'temporary',
          'busy',
          'unavailable'
        ]
      }
    };

    return { ...defaultConfig, ...overrides };
  }

  private setupEventHandling(): void {
    // Handle budget alerts by subscribing to cost tracker alerts
    this.costTracker.onBudgetAlert((alert) => {
      console.warn(`Budget alert: ${alert.level} - ${alert.percentage.toFixed(1)}% of limit used`);
    });

    // Handle execution events
    this.onExecutionEvent('failed', (event) => {
      console.error(`Execution ${event.executionId} failed:`, event.data);
    });
  }

  private createPermissionHandler(): CanUseTool {
    return async (
      toolName: string,
      input: ToolInput,
      options: { signal: AbortSignal; suggestions?: PermissionUpdate[] }
    ): Promise<PermissionResult> => {
      // Security checks for dangerous operations
      if (toolName === 'Bash' && typeof input === 'object' && 'command' in input) {
        const command = input.command as string;

        // Block extremely dangerous operations
        const dangerousPatterns = [
          /rm\s+-rf\s+\/[^\/\s]*/,  // rm -rf /system-path
          /dd\s+if=.*of=\/dev\/[hs]d/, // disk operations
          /format\s+/,
          /mkfs\./,
          /fdisk\s+/
        ];

        if (dangerousPatterns.some(pattern => pattern.test(command))) {
          return {
            allowed: false,
            reason: 'Extremely dangerous command blocked for system safety'
          };
        }

        // Require confirmation for potentially destructive operations
        const destructivePatterns = [
          /rm\s+-rf/,
          /sudo\s+/,
          /systemctl\s+(stop|disable|mask)/,
          /iptables\s+/,
          /ufw\s+/
        ];

        if (destructivePatterns.some(pattern => pattern.test(command))) {
          // In a real implementation, this would prompt the user
          // For now, we'll allow but log the operation
          console.warn(`Potentially destructive command allowed: ${command}`);
        }
      }

      // Restrict file operations to safe directories
      if ((toolName === 'Write' || toolName === 'Edit') && 
          typeof input === 'object' && 'file_path' in input) {
        const filePath = input.file_path as string;
        const safePaths = [
          '/tmp/',
          '/var/tmp/',
          '/opt/homelab/',
          '/home/',
          process.cwd()
        ];

        const isAllowed = safePaths.some(path => 
          filePath.startsWith(path) || path.startsWith(process.cwd())
        );

        if (!isAllowed) {
          return {
            allowed: false,
            reason: `File operations restricted to safe directories: ${safePaths.join(', ')}`
          };
        }
      }

      return {
        allowed: true
      };
    };
  }

  // Hook implementations

  private async preToolUseHook(
    input: PreToolUseHookInput,
    toolUseId: string | undefined,
    options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> {
    console.log(`Starting tool: ${input.tool}`);
    
    // Record start time for performance tracking
    this.metrics.set(`tool_start_${toolUseId}`, Date.now());
    
    // Check system resources (simplified)
    const isOverloaded = await this.checkSystemLoad();
    if (isOverloaded && input.tool === 'Bash') {
      return {
        success: false,
        data: { reason: 'System overloaded, delaying execution' }
      };
    }
    
    return { success: true };
  }

  private async postToolUseHook(
    input: PostToolUseHookInput,
    toolUseId: string | undefined,
    options: { signal: AbortSignal }
  ): Promise<HookJSONOutput> {
    // Calculate execution time
    const startTime = this.metrics.get(`tool_start_${toolUseId}`);
    if (startTime) {
      const duration = Date.now() - startTime;
      console.log(`Tool ${input.tool} completed in ${duration}ms`);
      
      // Store performance metrics
      this.recordToolMetrics(input.tool, duration);
    }
    
    return { success: true };
  }

  private async sessionStartHook(
    input: SessionStartHookInput
  ): Promise<HookJSONOutput> {
    console.log(`Session started: ${input.sessionId}`);
    
    return {
      success: true
    };
  }

  private async sessionEndHook(
    input: SessionEndHookInput
  ): Promise<HookJSONOutput> {
    console.log(`Session ended: ${input.sessionId}`);
    
    // Generate session summary (if needed)
    await this.generateSessionSummary(input.sessionId);
    
    return { success: true };
  }

  private async notificationHook(
    input: NotificationHookInput
  ): Promise<HookJSONOutput> {
    const notification: NotificationEvent = {
      timestamp: new Date().toISOString(),
      title: input.type,
      message: input.message,
      sessionId: 'unknown'
    };

    this.notifications.push(notification);
    
    // Keep only last 100 notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(-100);
    }
    
    console.log(`Notification: ${input.type} - ${input.message}`);
    
    return { success: true };
  }

  private async checkSystemLoad(): Promise<boolean> {
    // Simplified system load check
    // In production, would use actual system metrics
    try {
      const loadavg = require('os').loadavg();
      const cpuCount = require('os').cpus().length;
      const load5min = loadavg[1];
      
      return load5min > cpuCount * 0.8; // 80% threshold
    } catch (error) {
      return false; // If we can't check, assume it's fine
    }
  }

  private recordToolMetrics(toolName: string, duration: number): void {
    const key = `tool_metrics_${toolName}`;
    const existing = this.metrics.get(key) || { count: 0, totalDuration: 0 };
    
    this.metrics.set(key, {
      count: existing.count + 1,
      totalDuration: existing.totalDuration + duration,
      averageDuration: (existing.totalDuration + duration) / (existing.count + 1)
    });
  }

  private async generateSessionSummary(sessionId: string): Promise<void> {
    // Implementation for session summary generation
    // This could involve analyzing the session's execution results
    console.log(`Generating summary for session: ${sessionId}`);
  }
}

/**
 * Factory for creating pre-configured SDK managers
 */
export class SDKManagerFactory {
  /**
   * Create SDK manager for development with safe defaults
   */
  static createDevelopmentManager(): ClaudeSDKManager {
    return new ClaudeSDKManager({
      baseOptions: SDKConfigFactory.createDevelopmentConfig() as Options,
      costThresholds: {
        warning: 30,
        critical: 50,
        monthlyLimit: 10 // Lower limit for development
      },
      retryPolicy: {
        maxAttempts: 2,
        backoffMultiplier: 1.5,
        initialDelay: 500,
        maxDelay: 5000,
        retryableErrors: ['timeout', 'network']
      }
    });
  }

  /**
   * Create SDK manager for production
   */
  static createProductionManager(config?: Partial<AgentConfig>): ClaudeSDKManager {
    const productionConfig: Partial<AgentConfig> = {
      baseOptions: {
        model: 'claude-3-5-sonnet-20241022',
        permissionMode: 'default', // More restrictive
        cwd: process.cwd(),
        env: process.env,
        maxTurns: 15,
        maxThinkingTokens: 15000
      },
      costThresholds: {
        warning: 70,
        critical: 90,
        monthlyLimit: 100
      },
      retryPolicy: {
        ...ErrorHandler.createDefaultRetryConfig(),
        maxDelay: 10000
      },
      ...config
    };

    return new ClaudeSDKManager(productionConfig);
  }

  /**
   * Create SDK manager with custom budget limits
   */
  static createWithBudget(monthlyLimit: number): ClaudeSDKManager {
    return new ClaudeSDKManager({
      costThresholds: {
        warning: 50,
        critical: 85,
        monthlyLimit
      }
    });
  }
}