import { BaseAgent } from './core/BaseAgent';
import type { BaseAgentOptions, AgentConfig, AgentError, ErrorContext, ErrorRecovery } from './core/types';

interface DockerDeploymentOptions extends BaseAgentOptions {
  serviceName: string;
  forceLatest?: boolean;
  skipExistingCheck?: boolean;
  enableSSL?: boolean;
  customNetwork?: string;
  environment?: 'production' | 'staging' | 'development';
  dataRetentionDays?: number;
  backupBeforeDeployment?: boolean;
  generateCredentials?: boolean;
  securityScanEnabled?: boolean;
  monitoringEnabled?: boolean;
  customPorts?: Record<string, number>;
  volumeMounts?: Record<string, string>;
  environmentVariables?: Record<string, string>;
}

export class DockerDeploymentAgent extends BaseAgent<DockerDeploymentOptions> {
  getAgentType(): string {
    return 'docker-deployment';
  }

  getAllowedTools(): string[] {
    return [
      'Bash',
      'Read', 
      'Write',
      'Edit',
      'Grep',
      'Glob',
      'WebSearch',
      'WebFetch',
      'mcp__searxng__search',
      'mcp__context7__resolve-library-id',
      'mcp__context7__get-library-docs',
      'mcp__fetch__fetch'
    ];
  }

  buildPrompt(options: DockerDeploymentOptions): string {
    const serviceName = options.serviceName;
    const environment = options.environment || 'production';
    const forceLatest = options.forceLatest || false;
    const enableSSL = options.enableSSL !== false; // Default to true
    const generateCredentials = options.generateCredentials !== false; // Default to true
    const securityScan = options.securityScanEnabled !== false; // Default to true

    return `
You are a Docker deployment specialist tasked with deploying the service "${serviceName}" in a ${environment} environment.

DEPLOYMENT REQUIREMENTS:
- Service Name: ${serviceName}
- Environment: ${environment}
- Force Latest Version: ${forceLatest}
- SSL/TLS Enabled: ${enableSSL}
- Generate Secure Credentials: ${generateCredentials}
- Security Scanning: ${securityScan}
- Custom Ports: ${options.customPorts ? JSON.stringify(options.customPorts) : 'Auto-detect'}
- Custom Volumes: ${options.volumeMounts ? JSON.stringify(options.volumeMounts) : 'Auto-configure'}

COMPREHENSIVE DEPLOYMENT PROCESS:

## Phase 1: Research & Discovery
1. **Internet Research**: Use all available tools (WebSearch, searxng, context7, WebFetch) to:
   - Find the official ${serviceName} Docker image and documentation
   - Research latest stable version and security best practices
   - Identify common deployment patterns and configurations
   - Find security considerations and hardening guides
   - Research SSL/TLS setup requirements
   - Look for production deployment examples

2. **System Analysis**: Investigate the current infrastructure:
   - Scan for existing Docker Compose files and patterns
   - Identify available ports and network configurations
   - Analyze existing data storage locations and patterns
   - Check current security configurations
   - Map out existing service dependencies

3. **Port & Network Planning**: 
   - Identify all ports currently in use across the system
   - Find optimal port assignments avoiding conflicts
   - Plan network configuration and service discovery
   - Design reverse proxy integration if needed

## Phase 2: Security & Credentials
1. **Credential Generation**: If generateCredentials is true:
   - Generate cryptographically secure passwords/keys
   - Create secure API keys and tokens where needed
   - Set up proper secret management
   - Configure database passwords and access controls

2. **Security Configuration**:
   - Apply security best practices from research
   - Configure proper file permissions and ownership
   - Set up security headers and SSL/TLS certificates
   - Implement network security and firewall rules
   - Apply container security hardening

## Phase 3: Configuration & Deployment
1. **Docker Compose Creation**:
   - Create production-ready docker-compose.yml following patterns from existing services
   - Configure all necessary environment variables
   - Set up proper volume mounts for data persistence
   - Configure networking and service dependencies
   - Apply resource limits and health checks

2. **Environment Setup**:
   - Create .env file with secure credentials
   - Set up data directories with proper permissions
   - Configure backup strategies
   - Set up log rotation and management

3. **Deployment Execution**:
   - Pull latest images and verify signatures
   - Deploy services with proper orchestration
   - Verify all containers start successfully
   - Test connectivity and basic functionality

## Phase 4: Verification & Monitoring
1. **Health Verification**:
   - Test all service endpoints and functionality
   - Verify SSL/TLS certificates and security
   - Check log outputs for errors or warnings
   - Validate data persistence and backups

2. **Security Validation**:
   - Run security scans on deployed containers
   - Verify network isolation and access controls
   - Test authentication and authorization
   - Validate SSL/TLS configuration

3. **Monitoring Setup**:
   - Configure log monitoring and alerts
   - Set up health check endpoints
   - Implement performance monitoring
   - Configure backup verification

## Phase 5: Documentation & Reporting
1. **Deployment Report**: Generate comprehensive report including:
   - Service configuration summary
   - Port assignments and network details
   - Security measures implemented
   - Credentials and access information (encrypted/hashed)
   - Backup and recovery procedures
   - Troubleshooting guide
   - Maintenance recommendations

2. **Operational Documentation**:
   - Create service management scripts
   - Document update and maintenance procedures
   - Provide monitoring and alerting setup
   - Include disaster recovery procedures

CRITICAL REQUIREMENTS:
- Follow production best practices throughout
- Ensure all credentials are generated securely and stored properly
- Verify compatibility with existing infrastructure
- Test thoroughly before marking deployment complete
- Provide detailed logging of all actions taken
- Generate actionable documentation and reports

TOOLS USAGE:
- Use WebSearch and searxng for comprehensive internet research
- Use context7 for official documentation and best practices
- Use WebFetch for downloading configuration examples
- Use system tools (Bash, Read, Write, etc.) for infrastructure analysis
- Use Grep and Glob for pattern discovery in existing configurations

Begin with Phase 1 research and proceed systematically through all phases.
Do not skip any verification steps. Ensure the deployment is production-ready and secure.
`;
  }

