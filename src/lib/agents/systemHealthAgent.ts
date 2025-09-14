import { query } from '@anthropic-ai/claude-code';
import { createId } from '@paralleldrive/cuid2';

export interface AgentResult {
  executionId: string;
  agentType: string;
  status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  result: string;
  cost: number;
  duration: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
  };
  logs: string[];
  timestamp: string;
  error?: string;
  summary?: string;
}

export interface AgentExecutionOptions {
  timeout_ms?: number;
  ai_analysis_depth?: 'basic' | 'detailed' | 'comprehensive';
  include_security_scan?: boolean;
  detailed_service_analysis?: boolean;
  include_docker?: boolean;
  onLog?: (message: string, level?: string) => void;
}

/**
 * System Health Reporter Agent
 * 
 * Uses Claude Code SDK to give Claude direct access to system investigation tools.
 * Claude investigates the system directly using bash commands and provides intelligent analysis.
 */
export class SystemHealthAgent {
  constructor() {}

  /**
   * Execute system health analysis using Claude Code SDK
   */
  async execute(options: AgentExecutionOptions = {}): Promise<AgentResult> {
    const executionId = createId();
    const startTime = Date.now();
    const logs: string[] = [];
    
    const log = (message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info') => {
      const logMessage = `[${new Date().toISOString()}] ${message}`;
      logs.push(logMessage);
      
      if (options.onLog) {
        options.onLog(logMessage, level);
      }
    };

    try {
      log('🚀 Starting comprehensive system health analysis...');
      log(`📋 Execution ID: ${executionId}`, 'debug');

      const prompt = this.buildInvestigationPrompt(options);
      
      log('🔍 Launching Claude to investigate system directly...');
      
      let result = '';
      let totalCost = 0;
      let totalUsage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0
      };

      const claudeQuery = query({
        prompt,
        options: {
          maxTurns: 50, // Allow Claude to investigate thoroughly
          permissionMode: 'acceptEdits', // Auto-accept bash commands and file edits
          allowedTools: ['Bash', 'Read', 'Glob', 'Grep'], // Explicitly allow investigation tools
          customSystemPrompt: this.getSystemPrompt()
        }
      });

      for await (const message of claudeQuery) {
        if (message.type === 'assistant') {
          const content = message.message.content;
          
          // Show tool calls in real time
          if (Array.isArray(content)) {
            content.forEach(block => {
              if (block.type === 'tool_use') {
                log(`🔧 Running: ${block.name} - ${JSON.stringify(block.input)}`, 'debug');
              } else if (block.type === 'text' && block.text.trim()) {
                // Show Claude's analysis as he works
                const preview = block.text.substring(0, 100) + (block.text.length > 100 ? '...' : '');
                log(`💭 Claude: ${preview}`);
              }
            });
            
            result = content.find(block => block.type === 'text')?.text || result;
          } else if (typeof content === 'string') {
            result = content;
            log(`💭 Claude: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
          }
        } else if (message.type === 'user') {
          // Show tool results
          const content = message.message.content;
          if (Array.isArray(content)) {
            content.forEach(block => {
              if (block.type === 'tool_result') {
                const contentStr = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
                const preview = contentStr?.substring(0, 200) + (contentStr && contentStr.length > 200 ? '...' : '');
                log(`📊 Tool result: ${preview || 'No output'}`);
              }
            });
          }
        } else if (message.type === 'result') {
          if (message.subtype === 'success') {
            totalCost = message.total_cost_usd;
            totalUsage = {
              input_tokens: message.usage.input_tokens || 0,
              output_tokens: message.usage.output_tokens || 0,
              cache_creation_tokens: message.usage.cache_creation_input_tokens || 0,
              cache_read_tokens: message.usage.cache_read_input_tokens || 0
            };
            log('✅ Claude investigation completed successfully');
          } else {
            log('❌ Claude investigation failed', 'error');
            throw new Error(`Investigation failed: ${message.subtype}`);
          }
        }
      }

      const duration = Date.now() - startTime;
      log(`⏱️ Analysis completed in ${(duration / 1000).toFixed(1)}s`);
      log(`💰 Total cost: $${totalCost.toFixed(4)}`);

      return {
        executionId,
        agentType: 'system-health',
        status: 'completed',
        result,
        cost: totalCost,
        duration,
        usage: totalUsage,
        logs,
        timestamp: new Date().toISOString(),
        summary: `System health investigation completed - Cost: $${totalCost.toFixed(4)}`
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      log(`❌ ERROR: ${errorMessage}`, 'error');
      
      return {
        executionId,
        agentType: 'system-health',
        status: 'failed',
        result: JSON.stringify({ error: errorMessage, logs }, null, 2),
        cost: 0,
        duration,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_tokens: 0,
          cache_read_tokens: 0
        },
        logs,
        timestamp: new Date().toISOString(),
        error: errorMessage
      };
    }
  }

  private buildInvestigationPrompt(options: AgentExecutionOptions): string {
    const depth = options.ai_analysis_depth || 'detailed';
    
    return `
Please conduct a focused system health investigation and provide a comprehensive analysis report.

INVESTIGATION STRATEGY:
Start by understanding what problems the system is experiencing, then investigate the metrics:

1. **Check System Logs First**: Start with recent errors and warnings:
   - Try 'journalctl -p err -n 20 --no-pager' (systemd systems)
   - If journalctl fails, use 'tail -n 50 /var/log/syslog | grep -E "(error|Error|ERROR|fail|Fail|FAIL)"'
   - Also check 'dmesg | tail -n 20' for kernel messages
   - On some systems: 'tail -n 30 /var/log/messages' or '/var/log/kern.log'

2. **Quick System Overview**: Get current resource status:
   - 'free -h && df -h && uptime'
   - 'systemctl --failed'

3. **Targeted Investigation**: Based on what you found in logs:
   - If memory/OOM issues → check memory usage and top processes
   - If disk issues → investigate disk usage patterns
   - If service failures → check specific service status and logs
   - If network/security issues → check ports and updates

4. **Focus on Actionable Problems**: Only dive deep into areas that logs indicate are problematic

ANALYSIS CONFIGURATION:
- Analysis Depth: ${depth}
- Include Security Analysis: ${options.include_security_scan ? 'Yes' : 'No'}
- Include Docker Analysis: ${options.include_docker ? 'Yes' : 'No'}
- Detailed Service Analysis: ${options.detailed_service_analysis ? 'Yes' : 'No'}

After your investigation, provide:
1. A comprehensive summary of system health based on your findings
2. Specific actionable recommendations prioritized by impact and urgency
3. Analysis of trends and patterns you discovered
4. Alert identification with severity levels
5. Health score justification (0-100) based on your investigation
6. Priority actions that should be taken immediately

Format your final analysis as a structured report with clear sections for:
- Executive Summary
- Key Findings
- Critical Issues (if any)
- Recommendations (with specific commands)
- Health Score and Justification
- Next Steps

Be thorough but practical. Focus on actionable insights and clearly explain the reasoning behind your recommendations.
`;
  }

  private getSystemPrompt(): string {
    return `
You are an expert system administrator and infrastructure monitoring specialist. You have direct access to system investigation tools and should use them to conduct thorough system health analysis.

INVESTIGATION PRINCIPLES:
- Always start with broad system overview commands before diving deep
- Use your judgment to investigate concerning areas more thoroughly
- Prioritize critical issues that could cause system failures
- Provide specific, actionable recommendations with exact commands
- Consider the interconnections between system components
- Balance thoroughness with practical insights

TOOL USAGE:
- Use bash commands freely to investigate system state
- Adapt to different system types (systemd vs SysV init, different distros)
- If journalctl fails, fall back to /var/log/syslog, /var/log/messages, etc.
- If systemctl fails, try 'service --status-all' or '/etc/init.d/* status'  
- Always try alternative commands if the first approach doesn't work

ANALYSIS APPROACH:
- Look for patterns across CPU, memory, disk, network, and services
- Identify bottlenecks and resource constraints
- Detect security vulnerabilities and misconfigurations
- Assess service health and dependencies
- Provide context for why issues matter and their potential impact

OUTPUT REQUIREMENTS:
- Structure findings clearly with sections and bullet points
- Include specific commands for remediation when possible  
- Prioritize recommendations by urgency and impact
- Provide health score with clear justification
- Focus on actionable insights over raw data

SAFETY:
- Never run destructive commands
- Always verify before suggesting system changes
- Provide clear warnings about potential risks
- Respect system security boundaries
`;
  }

  /**
   * Get agent capability information
   */
  getCapabilities(): Record<string, any> {
    return {
      name: 'System Health Reporter (Claude SDK)',
      version: '2.0.0',
      description: 'Direct system health investigation using Claude Code SDK',
      capabilities: [
        'Direct system investigation with bash commands',
        'Real-time system analysis and troubleshooting',
        'Security vulnerability detection',
        'Performance bottleneck identification',
        'Service health assessment',
        'Docker container analysis',
        'Intelligent recommendations with specific commands'
      ],
      provides_exact_costs: true,
      typical_execution_time_ms: 120000,
      outputs: [
        'Comprehensive system analysis report',
        'Actionable recommendations with commands',
        'Health score with justification',
        'Priority action items',
        'Security findings'
      ]
    };
  }
}