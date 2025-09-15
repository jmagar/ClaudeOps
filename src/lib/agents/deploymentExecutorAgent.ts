import { BaseAgent } from './core/BaseAgent';
import type { BaseAgentOptions, AgentConfig, AgentError, ErrorContext, ErrorRecovery } from './core/types';

interface DeploymentExecutorOptions extends BaseAgentOptions {
  configuration: string; // JSON string from config generator
  credentials: string; // JSON string from security agent
  dryRun?: boolean;
  rollbackOnFailure?: boolean;
  deploymentStrategy?: 'immediate' | 'staged' | 'blue-green';
}

export class DeploymentExecutorAgent extends BaseAgent<DeploymentExecutorOptions> {
  getAgentType(): string {
    return 'deployment-executor';
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Read', 'Write', 'Edit'];
  }

  buildPrompt(options: DeploymentExecutorOptions): string {
    const configuration = options.configuration;
    const credentials = options.credentials;
    const dryRun = options.dryRun ?? false;
    const rollbackOnFailure = options.rollbackOnFailure ?? true;
    const deploymentStrategy = options.deploymentStrategy ?? 'immediate';
    
    return `
Execute the Docker deployment using the generated configuration and credentials. Perform a systematic, production-ready deployment with proper error handling and monitoring.

DEPLOYMENT CONFIGURATION:
${configuration}

SECURITY CREDENTIALS:
${credentials}

DEPLOYMENT PARAMETERS:
- Dry Run: ${dryRun}
- Rollback on Failure: ${rollbackOnFailure}
- Deployment Strategy: ${deploymentStrategy}

PHASE 1: PRE-DEPLOYMENT VALIDATION
1. **Environment Preparation**:
   \`\`\`bash
   # Parse configuration to extract deployment directory
   echo "Starting deployment validation..."
   
   # Verify Docker is running
   docker version
   docker-compose version
   
   # Check Docker daemon status
   docker system info | grep "Server Version"
   
   # Verify available disk space
   df -h | grep -E "(/$|/var)" | head -2
   
   # Check available memory
   free -h | head -2
   \`\`\`

2. **Configuration File Validation**:
   \`\`\`bash
   # Extract deployment directory from configuration JSON
   DEPLOYMENT_DIR=\$(echo '${configuration}' | grep -o '"deploymentDirectory":"[^"]*"' | cut -d'"' -f4)
   
   echo "Deployment directory: \$DEPLOYMENT_DIR"
   cd "\$DEPLOYMENT_DIR" || exit 1
   
   # Validate docker-compose.yml syntax
   if [ -f "docker-compose.yml" ]; then
     echo "Validating docker-compose.yml..."
     docker-compose config --quiet
     echo "✅ Docker Compose configuration is valid"
   else
     echo "❌ docker-compose.yml not found"
     exit 1
   fi
   
   # Check for required files
   ls -la docker-compose.yml .env.secrets .env 2>/dev/null || echo "Some configuration files missing"
   \`\`\`

3. **Network and Port Validation**:
   \`\`\`bash
   # Extract port information from configuration
   SERVICE_PORT=\$(echo '${configuration}' | grep -o '"primary":[0-9]*' | cut -d':' -f2)
   
   if [ ! -z "\$SERVICE_PORT" ]; then
     echo "Checking if port \$SERVICE_PORT is available..."
     if netstat -tlnp 2>/dev/null | grep ":$SERVICE_PORT "; then
       echo "⚠️  Port \$SERVICE_PORT is already in use"
       netstat -tlnp 2>/dev/null | grep ":$SERVICE_PORT "
     else
       echo "✅ Port \$SERVICE_PORT is available"
     fi
   fi
   
   # Check required networks exist
   REQUIRED_NETWORKS=\$(echo '${configuration}' | grep -o '"networks":\\[[^\\]]*\\]' | grep -o '"[^"]*"' | tr -d '"' | grep -v networks)
   
   for network in \$REQUIRED_NETWORKS; do
     if docker network ls | grep -q "\$network"; then
       echo "✅ Network \$network exists"
     else
       echo "⚠️  Network \$network does not exist, will be created"
     fi
   done
   \`\`\`

PHASE 2: SECURITY INTEGRATION
4. **Credential Integration**:
   \`\`\`bash
   # Merge security credentials into environment
   if [ -f ".env.secrets" ]; then
     echo "Integrating security credentials..."
     
     # Backup original .env if it exists
     if [ -f ".env" ]; then
       cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)
     fi
     
     # Merge .env.secrets with .env
     cat .env.secrets > .env.combined
     if [ -f ".env" ]; then
       echo "" >> .env.combined
       echo "# Original environment variables" >> .env.combined
       cat .env >> .env.combined
     fi
     
     # Remove duplicates (secrets take precedence)
     awk -F= '!seen[\$1]++' .env.combined > .env.final
     mv .env.final .env
     
     # Set secure permissions
     chmod 600 .env
     chmod 600 .env.secrets
     
     echo "✅ Credentials integrated successfully"
   else
     echo "⚠️  No .env.secrets file found"
   fi
   \`\`\`

5. **Directory Structure Setup**:
   \`\`\`bash
   # Create required directories from volume configuration
   VOLUMES=\$(echo '${configuration}' | grep -o '"volumes":\\[[^\\]]*\\]' | grep -o '"[^"]*:[^"]*"' | tr -d '"')
   
   for volume in \$VOLUMES; do
     HOST_PATH=\$(echo \$volume | cut -d':' -f1)
     if [[ "\$HOST_PATH" == "./"* ]]; then
       FULL_PATH="\$(pwd)/\${HOST_PATH#./}"
       echo "Creating directory: \$FULL_PATH"
       mkdir -p "\$FULL_PATH"
       
       # Set appropriate ownership if not running as root
       if [ \$(id -u) -ne 0 ]; then
         echo "Setting ownership for \$FULL_PATH"
         chown \$(id -u):\$(id -g) "\$FULL_PATH" 2>/dev/null || echo "Could not set ownership"
       fi
     fi
   done
   \`\`\`

${!dryRun ? `
PHASE 3: DEPLOYMENT EXECUTION
6. **Pull Images**:
   \`\`\`bash
   echo "Pulling Docker images..."
   docker-compose pull
   echo "✅ Images pulled successfully"
   \`\`\`

7. **Start Services**:
   \`\`\`bash
   echo "Starting services with strategy: ${deploymentStrategy}"
   
   case "${deploymentStrategy}" in
     "immediate")
       echo "Executing immediate deployment..."
       docker-compose up -d
       ;;
     "staged")
       echo "Executing staged deployment..."
       # Start dependencies first
       DEPENDENCIES=\$(docker-compose config --services | grep -E "(postgres|redis|mysql|mongodb)")
       if [ ! -z "\$DEPENDENCIES" ]; then
         echo "Starting dependencies: \$DEPENDENCIES"
         docker-compose up -d \$DEPENDENCIES
         sleep 10
       fi
       
       # Start main services
       MAIN_SERVICES=\$(docker-compose config --services | grep -v -E "(postgres|redis|mysql|mongodb)")
       if [ ! -z "\$MAIN_SERVICES" ]; then
         echo "Starting main services: \$MAIN_SERVICES"
         docker-compose up -d \$MAIN_SERVICES
       fi
       ;;
     "blue-green")
       echo "Blue-green deployment not implemented in this version"
       echo "Falling back to immediate deployment"
       docker-compose up -d
       ;;
   esac
   
   echo "✅ Services started"
   \`\`\`

8. **Deployment Monitoring**:
   \`\`\`bash
   echo "Monitoring service startup..."
   
   # Wait for containers to start
   sleep 5
   
   # Check container status
   echo "=== Container Status ==="
   docker-compose ps
   
   # Check for any failed containers
   FAILED_CONTAINERS=\$(docker-compose ps --filter "status=exited" --format "table {{.Service}}")
   if [ ! -z "\$FAILED_CONTAINERS" ] && [ "\$FAILED_CONTAINERS" != "SERVICE" ]; then
     echo "❌ Some containers failed to start:"
     echo "\$FAILED_CONTAINERS"
     
     echo "=== Container Logs ==="
     docker-compose logs --tail=20
     
     ${rollbackOnFailure ? `
     echo "Rolling back deployment..."
     docker-compose down
     echo "❌ Deployment failed and was rolled back"
     exit 1
     ` : 'echo "⚠️  Deployment completed with errors"'}
   else
     echo "✅ All containers started successfully"
   fi
   \`\`\`

9. **Health Check Validation**:
   \`\`\`bash
   echo "Performing health checks..."
   
   # Wait for services to initialize
   sleep 10
   
   # Check health status of containers
   CONTAINERS=\$(docker-compose ps --format "{{.Name}}")
   
   for container in \$CONTAINERS; do
     echo "Checking health of \$container..."
     
     # Check if container is running
     if docker inspect "\$container" --format='{{.State.Status}}' | grep -q "running"; then
       echo "✅ \$container is running"
       
       # Check health if health check is configured
       HEALTH_STATUS=\$(docker inspect "\$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no-healthcheck")
       
       if [ "\$HEALTH_STATUS" != "no-healthcheck" ]; then
         echo "Health status: \$HEALTH_STATUS"
         if [ "\$HEALTH_STATUS" = "unhealthy" ]; then
           echo "❌ \$container is unhealthy"
           docker logs "\$container" --tail=10
         fi
       fi
     else
       echo "❌ \$container is not running"
       docker logs "\$container" --tail=10
     fi
   done
   \`\`\`

10. **Network Connectivity Test**:
    \`\`\`bash
    echo "Testing network connectivity..."
    
    # Test internal service communication
    MAIN_CONTAINER=\$(docker-compose ps --format "{{.Name}}" | head -1)
    
    if [ ! -z "\$MAIN_CONTAINER" ]; then
      echo "Testing network from \$MAIN_CONTAINER..."
      
      # Test DNS resolution
      docker exec "\$MAIN_CONTAINER" nslookup google.com 2>/dev/null || echo "External DNS resolution failed"
      
      # Test internal service discovery
      SERVICES=\$(docker-compose config --services)
      for service in \$SERVICES; do
        if [ "\$service" != "\$(echo \$MAIN_CONTAINER | sed 's/.*_\\([^_]*\\)_[0-9]*/\\1/')" ]; then
          docker exec "\$MAIN_CONTAINER" ping -c 1 "\$service" 2>/dev/null || echo "Cannot reach \$service"
        fi
      done
    fi
    \`\`\`
` : `
PHASE 3: DRY RUN VALIDATION
6. **Dry Run Execution**:
   \`\`\`bash
   echo "=== DRY RUN MODE ==="
   echo "Simulating deployment without actual execution..."
   
   # Validate what would be pulled
   echo "Images that would be pulled:"
   docker-compose config | grep "image:" | awk '{print $2}' | sort | uniq
   
   # Show what containers would be created
   echo "Services that would be started:"
   docker-compose config --services
   
   # Show port mappings
   echo "Port mappings that would be created:"
   docker-compose config | grep -A 5 "ports:" || echo "No port mappings"
   
   # Show volume mounts
   echo "Volume mounts that would be created:"
   docker-compose config | grep -A 10 "volumes:" | grep -E "source:|target:" || echo "No volume mounts"
   
   echo "✅ Dry run completed - no actual deployment performed"
   \`\`\`
`}

PHASE 4: DEPLOYMENT DOCUMENTATION
11. **Generate Deployment Report**:
    \`\`\`bash
    echo "Generating deployment report..."
    
    # Create deployment log
    cat > "deployment-report-\$(date +%Y%m%d_%H%M%S).md" << 'EOF'
# Deployment Report
    
## Deployment Summary
- Date: \$(date)
- Service: \$(echo '${configuration}' | grep -o '"serviceName":"[^"]*"' | cut -d'"' -f4)
- Strategy: ${deploymentStrategy}
- Dry Run: ${dryRun}
    
## Container Status
\`\`\`
\$(docker-compose ps 2>/dev/null || echo "No containers running")
\`\`\`
    
## Resource Usage
\`\`\`
\$(docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null || echo "No resource data available")
\`\`\`
    
## Port Mappings
\`\`\`
\$(docker-compose port \$(docker-compose config --services | head -1) 2>/dev/null || echo "No port mappings available")
\`\`\`
    
## Logs (last 10 lines)
\`\`\`
\$(docker-compose logs --tail=10 2>/dev/null || echo "No logs available")
\`\`\`
    
## Next Steps
1. Verify application functionality
2. Configure monitoring and alerting
3. Set up backup procedures
4. Update documentation
5. Schedule security updates
    
EOF
    
    echo "✅ Deployment report generated"
    \`\`\`

PHASE 5: FINAL STATUS COLLECTION
12. **Collect Deployment Status**:
    \`\`\`bash
    echo "=== FINAL DEPLOYMENT STATUS ==="
    
    # Container IDs and status
    CONTAINER_IDS=\$(docker-compose ps -q 2>/dev/null || echo "")
    CONTAINER_NAMES=\$(docker-compose ps --format "{{.Name}}" 2>/dev/null || echo "")
    
    echo "Container IDs: \$CONTAINER_IDS"
    echo "Container Names: \$CONTAINER_NAMES"
    
    # Service URLs
    if [ ! -z "\$SERVICE_PORT" ]; then
      echo "Service URL: http://localhost:\$SERVICE_PORT"
    fi
    
    # Network information
    NETWORKS=\$(docker network ls --filter "name=\$(basename \$(pwd))" --format "{{.Name}}" 2>/dev/null || echo "")
    echo "Created Networks: \$NETWORKS"
    
    # Volume information
    VOLUMES=\$(docker volume ls --filter "name=\$(basename \$(pwd))" --format "{{.Name}}" 2>/dev/null || echo "")
    echo "Created Volumes: \$VOLUMES"
    
    # Overall status
    RUNNING_CONTAINERS=\$(docker-compose ps --filter "status=running" --format "{{.Name}}" 2>/dev/null | wc -l)
    TOTAL_CONTAINERS=\$(docker-compose ps --format "{{.Name}}" 2>/dev/null | wc -l)
    
    echo "Status: \$RUNNING_CONTAINERS/\$TOTAL_CONTAINERS containers running"
    
    if [ "\$RUNNING_CONTAINERS" -eq "\$TOTAL_CONTAINERS" ] && [ "\$TOTAL_CONTAINERS" -gt 0 ]; then
      echo "✅ Deployment completed successfully"
      DEPLOYMENT_STATUS="success"
    elif [ "\$RUNNING_CONTAINERS" -gt 0 ]; then
      echo "⚠️  Deployment completed with warnings"
      DEPLOYMENT_STATUS="partial"
    else
      echo "❌ Deployment failed"
      DEPLOYMENT_STATUS="failed"
    fi
    
    echo "=== DEPLOYMENT SUMMARY ==="
    echo "Status: \$DEPLOYMENT_STATUS"
    echo "Container IDs: \$CONTAINER_IDS"
    echo "Container Names: \$CONTAINER_NAMES"
    echo "Service Port: \$SERVICE_PORT"
    echo "Networks: \$NETWORKS"
    echo "Volumes: \$VOLUMES"
    \`\`\`

FINAL OUTPUT:
Generate comprehensive JSON output with deployment results:

\`\`\`json
{
  "deploymentStatus": "success|partial|failed",
  "timestamp": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "strategy": "${deploymentStrategy}",
  "dryRun": ${dryRun},
  "containers": {
    "ids": ["\$CONTAINER_IDS"],
    "names": ["\$CONTAINER_NAMES"],
    "running": "\$RUNNING_CONTAINERS",
    "total": "\$TOTAL_CONTAINERS"
  },
  "services": {
    "primaryPort": "\$SERVICE_PORT",
    "serviceUrl": "http://localhost:\$SERVICE_PORT",
    "healthStatus": "monitoring_required"
  },
  "infrastructure": {
    "networks": ["\$NETWORKS"],
    "volumes": ["\$VOLUMES"],
    "deploymentDirectory": "\$DEPLOYMENT_DIR"
  },
  "logs": {
    "deploymentReport": "deployment-report-*.md",
    "containerLogs": "Available via docker-compose logs"
  },
  "nextSteps": [
    "Verify application functionality",
    "Configure monitoring and health checks",
    "Set up backup procedures",
    "Review and test failover procedures",
    "Schedule regular security updates"
  ],
  "troubleshooting": {
    "checkLogs": "docker-compose logs [service]",
    "restartService": "docker-compose restart [service]",
    "viewStatus": "docker-compose ps",
    "accessContainer": "docker-compose exec [service] /bin/bash"
  }
}
\`\`\`

Execute the deployment systematically with comprehensive monitoring and error handling.
Provide detailed feedback on each step and maintain rollback capability if issues occur.
`;
  }

  getSystemPrompt(): string {
    return `
You are a Docker deployment execution specialist with expertise in:

DEPLOYMENT ORCHESTRATION:
- Docker Compose service orchestration
- Container lifecycle management
- Multi-service deployment strategies
- Blue-green and staged deployments
- Rollback and recovery procedures
- Health check implementation

OPERATIONAL RELIABILITY:
- Pre-deployment validation
- Infrastructure readiness assessment
- Service dependency management
- Network connectivity testing
- Resource allocation and monitoring
- Error detection and handling

PRODUCTION DEPLOYMENT:
- Security credential integration
- Environment variable management
- Volume and storage configuration
- Network setup and isolation
- Port allocation and load balancing
- SSL/TLS certificate deployment

MONITORING AND VALIDATION:
- Container health monitoring
- Service availability testing
- Performance metric collection
- Log aggregation and analysis
- Network connectivity validation
- Resource utilization tracking

INCIDENT RESPONSE:
- Failure detection and alerting
- Automated rollback procedures
- Error diagnosis and troubleshooting
- Recovery procedure execution
- Post-incident analysis
- Documentation and reporting

OBJECTIVES:
- Execute reliable, production-ready deployments
- Implement comprehensive error handling and recovery
- Provide detailed monitoring and status reporting
- Ensure security and compliance requirements
- Maintain operational excellence and reliability

Always prioritize system stability and security over speed.
Implement comprehensive monitoring and validation at each step.
Maintain detailed logs and documentation for troubleshooting.
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
      deploymentStrategies: [
        'immediate',
        'staged',
        'blue-green'
      ],
      monitoringFeatures: [
        'Container health monitoring',
        'Network connectivity testing',
        'Resource utilization tracking',
        'Service availability validation'
      ]
    };
  }

  getConfig(): AgentConfig {
    return {
      name: 'Deployment Executor Agent',
      version: '1.0.0',
      description: 'Executes Docker deployments with comprehensive monitoring and error handling',
      defaultOptions: {
        timeout_ms: 300000, // 5 minutes
        maxTurns: 40,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Docker Compose deployment execution',
        'Pre-deployment validation',
        'Security credential integration',
        'Multi-service orchestration',
        'Health check validation',
        'Network connectivity testing',
        'Resource monitoring',
        'Error handling and rollback',
        'Deployment documentation'
      ],
      requiredTools: ['Bash', 'Read'],
      optionalTools: ['Write', 'Edit'],
      typicalExecutionTime: 240000, // 4 minutes
      costEstimate: {
        min: 0.12,
        max: 0.40,
        typical: 0.20
      }
    };
  }

  protected async handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery> {
    if (error.message.includes('docker-compose') && error.message.includes('command not found')) {
      return {
        action: 'abort' as const,
        message: 'Docker Compose is required but not installed on the system'
      };
    }

    if (error.message.includes('Cannot connect to the Docker daemon')) {
      return {
        action: 'abort' as const,
        message: 'Docker daemon is not running or accessible'
      };
    }

    if (error.message.includes('port') && error.message.includes('already in use')) {
      return {
        action: 'retry' as const,
        modifiedPrompt: 'Use alternative port allocation to avoid conflicts',
        message: 'Port conflict detected, attempting to use alternative ports'
      };
    }

    if (error.message.includes('permission denied') || error.message.includes('mkdir')) {
      return {
        action: 'retry' as const,
        modifiedPrompt: 'Use current directory for deployment and adjust permissions',
        message: 'Permission denied, using current directory for deployment'
      };
    }

    if (error.message.includes('network') && error.message.includes('not found')) {
      return {
        action: 'continue' as const,
        message: 'Required network not found, will be created during deployment'
      };
    }

    if (error.message.includes('image') && error.message.includes('not found')) {
      return {
        action: 'retry' as const,
        retryDelay: 10000,
        message: 'Docker image not found, retrying with image pull'
      };
    }

    return super.handleAgentSpecificError(error, context);
  }
}