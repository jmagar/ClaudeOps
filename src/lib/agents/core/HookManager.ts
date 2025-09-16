import type { 
  HookCallback,
  PreToolUseHookInput,
  PostToolUseHookInput
} from '@anthropic-ai/claude-code';

import type {
  AgentHooks,
  ToolContext,
  LogCallback
} from './types';

// Local hook types for the HookManager's internal hook system
export type PreToolUseHook = (toolName: string, input: any) => Promise<boolean>;
export type PostToolUseHook = (toolName: string, input: any, result: any) => Promise<void>;

/**
 * Manages hook execution for tool monitoring, security, and performance tracking
 */
export class HookManager {
  private hooks: AgentHooks;
  private toolMetrics: Map<string, ToolMetrics> = new Map();
  private rateLimits: Map<string, RateLimit> = new Map();
  private log: LogCallback;

  constructor(hooks: AgentHooks = {}, log?: LogCallback) {
    this.hooks = hooks;
    this.log = log || (() => {});
  }

  /**
   * Create a pre-tool-use hook with security and rate limiting
   */
  createPreToolUseHook(): PreToolUseHook {
    return async (toolName: string, input: any) => {
      const startTime = Date.now();
      
      try {
        // Rate limiting check
        if (this.isRateLimited(toolName)) {
          this.log(`🚫 Tool ${toolName} is rate limited`, 'warn');
          return false;
        }

        // Security validation
        if (!this.validateToolSecurity(toolName, input)) {
          this.log(`🔒 Security check failed for ${toolName}`, 'warn');
          return false;
        }

        // Update rate limit tracking
        this.updateRateLimit(toolName);

        // Execute custom pre-hooks
        if (this.hooks.preToolUse) {
          for (const hook of this.hooks.preToolUse) {
            const hookInput = {
              hook_event_name: 'PreToolUse' as const,
              session_id: 'current-session', // TODO: Pass actual session ID
              transcript_path: '', // TODO: Pass actual transcript path
              cwd: process.cwd(),
              tool_name: toolName,
              tool_input: input
            };
            
            const result = await hook(hookInput, undefined, { signal: new AbortController().signal });
            
            // Check if hook wants to block the tool use
            // For async hooks, we can't determine the result immediately
            if ('async' in result && result.async) {
              this.log(`⏳ Async hook detected for ${toolName}, continuing execution`, 'debug');
              continue;
            }
            
            // For sync hooks, check decision and continue flags
            if ('decision' in result && result.decision === 'block') {
              this.log(`🚫 Custom pre-hook blocked ${toolName}: ${result.reason || 'No reason provided'}`, 'warn');
              return false;
            }
            
            if ('continue' in result && result.continue === false) {
              this.log(`🚫 Custom pre-hook blocked ${toolName}: ${result.stopReason || 'Hook requested stop'}`, 'warn');
              return false;
            }
          }
        }

        // Track metrics
        this.trackToolStart(toolName, startTime);
        this.log(`✅ Pre-hook passed for ${toolName}`, 'debug');
        return true;

      } catch (error) {
        this.log(`❌ Pre-hook error for ${toolName}: ${error}`, 'error');
        return false;
      }
    };
  }

  /**
   * Create a post-tool-use hook for result processing and metrics
   */
  createPostToolUseHook(): PostToolUseHook {
    return async (toolName: string, input: any, result: any) => {
      const endTime = Date.now();
      
      try {
        // Update metrics
        this.trackToolEnd(toolName, endTime, result);

        // Process result for monitoring
        this.processToolResult(toolName, result);

        // Execute custom post-hooks
        if (this.hooks.postToolUse) {
          for (const hook of this.hooks.postToolUse) {
            const hookInput = {
              hook_event_name: 'PostToolUse' as const,
              session_id: 'current-session', // TODO: Pass actual session ID
              transcript_path: '', // TODO: Pass actual transcript path
              cwd: process.cwd(),
              tool_name: toolName,
              tool_input: input,
              tool_response: result
            };
            
            await hook(hookInput, undefined, { signal: new AbortController().signal });
          }
        }

        this.log(`📊 Post-hook completed for ${toolName}`, 'debug');

      } catch (error) {
        this.log(`❌ Post-hook error for ${toolName}: ${error}`, 'error');
      }
    };
  }

