import type {
  CanUseToolCallback,
  ToolContext,
  LogCallback
} from './types';

/**
 * Manages fine-grained tool permissions and security policies
 */
export class PermissionManager {
  private policies: Map<string, ToolPolicy> = new Map();
  private globalRules: GlobalRule[] = [];
  private auditLog: AuditEntry[] = [];
  private log: LogCallback;

  constructor(log?: LogCallback) {
    this.log = log || (() => {});
    this.initializeDefaultPolicies();
  }

  /**
   * Create a permission callback function for SDK use
   */
  createPermissionCallback(): CanUseToolCallback {
    return async (toolName: string, input: any, context: ToolContext): Promise<boolean> => {
      const startTime = Date.now();
      
      try {
        // Check global rules first
        const globalResult = await this.checkGlobalRules(toolName, input, context);
        if (!globalResult.allowed) {
          this.auditDenial(toolName, input, context, globalResult.reason, 'global_rule');
          return false;
        }

        // Check tool-specific policy
        const policyResult = await this.checkToolPolicy(toolName, input, context);
        if (!policyResult.allowed) {
          this.auditDenial(toolName, input, context, policyResult.reason, 'tool_policy');
          return false;
        }

        // Log successful permission grant
        this.auditApproval(toolName, input, context, Date.now() - startTime);
        return true;

      } catch (error) {
        this.log(`❌ Permission check error for ${toolName}: ${error}`, 'error');
        this.auditDenial(toolName, input, context, `Permission check error: ${error}`, 'system_error');
        return false;
      }
    };
  }

  /**
   * Add a custom tool policy
   */
  addToolPolicy(toolName: string, policy: ToolPolicy): void {
    this.policies.set(toolName, policy);
    this.log(`🔒 Added policy for ${toolName}`, 'debug');
  }

  /**
   * Add a global rule that applies to all tools
   */
  addGlobalRule(rule: GlobalRule): void {
    this.globalRules.push(rule);
    this.log(`🌐 Added global rule: ${rule.description}`, 'debug');
  }

  /**
   * Remove a tool policy
   */
  removeToolPolicy(toolName: string): void {
    this.policies.delete(toolName);
    this.log(`🔓 Removed policy for ${toolName}`, 'debug');
  }

  /**
   * Check global rules
   */
  private async checkGlobalRules(
    toolName: string,
    input: any,
    context: ToolContext
  ): Promise<PermissionResult> {
    for (const rule of this.globalRules) {
      if (rule.condition && !rule.condition(toolName, input, context)) {
        continue; // Rule doesn't apply
      }

      const result = await rule.check(toolName, input, context);
      if (!result.allowed) {
        return result;
      }
    }

    return { allowed: true, reason: 'Global rules passed' };
  }

  /**
   * Check tool-specific policy
   */
  private async checkToolPolicy(
    toolName: string,
    input: any,
    context: ToolContext
  ): Promise<PermissionResult> {
    const policy = this.policies.get(toolName);
    if (!policy) {
      return { allowed: true, reason: 'No specific policy' };
    }

    return await policy.check(toolName, input, context);
  }

  /**
   * Initialize default security policies
   */
  private initializeDefaultPolicies(): void {
    // Bash command policy
    this.addToolPolicy('Bash', {
      description: 'Bash command security policy',
      check: async (toolName, input, context) => {
        const command = input.command || '';
        
        // Block obviously dangerous commands
        const dangerousPatterns = [
          /rm\s+-rf\s+\/(?!tmp\/|var\/tmp\/)/,  // rm -rf except in tmp
          /dd\s+if=.*of=\/dev/,                 // Direct device writes
          /mkfs\./,                             // Format filesystem
          /fdisk|parted/,                       // Disk partitioning
          /userdel|deluser/,                    // Delete users
          /passwd\s+root/,                      // Change root password
          /sudo\s+su\s*$/,                      // Privilege escalation
          /curl.*\|\s*sh/,                      // Download and execute
          /wget.*\|\s*sh/,                      // Download and execute
          /init\s+0|shutdown\s+-h|reboot/,     // System shutdown
          /\/etc\/passwd|\/etc\/shadow/,        // System files
          />\s*\/dev\/sd[a-z]/,                 // Direct disk writes
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(command)) {
            return {
              allowed: false,
              reason: `Command blocked by security policy: ${pattern.source}`
            };
          }
        }

        // Length check
        if (command.length > 2000) {
          return {
            allowed: false,
            reason: `Command too long (${command.length} chars, max 2000)`
          };
        }

        // Network operation restrictions
        if (this.containsNetworkOperations(command) && !this.isNetworkAllowed(context)) {
          return {
            allowed: false,
            reason: 'Network operations not allowed in current context'
          };
        }

        return { allowed: true, reason: 'Command passed security checks' };
      }
    });

