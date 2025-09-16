import { BaseAgent } from '../core/BaseAgent';
import type { 
  BaseAgentOptions, 
  AgentConfig,
  TokenUsage,
  PermissionMode
} from '../core/types';

/**
 * TEMPLATE FOR CREATING NEW AGENTS
 * 
 * Copy this file and customize it for your specific agent type.
 * This template shows how to extend BaseAgent and implement the required methods.
 * 
 * Steps to create a new agent:
 * 1. Copy this file and rename it (e.g., MyCustomAgent.ts)
 * 2. Rename the class and interfaces
 * 3. Implement the abstract methods with your specific logic
 * 4. Add your agent to the AgentFactory in index.ts
 * 5. Export your agent from index.ts
 */

// Define agent-specific options by extending BaseAgentOptions
export interface ExampleAgentOptions extends BaseAgentOptions {
  // Add your agent-specific options here
  investigation_scope?: 'basic' | 'detailed' | 'comprehensive';
  include_network_analysis?: boolean;
  custom_parameter?: string;
  max_items_to_analyze?: number;
}

// Legacy interface for backward compatibility (if needed)
export interface ExampleAgentResult {
  executionId: string;
  agentType: string;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  result: string;
  cost: number;
  duration: number;
  usage: TokenUsage;
  logs: string[];
  timestamp: string;
  error?: string;
  summary?: string;
  // Add any agent-specific result fields
  customMetrics?: Record<string, any>;
}

/**
 * Example Agent Template
 * 
 * This agent demonstrates how to extend BaseAgent with custom functionality.
 * Replace this with your actual agent implementation.
 */
export class ExampleAgent extends BaseAgent<ExampleAgentOptions> {
  
  /**
   * REQUIRED: Return the unique identifier for this agent type
   */
  getAgentType(): string {
    return 'example'; // Change this to your agent type
  }

  /**
   * REQUIRED: Return the list of tools this agent is allowed to use
   */
  getAllowedTools(): string[] {
    return [
      'Bash',    // For system commands
      'Read',    // For reading files
      'Glob',    // For file pattern matching
      'Grep'     // For searching content
      // Add or remove tools based on your agent's needs
    ];
  }

  /**
   * REQUIRED: Build the investigation prompt based on options
   * This is where you define what Claude should do
   */
  buildPrompt(options: ExampleAgentOptions): string {
    const scope = options.investigation_scope || 'detailed';
    const includeNetwork = options.include_network_analysis || false;
    const maxItems = options.max_items_to_analyze || 10;
    
    return `
You are an expert [YOUR_DOMAIN] specialist with direct access to investigation tools.

TASK:
Conduct a ${scope} analysis of [WHAT_TO_ANALYZE] and provide actionable insights.

INVESTIGATION PARAMETERS:
- Scope: ${scope}
- Include Network Analysis: ${includeNetwork ? 'Yes' : 'No'}
- Maximum Items to Analyze: ${maxItems}
- Custom Parameter: ${options.custom_parameter || 'Not specified'}

INVESTIGATION STRATEGY:
1. **Initial Assessment**: Start with broad overview commands
   - [List specific commands your agent should run first]
   - Example: 'ps aux | head -20' for process overview
   
2. **Detailed Analysis**: Based on initial findings
   - [Describe what to look for and how to investigate]
   - Use conditional logic based on what you find
   
3. **Targeted Investigation**: Focus on specific areas
   - [Define how to drill down into problems]
   - Prioritize based on severity and impact

4. **Data Collection**: Gather relevant metrics
   - [Specify what data to collect and how]
   - Ensure data is actionable and relevant

ANALYSIS REQUIREMENTS:
After your investigation, provide:
1. Executive Summary of findings
2. Key metrics and their interpretation
3. Issues identified with severity levels
4. Specific actionable recommendations
5. Risk assessment and mitigation strategies
6. Next steps and monitoring recommendations

FORMAT YOUR RESPONSE:
Structure your analysis with clear sections:
- **Executive Summary**: Brief overview of system state
- **Key Findings**: Important discoveries during investigation
- **Issues Identified**: Problems found with severity (Critical/High/Medium/Low)
- **Recommendations**: Specific actions with commands where applicable
- **Risk Assessment**: Potential impacts and likelihood
- **Next Steps**: Immediate actions and long-term monitoring

INVESTIGATION PRINCIPLES:
- Start broad, then narrow focus based on findings
- Provide specific, actionable recommendations
- Include exact commands when suggesting fixes
- Explain the reasoning behind your analysis
- Consider interconnections between different components
- Balance thoroughness with practical insights

Be thorough but practical. Focus on actionable insights that will help improve [WHAT_YOU'RE_ANALYZING].
`;
  }