  /**
   * Validate tool security based on tool name and input
   */
  private validateToolSecurity(toolName: string, input: any): boolean {
    // Bash command security checks
    if (toolName === 'Bash') {
      const command = input.command || '';
      
      // Block destructive commands
      const destructivePatterns = [
        /rm\s+-rf\s+\/[^\/\s]+/,  // rm -rf /path
        /dd\s+if=.*of=/,          // dd commands
        />\s*\/dev\/sd[a-z]/,     // Direct disk writes
        /mkfs\./,                 // Format filesystem
        /fdisk|parted/,           // Disk partitioning
        /userdel|deluser/,        // Delete users
        /passwd.*root/,           // Change root password
        /sudo\s+su/,              // Privilege escalation
        /curl.*\|\s*sh/,          // Download and execute
        /wget.*\|\s*sh/,          // Download and execute
        /chmod\s+777/,            // Dangerous permissions
        /init\s+0|shutdown|reboot/, // System shutdown
      ];

      for (const pattern of destructivePatterns) {
        if (pattern.test(command)) {
          this.log(`🚫 Blocked destructive command: ${command.substring(0, 50)}...`, 'warn');
          return false;
        }
      }

      // Check for excessively long commands (potential injection)
      if (command.length > 1000) {
        this.log(`🚫 Blocked excessively long command (${command.length} chars)`, 'warn');
        return false;
      }
    }

    // File path security for Read/Write tools
    if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
      const filePath = input.file_path || input.filePath || '';
      
      // Block access to sensitive system files
      const sensitivePatterns = [
        /\/etc\/passwd/,
        /\/etc\/shadow/,
        /\/etc\/sudoers/,
        /\/root\/\./,
        /\/home\/[^\/]+\/\.\w+/,  // Hidden files in home dirs
        /\/proc\/\d+/,
        /\/sys\//,
        /\/dev\/random/,
        /\/dev\/urandom/,
      ];

      for (const pattern of sensitivePatterns) {
        if (pattern.test(filePath)) {
          this.log(`🚫 Blocked access to sensitive file: ${filePath}`, 'warn');
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if tool is currently rate limited
   */
  private isRateLimited(toolName: string): boolean {
    const limit = this.rateLimits.get(toolName);
    if (!limit) return false;

    const now = Date.now();
    const windowStart = now - limit.windowMs;
    
    // Remove old entries
    limit.calls = limit.calls.filter(time => time > windowStart);
    
    return limit.calls.length >= limit.maxCalls;
  }

  /**
   * Update rate limit tracking for a tool
   */
  private updateRateLimit(toolName: string): void {
    // Default rate limits per tool
    const defaultLimits: Record<string, { maxCalls: number; windowMs: number }> = {
      'Bash': { maxCalls: 20, windowMs: 60000 }, // 20 commands per minute
      'Read': { maxCalls: 50, windowMs: 60000 }, // 50 reads per minute
      'Grep': { maxCalls: 30, windowMs: 60000 }, // 30 searches per minute
      'Glob': { maxCalls: 30, windowMs: 60000 }, // 30 globs per minute
    };

    const config = defaultLimits[toolName];
    if (!config) return;

    let limit = this.rateLimits.get(toolName);
    if (!limit) {
      limit = {
        maxCalls: config.maxCalls,
        windowMs: config.windowMs,
        calls: []
      };
      this.rateLimits.set(toolName, limit);
    }

    limit.calls.push(Date.now());
  }

  /**
   * Track tool execution start
   */
  private trackToolStart(toolName: string, startTime: number): void {
    let metrics = this.toolMetrics.get(toolName);
    if (!metrics) {
      metrics = {
        name: toolName,
        totalCalls: 0,
        totalDuration: 0,
        successCount: 0,
        errorCount: 0,
        averageDuration: 0,
        lastUsed: new Date().toISOString(),
        currentExecution: { startTime }
      };
      this.toolMetrics.set(toolName, metrics);
    }

    metrics.currentExecution = { startTime };
    metrics.totalCalls++;
    metrics.lastUsed = new Date().toISOString();
  }

  /**
   * Track tool execution end and calculate metrics
   */
  private trackToolEnd(toolName: string, endTime: number, result: any): void {
    const metrics = this.toolMetrics.get(toolName);
    if (!metrics || !metrics.currentExecution) return;

    const duration = endTime - metrics.currentExecution.startTime;
    metrics.totalDuration += duration;
    metrics.averageDuration = metrics.totalDuration / metrics.totalCalls;

    // Determine if execution was successful
    if (this.isSuccessfulResult(result)) {
      metrics.successCount++;
    } else {
      metrics.errorCount++;
    }

    delete metrics.currentExecution;
  }

  /**
   * Process tool results for monitoring and logging
   */
  private processToolResult(toolName: string, result: any): void {
    // Log interesting patterns or errors
    if (toolName === 'Bash' && result) {
      const output = result.toString();
      
      // Look for error patterns
      const errorPatterns = [
        /error|Error|ERROR/,
        /failed|Failed|FAILED/,
        /permission denied/i,
        /no such file/i,
        /command not found/i
      ];

      for (const pattern of errorPatterns) {
        if (pattern.test(output)) {
          this.log(`⚠️ ${toolName} error pattern detected: ${pattern.source}`, 'warn');
          break;
        }
      }

      // Log if output is unusually large
      if (output.length > 10000) {
        this.log(`📊 ${toolName} produced large output (${output.length} chars)`, 'debug');
      }
    }
  }

  /**
   * Determine if a tool result indicates success
   */
  private isSuccessfulResult(result: any): boolean {
    if (!result) return false;
    
    const resultStr = result.toString().toLowerCase();
    
    // Common error indicators
    const errorIndicators = [
      'error', 'failed', 'permission denied', 'no such file',
      'command not found', 'access denied', 'operation not permitted'
    ];

    return !errorIndicators.some(indicator => resultStr.includes(indicator));
  }

  /**
   * Get performance metrics for all tools
   */
  getMetrics(): Record<string, ToolMetrics> {
    const metrics: Record<string, ToolMetrics> = {};
    
    Array.from(this.toolMetrics.entries()).forEach(([toolName, toolMetrics]) => {
      metrics[toolName] = { ...toolMetrics };
      delete metrics[toolName].currentExecution; // Don't expose internal state
    });
    
    return metrics;
  }

  /**
   * Get rate limit status for all tools
   */
  getRateLimitStatus(): Record<string, RateLimitStatus> {
    const status: Record<string, RateLimitStatus> = {};
    
    Array.from(this.rateLimits.entries()).forEach(([toolName, limit]) => {
      const now = Date.now();
      const windowStart = now - limit.windowMs;
      const recentCalls = limit.calls.filter(time => time > windowStart).length;
      
      status[toolName] = {
        maxCalls: limit.maxCalls,
        currentCalls: recentCalls,
        windowMs: limit.windowMs,
        isLimited: recentCalls >= limit.maxCalls,
        resetTime: limit.calls.length > 0 ? Math.max(...limit.calls) + limit.windowMs : now
      };
    });
    
    return status;
  }

  /**
   * Reset all metrics and rate limits
   */
  reset(): void {
    this.toolMetrics.clear();
    this.rateLimits.clear();
    this.log('🔄 Hook manager metrics reset', 'debug');
  }
}

// Internal interfaces
interface ToolMetrics {
  name: string;
  totalCalls: number;
  totalDuration: number;
  successCount: number;
  errorCount: number;
  averageDuration: number;
  lastUsed: string;
  currentExecution?: {
    startTime: number;
  };
}

interface RateLimit {
  maxCalls: number;
  windowMs: number;
  calls: number[];
}

interface RateLimitStatus {
  maxCalls: number;
  currentCalls: number;
  windowMs: number;
  isLimited: boolean;
  resetTime: number;
}