    // File access policy
    this.addToolPolicy('Read', {
      description: 'File read access policy',
      check: async (toolName, input, context) => {
        const filePath = input.file_path || input.filePath || '';
        return this.checkFileAccess(filePath, 'read');
      }
    });

    this.addToolPolicy('Write', {
      description: 'File write access policy',
      check: async (toolName, input, context) => {
        const filePath = input.file_path || input.filePath || '';
        return this.checkFileAccess(filePath, 'write');
      }
    });

    this.addToolPolicy('Edit', {
      description: 'File edit access policy',
      check: async (toolName, input, context) => {
        const filePath = input.file_path || input.filePath || '';
        return this.checkFileAccess(filePath, 'write');
      }
    });

    // Add rate limiting global rule
    this.addGlobalRule({
      description: 'Rate limiting for expensive operations',
      condition: (toolName) => ['Bash', 'Grep', 'Glob'].includes(toolName),
      check: async (toolName, input, context) => {
        const key = `${context.agentType}:${toolName}`;
        const now = Date.now();
        
        // Simple rate limiting - 50 operations per minute
        if (!this.rateLimitTracker) {
          this.rateLimitTracker = new Map();
        }
        
        const tracker = this.rateLimitTracker.get(key) || [];
        const recentOps = tracker.filter(time => now - time < 60000); // Last minute
        
        if (recentOps.length >= 50) {
          return {
            allowed: false,
            reason: `Rate limit exceeded for ${toolName} (50/minute)`
          };
        }
        
        // Update tracker
        recentOps.push(now);
        this.rateLimitTracker.set(key, recentOps);
        
        return { allowed: true, reason: 'Rate limit check passed' };
      }
    });

