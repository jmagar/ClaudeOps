import { SystemCollector } from './collectors/systemCollector';
import { DockerCollector } from './collectors/dockerCollector';
import { ServiceCollector } from './collectors/serviceCollector';
import { HealthAnalyzer } from './analyzers/healthAnalyzer';
import { 
  SystemHealthData,
  AgentExecutionContext,
  AgentExecutionOptions,
  AgentResult,
  HealthAnalysisInput,
  SystemCollectorResult,
  DockerCollectorResult,
  ServiceCollectorResult
} from '../types/agent';
import { createId } from '@paralleldrive/cuid2';

/**
 * System Health Reporter Agent
 * 
 * Provides comprehensive system analysis including:
 * - CPU, memory, disk, and network monitoring
 * - Docker container monitoring  
 * - System service health checks
 * - Security audit and vulnerability scanning
 * - AI-powered analysis and recommendations
 * - Trend detection and predictive insights
 */
export class SystemHealthAgent {
  private systemCollector: SystemCollector;
  private dockerCollector: DockerCollector;
  private serviceCollector: ServiceCollector;
  private healthAnalyzer: HealthAnalyzer;

  constructor() {
    this.systemCollector = new SystemCollector();
    this.dockerCollector = new DockerCollector();
    this.serviceCollector = new ServiceCollector();
    this.healthAnalyzer = new HealthAnalyzer();
  }

