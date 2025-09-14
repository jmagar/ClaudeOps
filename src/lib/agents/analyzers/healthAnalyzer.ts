import { 
  HealthAnalysisInput,
  HealthAnalysisResult,
  AgentExecutionContext,
  AIAnalysis,
  Recommendation,
  TrendAnalysis,
  Alert,
  SystemMetrics,
  SystemCollectorResult,
  DockerCollectorResult,
  ServiceCollectorResult
} from '../../types/agent';

/**
 * Health analysis engine for intelligent system analysis
 */
export class HealthAnalyzer {
  constructor() {
    // Future: Initialize with Claude SDK when available
  }

  /**
   * Perform comprehensive health analysis using AI
   */
  async analyzeHealth(
    input: HealthAnalysisInput,
    context: AgentExecutionContext,
    logs: string[]
  ): Promise<HealthAnalysisResult> {
    try {
      logs.push(`[${new Date().toISOString()}] Starting AI-powered health analysis...`);

      // Calculate base health score
      const baseHealthScore = this.calculateBaseHealthScore(input);
      logs.push(`[${new Date().toISOString()}] Base health score calculated: ${baseHealthScore}/100`);

      // Determine overall health status
      const overallHealth = this.determineOverallHealth(input, baseHealthScore);
      logs.push(`[${new Date().toISOString()}] Overall health status: ${overallHealth}`);

      // Identify critical issues
      const criticalIssues = this.identifyCriticalIssues(input);
      logs.push(`[${new Date().toISOString()}] Critical issues identified: ${criticalIssues.length}`);

      // Generate analysis (AI integration placeholder)
      const aiAnalysis = await this.generateAnalysis(input, context, logs);

      return {
        overall_health: overallHealth,
        health_score: baseHealthScore,
        ai_analysis: aiAnalysis,
        critical_issues: criticalIssues,
        warnings: this.identifyWarnings(input),
        recommendations: aiAnalysis.recommendations
      };
    } catch (error) {
      logs.push(`[${new Date().toISOString()}] Health analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      return {
        overall_health: 'warning',
        health_score: 50,
        ai_analysis: this.createFallbackAnalysis(input),
        critical_issues: ['Health analysis failed - manual review required'],
        warnings: ['Unable to perform complete system analysis'],
        recommendations: []
      };
    }
  }

  // Private analysis methods

  private calculateBaseHealthScore(input: HealthAnalysisInput): number {
    let score = 100;
    const penalties: Record<string, number> = {};

    // CPU analysis
    const cpuUsage = input.system_metrics.cpu.usage_percent;
    if (cpuUsage > 90) {
      penalties.cpu_critical = 25;
    } else if (cpuUsage > 75) {
      penalties.cpu_high = 15;
    } else if (cpuUsage > 50) {
      penalties.cpu_medium = 5;
    }

    // Memory analysis
    const memoryUsage = input.system_metrics.memory.usage_percent;
    if (memoryUsage > 95) {
      penalties.memory_critical = 30;
    } else if (memoryUsage > 85) {
      penalties.memory_high = 20;
    } else if (memoryUsage > 70) {
      penalties.memory_medium = 10;
    }

    // Disk analysis
    const diskUsage = input.system_metrics.disk.usage_percent;
    if (diskUsage > 95) {
      penalties.disk_critical = 25;
    } else if (diskUsage > 85) {
      penalties.disk_high = 15;
    } else if (diskUsage > 75) {
      penalties.disk_medium = 8;
    }

    // Service analysis
    const failedServices = input.service_metrics.failed_services_count;
    if (failedServices > 5) {
      penalties.services_critical = 20;
    } else if (failedServices > 2) {
      penalties.services_high = 10;
    } else if (failedServices > 0) {
      penalties.services_medium = 5;
    }

    // Network connectivity
    if (!input.system_metrics.network.internet_connected) {
      penalties.network_critical = 15;
    }

    // Security analysis
    const openPorts = input.system_metrics.security.open_ports.length;
    const securityUpdates = input.system_metrics.security.security_updates_available;
    
    if (securityUpdates > 10) {
      penalties.security_high = 10;
    } else if (securityUpdates > 5) {
      penalties.security_medium = 5;
    }

    if (openPorts > 20) {
      penalties.ports_medium = 5;
    }

    // Docker analysis (if available)
    if (input.docker_metrics?.available && input.docker_metrics.metrics) {
      const runningContainers = input.docker_metrics.metrics.running_containers;
      const totalContainers = input.docker_metrics.metrics.total_containers;
      
      if (totalContainers > 0) {
        const containerHealthRatio = runningContainers / totalContainers;
        if (containerHealthRatio < 0.5) {
          penalties.docker_high = 15;
        } else if (containerHealthRatio < 0.8) {
          penalties.docker_medium = 8;
        }
      }
    }

    // Apply penalties
    const totalPenalty = Object.values(penalties).reduce((sum, penalty) => sum + penalty, 0);
    score = Math.max(0, score - totalPenalty);

    return Math.round(score);
  }

  private determineOverallHealth(
    input: HealthAnalysisInput, 
    healthScore: number
  ): 'healthy' | 'warning' | 'critical' {
    // Check for critical conditions first
    if (
      input.system_metrics.memory.usage_percent > 95 ||
      input.system_metrics.disk.usage_percent > 95 ||
      input.service_metrics.failed_services_count > 5 ||
      healthScore < 30
    ) {
      return 'critical';
    }

    // Check for warning conditions
    if (
      input.system_metrics.cpu.usage_percent > 80 ||
      input.system_metrics.memory.usage_percent > 85 ||
      input.system_metrics.disk.usage_percent > 85 ||
      input.service_metrics.failed_services_count > 0 ||
      !input.system_metrics.network.internet_connected ||
      healthScore < 70
    ) {
      return 'warning';
    }

    return 'healthy';
  }

  private identifyCriticalIssues(input: HealthAnalysisInput): string[] {
    const issues: string[] = [];

    // Memory issues
    if (input.system_metrics.memory.usage_percent > 95) {
      issues.push(`Critical memory usage: ${input.system_metrics.memory.usage_percent.toFixed(1)}%`);
    }

    // Disk issues
    if (input.system_metrics.disk.usage_percent > 95) {
      issues.push(`Critical disk usage: ${input.system_metrics.disk.usage_percent.toFixed(1)}%`);
    }

    // Service failures
    if (input.service_metrics.failed_services_count > 0) {
      issues.push(`${input.service_metrics.failed_services_count} system services have failed`);
    }

    // Network connectivity
    if (!input.system_metrics.network.internet_connected) {
      issues.push('Internet connectivity is unavailable');
    }

    // High load
    const load15min = input.system_metrics.cpu.load_average.fifteen_minutes;
    const coreCount = input.system_metrics.cpu.core_count;
    if (load15min > coreCount * 2) {
      issues.push(`System load is critically high: ${load15min.toFixed(2)} (${coreCount} cores)`);
    }

    // Security updates
    if (input.system_metrics.security.security_updates_available > 10) {
      issues.push(`${input.system_metrics.security.security_updates_available} security updates available`);
    }

    return issues;
  }

  private identifyWarnings(input: HealthAnalysisInput): string[] {
    const warnings: string[] = [];

    // CPU warnings
    if (input.system_metrics.cpu.usage_percent > 75) {
      warnings.push(`High CPU usage: ${input.system_metrics.cpu.usage_percent.toFixed(1)}%`);
    }

    // Memory warnings
    if (input.system_metrics.memory.usage_percent > 80) {
      warnings.push(`High memory usage: ${input.system_metrics.memory.usage_percent.toFixed(1)}%`);
    }

    // Disk warnings
    if (input.system_metrics.disk.usage_percent > 80) {
      warnings.push(`High disk usage: ${input.system_metrics.disk.usage_percent.toFixed(1)}%`);
    }

    // Swap usage
    if (input.system_metrics.memory.swap_usage_percent > 50) {
      warnings.push(`High swap usage: ${input.system_metrics.memory.swap_usage_percent.toFixed(1)}%`);
    }

    // Open ports
    if (input.system_metrics.security.open_ports.length > 15) {
      warnings.push(`Many open ports detected: ${input.system_metrics.security.open_ports.length}`);
    }

    // Docker warnings
    if (input.docker_metrics?.available && input.docker_metrics.metrics) {
      const dockerMetrics = input.docker_metrics.metrics;
      if (dockerMetrics.total_containers > dockerMetrics.running_containers + dockerMetrics.stopped_containers) {
        warnings.push('Some containers are in an unknown state');
      }
    }

    return warnings;
  }

  private async generateAnalysis(
    input: HealthAnalysisInput,
    context: AgentExecutionContext,
    logs: string[]
  ): Promise<AIAnalysis> {
    try {
      logs.push(`[${new Date().toISOString()}] Generating analysis with depth: ${context.options.ai_analysis_depth}`);

      // For now, use rule-based analysis
      // Future: Integrate with Claude SDK for AI-powered insights
      return this.createRuleBasedAnalysis(input);
    } catch (error) {
      logs.push(`[${new Date().toISOString()}] Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return this.createFallbackAnalysis(input);
    }
  }

  private buildAnalysisPrompt(input: HealthAnalysisInput, context: AgentExecutionContext): string {
    const depth = context.options.ai_analysis_depth || 'detailed';
    
    return `
Please analyze the following system health data and provide comprehensive insights:

SYSTEM METRICS:
- CPU Usage: ${input.system_metrics.cpu.usage_percent.toFixed(1)}% (${input.system_metrics.cpu.core_count} cores)
- Load Average: ${input.system_metrics.cpu.load_average.one_minute.toFixed(2)}, ${input.system_metrics.cpu.load_average.five_minutes.toFixed(2)}, ${input.system_metrics.cpu.load_average.fifteen_minutes.toFixed(2)}
- Memory Usage: ${input.system_metrics.memory.usage_percent.toFixed(1)}% (${input.system_metrics.memory.used_gb.toFixed(1)}GB / ${input.system_metrics.memory.total_gb.toFixed(1)}GB)
- Disk Usage: ${input.system_metrics.disk.usage_percent.toFixed(1)}% (${input.system_metrics.disk.used_space_gb.toFixed(1)}GB / ${input.system_metrics.disk.total_space_gb.toFixed(1)}GB)
- Swap Usage: ${input.system_metrics.memory.swap_usage_percent.toFixed(1)}%

NETWORK STATUS:
- Internet Connected: ${input.system_metrics.network.internet_connected ? 'Yes' : 'No'}
- DNS Resolution: Google ${input.system_metrics.network.dns_resolution.google_dns ? 'OK' : 'Failed'}, Cloudflare ${input.system_metrics.network.dns_resolution.cloudflare_dns ? 'OK' : 'Failed'}

SERVICES:
- Total Services: ${input.service_metrics.system_services_count}
- Failed Services: ${input.service_metrics.failed_services_count}
- Service Issues: ${input.service_metrics.services.filter(s => s.status === 'failed').map(s => s.name).join(', ') || 'None'}

SECURITY:
- Open Ports: ${input.system_metrics.security.open_ports.length}
- Security Updates Available: ${input.system_metrics.security.security_updates_available}
- Firewall Status: ${input.system_metrics.security.firewall_status}

${input.docker_metrics?.available ? `
DOCKER STATUS:
- Total Containers: ${input.docker_metrics.metrics?.total_containers || 0}
- Running Containers: ${input.docker_metrics.metrics?.running_containers || 0}
- Docker Disk Usage: ${input.docker_metrics.metrics?.disk_usage_gb?.toFixed(1) || 0}GB
` : 'DOCKER: Not available or not accessible'}

ANALYSIS REQUEST:
Analysis Depth: ${depth}
Focus Areas: ${context.options.include_security_scan ? 'Include security analysis' : 'Basic analysis'}, ${context.options.detailed_service_analysis ? 'detailed service analysis' : 'basic service analysis'}

Please provide:
1. A comprehensive summary of system health
2. Specific actionable recommendations prioritized by impact and urgency
3. Trend analysis based on current metrics
4. Alert identification with severity levels
5. Health score justification (0-100)
6. Priority actions that should be taken immediately

Format the response as a JSON object with the following structure:
{
  "summary": "Overall system health assessment",
  "health_score": 85,
  "recommendations": [
    {
      "category": "performance|security|maintenance|cost_optimization|monitoring",
      "priority": "low|medium|high|critical", 
      "title": "Recommendation title",
      "description": "Detailed description",
      "action_items": ["Specific action 1", "Specific action 2"],
      "estimated_impact": "low|medium|high",
      "implementation_difficulty": "easy|moderate|hard"
    }
  ],
  "trends": [
    {
      "metric": "CPU usage",
      "trend": "improving|stable|degrading|volatile",
      "timeframe": "Current observation",
      "current_value": 45.2,
      "analysis": "Trend explanation"
    }
  ],
  "alerts": [
    {
      "level": "info|warning|error|critical",
      "category": "performance|security|maintenance",
      "message": "Alert message",
      "affected_component": "CPU|Memory|Disk|Network|Services",
      "recommended_action": "Specific action to take",
      "urgency": "low|medium|high|immediate",
      "auto_resolvable": true|false
    }
  ],
  "priority_actions": ["Action 1", "Action 2", "Action 3"]
}
`;
  }

  private getAnalysisSystemPrompt(): string {
    return `
You are an expert system administrator and infrastructure monitoring specialist. You analyze system health data to provide actionable insights and recommendations.

ANALYSIS PRINCIPLES:
- Prioritize critical issues that could cause system failures
- Consider resource trends and usage patterns
- Factor in security implications of system state  
- Provide specific, actionable recommendations
- Balance system performance with stability and security
- Consider the interconnections between system components

RECOMMENDATION GUIDELINES:
- Make recommendations specific and actionable
- Include exact commands or configuration changes when appropriate
- Consider the impact and difficulty of implementation
- Prioritize based on urgency and business impact
- Provide alternative solutions when possible

SEVERITY ASSESSMENT:
- Critical: Immediate system failure risk or security breach
- High: Significant performance degradation or security risk
- Medium: Performance concerns or minor security issues
- Low: Optimization opportunities or preventive measures

OUTPUT FORMAT:
Always respond with valid JSON matching the requested structure. Be precise with metrics and practical with recommendations.
`;
  }

  private createRuleBasedAnalysis(input: HealthAnalysisInput): AIAnalysis {
    const healthScore = this.calculateBaseHealthScore(input);
    const recommendations: Recommendation[] = [];
    const alerts: Alert[] = [];
    const trends: TrendAnalysis[] = [];

    // Generate rule-based recommendations
    this.generatePerformanceRecommendations(input, recommendations);
    this.generateSecurityRecommendations(input, recommendations);
    this.generateMaintenanceRecommendations(input, recommendations);

    // Generate alerts
    this.generateSystemAlerts(input, alerts);

    // Generate trend analysis
    this.generateTrendAnalysis(input, trends);

    // Create summary
    const summary = this.generateSystemSummary(input, healthScore);

    // Priority actions
    const priorityActions = recommendations
      .filter(r => r.priority === 'critical' || r.priority === 'high')
      .slice(0, 5)
      .map(r => r.title);

    return {
      summary,
      recommendations,
      trends,
      alerts,
      health_score: healthScore,
      priority_actions: priorityActions
    };
  }

  private parseAIAnalysisResult(analysisResult: any, input: HealthAnalysisInput): AIAnalysis {
    try {
      return {
        summary: analysisResult.summary || 'System analysis completed',
        recommendations: (analysisResult.recommendations || []).map((rec: any) => ({
          category: rec.category || 'maintenance',
          priority: rec.priority || 'medium',
          title: rec.title || 'System optimization',
          description: rec.description || 'No description provided',
          action_items: Array.isArray(rec.action_items) ? rec.action_items : [],
          estimated_impact: rec.estimated_impact || 'medium',
          implementation_difficulty: rec.implementation_difficulty || 'moderate'
        })) as Recommendation[],
        trends: (analysisResult.trends || []).map((trend: any) => ({
          metric: trend.metric || 'Unknown',
          trend: trend.trend || 'stable',
          timeframe: trend.timeframe || 'Current',
          current_value: trend.current_value || 0,
          analysis: trend.analysis || 'No analysis available'
        })) as TrendAnalysis[],
        alerts: (analysisResult.alerts || []).map((alert: any) => ({
          level: alert.level || 'info',
          category: alert.category || 'maintenance',
          message: alert.message || 'System alert',
          affected_component: alert.affected_component || 'System',
          recommended_action: alert.recommended_action,
          urgency: alert.urgency || 'medium',
          auto_resolvable: alert.auto_resolvable === true
        })) as Alert[],
        health_score: analysisResult.health_score || this.calculateBaseHealthScore(input),
        priority_actions: Array.isArray(analysisResult.priority_actions) ? analysisResult.priority_actions : []
      };
    } catch {
      return this.createFallbackAnalysis(input);
    }
  }

  private parseTextAnalysisResult(textResult: string, input: HealthAnalysisInput): AIAnalysis {
    // Extract insights from text when JSON parsing fails
    const summary = textResult.substring(0, 500) + (textResult.length > 500 ? '...' : '');
    
    const basicRecommendations: Recommendation[] = [];
    const basicAlerts: Alert[] = [];

    // Generate basic recommendations based on metrics
    if (input.system_metrics.cpu.usage_percent > 80) {
      basicRecommendations.push({
        category: 'performance',
        priority: 'high',
        title: 'Reduce CPU usage',
        description: `CPU usage is high at ${input.system_metrics.cpu.usage_percent.toFixed(1)}%`,
        action_items: ['Identify high CPU processes', 'Consider scaling or optimization'],
        estimated_impact: 'high',
        implementation_difficulty: 'moderate'
      });
    }

    if (input.system_metrics.memory.usage_percent > 85) {
      basicAlerts.push({
        level: 'warning',
        category: 'performance',
        message: `High memory usage: ${input.system_metrics.memory.usage_percent.toFixed(1)}%`,
        affected_component: 'Memory',
        urgency: 'high',
        auto_resolvable: false
      });
    }

    return {
      summary,
      recommendations: basicRecommendations,
      trends: [],
      alerts: basicAlerts,
      health_score: this.calculateBaseHealthScore(input),
      priority_actions: basicRecommendations.slice(0, 3).map(r => r.title)
    };
  }

  private createFallbackAnalysis(input: HealthAnalysisInput): AIAnalysis {
    const healthScore = this.calculateBaseHealthScore(input);
    const criticalIssues = this.identifyCriticalIssues(input);
    const warnings = this.identifyWarnings(input);

    const recommendations: Recommendation[] = [];
    const alerts: Alert[] = [];

    // Generate basic recommendations
    if (input.system_metrics.disk.usage_percent > 80) {
      recommendations.push({
        category: 'maintenance',
        priority: 'high',
        title: 'Free up disk space',
        description: `Disk usage is at ${input.system_metrics.disk.usage_percent.toFixed(1)}%`,
        action_items: [
          'Clean temporary files',
          'Remove old log files',
          'Uninstall unused packages'
        ],
        estimated_impact: 'high',
        implementation_difficulty: 'easy'
      });
    }

    if (input.system_metrics.security.security_updates_available > 0) {
      recommendations.push({
        category: 'security',
        priority: 'medium',
        title: 'Install security updates',
        description: `${input.system_metrics.security.security_updates_available} security updates available`,
        action_items: ['sudo apt update && sudo apt upgrade'],
        estimated_impact: 'high',
        implementation_difficulty: 'easy'
      });
    }

    // Generate basic alerts
    criticalIssues.forEach(issue => {
      alerts.push({
        level: 'critical',
        category: 'performance',
        message: issue,
        affected_component: 'System',
        urgency: 'immediate',
        auto_resolvable: false
      });
    });

    warnings.forEach(warning => {
      alerts.push({
        level: 'warning',
        category: 'performance',
        message: warning,
        affected_component: 'System',
        urgency: 'medium',
        auto_resolvable: false
      });
    });

    return {
      summary: `System health analysis completed. Health score: ${healthScore}/100. ${criticalIssues.length} critical issues and ${warnings.length} warnings identified.`,
      recommendations,
      trends: [],
      alerts,
      health_score: healthScore,
      priority_actions: criticalIssues.slice(0, 3)
    };
  }

  // Rule-based analysis helper methods

  private generatePerformanceRecommendations(input: HealthAnalysisInput, recommendations: Recommendation[]): void {
    const cpu = input.system_metrics.cpu.usage_percent;
    const memory = input.system_metrics.memory.usage_percent;
    const disk = input.system_metrics.disk.usage_percent;

    if (cpu > 80) {
      recommendations.push({
        category: 'performance',
        priority: cpu > 95 ? 'critical' : 'high',
        title: 'Optimize CPU Usage',
        description: `CPU usage is at ${cpu.toFixed(1)}%, which may impact system performance`,
        action_items: [
          'Identify processes consuming high CPU',
          'Consider process optimization or scaling',
          'Review system resource allocation'
        ],
        estimated_impact: 'high',
        implementation_difficulty: 'moderate'
      });
    }

    if (memory > 85) {
      recommendations.push({
        category: 'performance',
        priority: memory > 95 ? 'critical' : 'high',
        title: 'Address Memory Pressure',
        description: `Memory usage is at ${memory.toFixed(1)}%, risking system stability`,
        action_items: [
          'Identify memory-intensive processes',
          'Clear unnecessary cached data',
          'Consider adding more RAM'
        ],
        estimated_impact: 'high',
        implementation_difficulty: 'easy'
      });
    }

    if (disk > 85) {
      recommendations.push({
        category: 'performance',
        priority: disk > 95 ? 'critical' : 'high',
        title: 'Free Disk Space',
        description: `Disk usage is at ${disk.toFixed(1)}%, approaching capacity limits`,
        action_items: [
          'Clean temporary files and logs',
          'Remove old backups and snapshots',
          'Uninstall unused applications'
        ],
        estimated_impact: 'high',
        implementation_difficulty: 'easy'
      });
    }
  }

  private generateSecurityRecommendations(input: HealthAnalysisInput, recommendations: Recommendation[]): void {
    const security = input.system_metrics.security;

    if (security.security_updates_available > 0) {
      recommendations.push({
        category: 'security',
        priority: security.security_updates_available > 10 ? 'critical' : 'medium',
        title: 'Install Security Updates',
        description: `${security.security_updates_available} security updates are available`,
        action_items: [
          'Run system update command',
          'Schedule automatic security updates',
          'Verify critical services after updates'
        ],
        estimated_impact: 'high',
        implementation_difficulty: 'easy'
      });
    }

    if (security.firewall_status !== 'active') {
      recommendations.push({
        category: 'security',
        priority: 'high',
        title: 'Enable Firewall',
        description: 'System firewall is not active, leaving system exposed',
        action_items: [
          'Enable and configure firewall',
          'Review and restrict open ports',
          'Set up intrusion detection'
        ],
        estimated_impact: 'high',
        implementation_difficulty: 'moderate'
      });
    }

    if (security.open_ports.length > 15) {
      recommendations.push({
        category: 'security',
        priority: 'medium',
        title: 'Review Open Ports',
        description: `${security.open_ports.length} ports are open, review for necessity`,
        action_items: [
          'Audit open ports and services',
          'Close unnecessary ports',
          'Implement port access controls'
        ],
        estimated_impact: 'medium',
        implementation_difficulty: 'moderate'
      });
    }
  }

  private generateMaintenanceRecommendations(input: HealthAnalysisInput, recommendations: Recommendation[]): void {
    if (input.service_metrics.failed_services_count > 0) {
      recommendations.push({
        category: 'maintenance',
        priority: 'high',
        title: 'Fix Failed Services',
        description: `${input.service_metrics.failed_services_count} system services have failed`,
        action_items: [
          'Investigate service failure logs',
          'Restart or reconfigure failed services',
          'Set up service monitoring alerts'
        ],
        estimated_impact: 'high',
        implementation_difficulty: 'moderate'
      });
    }

    if (input.system_metrics.memory.swap_usage_percent > 50) {
      recommendations.push({
        category: 'maintenance',
        priority: 'medium',
        title: 'Reduce Swap Usage',
        description: `Swap usage is at ${input.system_metrics.memory.swap_usage_percent.toFixed(1)}%`,
        action_items: [
          'Identify processes using swap',
          'Optimize memory usage',
          'Consider increasing RAM'
        ],
        estimated_impact: 'medium',
        implementation_difficulty: 'moderate'
      });
    }
  }

  private generateSystemAlerts(input: HealthAnalysisInput, alerts: Alert[]): void {
    if (input.system_metrics.cpu.usage_percent > 90) {
      alerts.push({
        level: 'critical',
        category: 'performance',
        message: `Critical CPU usage: ${input.system_metrics.cpu.usage_percent.toFixed(1)}%`,
        affected_component: 'CPU',
        recommended_action: 'Identify and optimize high CPU processes immediately',
        urgency: 'immediate',
        auto_resolvable: false
      });
    }

    if (input.system_metrics.memory.usage_percent > 95) {
      alerts.push({
        level: 'critical',
        category: 'performance',
        message: `Critical memory usage: ${input.system_metrics.memory.usage_percent.toFixed(1)}%`,
        affected_component: 'Memory',
        recommended_action: 'Free memory or restart services to prevent system crash',
        urgency: 'immediate',
        auto_resolvable: false
      });
    }

    if (!input.system_metrics.network.internet_connected) {
      alerts.push({
        level: 'error',
        category: 'network',
        message: 'Internet connectivity is unavailable',
        affected_component: 'Network',
        recommended_action: 'Check network configuration and connectivity',
        urgency: 'high',
        auto_resolvable: false
      });
    }

    if (input.service_metrics.failed_services_count > 0) {
      alerts.push({
        level: 'warning',
        category: 'services',
        message: `${input.service_metrics.failed_services_count} system services have failed`,
        affected_component: 'Services',
        recommended_action: 'Investigate and restart failed services',
        urgency: 'medium',
        auto_resolvable: false
      });
    }
  }

  private generateTrendAnalysis(input: HealthAnalysisInput, trends: TrendAnalysis[]): void {
    // For now, provide current state analysis
    // Future: Implement actual trend analysis with historical data
    
    trends.push({
      metric: 'CPU Usage',
      trend: input.system_metrics.cpu.usage_percent > 75 ? 'degrading' : 'stable',
      timeframe: 'Current observation',
      current_value: input.system_metrics.cpu.usage_percent,
      analysis: `CPU usage is currently ${input.system_metrics.cpu.usage_percent.toFixed(1)}%`
    });

    trends.push({
      metric: 'Memory Usage',
      trend: input.system_metrics.memory.usage_percent > 80 ? 'degrading' : 'stable',
      timeframe: 'Current observation',
      current_value: input.system_metrics.memory.usage_percent,
      analysis: `Memory usage is currently ${input.system_metrics.memory.usage_percent.toFixed(1)}%`
    });

    trends.push({
      metric: 'Disk Usage',
      trend: input.system_metrics.disk.usage_percent > 85 ? 'degrading' : 'stable',
      timeframe: 'Current observation',
      current_value: input.system_metrics.disk.usage_percent,
      analysis: `Disk usage is currently ${input.system_metrics.disk.usage_percent.toFixed(1)}%`
    });
  }

  private generateSystemSummary(input: HealthAnalysisInput, healthScore: number): string {
    const status = healthScore > 80 ? 'good' : healthScore > 60 ? 'fair' : 'poor';
    const criticalCount = this.identifyCriticalIssues(input).length;
    const warningCount = this.identifyWarnings(input).length;

    return `System health is ${status} with a score of ${healthScore}/100. Found ${criticalCount} critical issues and ${warningCount} warnings that need attention. ${
      input.system_metrics.network.internet_connected ? 'Network connectivity is available.' : 'Network connectivity issues detected.'
    } ${
      input.service_metrics.failed_services_count === 0 ? 'All system services are running normally.' : 
      `${input.service_metrics.failed_services_count} system services have failed and require attention.`
    }`;
  }
}