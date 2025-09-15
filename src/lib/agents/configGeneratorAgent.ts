import { BaseAgent } from './core/BaseAgent';
import type { BaseAgentOptions, AgentConfig, AgentError, ErrorContext, ErrorRecovery } from './core/types';

interface ConfigGeneratorOptions extends BaseAgentOptions {
  context: string; // JSON string containing infrastructure + research results
  outputDirectory?: string;
  includeEnvFile?: boolean;
  enableReverseProxy?: boolean;
}

export class ConfigGeneratorAgent extends BaseAgent<ConfigGeneratorOptions> {
  getAgentType(): string {
    return 'config-generator';
  }

  getAllowedTools(): string[] {
    return ['Write', 'Read', 'Edit', 'Bash'];
  }

  buildPrompt(options: ConfigGeneratorOptions): string {
    const context = options.context;
    const outputDirectory = options.outputDirectory || '/opt/docker-deployments';
    const includeEnvFile = options.includeEnvFile ?? true;
    const enableReverseProxy = options.enableReverseProxy ?? true;
    
    return `
Generate production-ready Docker Compose configuration based on the combined infrastructure analysis and service research data.

DEPLOYMENT CONTEXT:
${context}

PHASE 1: DIRECTORY STRUCTURE CREATION
Create the deployment directory structure:

1. **Create Base Directory**:
   \`\`\`bash
   mkdir -p "${outputDirectory}"
   cd "${outputDirectory}"
   \`\`\`

2. **Parse Context Data**:
   Parse the provided JSON context to extract:
   - Infrastructure patterns (ports, volumes, networks)
   - Service requirements (environment variables, dependencies)
   - Security recommendations
   - Resource requirements

PHASE 2: DOCKER COMPOSE GENERATION
Generate docker-compose.yml following discovered patterns:

3. **Service Configuration**:
   Based on the context data, create a docker-compose.yml that:
   - Uses the recommended Docker image and version
   - Maps to available ports from infrastructure analysis
   - Follows existing volume mount patterns
   - Implements discovered naming conventions
   - Includes all required environment variables
   - Sets up health checks if available
   - Applies security best practices

4. **Network Configuration**:
   - Use existing networks if reverse proxy detected
   - Create new networks following naming patterns
   - Ensure proper service-to-service communication

5. **Volume Configuration**:
   - Follow discovered volume path patterns
   - Create config and data volumes as needed
   - Use bind mounts for configuration files
   - Set proper permissions and ownership

PHASE 3: ENVIRONMENT FILE GENERATION
${includeEnvFile ? `
6. **Environment File (.env)**:
   Create a .env file with:
   - All required environment variables from research
   - Placeholder values for secrets (to be filled by security agent)
   - Optional variables with recommended defaults
   - Clear comments explaining each variable
` : ''}

PHASE 4: CONFIGURATION FILES
7. **Additional Configuration**:
   Generate supporting files:
   - Service-specific configuration files if needed
   - Backup scripts
   - Update scripts
   - Documentation README

EXAMPLE DOCKER COMPOSE STRUCTURE:
\`\`\`yaml
version: '3.8'

services:
  servicename:
    image: \${DOCKER_IMAGE:-official/servicename:stable}
    container_name: \${SERVICE_NAME:-servicename-01}
    restart: unless-stopped
    
    # Environment variables
    environment:
      - DATABASE_URL=\${DATABASE_URL}
      - API_KEY=\${API_KEY}
      - LOG_LEVEL=\${LOG_LEVEL:-info}
    
    # Port mapping based on available ports
    ports:
      - "\${SERVICE_PORT:-8081}:8080"
    
    # Volume mounts following patterns
    volumes:
      - \${DATA_PATH:-./data}:/app/data
      - \${CONFIG_PATH:-./config}:/app/config:ro
    
    # Networks following patterns
    networks:
      - proxy_network
      - backend_network
    
    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    
    # Security settings
    user: "1000:1000"
    read_only: true
    security_opt:
      - no-new-privileges:true
    
    # Resource limits
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.1'

# Dependencies if required
  postgres:
    image: postgres:15-alpine
    container_name: \${DB_CONTAINER_NAME:-servicename-db}
    restart: unless-stopped
    environment:
      - POSTGRES_DB=\${DB_NAME}
      - POSTGRES_USER=\${DB_USER}
      - POSTGRES_PASSWORD=\${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - backend_network

networks:
  proxy_network:
    external: true
  backend_network:
    driver: bridge

volumes:
  postgres_data:
    driver: local
\`\`\`

${enableReverseProxy ? `
PHASE 5: REVERSE PROXY CONFIGURATION
8. **Reverse Proxy Labels**:
   Add appropriate labels for detected reverse proxy:
   - Traefik labels with routers and services
   - Nginx Proxy Manager configuration
   - Caddy configuration
   - SWAG configuration

Example Traefik labels:
\`\`\`yaml
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.servicename.rule=Host(\`servicename.domain.com\`)"
      - "traefik.http.routers.servicename.entrypoints=https"
      - "traefik.http.routers.servicename.tls=true"
      - "traefik.http.routers.servicename.tls.certresolver=letsencrypt"
      - "traefik.http.services.servicename.loadbalancer.server.port=8080"
\`\`\`
` : ''}

PHASE 6: OUTPUT AND VALIDATION
9. **File Creation**:
   Create all configuration files in the deployment directory:
   - docker-compose.yml
   - .env (with placeholders)
   - README.md (deployment instructions)
   - Any service-specific config files

10. **Configuration Validation**:
    \`\`\`bash
    # Validate docker-compose syntax
    docker-compose -f docker-compose.yml config
    
    # Check for syntax errors
    echo "Configuration validation complete"
    \`\`\`

FINAL OUTPUT:
Return a JSON object with the created file paths and configuration summary:

\`\`\`json
{
  "deploymentDirectory": "/opt/docker-deployments/servicename",
  "files": {
    "dockerCompose": "/opt/docker-deployments/servicename/docker-compose.yml",
    "environment": "/opt/docker-deployments/servicename/.env",
    "readme": "/opt/docker-deployments/servicename/README.md",
    "additionalConfigs": []
  },
  "configuration": {
    "serviceName": "servicename",
    "image": "official/servicename:1.2.3",
    "ports": {
      "primary": 8081
    },
    "volumes": [
      "./data:/app/data",
      "./config:/app/config"
    ],
    "networks": ["proxy_network", "backend_network"],
    "dependencies": ["postgres"],
    "reverseProxy": {
      "enabled": true,
      "type": "traefik"
    },
    "healthCheck": true,
    "security": {
      "nonRoot": true,
      "readOnly": true,
      "resourceLimits": true
    }
  },
  "nextSteps": [
    "Security credentials need to be generated",
    "Review and customize environment variables",
    "Verify network connectivity",
    "Test deployment in staging environment"
  ]
}
\`\`\`

Generate production-ready configurations that follow the discovered infrastructure patterns.
Ensure all security best practices are implemented.
Create comprehensive documentation for deployment and maintenance.
`;
  }

  getSystemPrompt(): string {
    return `
You are a Docker Compose configuration specialist with expertise in:

CONFIGURATION GENERATION:
- Docker Compose file creation and optimization
- Multi-service orchestration and dependencies
- Network architecture and service discovery
- Volume management and persistent storage
- Environment variable configuration
- Security hardening and best practices

INFRASTRUCTURE INTEGRATION:
- Existing infrastructure pattern analysis
- Resource allocation and port management
- Network topology and reverse proxy integration
- Storage and backup configuration
- Service dependency management
- Performance optimization

SECURITY IMPLEMENTATION:
- Non-root container execution
- Read-only filesystems and security contexts
- Secret management and environment isolation
- Network segmentation and access control
- Resource limits and quotas
- Security scanning and compliance

PRODUCTION READINESS:
- Health check implementation
- Graceful shutdown handling
- Update and rollback procedures
- Monitoring and logging integration
- Backup and recovery planning
- Documentation and runbooks

OBJECTIVES:
- Generate production-ready Docker Compose configurations
- Follow discovered infrastructure patterns and conventions
- Implement comprehensive security best practices
- Create maintainable and documented deployments
- Ensure scalability and reliability

Always generate configurations that are secure, maintainable, and follow industry best practices.
Focus on production readiness and operational excellence.
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
      supportedFormats: [
        'Docker Compose v3.8',
        'Environment files',
        'Configuration templates',
        'Documentation'
      ]
    };
  }

  getConfig(): AgentConfig {
    return {
      name: 'Configuration Generator Agent',
      version: '1.0.0',
      description: 'Generates Docker Compose configurations based on infrastructure analysis and service research',
      defaultOptions: {
        timeout_ms: 180000, // 3 minutes
        maxTurns: 30,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Docker Compose file generation',
        'Environment file creation',
        'Network configuration',
        'Volume management setup',
        'Security hardening implementation',
        'Health check configuration',
        'Resource limit management',
        'Reverse proxy integration',
        'Documentation generation'
      ],
      requiredTools: ['Write', 'Read'],
      optionalTools: ['Edit', 'Bash'],
      typicalExecutionTime: 120000, // 2 minutes
      costEstimate: {
        min: 0.08,
        max: 0.30,
        typical: 0.15
      }
    };
  }

  protected async handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery> {
    if (error.message.includes('permission denied') || error.message.includes('mkdir')) {
      return {
        action: 'retry' as const,
        modifiedPrompt: 'Use current directory instead of creating new directories',
        message: 'Permission denied creating directories, using current directory'
      };
    }

    if (error.message.includes('docker-compose') && error.message.includes('command not found')) {
      return {
        action: 'continue' as const,
        message: 'Docker Compose not available for validation, continuing with file generation'
      };
    }

    if (error.message.includes('Invalid JSON') || error.message.includes('parse')) {
      return {
        action: 'retry' as const,
        message: 'JSON parsing failed, retrying with error handling'
      };
    }

    return super.handleAgentSpecificError(error, context);
  }
}