  /**
   * Execute system health analysis
   */
  async execute(options: AgentExecutionOptions = {}): Promise<AgentResult> {
    const executionId = createId();
    const startTime = Date.now();
    
    const context: AgentExecutionContext = {
      execution_id: executionId,
      agent_type: 'system-health',
      started_at: new Date().toISOString(),
      options: {
        timeout_ms: 300000, // 5 minutes default
        max_retries: 2,
        include_docker: true,
        include_security_scan: true,
        detailed_service_analysis: true,
        historical_comparison_days: 7,
        ai_analysis_depth: 'detailed',
        ...options
      }
    };

    const logs: string[] = [];
    
    try {
      logs.push(`[${new Date().toISOString()}] Starting system health analysis`);
      logs.push(`[${new Date().toISOString()}] Execution ID: ${executionId}`);
      logs.push(`[${new Date().toISOString()}] Options: ${JSON.stringify(context.options, null, 2)}`);

      // Collect system metrics
      logs.push(`[${new Date().toISOString()}] Collecting system metrics...`);
      const systemMetrics = await this.collectSystemMetrics(logs);

      // Collect Docker metrics if enabled
      let dockerMetrics: DockerCollectorResult | undefined;
      if (context.options.include_docker) {
        logs.push(`[${new Date().toISOString()}] Collecting Docker metrics...`);
        dockerMetrics = await this.collectDockerMetrics(logs);
      }

      // Collect service metrics
      logs.push(`[${new Date().toISOString()}] Collecting service metrics...`);
      const serviceMetrics = await this.collectServiceMetrics(logs);

      // Prepare analysis input
      const analysisInput: HealthAnalysisInput = {
        system_metrics: systemMetrics,
        docker_metrics: dockerMetrics,
        service_metrics: serviceMetrics
      };

      // Perform AI analysis
      logs.push(`[${new Date().toISOString()}] Performing AI-powered health analysis...`);
      const healthAnalysis = await this.healthAnalyzer.analyzeHealth(
        analysisInput,
        context,
        logs
      );

      // Compile final health report
      logs.push(`[${new Date().toISOString()}] Compiling health report...`);
      const healthReport = this.compileHealthReport(
        systemMetrics,
        dockerMetrics,
        serviceMetrics,
        healthAnalysis,
        executionId
      );

      // Calculate execution metrics
      const duration = Date.now() - startTime;
      logs.push(`[${new Date().toISOString()}] Analysis completed in ${duration}ms`);
      logs.push(`[${new Date().toISOString()}] Overall health: ${healthReport.overall_health}`);
      logs.push(`[${new Date().toISOString()}] Health score: ${healthReport.ai_analysis.health_score}/100`);

      return {
        executionId,
        agentType: 'system-health',
        status: 'completed',
        result: JSON.stringify(healthReport, null, 2),
        cost: healthReport.cost_breakdown.execution_cost_usd,
        duration,
        usage: healthReport.cost_breakdown.tokens_used,
        logs,
        timestamp: new Date().toISOString(),
        summary: this.generateExecutionSummary(healthReport)
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logs.push(`[${new Date().toISOString()}] ERROR: ${errorMessage}`);
      
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

  /**
   * Execute using Claude SDK integration (placeholder for future implementation)
   */
  async executeWithSDK(prompt: string, options: AgentExecutionOptions = {}): Promise<AgentResult> {
    // This will be implemented when Claude SDK integration is available
    // For now, fallback to local execution
    return this.execute(options);
  }

  /**
   * Get agent capability information
   */
  getCapabilities(): Record<string, any> {
    return {
      name: 'System Health Reporter',
      version: '1.0.0',
      description: 'Comprehensive system health monitoring and analysis agent',
      capabilities: [
        'CPU, Memory, Disk, Network monitoring',
        'Docker container analysis',
        'System service health checks',
        'Security vulnerability scanning',
        'AI-powered trend analysis',
        'Predictive health insights',
        'Automated recommendations'
      ],
      estimated_cost_per_run: 0.05,
      typical_execution_time_ms: 60000,
      outputs: [
        'System metrics',
        'Health score (0-100)',
        'AI analysis and recommendations',
        'Security audit results',
        'Performance trends',
        'Critical alerts'
      ]
    };
  }

  // Private methods

  private async collectSystemMetrics(logs: string[]): Promise<SystemCollectorResult> {
    try {
      const metrics = await this.systemCollector.collectSystemInfo();
      logs.push(`[${new Date().toISOString()}] System metrics collected: CPU ${metrics.cpu.usage_percent.toFixed(1)}%, Memory ${metrics.memory.usage_percent.toFixed(1)}%, Disk ${metrics.disk.usage_percent.toFixed(1)}%`);
      return metrics;
    } catch (error) {
      const errorMsg = `Failed to collect system metrics: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logs.push(`[${new Date().toISOString()}] ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  private async collectDockerMetrics(logs: string[]): Promise<DockerCollectorResult> {
    try {
      const dockerInfo = await this.dockerCollector.collectDockerInfo();
      if (dockerInfo.available && dockerInfo.metrics) {
        logs.push(`[${new Date().toISOString()}] Docker metrics collected: ${dockerInfo.metrics.total_containers} containers (${dockerInfo.metrics.running_containers} running)`);
      } else {
        logs.push(`[${new Date().toISOString()}] Docker not available or accessible`);
      }
      return dockerInfo;
    } catch (error) {
      const errorMsg = `Failed to collect Docker metrics: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logs.push(`[${new Date().toISOString()}] WARNING: ${errorMsg}`);
      
      return {
        available: false,
        error: errorMsg,
        timestamp: new Date().toISOString()
      };
    }
  }

  private async collectServiceMetrics(logs: string[]): Promise<ServiceCollectorResult> {
    try {
      const serviceInfo = await this.serviceCollector.collectServiceHealth();
      logs.push(`[${new Date().toISOString()}] Service metrics collected: ${serviceInfo.system_services_count} total services (${serviceInfo.failed_services_count} failed)`);
      return serviceInfo;
    } catch (error) {
      const errorMsg = `Failed to collect service metrics: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logs.push(`[${new Date().toISOString()}] ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  private compileHealthReport(
    systemMetrics: SystemCollectorResult,
    dockerMetrics: DockerCollectorResult | undefined,
    serviceMetrics: ServiceCollectorResult,
    healthAnalysis: any,
    executionId: string
  ): SystemHealthData {
    return {
      timestamp: new Date().toISOString(),
      overall_health: healthAnalysis.overall_health || 'warning',
      metrics: {
        cpu_usage: systemMetrics.cpu,
        memory_usage: systemMetrics.memory,
        disk_usage: systemMetrics.disk,
        network: systemMetrics.network,
        services: serviceMetrics.services,
        security: systemMetrics.security,
        docker_containers: dockerMetrics?.metrics
      },
      ai_analysis: healthAnalysis.ai_analysis || {
        summary: 'System analysis completed',
        recommendations: [],
        trends: [],
        alerts: [],
        health_score: 85,
        priority_actions: []
      },
      cost_breakdown: {
        execution_cost_usd: healthAnalysis.cost || 0.00,
        tokens_used: healthAnalysis.usage || {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_tokens: 0,
          cache_read_tokens: 0
        },
        model_used: healthAnalysis.model_used || 'claude-3-5-sonnet-20241022',
        execution_duration_ms: healthAnalysis.duration || 0,
        cost_per_minute_usd: 0.001
      }
    };
  }

  private generateExecutionSummary(healthReport: SystemHealthData): string {
    const health = healthReport.overall_health;
    const score = healthReport.ai_analysis.health_score;
    const alertCount = healthReport.ai_analysis.alerts.length;
    const recommendationCount = healthReport.ai_analysis.recommendations.length;
    
    return `System Health: ${health.toUpperCase()} (${score}/100) - ${alertCount} alerts, ${recommendationCount} recommendations`;
  }

  private buildAnalysisPrompt(userPrompt: string, options: AgentExecutionOptions): string {
    return `
System Health Analysis Request:
${userPrompt}

Analysis Configuration:
- Include Docker: ${options.include_docker ? 'Yes' : 'No'}
- Include Security Scan: ${options.include_security_scan ? 'Yes' : 'No'}
- Service Analysis: ${options.detailed_service_analysis ? 'Detailed' : 'Basic'}
- AI Analysis Depth: ${options.ai_analysis_depth || 'detailed'}

Please perform a comprehensive system health analysis and provide:
1. Current system metrics and status
2. Health assessment with scoring
3. Actionable recommendations
4. Trend analysis where applicable
5. Priority alerts and warnings

Focus on actionable insights and clearly prioritize any critical issues.
`;
  }

  private getSystemPrompt(): string {
    return `
You are a System Health Reporter agent specializing in comprehensive system monitoring and analysis. Your capabilities include:

TECHNICAL EXPERTISE:
- System resource monitoring (CPU, memory, disk, network)
- Docker container ecosystem analysis  
- System service health assessment
- Security vulnerability detection
- Performance trend analysis
- Predictive maintenance insights

ANALYSIS APPROACH:
- Collect comprehensive system metrics
- Identify performance bottlenecks and resource constraints
- Detect security vulnerabilities and configuration issues
- Analyze service dependencies and failure patterns
- Provide actionable, prioritized recommendations
- Calculate health scores based on multiple factors

OUTPUT REQUIREMENTS:
- Always provide structured, actionable findings
- Prioritize critical issues requiring immediate attention
- Include specific commands/steps for issue resolution
- Provide context for recommendations (why they matter)
- Use clear severity levels (info, warning, error, critical)
- Include estimated impact and implementation difficulty

SAFETY GUIDELINES:
- Never execute destructive commands
- Always verify system state before recommendations
- Provide rollback plans for significant changes
- Highlight potential risks of recommended actions
- Respect system security and access boundaries
`;
  }
}