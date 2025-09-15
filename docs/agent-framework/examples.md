# Agent Framework Examples

Practical examples and patterns for using the Claude Code SDK Agent Framework.

## Table of Contents

- [Basic Usage](#basic-usage)
- [Creating Custom Agents](#creating-custom-agents)
- [Advanced Configuration](#advanced-configuration)
- [Error Handling Patterns](#error-handling-patterns)
- [Session Management](#session-management)
- [Streaming and Real-time Updates](#streaming-and-real-time-updates)
- [Hook System Examples](#hook-system-examples)
- [Migration Examples](#migration-examples)
- [Production Patterns](#production-patterns)
- [Testing Agents](#testing-agents)

## Basic Usage

### Simple Agent Execution

```typescript
import { AgentFactory, AgentUtils } from './lib/agents';

// Create and execute a system health agent
async function runSystemHealthCheck() {
  const agent = AgentFactory.create('system-health');
  
  const result = await agent.execute({
    ai_analysis_depth: 'detailed',
    include_security_scan: true,
    timeout_ms: 300000  // 5 minutes
  });

  console.log('Health Check Results:');
  console.log('Status:', result.status);
  console.log('Cost:', `$${result.cost.toFixed(4)}`);
  console.log('Duration:', `${(result.duration / 1000).toFixed(1)}s`);
  console.log('\nSummary:', result.summary);
  
  if (result.error) {
    console.error('Error:', result.error);
  }
}

runSystemHealthCheck().catch(console.error);
```

### With Logging and Progress

```typescript
import { AgentFactory, AgentUtils } from './lib/agents';

async function runWithLogging() {
  const agent = AgentFactory.create('system-health');
  
  // Create structured logging callbacks
  const { onLog, onProgress } = AgentUtils.createCombinedCallbacks('HealthCheck');
  
  const result = await agent.execute({
    ai_analysis_depth: 'comprehensive',
    include_docker: true,
    detailed_service_analysis: true,
    onLog,
    onProgress
  });

  return result;
}
```

### Custom Logging

```typescript
// Custom logging with different output formats
function createCustomLogger(outputFile?: string): LogCallback {
  return (message: string, level: string = 'info') => {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    // Console output with colors
    const colors = {
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m',    // Yellow
      info: '\x1b[36m',    // Cyan
      debug: '\x1b[90m',   // Gray
      reset: '\x1b[0m'
    };
    
    console.log(
      `${colors[level] || colors.info}${formattedMessage}${colors.reset}`
    );
    
    // Optional file output
    if (outputFile) {
      require('fs').appendFileSync(outputFile, formattedMessage + '\n');
    }
  };
}

// Usage
const result = await agent.execute({
  onLog: createCustomLogger('./agent.log'),
  onProgress: (progress) => {
    console.log(`📈 ${progress.stage}: ${progress.message}`);
    if (progress.percentage) {
      console.log(`   Progress: ${progress.percentage}%`);
    }
  }
});
```

## Creating Custom Agents

### Simple Custom Agent

```typescript
import { BaseAgent } from './lib/agents/core/BaseAgent';
import type { BaseAgentOptions, AgentConfig } from './lib/agents/core/types';

interface NetworkScanOptions extends BaseAgentOptions {
  targetHost?: string;
  portRange?: string;
  includeServiceDetection?: boolean;
  scanIntensity?: 'light' | 'normal' | 'aggressive';
}

export class NetworkScanAgent extends BaseAgent<NetworkScanOptions> {
  getAgentType(): string {
    return 'network-scan';
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Read', 'Grep'];
  }

  buildPrompt(options: NetworkScanOptions): string {
    const target = options.targetHost || 'localhost';
    const ports = options.portRange || '1-1000';
    const serviceDetection = options.includeServiceDetection || false;
    const intensity = options.scanIntensity || 'normal';

    return `
Conduct a ${intensity} network scan of ${target} for ports ${ports}.

SCAN PARAMETERS:
- Target: ${target}
- Port Range: ${ports}
- Service Detection: ${serviceDetection ? 'Enabled' : 'Disabled'}
- Intensity: ${intensity}

INVESTIGATION STEPS:
1. **Host Discovery**: Verify target is reachable
   - Use ping to check connectivity
   - Check basic network configuration

2. **Port Scanning**: Scan specified port range
   - Use nmap or netstat for port discovery
   - Identify open, closed, and filtered ports

3. **Service Detection**: ${serviceDetection ? 'Identify services on open ports' : 'Skip service detection'}
   ${serviceDetection ? '- Determine service versions and types\n   - Check for common vulnerabilities' : ''}

4. **Security Assessment**: Evaluate findings
   - Identify potential security risks
   - Check for unnecessary open ports
   - Recommend security improvements

Provide a comprehensive report with:
- Network topology summary
- Open ports and services
- Security recommendations
- Risk assessment with severity levels
`;
  }

  getSystemPrompt(): string {
    return `
You are a network security specialist with expertise in network scanning and analysis.

CAPABILITIES:
- Network topology analysis
- Port scanning and service detection
- Security vulnerability assessment
- Network configuration analysis
- Risk evaluation and remediation

METHODOLOGY:
- Use systematic scanning approaches
- Validate findings with multiple tools
- Provide evidence-based recommendations
- Consider network security best practices
- Prioritize findings by risk level

OUTPUT REQUIREMENTS:
- Clear network analysis with diagrams where helpful
- Specific security recommendations
- Risk assessment with CVSS scoring where applicable
- Actionable remediation steps
`;
  }

  getConfig(): AgentConfig {
    return {
      name: 'Network Security Scanner',
      version: '1.0.0',
      description: 'Network scanning and security analysis agent',
      defaultOptions: {
        timeout_ms: 600000,  // 10 minutes for network scans
        maxTurns: 40,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Network topology discovery',
        'Port scanning and analysis',
        'Service detection and fingerprinting',
        'Security vulnerability assessment',
        'Network configuration analysis',
        'Risk assessment and prioritization'
      ],
      requiredTools: ['Bash'],
      optionalTools: ['Read', 'Grep'],
      typicalExecutionTime: 300000,  // 5 minutes
      costEstimate: {
        min: 0.15,
        max: 2.00,
        typical: 0.60
      }
    };
  }

  // Custom error handling for network-specific issues
  protected async handleAgentSpecificError(error: any, context: any) {
    if (error.message.includes('Network is unreachable')) {
      return {
        action: 'continue',
        message: 'Target network unreachable, checking local network only'
      };
    }

    if (error.message.includes('Permission denied') && error.message.includes('nmap')) {
      return {
        action: 'reduce_scope',
        message: 'Running with reduced privileges, some scans may be limited'
      };
    }

    return super.handleAgentSpecificError(error, context);
  }
}
```

### Complex Agent with State Management

```typescript
interface LogAnalysisOptions extends BaseAgentOptions {
  logPaths?: string[];
  timeRange?: string;
  alertPatterns?: string[];
  analysisDepth?: 'summary' | 'detailed' | 'forensic';
}

export class LogAnalysisAgent extends BaseAgent<LogAnalysisOptions> {
  private analysisState = {
    currentLogFile: '',
    foundPatterns: [] as string[],
    analysisPhase: 'initialization' as string,
    anomalies: [] as any[]
  };

  getAgentType(): string {
    return 'log-analysis';
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Read', 'Grep', 'Glob'];
  }

  buildPrompt(options: LogAnalysisOptions): string {
    const logPaths = options.logPaths || ['/var/log/syslog', '/var/log/auth.log'];
    const timeRange = options.timeRange || 'last 24 hours';
    const patterns = options.alertPatterns || ['error', 'failed', 'unauthorized'];
    const depth = options.analysisDepth || 'detailed';

    this.analysisState.analysisPhase = 'log_discovery';

    return `
Conduct a ${depth} analysis of system logs for security and operational insights.

ANALYSIS PARAMETERS:
- Log Paths: ${logPaths.join(', ')}
- Time Range: ${timeRange}
- Alert Patterns: ${patterns.join(', ')}
- Analysis Depth: ${depth}

INVESTIGATION STRATEGY:
1. **Log Discovery**: Identify available log files
   - Check specified paths: ${logPaths.join(', ')}
   - Discover additional relevant logs
   - Verify log accessibility and format

2. **Pattern Analysis**: Search for alert patterns
   - Look for: ${patterns.join(', ')}
   - Use time-based filtering for ${timeRange}
   - Identify frequency and trends

3. **Anomaly Detection**: Find unusual patterns
   - Detect authentication anomalies
   - Identify system errors and warnings
   - Look for suspicious network activity

4. **Temporal Analysis**: Analyze timing patterns
   - Correlate events across different logs
   - Identify peak error times
   - Look for patterns indicating attacks

5. **Risk Assessment**: Evaluate security implications
   - Classify findings by severity
   - Provide remediation recommendations
   - Suggest monitoring improvements

Format your analysis with:
- Executive Summary
- Critical Findings (with timestamps)
- Anomaly Report
- Trend Analysis
- Security Recommendations
- Monitoring Suggestions
`;
  }

  getSystemPrompt(): string {
    return `
You are a cybersecurity analyst specializing in log analysis and incident response.

EXPERTISE:
- Security log analysis and correlation
- Anomaly detection and pattern recognition
- Incident response and forensics
- System monitoring and alerting
- Threat hunting and investigation

ANALYSIS APPROACH:
- Use statistical methods to identify anomalies
- Correlate events across multiple log sources
- Apply security frameworks (MITRE ATT&CK, etc.)
- Consider false positive reduction
- Provide actionable intelligence

TOOLS AND TECHNIQUES:
- Advanced grep patterns and regex
- Log parsing and structured analysis
- Timeline analysis and correlation
- Statistical analysis for anomaly detection
- Security indicator recognition
`;
  }

  getConfig(): AgentConfig {
    return {
      name: 'Log Analysis and Security Agent',
      version: '1.0.0',
      description: 'Advanced log analysis for security and operational insights',
      defaultOptions: {
        timeout_ms: 900000,  // 15 minutes for complex log analysis
        maxTurns: 60,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Multi-log correlation analysis',
        'Security anomaly detection',
        'Pattern recognition and trending',
        'Forensic timeline analysis',
        'Threat hunting and investigation',
        'Compliance reporting'
      ],
      requiredTools: ['Bash', 'Grep'],
      optionalTools: ['Read', 'Glob'],
      typicalExecutionTime: 450000,  // 7.5 minutes
      costEstimate: {
        min: 0.25,
        max: 3.50,
        typical: 1.20
      }
    };
  }

  // Custom session state management
  protected async saveSessionState(state: any): Promise<void> {
    const customState = {
      ...state,
      analysisState: this.analysisState,
      timestamp: new Date().toISOString()
    };
    await super.saveSessionState(customState);
  }

  protected async restoreSessionState(sessionId: string): Promise<any> {
    const state = await super.restoreSessionState(sessionId);
    if (state?.analysisState) {
      this.analysisState = state.analysisState;
    }
    return state;
  }

  // Update analysis state during execution
  private updateAnalysisPhase(phase: string, context?: any) {
    this.analysisState.analysisPhase = phase;
    if (context) {
      Object.assign(this.analysisState, context);
    }
  }
}
```

## Advanced Configuration

### Production-Ready Configuration

```typescript
import { AgentFactory, SessionManager, StreamHandler } from './lib/agents';

class ProductionAgentRunner {
  private sessionManager: SessionManager;
  private streamHandler: StreamHandler;
  
  constructor() {
    this.sessionManager = new SessionManager(
      './production-sessions',
      this.createLogger('SessionManager'),
      60000  // 1-minute checkpoint interval
    );
    
    this.streamHandler = new StreamHandler(
      500,  // Larger buffer for production
      this.createLogger('StreamHandler')
    );
    
    // Set up production monitoring
    this.setupMonitoring();
  }

  async runAgent(agentType: string, options: any = {}) {
    const agent = AgentFactory.create(agentType);
    
    // Production-grade configuration
    const productionOptions = {
      ...options,
      timeout_ms: 1800000,  // 30 minutes
      maxTurns: 100,
      costLimit: 5.00,      // $5 limit
      includePartialMessages: true,
      onLog: this.createLogger(agentType),
      onProgress: this.createProgressTracker(agentType),
      hooks: {
        preToolUse: [this.createSecurityHook()],
        postToolUse: [this.createMonitoringHook()],
        onError: this.createErrorHandler(),
        onComplete: this.createCompletionHandler()
      }
    };

    // Create session for resumability
    const sessionId = await this.sessionManager.createSession(
      agentType,
      `prod-${Date.now()}`,
      productionOptions,
      { environment: 'production', requestId: options.requestId }
    );

    try {
      const result = await agent.execute({
        ...productionOptions,
        sessionId
      });

      // Log successful completion
      console.log(`Agent ${agentType} completed successfully:`, {
        executionId: result.executionId,
        cost: result.cost,
        duration: result.duration,
        status: result.status
      });

      return result;
    } catch (error) {
      // Log error and session info for recovery
      console.error(`Agent ${agentType} failed:`, {
        error: error.message,
        sessionId,
        canResume: true
      });
      throw error;
    }
  }

  private createLogger(component: string) {
    return (message: string, level: string = 'info') => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        component,
        level,
        message,
        environment: 'production'
      };
      
      // Structure logging for production monitoring
      console.log(JSON.stringify(logEntry));
      
      // Send to monitoring system
      if (level === 'error') {
        this.sendToAlertingSystem(logEntry);
      }
    };
  }

  private createProgressTracker(agentType: string) {
    return (progress: ProgressUpdate) => {
      // Send progress to monitoring dashboard
      this.updateProgressDashboard(agentType, progress);
      
      // Check for stuck operations
      if (progress.currentTurn && progress.currentTurn > 80) {
        console.warn(`Agent ${agentType} using many turns (${progress.currentTurn})`);
      }
    };
  }

  private createSecurityHook() {
    return async (toolName: string, input: any) => {
      // Additional security validation for production
      if (toolName === 'Bash') {
        const command = input.command;
        
        // Block production-unsafe commands
        const unsafePatterns = [
          /rm.*-rf.*\/(?!tmp|var\/tmp)/,  // Prevent deleting system dirs
          /mkfs/,                         // Prevent filesystem formatting
          /dd.*of=\/dev/,                 // Prevent disk writes
          /passwd|useradd|userdel/,       // Prevent user management
          /iptables.*-F/,                 // Prevent firewall rule clearing
          /systemctl.*stop.*ssh/          // Prevent SSH service stop
        ];

        for (const pattern of unsafePatterns) {
          if (pattern.test(command)) {
            console.error(`SECURITY: Blocked unsafe command: ${command}`);
            return false;
          }
        }
      }
      
      return true;
    };
  }

  private createMonitoringHook() {
    return async (toolName: string, input: any, result: any) => {
      // Track tool usage metrics
      this.recordToolMetrics(toolName, {
        duration: result.duration || 0,
        success: !result.error,
        inputSize: JSON.stringify(input).length,
        outputSize: typeof result === 'string' ? result.length : JSON.stringify(result).length
      });
    };
  }

  private createErrorHandler() {
    return async (error: AgentError, context: ErrorContext) => {
      // Enhanced error handling for production
      console.error('Production Agent Error:', {
        type: error.type,
        subtype: error.subtype,
        message: error.message,
        executionId: context.executionId,
        agentType: context.agentType,
        currentTurn: context.currentTurn,
        totalCost: context.totalCost
      });

      // Send to error tracking service
      this.reportToErrorTracking(error, context);

      // Implement circuit breaker pattern
      if (this.shouldTriggerCircuitBreaker(error, context)) {
        return { action: 'abort', message: 'Circuit breaker triggered' };
      }

      // Default recovery strategy
      if (error.type === 'timeout' && context.currentTurn < 50) {
        return { action: 'retry', retryDelay: 10000 };
      }

      return { action: 'abort' };
    };
  }

  private createCompletionHandler() {
    return async (result: BaseAgentResult) => {
      // Record completion metrics
      this.recordCompletionMetrics(result);
      
      // Clean up resources if needed
      await this.cleanup(result.executionId);
      
      // Archive session for audit trail
      await this.archiveSession(result.sessionId);
    };
  }

  private setupMonitoring() {
    // Set up health checks, metrics collection, etc.
    setInterval(async () => {
      const stats = await this.sessionManager.getStatistics();
      const streamStats = this.streamHandler.getStatistics();
      
      console.log('Production Metrics:', {
        activeSessions: stats.activeSessions,
        totalSessions: stats.totalSessions,
        streamMessages: streamStats.totalMessages,
        activeListeners: streamStats.activeListeners
      });
    }, 60000);  // Every minute
  }

  // Placeholder methods for production integrations
  private sendToAlertingSystem(logEntry: any) { /* Implementation */ }
  private updateProgressDashboard(agentType: string, progress: ProgressUpdate) { /* Implementation */ }
  private recordToolMetrics(toolName: string, metrics: any) { /* Implementation */ }
  private reportToErrorTracking(error: AgentError, context: ErrorContext) { /* Implementation */ }
  private shouldTriggerCircuitBreaker(error: AgentError, context: ErrorContext): boolean { return false; }
  private recordCompletionMetrics(result: BaseAgentResult) { /* Implementation */ }
  private cleanup(executionId: string) { /* Implementation */ }
  private archiveSession(sessionId?: string) { /* Implementation */ }
}
```

## Error Handling Patterns

### Comprehensive Error Strategy

```typescript
import { AgentError, ErrorContext, ErrorRecovery } from './lib/agents/core/types';

class RobustAgent extends BaseAgent<MyAgentOptions> {
  private errorCount = 0;
  private consecutiveErrors = 0;
  private lastErrorTime = 0;

  protected async handleAgentSpecificError(
    error: AgentError, 
    context: ErrorContext
  ): Promise<ErrorRecovery> {
    this.errorCount++;
    this.consecutiveErrors++;
    this.lastErrorTime = Date.now();

    // Log detailed error information
    console.error('Agent Error Details:', {
      errorType: error.type,
      errorSubtype: error.subtype,
      message: error.message,
      executionId: context.executionId,
      agentType: context.agentType,
      currentTurn: context.currentTurn,
      totalCost: context.totalCost,
      timeElapsed: context.timeElapsed,
      consecutiveErrors: this.consecutiveErrors,
      totalErrors: this.errorCount
    });

    // Circuit breaker pattern
    if (this.consecutiveErrors >= 5) {
      console.error('Circuit breaker triggered: too many consecutive errors');
      return {
        action: 'abort',
        message: 'Circuit breaker: multiple consecutive failures detected'
      };
    }

    // Rate limiting detection
    if (error.type === 'sdk_error' && error.subtype === 'error_rate_limit') {
      const backoffTime = Math.min(30000, 1000 * Math.pow(2, this.consecutiveErrors));
      console.warn(`Rate limited, backing off for ${backoffTime}ms`);
      
      return {
        action: 'retry',
        retryDelay: backoffTime,
        message: `Rate limited, retrying after ${backoffTime}ms`
      };
    }

    // Network/connectivity errors
    if (this.isNetworkError(error)) {
      if (this.consecutiveErrors <= 3) {
        return {
          action: 'retry',
          retryDelay: 5000 * this.consecutiveErrors,
          message: 'Network error, retrying with backoff'
        };
      } else {
        return {
          action: 'reduce_scope',
          message: 'Network issues persist, continuing with cached data'
        };
      }
    }

    // Permission errors - try alternative approaches
    if (error.type === 'permission_denied' || error.message.includes('Permission denied')) {
      return this.handlePermissionError(error, context);
    }

    // Cost limit approaching
    if (context.totalCost > 2.00) {  // $2 threshold
      console.warn('High cost detected, reducing scope');
      return {
        action: 'reduce_scope',
        modifiedPrompt: this.createReducedScopePrompt(context),
        message: 'Reducing scope due to cost considerations'
      };
    }

    // Timeout with turn analysis
    if (error.type === 'timeout') {
      if (context.currentTurn < 10) {
        // Early timeout, likely system issue
        return {
          action: 'retry',
          retryDelay: 10000,
          message: 'Early timeout, retrying with delay'
        };
      } else {
        // Deep in analysis, continue with current results
        return {
          action: 'continue',
          message: 'Timeout during deep analysis, using partial results'
        };
      }
    }

    // Default fallback
    return super.handleAgentSpecificError(error, context);
  }

  private isNetworkError(error: AgentError): boolean {
    const networkPatterns = [
      /network.*unreachable/i,
      /connection.*refused/i,
      /timeout.*connecting/i,
      /dns.*resolution.*failed/i,
      /host.*not.*found/i
    ];

    return networkPatterns.some(pattern => 
      pattern.test(error.message) || 
      (error.originalError && pattern.test(error.originalError.message || ''))
    );
  }

  private async handlePermissionError(
    error: AgentError, 
    context: ErrorContext
  ): Promise<ErrorRecovery> {
    console.warn('Permission error, trying alternative approaches');

    // Reset consecutive errors for permission issues (different error class)
    if (error.type === 'permission_denied') {
      this.consecutiveErrors = 0;
    }

    // Try different approaches based on what failed
    if (error.message.includes('journalctl')) {
      return {
        action: 'continue',
        modifiedPrompt: this.getPromptWithoutSystemd(),
        message: 'Using traditional log files instead of systemd'
      };
    }

    if (error.message.includes('/var/log')) {
      return {
        action: 'continue',
        modifiedPrompt: this.getPromptWithUserLogs(),
        message: 'Using user-accessible logs only'
      };
    }

    return {
      action: 'reduce_scope',
      message: 'Continuing with reduced system access'
    };
  }

  private createReducedScopePrompt(context: ErrorContext): string {
    return `
Based on the analysis so far, provide a summary of findings and recommendations.
Focus on the most critical issues discovered in the first ${context.currentTurn} turns.
Avoid deep investigation of new areas to manage costs.
`;
  }

  private getPromptWithoutSystemd(): string {
    return this.buildPrompt({} as MyAgentOptions)
      .replace(/journalctl/g, 'tail /var/log/syslog')
      .replace(/systemctl/g, 'service');
  }

  private getPromptWithUserLogs(): string {
    return `
Analyze system health using only user-accessible information:
1. Check process information with 'ps aux'
2. Review disk usage with 'df -h'
3. Check memory with 'free -h'
4. Look at network connections with 'netstat -an'
5. Check user-level configuration files

Focus on issues that don't require root access to investigate.
`;
  }

  // Reset error counters on successful operations
  async execute(options: MyAgentOptions = {}) {
    try {
      const result = await super.execute(options);
      
      // Reset error counters on success
      this.consecutiveErrors = 0;
      
      return result;
    } catch (error) {
      throw error;
    }
  }
}
```

## Session Management

### Long-Running Operation with Checkpoints

```typescript
import { SessionManager } from './lib/agents';

async function runLongAnalysis() {
  const sessionManager = new SessionManager('./analysis-sessions');
  const agent = AgentFactory.create('system-health');
  
  // Check for existing session
  const existingSessionId = process.env.RESUME_SESSION_ID;
  
  if (existingSessionId) {
    console.log(`Resuming session ${existingSessionId}`);
    
    try {
      const { session, resumeFromCheckpoint } = await sessionManager.resumeSession(existingSessionId);
      
      console.log('Session Info:', {
        sessionId: session.sessionId,
        agentType: session.agentType,
        startTime: session.startTime,
        checkpoints: session.checkpoints.length,
        lastCheckpoint: resumeFromCheckpoint?.timestamp
      });
      
      // Resume with original options
      const result = await agent.execute({
        ...session.options,
        sessionId: existingSessionId,
        onProgress: (progress) => {
          console.log(`📈 Resumed: ${progress.stage} - ${progress.message}`);
        }
      });
      
      console.log('Resumed analysis completed:', result.summary);
      return result;
    } catch (error) {
      console.error('Failed to resume session:', error.message);
      console.log('Starting new analysis...');
    }
  }
  
  // Start new session
  const sessionId = await sessionManager.createSession(
    'system-health',
    `analysis-${Date.now()}`,
    {
      ai_analysis_depth: 'comprehensive',
      include_docker: true,
      include_security_scan: true,
      timeout_ms: 1800000,  // 30 minutes
      maxTurns: 100
    },
    {
      purpose: 'comprehensive-system-analysis',
      environment: process.env.NODE_ENV || 'development'
    }
  );

  console.log(`Starting new analysis session: ${sessionId}`);

  const result = await agent.execute({
    ai_analysis_depth: 'comprehensive',
    include_docker: true,
    include_security_scan: true,
    sessionId,
    onProgress: (progress) => {
      console.log(`📈 ${progress.stage}: ${progress.message}`);
      
      // Save important checkpoints
      if (progress.currentTurn && progress.currentTurn % 10 === 0) {
        console.log(`💾 Checkpoint at turn ${progress.currentTurn}`);
      }
    },
    onLog: (message, level) => {
      if (level === 'error' || level === 'warn') {
        console.log(`[${level}] ${message}`);
      }
    }
  });

  console.log('Analysis completed:', result.summary);
  return result;
}

// Usage with error handling and resumption
async function runWithRecovery() {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    try {
      return await runLongAnalysis();
    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} failed:`, error.message);
      
      if (attempts < maxAttempts) {
        console.log(`Retrying in 30 seconds... (${maxAttempts - attempts} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      } else {
        console.error('All attempts failed. Check logs and session data for recovery options.');
        throw error;
      }
    }
  }
}
```

### Session Cleanup and Management

```typescript
async function manageSessionCleanup() {
  const sessionManager = new SessionManager('./sessions');
  
  // List all sessions
  const sessions = await sessionManager.listSessions();
  console.log(`Found ${sessions.length} sessions`);
  
  // Show session statistics
  const stats = await sessionManager.getStatistics();
  console.log('Session Statistics:', {
    total: stats.totalSessions,
    active: stats.activeSessions,
    byType: stats.agentTypeBreakdown,
    diskUsage: `${(stats.totalDiskUsage / 1024 / 1024).toFixed(2)} MB`,
    oldestSession: stats.oldestSession?.startTime,
    newestSession: stats.newestSession?.startTime
  });
  
  // Clean up old sessions (older than 7 days)
  const deleted = await sessionManager.cleanup(7 * 24 * 60 * 60 * 1000);
  console.log(`Cleaned up ${deleted} old sessions`);
  
  // Show resumable sessions
  const resumableSessions = sessions.filter(s => s.canResume);
  console.log('\nResumable Sessions:');
  resumableSessions.forEach(session => {
    console.log(`- ${session.sessionId}: ${session.agentType} (${session.checkpointCount} checkpoints)`);
    console.log(`  Started: ${session.startTime}`);
    console.log(`  Last Update: ${session.lastUpdate}`);
    console.log(`  Progress: ${session.progress.stage} - ${session.progress.message}`);
  });
}
```

## Streaming and Real-time Updates

### Real-time Monitoring Dashboard

```typescript
import { StreamHandler, StreamUtils } from './lib/agents';

class AgentMonitoringDashboard {
  private streamHandler: StreamHandler;
  private activeSessions = new Map<string, any>();

  constructor() {
    this.streamHandler = new StreamHandler(1000);  // Large buffer
    this.setupStreamListeners();
  }

  private setupStreamListeners() {
    // Console output listener
    this.streamHandler.addListener(
      StreamUtils.createConsoleListener(true)  // Verbose mode
    );

    // Custom dashboard listener
    this.streamHandler.addListener(async (update) => {
      await this.updateDashboard(update);
    });

    // Error tracking listener
    this.streamHandler.addListener(
      StreamUtils.createFilteredListener(
        async (update) => {
          await this.handleErrorAlert(update);
        },
        ['error']
      )
    );

    // Performance monitoring listener
    this.streamHandler.addListener(
      StreamUtils.createRateLimitedListener(
        async (update) => {
          await this.trackPerformance(update);
        },
        2  // 2 updates per second max
      )
    );
  }

  async startMonitoring(agentType: string, options: any = {}) {
    const agent = AgentFactory.create(agentType);
    const sessionId = `monitor-${Date.now()}`;
    
    // Add session tracking
    this.activeSessions.set(sessionId, {
      agentType,
      startTime: Date.now(),
      status: 'running',
      progress: { stage: 'starting', message: 'Initializing...' }
    });

    const result = await agent.execute({
      ...options,
      sessionId,
      onProgress: async (progress) => {
        // Update session tracking
        const session = this.activeSessions.get(sessionId);
        if (session) {
          session.progress = progress;
          session.lastUpdate = Date.now();
        }
        
        // Send to stream handler
        await this.streamHandler.handleProgress(progress);
      },
      onLog: (message, level) => {
        console.log(`[${sessionId}] [${level}] ${message}`);
      }
    });

    // Mark session as completed
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.status = result.status;
      session.endTime = Date.now();
      session.cost = result.cost;
    }

    return result;
  }

  private async updateDashboard(update: StreamUpdate) {
    // Update web dashboard, database, etc.
    const dashboardData = {
      timestamp: update.timestamp,
      type: update.type,
      content: this.sanitizeContent(update.content),
      metadata: update.metadata,
      activeSessions: Array.from(this.activeSessions.entries()).map(([id, session]) => ({
        sessionId: id,
        agentType: session.agentType,
        status: session.status,
        progress: session.progress,
        runtime: Date.now() - session.startTime
      }))
    };

    // Send to WebSocket clients, REST API, etc.
    this.broadcastToClients(dashboardData);
  }

  private async handleErrorAlert(update: StreamUpdate) {
    if (update.type === 'error') {
      const alert = {
        severity: 'high',
        timestamp: update.timestamp,
        message: update.content.message,
        context: update.content.context,
        sessionIds: Array.from(this.activeSessions.keys())
      };

      // Send to alerting system
      console.error('🚨 ALERT:', alert);
      await this.sendAlert(alert);
    }
  }

  private async trackPerformance(update: StreamUpdate) {
    if (update.type === 'tool_result') {
      const metrics = {
        tool: update.content.tool,
        duration: update.content.duration,
        success: update.content.status === 'completed',
        timestamp: update.timestamp,
        sessionCount: this.activeSessions.size
      };

      // Store metrics for analysis
      await this.storeMetrics(metrics);
    }
  }

  private sanitizeContent(content: any): any {
    // Remove sensitive information from content before broadcasting
    if (typeof content === 'string') {
      return content.replace(/password[=:]\s*\S+/gi, 'password=***');
    }
    return content;
  }

  private broadcastToClients(data: any) {
    // WebSocket broadcast implementation
    console.log('📊 Dashboard Update:', {
      type: data.type,
      activeSessions: data.activeSessions.length,
      timestamp: data.timestamp
    });
  }

  private async sendAlert(alert: any) {
    // Integration with alerting systems (PagerDuty, Slack, etc.)
    console.log('🚨 Sending alert to monitoring system:', alert);
  }

  private async storeMetrics(metrics: any) {
    // Store in time-series database for analysis
    console.log('📈 Storing metrics:', metrics);
  }

  getStatistics() {
    const stats = this.streamHandler.getStatistics();
    return {
      streamStats: stats,
      activeSessions: this.activeSessions.size,
      sessionDetails: Array.from(this.activeSessions.entries())
    };
  }
}

// Usage
const dashboard = new AgentMonitoringDashboard();
dashboard.startMonitoring('system-health', {
  ai_analysis_depth: 'comprehensive',
  include_docker: true
});
```

## Hook System Examples

### Security and Compliance Hooks

```typescript
import { HookManager } from './lib/agents';

class SecurityAuditHooks {
  private auditLog: any[] = [];
  private complianceViolations: any[] = [];

  createSecurityHooks(): AgentHooks {
    return {
      preToolUse: [
        this.createCommandAuditHook(),
        this.createComplianceHook(),
        this.createResourceLimitHook()
      ],
      postToolUse: [
        this.createResultAuditHook(),
        this.createDataClassificationHook()
      ],
      onError: this.createSecurityErrorHandler(),
      onComplete: this.createComplianceReportHook()
    };
  }

  private createCommandAuditHook() {
    return async (toolName: string, input: any) => {
      const auditEntry = {
        timestamp: new Date().toISOString(),
        tool: toolName,
        command: input.command || input,
        user: process.env.USER || 'unknown',
        sessionId: input.sessionId,
        riskLevel: this.assessRiskLevel(toolName, input)
      };

      this.auditLog.push(auditEntry);

      // Block high-risk commands
      if (auditEntry.riskLevel === 'high') {
        console.warn('🔒 High-risk command blocked:', auditEntry.command);
        return false;
      }

      // Log medium-risk commands for review
      if (auditEntry.riskLevel === 'medium') {
        console.warn('⚠️ Medium-risk command logged:', auditEntry.command);
      }

      return true;
    };
  }

  private createComplianceHook() {
    return async (toolName: string, input: any) => {
      // Check against compliance policies (SOX, HIPAA, etc.)
      const violations = this.checkComplianceViolations(toolName, input);
      
      if (violations.length > 0) {
        this.complianceViolations.push(...violations);
        
        // Block critical violations
        const criticalViolations = violations.filter(v => v.severity === 'critical');
        if (criticalViolations.length > 0) {
          console.error('🚫 Compliance violation blocked:', criticalViolations);
          return false;
        }
      }

      return true;
    };
  }

  private createResourceLimitHook() {
    return async (toolName: string, input: any) => {
      // Check resource limits
      if (toolName === 'Bash') {
        const command = input.command;
        
        // Prevent resource-intensive operations
        if (this.isResourceIntensive(command)) {
          const currentLoad = await this.checkSystemLoad();
          if (currentLoad > 0.8) {
            console.warn('🚫 System under high load, blocking resource-intensive operation');
            return false;
          }
        }
      }

      return true;
    };
  }

  private createResultAuditHook() {
    return async (toolName: string, input: any, result: any) => {
      // Audit results for sensitive data
      const sensitivePatterns = [
        /password[=:]\s*\S+/gi,
        /api[_-]?key[=:]\s*\S+/gi,
        /secret[=:]\s*\S+/gi,
        /token[=:]\s*\S+/gi,
        /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g  // Credit card pattern
      ];

      const resultString = JSON.stringify(result);
      const foundSensitive = sensitivePatterns.some(pattern => pattern.test(resultString));

      if (foundSensitive) {
        console.warn('🔐 Sensitive data detected in tool result');
        this.auditLog.push({
          timestamp: new Date().toISOString(),
          tool: toolName,
          event: 'sensitive_data_detected',
          hash: this.hashResult(result)
        });
      }
    };
  }

  private createDataClassificationHook() {
    return async (toolName: string, input: any, result: any) => {
      // Classify data based on content
      const classification = this.classifyData(result);
      
      if (classification.level === 'confidential' || classification.level === 'restricted') {
        console.log(`🏷️ Data classified as ${classification.level}: ${classification.reason}`);
        
        // Apply appropriate handling
        await this.applyDataHandlingPolicies(classification, result);
      }
    };
  }

  private createSecurityErrorHandler() {
    return async (error: AgentError, context: ErrorContext) => {
      // Enhanced error handling for security events
      if (this.isSecurityError(error)) {
        console.error('🔒 Security error detected:', {
          type: error.type,
          message: error.message,
          context: context.agentType,
          executionId: context.executionId
        });

        // Immediate security response
        await this.triggerSecurityResponse(error, context);
        
        return { action: 'abort', message: 'Security policy violation' };
      }

      // Default error handling
      return { action: 'continue' };
    };
  }

  private createComplianceReportHook() {
    return async (result: BaseAgentResult) => {
      // Generate compliance report
      const report = {
        executionId: result.executionId,
        agentType: result.agentType,
        timestamp: result.timestamp,
        auditEntries: this.auditLog.length,
        complianceViolations: this.complianceViolations.length,
        riskAssessment: this.calculateRiskScore(),
        classification: 'standard'  // or 'sensitive', 'confidential'
      };

      console.log('📋 Compliance Report Generated:', report);
      await this.saveComplianceReport(report);

      // Reset for next execution
      this.auditLog = [];
      this.complianceViolations = [];
    };
  }

  // Helper methods
  private assessRiskLevel(toolName: string, input: any): 'low' | 'medium' | 'high' {
    if (toolName === 'Bash') {
      const command = input.command || '';
      
      // High-risk patterns
      const highRisk = [
        /rm.*-rf/,
        /dd.*if=/,
        /mkfs/,
        /fdisk/,
        /passwd/,
        /sudo.*su/
      ];

      // Medium-risk patterns
      const mediumRisk = [
        /chmod.*777/,
        /wget.*\|.*sh/,
        /curl.*\|.*sh/,
        /systemctl.*stop/
      ];

      if (highRisk.some(pattern => pattern.test(command))) return 'high';
      if (mediumRisk.some(pattern => pattern.test(command))) return 'medium';
    }

    return 'low';
  }

  private checkComplianceViolations(toolName: string, input: any): any[] {
    const violations = [];

    // Example compliance checks
    if (toolName === 'Read' && input.file_path?.includes('/etc/passwd')) {
      violations.push({
        policy: 'PCI-DSS',
        rule: 'No access to sensitive system files',
        severity: 'high',
        file: input.file_path
      });
    }

    return violations;
  }

  private isResourceIntensive(command: string): boolean {
    const intensivePatterns = [
      /find.*\/.*-name/,  // Filesystem searches
      /grep.*-r.*\//,     // Recursive greps
      /tar.*-c/,          // Archive creation
      /rsync/,            // Large file transfers
      /dd.*bs=.*count=/   // Disk operations
    ];

    return intensivePatterns.some(pattern => pattern.test(command));
  }

  private async checkSystemLoad(): Promise<number> {
    // Check system load average
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('uptime');
      const loadMatch = stdout.match(/load averages?: ([0-9.]+)/);
      return loadMatch ? parseFloat(loadMatch[1]) : 0;
    } catch {
      return 0;
    }
  }

  private classifyData(result: any): { level: string; reason: string } {
    const resultString = JSON.stringify(result);
    
    if (/password|secret|key|token/i.test(resultString)) {
      return { level: 'confidential', reason: 'Contains authentication data' };
    }
    
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(resultString)) {
      return { level: 'restricted', reason: 'Contains SSN pattern' };
    }
    
    return { level: 'public', reason: 'No sensitive data detected' };
  }

  private hashResult(result: any): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(JSON.stringify(result)).digest('hex');
  }

  private isSecurityError(error: AgentError): boolean {
    const securityPatterns = [
      /permission denied/i,
      /access denied/i,
      /unauthorized/i,
      /authentication failed/i,
      /security violation/i
    ];

    return securityPatterns.some(pattern => pattern.test(error.message));
  }

  private async triggerSecurityResponse(error: AgentError, context: ErrorContext) {
    // Implement security incident response
    console.log('🚨 Triggering security incident response');
  }

  private calculateRiskScore(): number {
    // Calculate overall risk score based on audit log
    return this.auditLog.filter(entry => entry.riskLevel === 'high').length * 10 +
           this.auditLog.filter(entry => entry.riskLevel === 'medium').length * 5;
  }

  private async applyDataHandlingPolicies(classification: any, result: any) {
    // Apply data handling policies based on classification
    if (classification.level === 'confidential') {
      // Encrypt, redact, or apply special handling
      console.log('🔒 Applying confidential data policies');
    }
  }

  private async saveComplianceReport(report: any) {
    // Save compliance report to audit system
    console.log('💾 Saving compliance report to audit system');
  }
}

// Usage
const securityHooks = new SecurityAuditHooks();
const agent = AgentFactory.create('system-health');

const result = await agent.execute({
  ai_analysis_depth: 'detailed',
  hooks: securityHooks.createSecurityHooks()
});
```

## Migration Examples

### Migrating from Legacy Agent

**Before (Legacy Pattern):**

```typescript
// Old agent implementation
class LegacySystemHealthAgent {
  async executeHealthCheck(options: any = {}) {
    const executionId = Math.random().toString(36);
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      // Manual prompt building
      const prompt = `
        Analyze system health with the following configuration:
        - Include Docker: ${options.include_docker || false}
        - Security Scan: ${options.include_security_scan || false}
        
        Use bash commands to investigate the system and provide recommendations.
      `;

      // Manual Claude SDK integration
      const claudeQuery = query({
        prompt,
        options: {
          maxTurns: options.maxTurns || 50,
          permissionMode: 'acceptEdits',
          allowedTools: ['Bash', 'Read', 'Grep']
        }
      });

      let result = '';
      let totalCost = 0;
      
      // Manual message processing
      for await (const message of claudeQuery) {
        if (message.type === 'assistant') {
          // Basic message handling
          const content = message.message.content;
          if (typeof content === 'string') {
            result = content;
          }
        } else if (message.type === 'result') {
          if (message.subtype === 'success') {
            totalCost = message.total_cost_usd;
          } else {
            throw new Error(`Claude error: ${message.subtype}`);
          }
          break;
        }
      }

      return {
        executionId,
        result,
        cost: totalCost,
        duration: Date.now() - startTime,
        logs,
        status: 'completed'
      };

    } catch (error) {
      // Basic error handling
      logs.push(`Error: ${error.message}`);
      return {
        executionId,
        result: '',
        cost: 0,
        duration: Date.now() - startTime,
        logs,
        status: 'failed',
        error: error.message
      };
    }
  }
}
```

**After (Framework Pattern):**

```typescript
import { BaseAgent } from './lib/agents/core/BaseAgent';
import type { BaseAgentOptions, AgentConfig } from './lib/agents/core/types';

interface SystemHealthOptions extends BaseAgentOptions {
  include_docker?: boolean;
  include_security_scan?: boolean;
  ai_analysis_depth?: 'basic' | 'detailed' | 'comprehensive';
}

class ModernSystemHealthAgent extends BaseAgent<SystemHealthOptions> {
  getAgentType(): string {
    return 'system-health';
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Read', 'Grep', 'Glob'];
  }

  buildPrompt(options: SystemHealthOptions): string {
    return `
Analyze system health with the following configuration:
- Include Docker: ${options.include_docker || false}
- Security Scan: ${options.include_security_scan || false}
- Analysis Depth: ${options.ai_analysis_depth || 'detailed'}

Use systematic investigation to:
1. Check system resources and performance
2. Analyze service health and configurations
3. Identify security issues and vulnerabilities
4. Provide specific, actionable recommendations

Format your response with clear sections and priority levels.
    `;
  }

  getSystemPrompt(): string {
    return `
You are an expert system administrator with deep knowledge of:
- System performance analysis and optimization
- Security assessment and hardening
- Service configuration and troubleshooting
- Infrastructure monitoring and alerting

Provide evidence-based analysis with specific commands and recommendations.
    `;
  }

  getConfig(): AgentConfig {
    return {
      name: 'Modern System Health Agent',
      version: '2.0.0',
      description: 'Framework-powered system health analysis',
      defaultOptions: {
        timeout_ms: 300000,
        maxTurns: 50,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'System performance analysis',
        'Security vulnerability assessment',
        'Service health monitoring',
        'Automated recommendations'
      ],
      requiredTools: ['Bash'],
      optionalTools: ['Read', 'Grep', 'Glob'],
      typicalExecutionTime: 120000,
      costEstimate: { min: 0.10, max: 2.00, typical: 0.50 }
    };
  }

  // Custom error handling for system-specific issues
  protected async handleAgentSpecificError(error: any, context: any) {
    if (error.message.includes('journalctl: command not found')) {
      return {
        action: 'continue',
        message: 'Non-systemd system detected, using traditional log files'
      };
    }
    return super.handleAgentSpecificError(error, context);
  }
}

// Usage comparison
// Legacy:
// const agent = new LegacySystemHealthAgent();
// const result = await agent.executeHealthCheck({ include_docker: true });

// Modern:
const agent = new ModernSystemHealthAgent();
const result = await agent.execute({
  include_docker: true,
  include_security_scan: true,
  ai_analysis_depth: 'comprehensive',
  onProgress: (progress) => console.log(`Progress: ${progress.message}`),
  hooks: {
    onComplete: async (result) => console.log(`Completed: ${result.summary}`)
  }
});
```

### Migration Steps

1. **Replace manual SDK calls** with BaseAgent extension
2. **Move prompt logic** to `buildPrompt()` and `getSystemPrompt()`
3. **Define agent metadata** in `getConfig()`
4. **Add tool configuration** in `getAllowedTools()`
5. **Implement error handling** with `handleAgentSpecificError()`
6. **Add hooks and callbacks** for monitoring and integration
7. **Test thoroughly** with the new framework features

### Benefits After Migration

- **Automatic error handling** with retry logic and recovery
- **Session persistence** for long-running operations
- **Real-time streaming** and progress updates
- **Hook system** for extensibility and monitoring
- **Type safety** with proper TypeScript integration
- **Standardized logging** and metrics collection
- **Production-ready** security and compliance features

## Testing Agents

### Unit Testing

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { MyCustomAgent } from './MyCustomAgent';

describe('MyCustomAgent', () => {
  let agent: MyCustomAgent;
  
  beforeEach(() => {
    agent = new MyCustomAgent();
  });

  it('should have correct agent type', () => {
    expect(agent.getAgentType()).toBe('my-custom-agent');
  });

  it('should define required tools', () => {
    const tools = agent.getAllowedTools();
    expect(tools).toContain('Bash');
    expect(tools).toContain('Read');
  });

  it('should build appropriate prompt', () => {
    const options = {
      analysisDepth: 'comprehensive',
      includeNetworkScan: true
    };
    
    const prompt = agent.buildPrompt(options);
    expect(prompt).toContain('comprehensive analysis');
    expect(prompt).toContain('Network connectivity tests');
  });

  it('should handle permission errors gracefully', async () => {
    const error = {
      type: 'permission_denied' as const,
      message: 'Permission denied accessing /var/log'
    };
    
    const context = {
      executionId: 'test-123',
      agentType: 'my-custom-agent',
      currentTurn: 5,
      totalCost: 0.25,
      timeElapsed: 30000
    };

    const recovery = await agent['handleAgentSpecificError'](error, context);
    expect(recovery.action).toBe('continue');
    expect(recovery.message).toContain('reduced');
  });

  it('should provide valid configuration', () => {
    const config = agent.getConfig();
    expect(config.name).toBeTruthy();
    expect(config.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(config.capabilities).toBeInstanceOf(Array);
    expect(config.costEstimate.typical).toBeGreaterThan(0);
  });
});
```

### Integration Testing

```typescript
import { AgentFactory, SessionManager } from './lib/agents';

describe('Agent Integration Tests', () => {
  let sessionManager: SessionManager;
  
  beforeEach(() => {
    sessionManager = new SessionManager('./test-sessions');
  });

  afterEach(async () => {
    // Clean up test sessions
    const sessions = await sessionManager.listSessions();
    for (const session of sessions) {
      await sessionManager.deleteSession(session.sessionId);
    }
  });

  it('should execute agent with session management', async () => {
    const agent = AgentFactory.create('system-health');
    
    const sessionId = await sessionManager.createSession(
      'system-health',
      'test-execution',
      { maxTurns: 10, timeout_ms: 60000 }
    );

    const result = await agent.execute({
      sessionId,
      ai_analysis_depth: 'basic',
      maxTurns: 10,
      timeout_ms: 60000
    });

    expect(result.status).toBe('completed');
    expect(result.sessionId).toBe(sessionId);
    expect(result.cost).toBeGreaterThan(0);
    expect(result.duration).toBeGreaterThan(0);

    // Verify session was saved
    const session = await sessionManager.loadSession(sessionId);
    expect(session).toBeTruthy();
    expect(session?.agentType).toBe('system-health');
  });

  it('should handle errors and maintain session state', async () => {
    const agent = AgentFactory.create('system-health');
    
    // Mock an error scenario
    const mockAgent = jest.spyOn(agent, 'execute').mockRejectedValueOnce(
      new Error('Test timeout error')
    );

    const sessionId = await sessionManager.createSession(
      'system-health',
      'test-error',
      { maxTurns: 5 }
    );

    await expect(agent.execute({ sessionId })).rejects.toThrow('Test timeout error');

    // Session should still exist for recovery
    const session = await sessionManager.loadSession(sessionId);
    expect(session).toBeTruthy();

    mockAgent.mockRestore();
  });

  it('should support session resumption', async () => {
    const agent = AgentFactory.create('system-health');
    
    // Create initial session
    const sessionId = await sessionManager.createSession(
      'system-health',
      'test-resume',
      { maxTurns: 20, ai_analysis_depth: 'detailed' }
    );

    // Add some checkpoints
    await sessionManager.addCheckpoint(5, 0.25, {
      stage: 'investigating',
      message: 'Halfway through analysis',
      currentTurn: 5,
      maxTurns: 20,
      toolsUsed: ['Bash'],
      cost: 0.25
    });

    // Resume session
    const { session, resumeFromCheckpoint } = await sessionManager.resumeSession(sessionId);
    
    expect(session.sessionId).toBe(sessionId);
    expect(resumeFromCheckpoint).toBeTruthy();
    expect(resumeFromCheckpoint?.turn).toBe(5);
    expect(session.options.ai_analysis_depth).toBe('detailed');

    // Continue execution
    const result = await agent.execute({
      ...session.options,
      sessionId
    });

    expect(result.status).toBe('completed');
  });
});
```

### Performance Testing

```typescript
describe('Agent Performance Tests', () => {
  it('should complete within expected time limits', async () => {
    const agent = AgentFactory.create('system-health');
    const startTime = Date.now();
    
    const result = await agent.execute({
      ai_analysis_depth: 'basic',
      maxTurns: 20,
      timeout_ms: 120000  // 2 minutes
    });
    
    const duration = Date.now() - startTime;
    
    expect(result.status).toBe('completed');
    expect(duration).toBeLessThan(120000);  // Should finish within timeout
    expect(result.cost).toBeLessThan(1.00);  // Should be cost-effective
  });

  it('should handle concurrent executions', async () => {
    const agent1 = AgentFactory.create('system-health');
    const agent2 = AgentFactory.create('system-health');
    
    const promises = [
      agent1.execute({ ai_analysis_depth: 'basic', maxTurns: 10 }),
      agent2.execute({ ai_analysis_depth: 'basic', maxTurns: 10 })
    ];
    
    const results = await Promise.all(promises);
    
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('completed');
    expect(results[1].status).toBe('completed');
    expect(results[0].executionId).not.toBe(results[1].executionId);
  });

  it('should respect cost limits', async () => {
    const agent = AgentFactory.create('system-health');
    
    const result = await agent.execute({
      ai_analysis_depth: 'basic',
      maxTurns: 5,  // Keep it short
      costLimit: 0.10,  // Low cost limit
      timeout_ms: 60000
    });
    
    // Should either complete under budget or stop due to cost limit
    expect(result.cost).toBeLessThanOrEqual(0.15);  // Small buffer for completion
  });
});
```

This comprehensive examples document provides practical patterns for using the Agent Framework in real-world scenarios. Each example builds on the framework's capabilities to show how to create robust, production-ready agents with proper error handling, monitoring, and security considerations.