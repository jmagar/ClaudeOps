import { BaseAgent } from './core/BaseAgent';
import type { BaseAgentOptions, AgentConfig, AgentError, ErrorContext, ErrorRecovery } from './core/types';

interface InfrastructureAnalysisOptions extends BaseAgentOptions {
  targetService?: string;
  scanDepth?: 'basic' | 'comprehensive';
  includeNetworkAnalysis?: boolean;
  includeVolumeAnalysis?: boolean;
}

export class InfrastructureAnalysisAgent extends BaseAgent<InfrastructureAnalysisOptions> {
  getAgentType(): string {
    return 'infrastructure-analysis';
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Read', 'Grep', 'Glob'];
  }

  buildPrompt(options: InfrastructureAnalysisOptions): string {
    const targetService = options.targetService || 'unknown';
    const scanDepth = options.scanDepth || 'comprehensive';
    
    return `
Analyze the local Docker infrastructure to understand existing patterns and configurations for deploying ${targetService}.

PHASE 1: DOCKER ENVIRONMENT SCAN
Execute these commands to gather infrastructure data:

1. **Container Analysis**:
   \`\`\`bash
   # List all containers with details
   docker ps -a --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Labels}}"
   
   # Get container naming patterns
   docker ps -a --format "{{.Names}}" | sed 's/[0-9]//g' | sort | uniq -c | sort -rn | head -10
   \`\`\`

2. **Network Configuration**:
   \`\`\`bash
   # List Docker networks
   docker network ls --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}"
   
   # Get detailed network info for custom networks
   docker network ls --format "{{.Name}}" | grep -v "bridge\\|host\\|none" | xargs -I {} docker network inspect {} --format "{{.Name}}: {{range .IPAM.Config}}{{.Subnet}}{{end}}"
   \`\`\`

3. **Port Usage Analysis**:
   \`\`\`bash
   # Find all used ports
   docker ps --format "{{.Ports}}" | grep -oE '[0-9]+' | sort -nu
   
   # Check system port usage
   ss -tlnp 2>/dev/null | grep LISTEN | awk '{print $4}' | grep -oE '[0-9]+$' | sort -nu
   \`\`\`

4. **Volume and Storage Patterns**:
   \`\`\`bash
   # List Docker volumes
   docker volume ls --format "table {{.Name}}\t{{.Driver}}\t{{.Mountpoint}}"
   
   # Find common volume mount patterns
   docker ps -a --format "{{.Mounts}}" | grep -oE '/[^:]+' | sort | uniq -c | sort -rn | head -20
   
   # Check common data directories
   ls -la /opt/ 2>/dev/null | head -20
   ls -la /srv/ 2>/dev/null | head -20
   ls -la /data/ 2>/dev/null | head -20
   ls -la /var/lib/docker/volumes/ 2>/dev/null | head -20
   \`\`\`

5. **Docker Compose Discovery**:
   \`\`\`bash
   # Find all docker-compose files
   find /opt /srv /home /root -name "docker-compose*.yml" -o -name "docker-compose*.yaml" -o -name "compose*.yml" -o -name "compose*.yaml" 2>/dev/null | head -30
   
   # Check for .env files
   find /opt /srv /home /root -name ".env" 2>/dev/null | grep -E "(docker|compose)" | head -20
   \`\`\`

6. **Label and Environment Patterns**:
   \`\`\`bash
   # Analyze common labels
   docker ps -a --format "{{.Labels}}" | tr ',' '\\n' | cut -d'=' -f1 | sort | uniq -c | sort -rn | head -20
   
   # Check for reverse proxy labels (Traefik, Nginx Proxy Manager, etc.)
   docker ps -a --format "{{.Labels}}" | grep -iE "(traefik|nginx|caddy|swag)" | head -10
   \`\`\`

${scanDepth === 'comprehensive' ? `
7. **Resource Usage**:
   \`\`\`bash
   # Docker system info
   docker system df
   
   # Container resource limits
   docker ps -q | xargs -I {} docker inspect {} --format "{{.Name}}: CPU={{.HostConfig.CpuShares}} Memory={{.HostConfig.Memory}}"
   \`\`\`

8. **Security Configuration**:
   \`\`\`bash
   # Check for running as root
   docker ps -q | xargs -I {} docker inspect {} --format "{{.Name}}: User={{.Config.User}}"
   
   # Check for privileged containers
   docker ps -q | xargs -I {} docker inspect {} --format "{{.Name}}: Privileged={{.HostConfig.Privileged}}"
   \`\`\`
` : ''}

PHASE 2: PATTERN ANALYSIS
Based on the scan results, identify and document:

1. **Naming Conventions**:
   - Container naming patterns (e.g., service-type, service_version)
   - Volume naming patterns
   - Network naming patterns

2. **Storage Patterns**:
   - Common base directories for volumes (e.g., /opt/appdata, /srv/docker)
   - Volume mount patterns per service type
   - Config vs data volume separation

3. **Network Architecture**:
   - Default network vs custom networks
   - Network segmentation patterns
   - Reverse proxy configuration (if present)

4. **Port Allocation**:
   - Port ranges used for different service types
   - Available port ranges for new services
   - Standard port mappings

5. **Configuration Management**:
   - Docker Compose file locations
   - Environment file patterns
   - Secret management approaches

PHASE 3: OUTPUT GENERATION
Generate a structured JSON output with all findings:

\`\`\`json
{
  "dockerComposeLocations": [
    "/path/to/compose/file1.yml",
    "/path/to/compose/file2.yml"
  ],
  "volumeMountPatterns": {
    "primaryPath": "/opt/appdata",
    "alternativePaths": ["/srv/docker", "/data"],
    "configPattern": "{primaryPath}/{service}/config",
    "dataPattern": "{primaryPath}/{service}/data"
  },
  "usedPorts": {
    "allocated": [80, 443, 8080, 9000],
    "available": {
      "ranges": ["8001-8079", "9001-9999"],
      "suggested": 8081
    }
  },
  "networks": {
    "default": "bridge",
    "custom": ["proxy_network", "backend_network"],
    "reverseProxy": {
      "detected": true,
      "type": "traefik|nginx|caddy",
      "network": "proxy_network"
    }
  },
  "namingConventions": {
    "containers": "{service}-{instance}",
    "volumes": "{service}_data",
    "prefixes": ["app-", "srv-"],
    "suffixes": ["-prod", "-01"]
  },
  "labels": {
    "common": ["com.docker.compose.project", "org.label-schema.name"],
    "reverseProxy": ["traefik.enable", "traefik.http.routers"]
  },
  "resourcePatterns": {
    "memoryLimits": "common|none",
    "cpuLimits": "rare|common|none",
    "privilegedContainers": []
  },
  "recommendations": {
    "volumePath": "/opt/appdata/${targetService}",
    "network": "proxy_network",
    "portSuggestion": 8081,
    "namingSuggestion": "${targetService}-01"
  }
}
\`\`\`

Focus on discovering actionable patterns that will guide the deployment configuration.
Return the JSON output as the final result for parsing by the orchestrator.
`;
  }

  getSystemPrompt(): string {
    return `
You are a Docker infrastructure analysis specialist with expertise in:

TECHNICAL EXPERTISE:
- Docker container orchestration and management
- Docker Compose configuration and patterns
- Network architecture and segmentation
- Volume management and storage patterns
- Port allocation and service discovery
- Security best practices and compliance

ANALYSIS METHODOLOGY:
- Systematic infrastructure scanning
- Pattern recognition and analysis
- Configuration discovery and documentation
- Resource utilization assessment
- Security posture evaluation

OBJECTIVES:
- Discover existing Docker deployment patterns
- Identify available resources (ports, networks, storage)
- Document naming conventions and standards
- Provide actionable recommendations
- Output structured, parseable data

Always output findings in structured JSON format for downstream processing.
Focus on actionable intelligence that guides deployment decisions.
`;
  }

  getCapabilities(): Record<string, any> {
    const config = this.getConfig();
    return {
      name: config.name,
      version: config.version,
      description: config.description,
      capabilities: config.capabilities,
      outputFormat: 'json'
    };
  }

  getConfig(): AgentConfig {
    return {
      name: 'Infrastructure Analysis Agent',
      version: '1.0.0',
      description: 'Analyzes Docker infrastructure to discover patterns and available resources',
      defaultOptions: {
        timeout_ms: 300000, // 5 minutes
        maxTurns: 50,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Docker container analysis',
        'Network topology discovery',
        'Port usage mapping',
        'Volume pattern analysis',
        'Docker Compose discovery',
        'Naming convention identification',
        'Resource utilization assessment',
        'Security configuration review'
      ],
      requiredTools: ['Bash', 'Grep'],
      optionalTools: ['Read', 'Glob'],
      typicalExecutionTime: 180000, // 3 minutes
      costEstimate: {
        min: 0.10,
        max: 0.50,
        typical: 0.25
      }
    };
  }

  protected async handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery> {
    if (error.message.includes('docker: command not found')) {
      return {
        action: 'abort' as const,
        message: 'Docker is not installed or not in PATH'
      };
    }

    if (error.message.includes('permission denied') && error.message.includes('docker.sock')) {
      return {
        action: 'abort' as const,
        message: 'User does not have permission to access Docker socket'
      };
    }

    if (error.message.includes('Cannot connect to the Docker daemon')) {
      return {
        action: 'retry' as const,
        retryDelay: 5000,
        message: 'Docker daemon is not running, retrying...'
      };
    }

    return super.handleAgentSpecificError(error, context);
  }
}