  /**
   * REQUIRED: Define Claude's behavior and expertise
   */
  getSystemPrompt(): string {
    return `
You are an expert [YOUR_DOMAIN] specialist with deep knowledge of [SPECIFIC_EXPERTISE_AREAS].

EXPERTISE AREAS:
- [List your agent's areas of expertise]
- [Example: Network security analysis]
- [Example: Performance optimization]
- [Example: Configuration management]

INVESTIGATION APPROACH:
- Use systematic methodology to analyze [WHAT_YOU_ANALYZE]
- Leverage available tools to gather comprehensive data
- Apply best practices from [YOUR_DOMAIN] field
- Provide evidence-based recommendations
- Consider both immediate and long-term impacts

TOOL USAGE GUIDELINES:
- Use bash commands to gather system information
- Read configuration files when relevant
- Search for patterns that indicate issues
- Adapt commands based on system type and environment
- Always verify findings with multiple data sources

OUTPUT STANDARDS:
- Provide clear, structured analysis
- Include specific evidence for all findings
- Offer actionable recommendations with exact steps
- Explain technical concepts in accessible terms
- Prioritize recommendations by impact and urgency

SAFETY AND ETHICS:
- Never run destructive or harmful commands
- Respect system security and access boundaries
- Provide clear warnings about potential risks
- Suggest testing changes in safe environments first
- Maintain professional standards in all analysis
`;
  }

  /**
   * REQUIRED: Return agent configuration and metadata
   */
  getConfig(): AgentConfig {
    return {
      name: 'Example Agent Template',
      version: '1.0.0',
      description: 'Template for creating new Claude Code SDK agents with full framework support',
      defaultOptions: {
        timeout_ms: 300000,      // 5 minutes default
        maxTurns: 30,            // Reasonable default for most tasks
        permissionMode: 'acceptEdits',
        includePartialMessages: true
      },
      capabilities: [
        // List your agent's capabilities
        'System investigation and analysis',
        'Real-time monitoring and troubleshooting',
        'Configuration analysis and optimization',
        'Performance assessment and tuning',
        'Security evaluation and hardening',
        'Automated report generation',
        'Session management and resumption',
        'Advanced error handling and recovery',
        'Real-time streaming updates'
      ],
      requiredTools: ['Bash'],  // Minimum tools needed
      optionalTools: ['Read', 'Glob', 'Grep'], // Tools that enhance functionality
      typicalExecutionTime: 90000, // 1.5 minutes typical
      costEstimate: {
        min: 0.05,    // Minimum expected cost
        max: 1.50,    // Maximum expected cost
        typical: 0.35 // Typical cost for normal operation
      }
    };
  }

  /**
   * OPTIONAL: Override permission mode if your agent needs different permissions
   */
  getPermissionMode(): PermissionMode {
    // Most agents should use 'acceptEdits' for tool access
    // Use 'plan' if your agent needs to plan complex operations
    // Use 'bypassPermissions' only if absolutely necessary (not recommended)
    return 'acceptEdits';
  }

  /**
   * OPTIONAL: Handle agent-specific errors
   * Override this method to provide custom error handling for your domain
   */
  protected async handleAgentSpecificError(error: any, context: any): Promise<any> {
    // Example: Handle domain-specific error conditions
    if (error.message.includes('connection refused')) {
      return {
        action: 'continue',
        message: 'Network service unavailable, continuing with alternative methods'
      };
    }

    if (error.message.includes('permission denied')) {
      return {
        action: 'reduce_scope',
        message: 'Access restricted, continuing with available data'
      };
    }

    // Fall back to base class error handling
    return super.handleAgentSpecificError(error, context);
  }

