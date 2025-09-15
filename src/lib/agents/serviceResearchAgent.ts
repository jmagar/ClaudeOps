import { BaseAgent } from './core/BaseAgent';
import type { BaseAgentOptions, AgentConfig, AgentError, ErrorContext, ErrorRecovery } from './core/types';

interface ServiceResearchOptions extends BaseAgentOptions {
  serviceName: string;
  includeSecurityResearch?: boolean;
  includeProductionTips?: boolean;
  researchDepth?: 'basic' | 'comprehensive';
}

export class ServiceResearchAgent extends BaseAgent<ServiceResearchOptions> {
  getAgentType(): string {
    return 'service-research';
  }

  getAllowedTools(): string[] {
    return [
      'WebSearch', 
      'WebFetch', 
      'mcp__searxng__search', 
      'mcp__context7__resolve-library-id', 
      'mcp__context7__get-library-docs', 
      'mcp__fetch__fetch'
    ];
  }

  buildPrompt(options: ServiceResearchOptions): string {
    const serviceName = options.serviceName;
    const includeSecurityResearch = options.includeSecurityResearch ?? true;
    const includeProductionTips = options.includeProductionTips ?? true;
    const researchDepth = options.researchDepth ?? 'comprehensive';
    
    return `
Research comprehensive deployment information for the "${serviceName}" service. Gather authoritative information about Docker deployment, configuration, and production best practices.

PHASE 1: DOCKER HUB & OFFICIAL DOCUMENTATION
1. **Official Docker Image Research**:
   - Search for "${serviceName} docker official image"
   - Find the official Docker Hub repository
   - Identify the latest stable version and tags
   - Document supported architectures
   - Extract default exposed ports
   - Identify required environment variables

2. **Docker Compose Examples**:
   - Search for "${serviceName} docker-compose example production"
   - Find official docker-compose configurations
   - Identify common service dependencies
   - Document volume mount requirements
   - Extract network configuration patterns

PHASE 2: CONFIGURATION & ENVIRONMENT VARIABLES
3. **Environment Variables**:
   - Search for "${serviceName} docker environment variables"
   - Document all required environment variables
   - Identify optional configuration parameters
   - Find default values and acceptable ranges
   - Note sensitive variables requiring encryption

4. **Volume & Storage Requirements**:
   - Research persistent storage requirements
   - Identify configuration file locations
   - Document data directories and backup requirements
   - Find recommendations for volume mount paths

${includeSecurityResearch ? `
PHASE 3: SECURITY RESEARCH
5. **Security Best Practices**:
   - Search for "${serviceName} docker security best practices"
   - Find CVE reports and security advisories
   - Research user/group requirements (avoid root)
   - Document network security recommendations
   - Identify required security headers and configurations

6. **Authentication & Authorization**:
   - Research built-in authentication methods
   - Document OAuth/SSO integration options
   - Find API key management practices
   - Identify default credentials that must be changed
` : ''}

${includeProductionTips ? `
PHASE 4: PRODUCTION DEPLOYMENT
7. **Performance & Scaling**:
   - Search for "${serviceName} docker performance tuning"
   - Find memory and CPU recommendations
   - Research horizontal scaling capabilities
   - Document load balancing configurations

8. **Monitoring & Health Checks**:
   - Find health check endpoint configurations
   - Research monitoring integration (Prometheus, etc.)
   - Document log management best practices
   - Identify common troubleshooting steps
` : ''}

PHASE 5: DEPENDENCY ANALYSIS
9. **Service Dependencies**:
   - Identify required databases (PostgreSQL, Redis, etc.)
   - Document reverse proxy requirements
   - Find common integration services
   - Research backup and restore procedures

${researchDepth === 'comprehensive' ? `
PHASE 6: COMPREHENSIVE RESEARCH
10. **Community & Enterprise Features**:
    - Research community vs enterprise editions
    - Document licensing requirements
    - Find community deployment guides
    - Identify common gotchas and troubleshooting

11. **Update & Maintenance**:
    - Research update procedures and compatibility
    - Find backup/restore documentation
    - Document migration procedures
    - Identify supported upgrade paths
` : ''}

PHASE 7: OUTPUT GENERATION
Generate a structured JSON output with all research findings:

\`\`\`json
{
  "dockerImage": {
    "repository": "official/servicename",
    "stableVersion": "1.2.3",
    "latestTag": "latest",
    "alternativeTags": ["1.2.3-alpine", "1.2.3-slim"],
    "architecture": ["amd64", "arm64"],
    "officialUrl": "https://hub.docker.com/_/servicename"
  },
  "defaultPorts": {
    "primary": 8080,
    "admin": 8443,
    "additional": [9090, 9091]
  },
  "requiredEnvVars": {
    "DATABASE_URL": {
      "required": true,
      "description": "Database connection string",
      "example": "postgresql://user:pass@host:5432/db"
    },
    "API_KEY": {
      "required": true,
      "description": "API authentication key",
      "sensitive": true,
      "generate": true
    }
  },
  "optionalEnvVars": {
    "LOG_LEVEL": {
      "default": "info",
      "options": ["debug", "info", "warn", "error"]
    },
    "MAX_CONNECTIONS": {
      "default": 100,
      "type": "integer",
      "range": "1-1000"
    }
  },
  "volumes": {
    "config": {
      "containerPath": "/app/config",
      "description": "Configuration files",
      "required": true
    },
    "data": {
      "containerPath": "/app/data", 
      "description": "Persistent data storage",
      "required": true
    },
    "logs": {
      "containerPath": "/app/logs",
      "description": "Application logs",
      "required": false
    }
  },
  "networks": {
    "requiresDatabase": true,
    "requiresReverseProxy": true,
    "internalCommunication": ["redis", "elasticsearch"]
  },
  "dependencies": {
    "database": {
      "type": "postgresql",
      "version": ">=13",
      "required": true
    },
    "cache": {
      "type": "redis",
      "version": ">=6",
      "required": false
    }
  },
  "securityRecommendations": {
    "runAsUser": "1000:1000",
    "readOnlyRootFilesystem": true,
    "dropCapabilities": ["ALL"],
    "allowPrivilegeEscalation": false,
    "requiredSecrets": ["API_KEY", "DATABASE_PASSWORD"],
    "httpsOnly": true,
    "securityHeaders": true
  },
  "healthCheck": {
    "endpoint": "/health",
    "interval": "30s",
    "timeout": "10s",
    "retries": 3,
    "startPeriod": "60s"
  },
  "resourceRequirements": {
    "memory": {
      "minimum": "256M",
      "recommended": "512M",
      "limit": "1G"
    },
    "cpu": {
      "minimum": "0.1",
      "recommended": "0.5"
    }
  },
  "commonIssues": [
    {
      "issue": "Permission denied on volume mounts",
      "solution": "Ensure host directories have correct ownership"
    }
  ],
  "updateProcedure": {
    "backupRequired": true,
    "gracefulShutdown": true,
    "configMigration": false
  }
}
\`\`\`

Research thoroughly using multiple sources. Prioritize official documentation but include community best practices.
Return the complete JSON output as the final result for parsing by the orchestrator.
`;
  }