  getSystemPrompt(): string {
    return `
You are an expert DevOps engineer and Docker deployment specialist with deep expertise in:

TECHNICAL EXPERTISE:
- Docker and Docker Compose production deployments
- Container orchestration and service discovery
- Network security and SSL/TLS configuration
- Credential management and secret handling
- Infrastructure security and hardening
- Production monitoring and observability
- Backup and disaster recovery strategies
- Performance optimization and resource management

DEPLOYMENT METHODOLOGY:
- Research-driven approach using multiple information sources
- Security-first mindset with defense in depth
- Infrastructure as Code best practices
- Systematic verification and testing procedures
- Comprehensive documentation and reporting
- Risk assessment and mitigation strategies

OPERATIONAL EXCELLENCE:
- Production-ready configuration standards
- Monitoring and alerting best practices
- Automated backup and recovery procedures
- Capacity planning and resource optimization
- Incident response and troubleshooting
- Change management and version control

SECURITY FOCUS:
- Apply NIST Cybersecurity Framework principles
- Implement least privilege access controls
- Use secure credential generation and storage
- Apply container security best practices
- Implement network segmentation and monitoring
- Regular security scanning and vulnerability assessment

RESEARCH CAPABILITIES:
- Leverage multiple information sources for comprehensive research
- Cross-reference best practices from official documentation
- Identify security vulnerabilities and mitigation strategies
- Find production deployment patterns and examples
- Research community recommendations and lessons learned

COMMUNICATION:
- Provide clear, actionable deployment reports
- Document all security measures and configurations
- Create operational runbooks and troubleshooting guides
- Explain technical decisions and recommendations
- Deliver production-ready documentation

Always prioritize security, reliability, and maintainability in all deployment decisions.
Use systematic approaches and verify all configurations before deployment.
Provide comprehensive documentation for operational teams.
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
      name: 'Docker Deployment Agent',
      version: '1.0.0',
      description: 'Comprehensive Docker service deployment with security, monitoring, and production best practices',
      defaultOptions: {
        timeout_ms: 1800000, // 30 minutes for complex deployments
        maxTurns: 150,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Comprehensive internet research for service deployment',
        'Infrastructure analysis and port management',
        'Security-focused Docker Compose configuration',
        'Automated credential generation and management',
        'SSL/TLS certificate setup and configuration',
        'Production monitoring and health check setup',
        'Backup and disaster recovery configuration',
        'Security scanning and vulnerability assessment',
        'Network configuration and service discovery',
        'Comprehensive deployment reporting and documentation'
      ],
      requiredTools: ['Bash', 'Read', 'Write'],
      optionalTools: [
        'Edit', 'Grep', 'Glob', 'WebSearch', 'WebFetch',
        'mcp__searxng__search', 'mcp__context7__resolve-library-id', 
        'mcp__context7__get-library-docs', 'mcp__fetch__fetch'
      ],
      typicalExecutionTime: 900000, // 15 minutes typical
      costEstimate: {
        min: 0.50,
        max: 5.00,
        typical: 2.00
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