    // Add execution context rule
    this.addGlobalRule({
      description: 'Execution context validation',
      check: async (toolName, input, context) => {
        // Block operations if cost is getting too high
        if (context.totalCost > 5.0) { // $5 limit
          return {
            allowed: false,
            reason: `Cost limit approaching ($${context.totalCost.toFixed(2)})`
          };
        }

        // Block if too many tools have been used (potential runaway)
        if (context.previousTools.length > 200) {
          return {
            allowed: false,
            reason: `Too many tool executions (${context.previousTools.length})`
          };
        }

        // Block if execution is taking too long
        if (context.timeElapsed > 600000) { // 10 minutes
          return {
            allowed: false,
            reason: `Execution time limit exceeded (${Math.round(context.timeElapsed/60000)} minutes)`
          };
        }

        return { allowed: true, reason: 'Context validation passed' };
      }
    });
  }

  /**
   * Check file access permissions
   */
  private checkFileAccess(filePath: string, operation: 'read' | 'write'): PermissionResult {
    // Block access to sensitive system files
    const sensitivePatterns = [
      /\/etc\/passwd$/,
      /\/etc\/shadow$/,
      /\/etc\/sudoers/,
      /\/root\/\./,                    // Hidden files in root
      /\/home\/[^\/]+\/\.[^\/]+/,      // Hidden files in user homes
      /\/proc\/\d+\//,                 // Process files
      /\/sys\//,                       // System files
      /\/dev\/(?!null|zero|random|urandom)/, // Device files except safe ones
      /\/boot\//,                      // Boot files
      /\/lib\/modules\//,              // Kernel modules
    ];

    for (const pattern of sensitivePatterns) {
      if (pattern.test(filePath)) {
        return {
          allowed: false,
          reason: `Access denied to sensitive file: ${filePath}`
        };
      }
    }

    // Write operations have additional restrictions
    if (operation === 'write') {
      const writeRestrictedPatterns = [
        /\/etc\//,                     // System config
        /\/usr\/bin\//,                // System binaries
        /\/usr\/sbin\//,               // System admin binaries
        /\/bin\//,                     // Essential binaries
        /\/sbin\//,                    // System binaries
        /\/lib\//,                     // System libraries
        /\/opt\/[^\/]+\/bin\//,        // Installed app binaries
      ];

      for (const pattern of writeRestrictedPatterns) {
        if (pattern.test(filePath)) {
          return {
            allowed: false,
            reason: `Write access denied to system path: ${filePath}`
          };
        }
      }
    }

    return { allowed: true, reason: `${operation} access granted` };
  }

  /**
   * Check if command contains network operations
   */
  private containsNetworkOperations(command: string): boolean {
    const networkPatterns = [
      /curl\s+/,
      /wget\s+/,
      /nc\s+|netcat\s+/,
      /ssh\s+/,
      /scp\s+/,
      /rsync\s+.*::/,
      /ftp\s+/,
      /telnet\s+/,
    ];

    return networkPatterns.some(pattern => pattern.test(command));
  }

  /**
   * Check if network operations are allowed in current context
   */
  private isNetworkAllowed(context: ToolContext): boolean {
    // Allow network for system health agents
    return context.agentType === 'system-health';
  }

  /**
   * Audit a permission denial
   */
  private auditDenial(
    toolName: string,
    input: any,
    context: ToolContext,
    reason: string,
    ruleType: string
  ): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      toolName,
      action: 'denied',
      reason,
      ruleType,
      context: {
        agentType: context.agentType,
        executionId: context.executionId,
        currentTurn: context.currentTurn,
        totalCost: context.totalCost
      },
      inputSummary: this.summarizeInput(input)
    };

    this.auditLog.push(entry);
    this.log(`🚫 Permission denied: ${toolName} - ${reason}`, 'warn');

    // Keep audit log size manageable
    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, 100); // Remove oldest 100 entries
    }
  }

  /**
   * Audit a permission approval
   */
  private auditApproval(
    toolName: string,
    input: any,
    context: ToolContext,
    checkDuration: number
  ): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      toolName,
      action: 'approved',
      reason: 'All checks passed',
      ruleType: 'comprehensive',
      context: {
        agentType: context.agentType,
        executionId: context.executionId,
        currentTurn: context.currentTurn,
        totalCost: context.totalCost
      },
      inputSummary: this.summarizeInput(input),
      checkDuration
    };

    this.auditLog.push(entry);
    this.log(`✅ Permission granted: ${toolName} (${checkDuration}ms)`, 'debug');

    // Keep audit log size manageable
    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, 100);
    }
  }

  /**
   * Summarize input for audit logging
   */
  private summarizeInput(input: any): string {
    if (typeof input === 'string') {
      return input.length > 100 ? input.substring(0, 100) + '...' : input;
    }

    if (input && typeof input === 'object') {
      const summary = JSON.stringify(input);
      return summary.length > 200 ? summary.substring(0, 200) + '...' : summary;
    }

    return String(input);
  }

  /**
   * Get audit statistics
   */
  getAuditStatistics(): AuditStatistics {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentEntries = this.auditLog.filter(entry => 
      new Date(entry.timestamp).getTime() > oneHourAgo
    );

    const totalApprovals = this.auditLog.filter(e => e.action === 'approved').length;
    const totalDenials = this.auditLog.filter(e => e.action === 'denied').length;
    const recentApprovals = recentEntries.filter(e => e.action === 'approved').length;
    const recentDenials = recentEntries.filter(e => e.action === 'denied').length;

    const toolUsage: Record<string, number> = {};
    const denialReasons: Record<string, number> = {};

    for (const entry of this.auditLog) {
      toolUsage[entry.toolName] = (toolUsage[entry.toolName] || 0) + 1;
      
      if (entry.action === 'denied') {
        denialReasons[entry.reason] = (denialReasons[entry.reason] || 0) + 1;
      }
    }

    return {
      totalEntries: this.auditLog.length,
      totalApprovals,
      totalDenials,
      approvalRate: totalApprovals / (totalApprovals + totalDenials) * 100,
      recentActivity: {
        approvals: recentApprovals,
        denials: recentDenials,
        total: recentEntries.length
      },
      toolUsage,
      topDenialReasons: Object.entries(denialReasons)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }))
    };
  }

  /**
   * Get recent audit entries
   */
  getRecentAuditEntries(count: number = 50): AuditEntry[] {
    return this.auditLog.slice(-count);
  }

  // Rate limiting tracker
  private rateLimitTracker?: Map<string, number[]>;
}

// Permission-related interfaces
interface ToolPolicy {
  description: string;
  check: (toolName: string, input: any, context: ToolContext) => Promise<PermissionResult>;
}

interface GlobalRule {
  description: string;
  condition?: (toolName: string, input: any, context: ToolContext) => boolean;
  check: (toolName: string, input: any, context: ToolContext) => Promise<PermissionResult>;
}

interface PermissionResult {
  allowed: boolean;
  reason: string;
}

interface AuditEntry {
  timestamp: string;
  toolName: string;
  action: 'approved' | 'denied';
  reason: string;
  ruleType: string;
  context: {
    agentType: string;
    executionId: string;
    currentTurn: number;
    totalCost: number;
  };
  inputSummary: string;
  checkDuration?: number;
}

interface AuditStatistics {
  totalEntries: number;
  totalApprovals: number;
  totalDenials: number;
  approvalRate: number;
  recentActivity: {
    approvals: number;
    denials: number;
    total: number;
  };
  toolUsage: Record<string, number>;
  topDenialReasons: Array<{ reason: string; count: number }>;
}