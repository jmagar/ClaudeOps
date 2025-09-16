import { BaseAgent } from './core/BaseAgent';
import type { 
  BaseAgentOptions, 
  AgentConfig,
  PermissionMode
} from './core/types';

// Extend base options with system health specific options
export interface SystemHealthOptions extends BaseAgentOptions {
  ai_analysis_depth?: 'basic' | 'detailed' | 'comprehensive';
  include_security_scan?: boolean;
  detailed_service_analysis?: boolean;
  include_docker?: boolean;
}

// Legacy interface compatibility
export interface AgentExecutionOptions extends SystemHealthOptions {}

/**
 * System Health Reporter Agent
 * 
 * Now powered by the BaseAgent framework with full SDK integration,
 * hooks, error handling, session management, and streaming capabilities.
 */
export class SystemHealthAgent extends BaseAgent<SystemHealthOptions> {
  
  /**
   * Get the agent type identifier
   */
  getAgentType(): string {
    return 'system-health';
  }

  /**
   * Get the allowed tools for system investigation
   */
  getAllowedTools(): string[] {
    return ['Bash', 'Read', 'Glob', 'Grep'];
  }

  /**
   * Build the investigation prompt based on options
   */
  buildPrompt(options: SystemHealthOptions): string {
    const depth = options.ai_analysis_depth || 'detailed';
    
    return `
Conduct a rapid system health triage and focused investigation.

PHASE 1: RAPID TRIAGE (1-2 commands max)
Execute this combined diagnostic:
\`\`\`bash
echo "=== SYSTEM TRIAGE ==="; (journalctl -p err -n 30 --no-pager 2>/dev/null || tail -50 /var/log/syslog 2>/dev/null | grep -iE "(error|fail|critical|alert|panic|kill|oom)") | head -20; echo -e "\\n=== RESOURCES ==="; free -h; df -h | head -10; uptime; echo -e "\\n=== FAILED SERVICES ==="; (systemctl --failed --no-pager 2>/dev/null || service --status-all 2>&1 | grep -E "\\[\\-\\]")
\`\`\`

PHASE 2: PATTERN ANALYSIS
Identify which issues are present:
- OOM/Memory: "oom-killer", "out of memory", "cannot allocate"
- Disk: "no space left", "disk full", "inode"
- Service: "failed to start", "dependency failed", "timeout"
- Security: "authentication failure", "unauthorized", "denied"
- Network: "connection refused", "unreachable", "timeout"

PHASE 3: TARGETED INVESTIGATION
Based on patterns found, investigate ONLY relevant areas:

IF memory issues → \`ps aux --sort=-%mem | head -15 && cat /proc/meminfo | grep -E "(MemTotal|MemAvailable|SwapTotal|SwapFree)"\`
IF disk issues → \`du -xh / 2>/dev/null | sort -rh | head -20 && find /var/log -type f -size +100M 2>/dev/null\`
IF service failures → \`journalctl -u [failed-service] -n 50 --no-pager\`
IF security concerns → \`last -20 && who && ss -tlnp 2>/dev/null | head -20\`
${options.include_docker ? 'IF docker requested → `docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Size}}" && docker system df`' : ''}

CONFIGURATION:
- Depth: ${depth === 'comprehensive' ? 'Deep dive into all found issues' : depth === 'basic' ? 'Quick assessment only' : 'Standard investigation'}
- Security: ${options.include_security_scan ? 'Check for vulnerabilities' : 'Skip unless critical'}
- Services: ${options.detailed_service_analysis ? 'Analyze all services' : 'Failed services only'}

OUTPUT REQUIREMENTS:
Provide a structured report with:
1. **Health Score** (0-100) with one-line justification
2. **Critical Issues** (if any) - bullet points with severity
3. **Key Metrics** - table format (CPU/Memory/Disk/Network)
4. **Recommendations** - numbered list with specific commands
5. **Next Steps** - immediate actions only

Focus on problems found, not exhaustive system enumeration.
`;
  }

  /**
   * Get the system prompt for Claude
   */
  getSystemPrompt(): string {
    return `
You are a senior SRE specializing in rapid system diagnostics and triage.

CORE PRINCIPLES:
- Start with combined diagnostic commands to minimize turns
- Parse outputs for patterns indicating specific problem types
- Only investigate areas showing actual issues
- Provide specific remediation commands, not general advice
- Adapt commands to system type (systemd/sysv, distro differences)

DIAGNOSTIC APPROACH:
- Pattern recognition over exhaustive checking
- Chain commands with && and || for efficiency
- Use grep/awk to extract relevant data
- Focus on actionable problems, ignore normal variations

SAFETY:
- Never run destructive commands
- Validate before suggesting changes
- Respect system security boundaries
`;
  }

  /**
   * Get agent configuration and capabilities
   */
  getConfig(): AgentConfig {
    return {
      name: 'System Health Reporter (Claude SDK v2)',
      version: '2.2.0',
      description: 'Optimized rapid system health triage using pattern-based diagnostics and efficient command chaining',
      defaultOptions: {
        timeout_ms: 300000,
        maxTurns: 50,
        permissionMode: 'acceptEdits',
        includePartialMessages: true
      },
      capabilities: [
        'Direct system investigation with bash commands',
        'Real-time system analysis and troubleshooting',
        'Security vulnerability detection',
        'Performance bottleneck identification',
        'Service health assessment',
        'Docker container analysis',
        'Intelligent recommendations with specific commands',
        'Session management and resumption',
        'Advanced error handling and recovery',
        'Real-time streaming updates',
        'Comprehensive audit logging'
      ],
      requiredTools: ['Bash'],
      optionalTools: ['Read', 'Glob', 'Grep'],
      typicalExecutionTime: 90000,
      costEstimate: {
        min: 0.08,
        max: 1.80,
        typical: 0.50
      }
    };
  }


  /**
   * Get agent capability information (legacy method)
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
        'Comprehensive system analysis report',
        'Actionable recommendations with commands',
        'Health score with justification',
        'Priority action items',
        'Security findings'
      ]
    };
  }

  /**
   * Override permission mode for system health investigations
   */
  getPermissionMode(): PermissionMode {
    return 'acceptEdits'; // System health needs bash access
  }

  /**
   * Custom error handling for system health specific scenarios
   */
  protected async handleAgentSpecificError(error: any, context: any): Promise<any> {
    // Handle system health specific errors
    if (error.message.includes('journalctl')) {
      return {
        action: 'continue',
        message: 'Falling back to traditional log files (no systemd)'
      };
    }

    if (error.message.includes('systemctl')) {
      return {
        action: 'continue',
        message: 'Falling back to SysV init service management'
      };
    }

    // Use default handling for other errors
    return super.handleAgentSpecificError(error, context);
  }
}