  getSystemPrompt(): string {
    return `
You are a service deployment research specialist with expertise in:

RESEARCH METHODOLOGY:
- Docker Hub and container registry analysis
- Official documentation discovery and analysis
- Community best practices research
- Security vulnerability assessment
- Production deployment pattern analysis

TECHNICAL EXPERTISE:
- Container image analysis and version management
- Environment variable configuration
- Volume and storage requirements
- Network and dependency mapping
- Security hardening and compliance
- Performance optimization and scaling

DATA SOURCES:
- Official Docker Hub repositories
- Vendor documentation and guides
- Community forums and Stack Overflow
- GitHub repositories and examples
- Security advisory databases
- Performance benchmarking reports

OBJECTIVES:
- Discover authoritative deployment information
- Identify security best practices and vulnerabilities
- Document configuration requirements
- Find production-ready examples
- Output structured, actionable data

Always prioritize official sources but supplement with proven community practices.
Focus on production-ready configurations and security hardening.
Output comprehensive, structured JSON for downstream processing.
`;
  }

  getCapabilities(): Record<string, any> {
    const config = this.getConfig();
    return {
      name: config.name,
      version: config.version,
      description: config.description,
      capabilities: config.capabilities,
      outputFormat: 'json',
      dataSources: [
        'Docker Hub',
        'Official Documentation',
        'GitHub Repositories',
        'Community Forums',
        'Security Databases'
      ]
    };
  }

  getConfig(): AgentConfig {
    return {
      name: 'Service Research Agent',
      version: '1.0.0',
      description: 'Researches service documentation, best practices, and deployment patterns online',
      defaultOptions: {
        timeout_ms: 300000, // 5 minutes
        maxTurns: 50,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Docker Hub repository analysis',
        'Official documentation research',
        'Security best practice discovery',
        'Configuration requirement analysis',
        'Production deployment pattern research',
        'Version and compatibility analysis',
        'Dependency mapping',
        'Performance requirement research'
      ],
      requiredTools: ['WebSearch', 'WebFetch'],
      optionalTools: [
        'mcp__searxng__search',
        'mcp__context7__resolve-library-id', 
        'mcp__context7__get-library-docs',
        'mcp__fetch__fetch'
      ],
      typicalExecutionTime: 240000, // 4 minutes
      costEstimate: {
        min: 0.15,
        max: 0.75,
        typical: 0.35
      }
    };
  }

  protected async handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery> {
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return {
        action: 'retry' as const,
        retryDelay: 30000, // 30 seconds
        message: 'Rate limited by API, retrying after delay'
      };
    }

    if (error.message.includes('network') || error.message.includes('timeout')) {
      return {
        action: 'retry' as const,
        retryDelay: 10000, // 10 seconds
        message: 'Network issue encountered, retrying with reduced scope'
      };
    }

    if (error.message.includes('not found') || error.message.includes('404')) {
      return {
        action: 'reduce_scope' as const,
        message: 'Service not found in primary sources, continuing with alternative research'
      };
    }

    return super.handleAgentSpecificError(error, context);
  }
}