  /**
   * OPTIONAL: Custom session state management
   * Override if your agent needs to save/restore custom state
   */
  protected async saveSessionState(state: any): Promise<void> {
    // Example: Save agent-specific state
    const customState = {
      ...state,
      lastAnalyzedItems: this.getLastAnalyzedItems(),
      currentInvestigationPhase: this.getCurrentPhase(),
      customMetrics: this.getCustomMetrics()
    };

    await super.saveSessionState(customState);
  }

  /**
   * OPTIONAL: Custom session restoration
   * Override if your agent needs to restore custom state
   */
  protected async restoreSessionState(sessionId: string): Promise<any> {
    const state = await super.restoreSessionState(sessionId);
    
    if (state) {
      // Restore agent-specific state
      this.setLastAnalyzedItems(state.lastAnalyzedItems || []);
      this.setCurrentPhase(state.currentInvestigationPhase || 'initial');
      this.setCustomMetrics(state.customMetrics || {});
    }

    return state;
  }

  /**
   * OPTIONAL: Provide backward compatibility methods if needed
   */
  async execute(options: ExampleAgentOptions = {}): Promise<ExampleAgentResult> {
    const result = await super.execute(options);
    
    // Convert to agent-specific result format
    return {
      executionId: result.executionId,
      agentType: result.agentType,
      status: result.status,
      result: result.result,
      cost: result.cost,
      duration: result.duration,
      usage: result.usage,
      logs: result.logs,
      timestamp: result.timestamp,
      error: result.error,
      summary: result.summary,
      customMetrics: this.getCustomMetrics() // Agent-specific data
    };
  }

  /**
   * OPTIONAL: Legacy compatibility method
   */
  getCapabilities(): Record<string, any> {
    const config = this.getConfig();
    return {
      name: config.name,
      version: config.version,
      description: config.description,
      capabilities: config.capabilities,
      provides_exact_costs: true,
      typical_execution_time_ms: config.typicalExecutionTime,
      outputs: [
        'Comprehensive analysis report',
        'Actionable recommendations',
        'Risk assessment',
        'Performance metrics',
        'Configuration insights'
      ]
    };
  }

  // HELPER METHODS: Add your own helper methods here
  
  private getLastAnalyzedItems(): any[] {
    // Implementation for tracking analyzed items
    return [];
  }

  private setLastAnalyzedItems(items: any[]): void {
    // Implementation for setting analyzed items
  }

  private getCurrentPhase(): string {
    // Implementation for tracking investigation phase
    return 'initial';
  }

  private setCurrentPhase(phase: string): void {
    // Implementation for setting investigation phase
  }

  private getCustomMetrics(): Record<string, any> {
    // Implementation for custom metrics
    return {};
  }

  private setCustomMetrics(metrics: Record<string, any>): void {
    // Implementation for setting custom metrics
  }
}

// USAGE EXAMPLE:
/*
import { ExampleAgent } from './agents/templates/ExampleAgent';

// Create the agent
const agent = new ExampleAgent();

// Execute with custom options
const result = await agent.execute({
  investigation_scope: 'comprehensive',
  include_network_analysis: true,
  custom_parameter: 'special-config',
  max_items_to_analyze: 25,
  timeout_ms: 600000, // 10 minutes
  onLog: (message, level) => console.log(`[${level}] ${message}`),
  onProgress: (progress) => console.log(`Progress: ${progress.message}`)
});

console.log('Analysis Result:', result);
*/

// TODO: When creating your own agent:
// 1. Replace all [YOUR_DOMAIN] placeholders with your actual domain
// 2. Replace all [WHAT_TO_ANALYZE] with what your agent analyzes
// 3. Customize the prompt and system prompt for your specific use case
// 4. Add your agent type to the AgentFactory in index.ts
// 5. Update the capabilities and tool requirements
// 6. Implement any custom error handling or session management
// 7. Add comprehensive tests for your agent
// 8. Update documentation with your agent's capabilities