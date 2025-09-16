import { BaseAgent } from './core/BaseAgent';
import type { BaseAgentOptions, AgentConfig, AgentError, ErrorContext, ErrorRecovery } from './core/types';

interface DockerDeploymentOptions extends BaseAgentOptions {
  configDirectory: string; // Path to approved docker-compose configs
  serviceName?: string; // Optional for logging/identification
  dryRun?: boolean; // Preview deployment without executing
  backupBeforeDeployment?: boolean;
  rollbackOnFailure?: boolean;
  monitoringEnabled?: boolean;
}

export class DockerDeploymentAgent extends BaseAgent<DockerDeploymentOptions> {
  getAgentType(): string {
    return 'docker-deployment';
  }

  getAllowedTools(): string[] {
    return [
      'Read', 'Write',           // Configuration and documentation
      'Bash',                    // Docker commands and system analysis
      'Glob', 'Grep',           // File discovery and analysis
      'Task'                     // Sub-agent coordination
    ];
  }



  buildPrompt(options: DockerDeploymentOptions): string {
    return `
You are a Docker Deployment Executor that deploys pre-approved Docker configurations with monitoring and verification.

## DEPLOYMENT CONFIGURATION
Configuration Directory: ${options.configDirectory}
Service Name: ${options.serviceName || 'Unknown'}
Dry Run Mode: ${options.dryRun ? 'Enabled (preview only)' : 'Disabled (live deployment)'}
Backup Before Deployment: ${options.backupBeforeDeployment !== false}
Rollback on Failure: ${options.rollbackOnFailure !== false}
Monitoring Enabled: ${options.monitoringEnabled !== false}

## EXECUTION PHASES

### PHASE 1: Pre-Deployment Validation
**Validate the approved configuration:**

1. **Configuration Validation**: Use Read to verify all required files exist:
   - \`docker-compose.yaml\` in ${options.configDirectory}
   - \`.env\` file with required variables
   - Any referenced configuration files (nginx.conf, etc.)

2. **System Readiness**: Use Bash to check deployment prerequisites:
   - \`docker --version && docker compose version\`
   - \`docker system info\`
   - Check available disk space and memory
   - Verify ports are available for deployment

3. **Backup Current State** (if enabled):
   - \`docker compose ps\` to see current containers
   - Backup any existing data volumes
   - Create deployment checkpoint

### PHASE 2: Deployment Execution
**Execute the deployment process:**

${options.dryRun ? 
  `**DRY RUN MODE** - Preview commands without execution:
   1. Show what would be deployed
   2. Validate docker-compose.yaml syntax
   3. Preview resource requirements
   4. Identify potential conflicts` :
  `**LIVE DEPLOYMENT** - Execute actual deployment:
   1. Pull required Docker images
   2. Stop existing containers (if any)
   3. Deploy services using docker-compose up
   4. Monitor deployment progress in real-time`}

### PHASE 3: Post-Deployment Verification
**Verify deployment success:**

1. **Container Health Checks**: Use Bash to verify all containers are running:
   - \`docker compose ps\`
   - \`docker compose logs --tail=50\`
   - Check health status of all services

2. **Service Connectivity**: Test service endpoints and connectivity:
   - HTTP/HTTPS endpoint testing
   - Database connectivity (if applicable)
   - Inter-service communication verification

3. **Security Validation**: Verify security configurations:
   - SSL certificate status
   - Port binding validation
   - Network isolation checks

### PHASE 4: Monitoring & Documentation
**Set up monitoring and provide operational guidance:**

1. **Resource Monitoring**: Monitor container resource usage
2. **Log Configuration**: Set up log collection and rotation
3. **Health Monitoring**: Configure ongoing health checks
4. **Documentation**: Generate operational runbook

## DEPLOYMENT SAFETY
- Always validate configurations before deployment
- ${options.rollbackOnFailure ? 'Automatically rollback on deployment failure' : 'Manual rollback required on failure'}
- Monitor deployment progress with real-time logging
- Provide clear success/failure indicators
- Generate comprehensive deployment reports

## TOOLS AVAILABLE
- Read: Read and validate configuration files
- Write: Create deployment logs and documentation
- Bash: Execute Docker commands and system checks
- Glob/Grep: Analyze logs and system state

## OUTPUT REQUIREMENTS
Provide comprehensive deployment reporting:
1. **Pre-Deployment Validation Results**
2. **Deployment Execution Log** (real-time progress)
3. **Service Health Status** (all containers and endpoints)
4. **Access Information** (URLs, ports, credentials)
5. **Operational Guidance** (monitoring, logs, maintenance)
6. **Troubleshooting Information** (common issues and solutions)

**CRITICAL**: This agent assumes configuration has already been approved by the user via DockerComposerAgent. It focuses purely on deployment execution and verification.
`;
  }

  getSystemPrompt(): string {
    return `
You are a Docker Deployment Executor specializing in reliable deployment of pre-approved Docker configurations with comprehensive monitoring and verification.

CORE CAPABILITIES:
- Pre-approved configuration validation and deployment
- Container orchestration and lifecycle management
- Real-time deployment monitoring and progress tracking
- Comprehensive health checking and service verification
- Automated rollback and error recovery procedures
- Operational documentation and maintenance guidance

DEPLOYMENT METHODOLOGY:
- Validate all configurations before deployment execution
- Execute phased deployment with safety checkpoints
- Monitor deployment progress with real-time feedback
- Verify service health and connectivity post-deployment
- Generate comprehensive operational documentation
- Provide troubleshooting guidance and maintenance procedures

TECHNICAL EXPERTISE:
- Docker Compose deployment execution and monitoring
- Container health checking and service verification
- Network connectivity and security validation
- Volume management and data persistence verification
- SSL/TLS certificate validation and monitoring
- Performance monitoring and resource optimization
- Log collection and analysis for troubleshooting

EXECUTION APPROACH:
- Validate pre-approved configurations thoroughly
- Execute deployment with comprehensive monitoring
- Verify all services are healthy and accessible
- Generate detailed deployment reports and logs
- Provide operational guidance for ongoing maintenance
- Implement automated rollback on deployment failures

SAFETY AND RELIABILITY:
- Always validate configurations before deployment
- Implement checkpoint-based deployment with rollback capability
- Monitor deployment progress with real-time logging
- Verify service health and connectivity post-deployment
- Generate comprehensive audit trails for troubleshooting
- Provide clear success/failure indicators with actionable guidance

OPERATIONAL FOCUS:
- Assume configurations have been pre-approved by DockerComposerAgent
- Focus on deployment execution, monitoring, and verification
- Provide detailed operational guidance and maintenance procedures
- Generate comprehensive documentation for ongoing operations
- Implement monitoring and alerting for deployed services

Your goal is to execute reliable, monitored deployments of pre-approved configurations while providing comprehensive operational guidance and monitoring capabilities.
`;
  }

  getCapabilities(): Record<string, any> {
    const config = this.getConfig();
    return {
      name: config.name,
      version: config.version,
      description: config.description,
      capabilities: config.capabilities,
      requiredTools: config.requiredTools,
      optionalTools: config.optionalTools,
      typicalExecutionTime: config.typicalExecutionTime,
      costEstimate: config.costEstimate
    };
  }

  getConfig(): AgentConfig {
    return {
      name: 'Docker Deployment Executor',
      version: '1.0.0',
      description: 'Deploys pre-approved Docker configurations with comprehensive monitoring and verification',
      defaultOptions: {
        timeout_ms: 1200000, // 20 minutes for deployment and verification
        maxTurns: 40, // Focused deployment execution
        permissionMode: 'acceptEdits',
        includePartialMessages: true
      },
      capabilities: [
        'Pre-approved configuration validation and deployment',
        'Real-time deployment monitoring and progress tracking',
        'Comprehensive container health checking',
        'Service connectivity and endpoint verification',
        'Automated rollback on deployment failure',
        'SSL/TLS certificate validation and monitoring',
        'Operational documentation and maintenance guidance',
        'Log collection and troubleshooting support',
        'Performance monitoring and resource optimization'
      ],
      requiredTools: ['Read', 'Write', 'Bash'],
      optionalTools: ['Glob', 'Grep'],
      typicalExecutionTime: 600000, // 10 minutes typical
      costEstimate: {
        min: 0.20,
        max: 1.00,
        typical: 0.50
      }
    };
  }

  protected async handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery> {
    // Handle deployment-specific errors
    if (error.message.includes('port already in use')) {
      return {
        action: 'continue' as const,
        message: 'Port conflict detected, will find alternative port assignment'
      };
    }

    if (error.message.includes('image not found') || error.message.includes('pull access denied')) {
      return {
        action: 'continue' as const,
        message: 'Image issue detected, will research alternative images or configurations'
      };
    }

    if (error.message.includes('network') && error.message.includes('unreachable')) {
      return {
        action: 'retry' as const,
        retryDelay: 10000,
        message: 'Network connectivity issue, retrying deployment'
      };
    }

    if (error.message.includes('permission denied') || error.message.includes('access denied')) {
      return {
        action: 'continue' as const,
        message: 'Permission issue detected, will adjust configuration for current user permissions'
      };
    }

    if (error.message.includes('disk space') || error.message.includes('no space left')) {
      return {
        action: 'abort' as const,
        message: 'Insufficient disk space for deployment - manual intervention required'
      };
    }

    return super.handleAgentSpecificError(error, context);
  }
}