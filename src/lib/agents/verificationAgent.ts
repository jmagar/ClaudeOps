import { BaseAgent } from './core/BaseAgent';
import type { BaseAgentOptions, AgentConfig, AgentError, ErrorContext, ErrorRecovery } from './core/types';

interface VerificationOptions extends BaseAgentOptions {
  serviceName: string;
  deployment: string; // JSON string from deployment executor
  comprehensiveTest?: boolean;
  performanceTest?: boolean;
  securityScan?: boolean;
}

export class VerificationAgent extends BaseAgent<VerificationOptions> {
  getAgentType(): string {
    return 'verification';
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Read', 'WebFetch', 'mcp__fetch__fetch'];
  }

  buildPrompt(options: VerificationOptions): string {
    const serviceName = options.serviceName;
    const deployment = options.deployment;
    const comprehensiveTest = options.comprehensiveTest ?? true;
    const performanceTest = options.performanceTest ?? false;
    const securityScan = options.securityScan ?? true;
    
    return `
Verify that the "${serviceName}" service deployment was successful and is operating correctly. Perform comprehensive testing to ensure production readiness.

DEPLOYMENT INFORMATION:
${deployment}

VERIFICATION PARAMETERS:
- Service Name: ${serviceName}
- Comprehensive Testing: ${comprehensiveTest}
- Performance Testing: ${performanceTest}
- Security Scanning: ${securityScan}

PHASE 1: CONTAINER HEALTH VERIFICATION
1. **Container Status Check**:
   \`\`\`bash
   echo "=== CONTAINER HEALTH VERIFICATION ==="
   
   # Parse deployment info to get container details
   CONTAINER_NAMES=\$(echo '${deployment}' | grep -o '"names":\\[[^\\]]*\\]' | sed 's/.*\\[//;s/\\].*//' | tr ',' ' ' | tr -d '"')
   SERVICE_PORT=\$(echo '${deployment}' | grep -o '"primaryPort":"[^"]*"' | cut -d'"' -f4)
   DEPLOYMENT_DIR=\$(echo '${deployment}' | grep -o '"deploymentDirectory":"[^"]*"' | cut -d'"' -f4)
   
   echo "Container Names: \$CONTAINER_NAMES"
   echo "Service Port: \$SERVICE_PORT"
   echo "Deployment Directory: \$DEPLOYMENT_DIR"
   
   # Check if deployment directory exists and navigate to it
   if [ -d "\$DEPLOYMENT_DIR" ]; then
     cd "\$DEPLOYMENT_DIR"
     echo "✅ Deployment directory accessible"
   else
     echo "⚠️  Deployment directory not found, using current directory"
   fi
   
   # Verify all containers are running
   echo "Checking container status..."
   for container in \$CONTAINER_NAMES; do
     if [ ! -z "\$container" ]; then
       STATUS=\$(docker inspect "\$container" --format='{{.State.Status}}' 2>/dev/null || echo "not_found")
       HEALTH=\$(docker inspect "\$container" --format='{{.State.Health.Status}}' 2>/dev/null || echo "no_healthcheck")
       
       echo "Container: \$container"
       echo "  Status: \$STATUS"
       echo "  Health: \$HEALTH"
       
       if [ "\$STATUS" != "running" ]; then
         echo "❌ Container \$container is not running"
         docker logs "\$container" --tail=5 2>/dev/null || echo "No logs available"
       else
         echo "✅ Container \$container is running"
       fi
     fi
   done
   \`\`\`

2. **Resource Usage Analysis**:
   \`\`\`bash
   echo "=== RESOURCE USAGE ANALYSIS ==="
   
   # Check resource consumption
   echo "Current resource usage:"
   docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" 2>/dev/null || echo "No containers running"
   
   # Check disk usage for volumes
   echo "Volume disk usage:"
   VOLUMES=\$(docker volume ls --filter "name=\$(basename \$(pwd) 2>/dev/null || echo 'unknown')" --format "{{.Name}}" 2>/dev/null)
   for volume in \$VOLUMES; do
     if [ ! -z "\$volume" ]; then
       SIZE=\$(docker system df | grep "\$volume" | awk '{print \$3}' || echo "unknown")
       echo "Volume \$volume: \$SIZE"
     fi
   done
   \`\`\`

PHASE 2: SERVICE AVAILABILITY TESTING
3. **Port Accessibility Test**:
   \`\`\`bash
   echo "=== SERVICE AVAILABILITY TESTING ==="
   
   if [ ! -z "\$SERVICE_PORT" ]; then
     echo "Testing port accessibility..."
     
     # Test if port is listening
     if netstat -tlnp 2>/dev/null | grep ":$SERVICE_PORT "; then
       echo "✅ Port \$SERVICE_PORT is listening"
       
       # Test HTTP connectivity if it's an HTTP service
       echo "Testing HTTP connectivity..."
       HTTP_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:\$SERVICE_PORT/" 2>/dev/null || echo "000")
       
       case "\$HTTP_STATUS" in
         "200"|"302"|"301")
           echo "✅ HTTP service responding (Status: \$HTTP_STATUS)"
           ;;
         "404")
           echo "⚠️  HTTP service responding but endpoint not found (Status: \$HTTP_STATUS)"
           ;;
         "000")
           echo "⚠️  HTTP connection failed - service may not be HTTP-based"
           ;;
         *)
           echo "⚠️  HTTP service responding with status: \$HTTP_STATUS"
           ;;
       esac
       
       # Test HTTPS if port suggests SSL
       if [[ "\$SERVICE_PORT" =~ ^(443|8443|9443)$ ]]; then
         echo "Testing HTTPS connectivity..."
         HTTPS_STATUS=\$(curl -s -k -o /dev/null -w "%{http_code}" "https://localhost:\$SERVICE_PORT/" 2>/dev/null || echo "000")
         echo "HTTPS Status: \$HTTPS_STATUS"
       fi
       
     else
       echo "❌ Port \$SERVICE_PORT is not listening"
       echo "Checking what's using similar ports..."
       netstat -tlnp 2>/dev/null | grep -E ":8[0-9]{3} " | head -5
     fi
   else
     echo "⚠️  No service port specified, skipping port tests"
   fi
   \`\`\`

4. **Health Endpoint Testing**:
   \`\`\`bash
   echo "=== HEALTH ENDPOINT TESTING ==="
   
   if [ ! -z "\$SERVICE_PORT" ]; then
     # Test common health endpoints
     HEALTH_ENDPOINTS=("/health" "/healthz" "/status" "/ping" "/api/health" "/actuator/health")
     
     for endpoint in "\${HEALTH_ENDPOINTS[@]}"; do
       echo "Testing health endpoint: \$endpoint"
       HEALTH_STATUS=\$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:\$SERVICE_PORT\$endpoint" 2>/dev/null || echo "000")
       
       if [ "\$HEALTH_STATUS" = "200" ]; then
         echo "✅ Health endpoint \$endpoint is responding"
         HEALTH_RESPONSE=\$(curl -s "http://localhost:\$SERVICE_PORT\$endpoint" 2>/dev/null || echo "No response body")
         echo "Response: \${HEALTH_RESPONSE:0:200}..."
         break
       elif [ "\$HEALTH_STATUS" != "000" ]; then
         echo "⚠️  Health endpoint \$endpoint returned: \$HEALTH_STATUS"
       fi
     done
   fi
   \`\`\`

${comprehensiveTest ? `
PHASE 3: COMPREHENSIVE TESTING
5. **Database Connectivity Test**:
   \`\`\`bash
   echo "=== DATABASE CONNECTIVITY TESTING ==="
   
   # Check for database containers
   DB_CONTAINERS=\$(docker-compose ps --format "{{.Name}}" 2>/dev/null | grep -E "(postgres|mysql|mongo|redis)" || echo "")
   
   if [ ! -z "\$DB_CONTAINERS" ]; then
     for db_container in \$DB_CONTAINERS; do
       echo "Testing database connectivity: \$db_container"
       
       # Test if database container is responding
       if docker exec "\$db_container" echo "Database connection test" 2>/dev/null; then
         echo "✅ Database container \$db_container is accessible"
         
         # Database-specific connectivity tests
         if echo "\$db_container" | grep -q "postgres"; then
           docker exec "\$db_container" pg_isready 2>/dev/null && echo "✅ PostgreSQL is ready" || echo "⚠️  PostgreSQL not ready"
         elif echo "\$db_container" | grep -q "mysql"; then
           docker exec "\$db_container" mysqladmin ping 2>/dev/null && echo "✅ MySQL is ready" || echo "⚠️  MySQL not ready"
         elif echo "\$db_container" | grep -q "redis"; then
           docker exec "\$db_container" redis-cli ping 2>/dev/null && echo "✅ Redis is ready" || echo "⚠️  Redis not ready"
         fi
       else
         echo "❌ Database container \$db_container is not accessible"
       fi
     done
   else
     echo "ℹ️  No database containers found"
   fi
   \`\`\`

6. **Network Connectivity Test**:
   \`\`\`bash
   echo "=== NETWORK CONNECTIVITY TESTING ==="
   
   # Test inter-service communication
   MAIN_CONTAINER=\$(echo \$CONTAINER_NAMES | awk '{print \$1}')
   
   if [ ! -z "\$MAIN_CONTAINER" ]; then
     echo "Testing network connectivity from \$MAIN_CONTAINER..."
     
     # Test external connectivity
     docker exec "\$MAIN_CONTAINER" ping -c 1 8.8.8.8 2>/dev/null && echo "✅ External connectivity working" || echo "⚠️  External connectivity issues"
     
     # Test DNS resolution
     docker exec "\$MAIN_CONTAINER" nslookup google.com 2>/dev/null && echo "✅ DNS resolution working" || echo "⚠️  DNS resolution issues"
     
     # Test service discovery
     SERVICES=\$(docker-compose config --services 2>/dev/null || echo "")
     for service in \$SERVICES; do
       if [ "\$service" != "\$(echo \$MAIN_CONTAINER | sed 's/.*_\\([^_]*\\)_[0-9]*/\\1/')" ]; then
         docker exec "\$MAIN_CONTAINER" ping -c 1 "\$service" 2>/dev/null && echo "✅ Can reach \$service" || echo "⚠️  Cannot reach \$service"
       fi
     done
   fi
   \`\`\`

7. **Configuration Validation**:
   \`\`\`bash
   echo "=== CONFIGURATION VALIDATION ==="
   
   # Validate environment variables are loaded
   echo "Checking environment variable configuration..."
   for container in \$CONTAINER_NAMES; do
     if [ ! -z "\$container" ]; then
       echo "Environment variables in \$container:"
       docker exec "\$container" env | grep -E "(API|DB|DATABASE|URL|KEY|SECRET|TOKEN)" | head -10 | sed 's/=.*/=***/' || echo "No sensitive env vars visible"
     fi
   done
   
   # Check volume mounts
   echo "Checking volume mounts..."
   for container in \$CONTAINER_NAMES; do
     if [ ! -z "\$container" ]; then
       echo "Volume mounts for \$container:"
       docker inspect "\$container" --format='{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{end}}' 2>/dev/null | head -5
     fi
   done
   \`\`\`
` : ''}

${performanceTest ? `
PHASE 4: PERFORMANCE TESTING
8. **Load Testing**:
   \`\`\`bash
   echo "=== PERFORMANCE TESTING ==="
   
   if [ ! -z "\$SERVICE_PORT" ]; then
     echo "Performing basic load test..."
     
     # Simple load test with curl
     echo "Testing response time..."
     for i in {1..5}; do
       RESPONSE_TIME=\$(curl -s -o /dev/null -w "%{time_total}" "http://localhost:\$SERVICE_PORT/" 2>/dev/null || echo "0")
       echo "Request \$i: \${RESPONSE_TIME}s"
     done
     
     # Test concurrent connections if ab is available
     if command -v ab &> /dev/null; then
       echo "Running concurrent connection test..."
       ab -n 10 -c 2 "http://localhost:\$SERVICE_PORT/" 2>/dev/null | grep -E "(Requests per second|Time per request)" || echo "Load test failed"
     else
       echo "ℹ️  Apache Bench (ab) not available for load testing"
     fi
   fi
   \`\`\`
` : ''}

${securityScan ? `
PHASE 5: SECURITY VALIDATION
9. **Security Configuration Check**:
   \`\`\`bash
   echo "=== SECURITY VALIDATION ==="
   
   # Check container security settings
   for container in \$CONTAINER_NAMES; do
     if [ ! -z "\$container" ]; then
       echo "Security settings for \$container:"
       
       # Check if running as root
       USER_ID=\$(docker exec "\$container" id -u 2>/dev/null || echo "unknown")
       if [ "\$USER_ID" = "0" ]; then
         echo "⚠️  Container running as root (UID: \$USER_ID)"
       else
         echo "✅ Container running as non-root (UID: \$USER_ID)"
       fi
       
       # Check privileged mode
       PRIVILEGED=\$(docker inspect "\$container" --format='{{.HostConfig.Privileged}}' 2>/dev/null || echo "unknown")
       if [ "\$PRIVILEGED" = "true" ]; then
         echo "⚠️  Container running in privileged mode"
       else
         echo "✅ Container not privileged"
       fi
       
       # Check read-only filesystem
       READONLY=\$(docker inspect "\$container" --format='{{.HostConfig.ReadonlyRootfs}}' 2>/dev/null || echo "unknown")
       if [ "\$READONLY" = "true" ]; then
         echo "✅ Read-only root filesystem enabled"
       else
         echo "⚠️  Root filesystem is writable"
       fi
     fi
   done
   \`\`\`

10. **SSL/TLS Verification**:
    \`\`\`bash
    echo "=== SSL/TLS VERIFICATION ==="
    
    # Check for SSL certificates
    if [ -d "ssl" ]; then
      echo "Checking SSL certificates..."
      for cert in ssl/*.crt; do
        if [ -f "\$cert" ]; then
          echo "Certificate: \$cert"
          openssl x509 -in "\$cert" -text -noout | grep -E "(Subject:|Not After:|Issuer:)" 2>/dev/null || echo "Certificate validation failed"
        fi
      done
    else
      echo "ℹ️  No SSL certificates found"
    fi
    
    # Test HTTPS endpoints if available
    if [ ! -z "\$SERVICE_PORT" ]; then
      echo "Testing SSL/TLS connectivity..."
      openssl s_client -connect localhost:\$SERVICE_PORT -timeout 5 </dev/null 2>/dev/null | grep -E "(CONNECTED|Verify return code)" || echo "No SSL service detected"
    fi
    \`\`\`
` : ''}

PHASE 6: LOG ANALYSIS
11. **Log Analysis**:
    \`\`\`bash
    echo "=== LOG ANALYSIS ==="
    
    # Analyze container logs for errors
    for container in \$CONTAINER_NAMES; do
      if [ ! -z "\$container" ]; then
        echo "Analyzing logs for \$container..."
        
        # Check for error patterns
        ERROR_COUNT=\$(docker logs "\$container" --since 5m 2>&1 | grep -i -c -E "(error|exception|failed|fatal|panic)" || echo "0")
        WARN_COUNT=\$(docker logs "\$container" --since 5m 2>&1 | grep -i -c -E "(warn|warning)" || echo "0")
        
        echo "Errors in last 5 minutes: \$ERROR_COUNT"
        echo "Warnings in last 5 minutes: \$WARN_COUNT"
        
        if [ "\$ERROR_COUNT" -gt 0 ]; then
          echo "Recent errors:"
          docker logs "\$container" --since 5m 2>&1 | grep -i -E "(error|exception|failed|fatal|panic)" | tail -3
        fi
        
        # Check startup messages
        echo "Startup status:"
        docker logs "\$container" 2>&1 | grep -i -E "(started|listening|ready|initialized)" | tail -2 || echo "No startup messages found"
      fi
    done
    \`\`\`

PHASE 7: OVERALL VERIFICATION SUMMARY
12. **Generate Verification Report**:
    \`\`\`bash
    echo "=== VERIFICATION SUMMARY ==="
    
    # Calculate overall health score
    TOTAL_CHECKS=0
    PASSED_CHECKS=0
    
    # Container health
    RUNNING_CONTAINERS=\$(docker-compose ps --filter "status=running" --format "{{.Name}}" 2>/dev/null | wc -l)
    TOTAL_CONTAINERS=\$(docker-compose ps --format "{{.Name}}" 2>/dev/null | wc -l)
    
    if [ "\$TOTAL_CONTAINERS" -gt 0 ]; then
      TOTAL_CHECKS=\$((TOTAL_CHECKS + 1))
      if [ "\$RUNNING_CONTAINERS" -eq "\$TOTAL_CONTAINERS" ]; then
        PASSED_CHECKS=\$((PASSED_CHECKS + 1))
        echo "✅ All containers running (\$RUNNING_CONTAINERS/\$TOTAL_CONTAINERS)"
      else
        echo "❌ Some containers not running (\$RUNNING_CONTAINERS/\$TOTAL_CONTAINERS)"
      fi
    fi
    
    # Service availability
    if [ ! -z "\$SERVICE_PORT" ]; then
      TOTAL_CHECKS=\$((TOTAL_CHECKS + 1))
      if netstat -tlnp 2>/dev/null | grep -q ":$SERVICE_PORT "; then
        PASSED_CHECKS=\$((PASSED_CHECKS + 1))
        echo "✅ Service port accessible"
      else
        echo "❌ Service port not accessible"
      fi
    fi
    
    # Calculate health percentage
    if [ "\$TOTAL_CHECKS" -gt 0 ]; then
      HEALTH_PERCENTAGE=\$(( PASSED_CHECKS * 100 / TOTAL_CHECKS ))
      echo "Overall Health Score: \$HEALTH_PERCENTAGE% (\$PASSED_CHECKS/\$TOTAL_CHECKS checks passed)"
      
      if [ "\$HEALTH_PERCENTAGE" -ge 90 ]; then
        VERIFICATION_STATUS="excellent"
        echo "✅ Deployment verification: EXCELLENT"
      elif [ "\$HEALTH_PERCENTAGE" -ge 75 ]; then
        VERIFICATION_STATUS="good"
        echo "✅ Deployment verification: GOOD"
      elif [ "\$HEALTH_PERCENTAGE" -ge 50 ]; then
        VERIFICATION_STATUS="fair"
        echo "⚠️  Deployment verification: FAIR"
      else
        VERIFICATION_STATUS="poor"
        echo "❌ Deployment verification: POOR"
      fi
    else
      VERIFICATION_STATUS="unknown"
      HEALTH_PERCENTAGE=0
      echo "⚠️  Deployment verification: UNKNOWN (no checks performed)"
    fi
    
    echo "=== END VERIFICATION ==="
    \`\`\`

FINAL OUTPUT:
Generate comprehensive JSON verification report:

\`\`\`json
{
  "verificationStatus": "\$VERIFICATION_STATUS",
  "healthScore": "\$HEALTH_PERCENTAGE",
  "timestamp": "\$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "serviceName": "${serviceName}",
  "containers": {
    "total": "\$TOTAL_CONTAINERS",
    "running": "\$RUNNING_CONTAINERS",
    "names": ["\$CONTAINER_NAMES"],
    "healthStatus": "monitored"
  },
  "serviceAvailability": {
    "port": "\$SERVICE_PORT",
    "accessible": true,
    "httpStatus": "200",
    "healthEndpoint": "available"
  },
  "security": {
    "nonRootContainers": true,
    "privilegedContainers": false,
    "readOnlyFilesystem": "mixed",
    "sslEnabled": ${securityScan}
  },
  "performance": {
    "tested": ${performanceTest},
    "responseTimeMs": "acceptable",
    "resourceUsage": "normal"
  },
  "connectivity": {
    "externalAccess": "working",
    "dnsResolution": "working",
    "serviceDiscovery": "working"
  },
  "logs": {
    "errorCount": "low",
    "warningCount": "low",
    "startupSuccess": true
  },
  "recommendations": [
    "Monitor resource usage over time",
    "Set up automated health checks", 
    "Configure log rotation and monitoring",
    "Schedule regular security updates",
    "Test backup and recovery procedures"
  ],
  "issues": [
    "Document any issues found during verification"
  ],
  "nextSteps": [
    "Configure production monitoring",
    "Set up alerting and notification",
    "Create operational runbooks",
    "Schedule maintenance windows",
    "Plan capacity scaling"
  ]
}
\`\`\`

Perform thorough verification to ensure production readiness.
Document all findings and provide actionable recommendations.
Focus on reliability, security, and operational excellence.
`;
  }

  getSystemPrompt(): string {
    return `
You are a deployment verification specialist with expertise in:

SYSTEM VERIFICATION:
- Container health and status monitoring
- Service availability and connectivity testing
- Resource utilization and performance analysis
- Network configuration and accessibility
- Database connectivity and health checks
- SSL/TLS certificate validation

QUALITY ASSURANCE:
- Comprehensive testing procedures
- Performance benchmarking and analysis
- Load testing and stress testing
- Configuration validation and compliance
- Error detection and log analysis
- Health check implementation

SECURITY VALIDATION:
- Security configuration assessment
- Container security scanning
- Network security validation
- SSL/TLS configuration testing
- Access control verification
- Vulnerability assessment

OPERATIONAL READINESS:
- Production readiness assessment
- Monitoring and alerting validation
- Backup and recovery testing
- Documentation and runbook validation
- Compliance and standards verification
- Incident response preparation

RELIABILITY ENGINEERING:
- Fault tolerance testing
- Failover and recovery validation
- Scalability assessment
- Performance optimization
- Monitoring and observability
- SLA and SLO validation

OBJECTIVES:
- Verify deployment success and operational readiness
- Validate security configurations and compliance
- Assess performance and reliability characteristics
- Identify potential issues and risks
- Provide actionable recommendations for improvement

Always perform comprehensive verification across all system components.
Focus on production readiness and operational excellence.
Provide detailed analysis and actionable recommendations.
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
      testingTypes: [
        'Container health verification',
        'Service availability testing',
        'Network connectivity testing',
        'Security configuration validation',
        'Performance benchmarking',
        'Log analysis and error detection'
      ]
    };
  }

  getConfig(): AgentConfig {
    return {
      name: 'Verification Agent',
      version: '1.0.0',
      description: 'Verifies deployment success and validates system functionality and security',
      defaultOptions: {
        timeout_ms: 120000, // 2 minutes
        maxTurns: 30,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'Container health verification',
        'Service availability testing',
        'Port accessibility validation',
        'Health endpoint testing',
        'Database connectivity testing',
        'Network connectivity validation',
        'Security configuration assessment',
        'Performance testing',
        'SSL/TLS validation',
        'Log analysis and error detection'
      ],
      requiredTools: ['Bash', 'Read'],
      optionalTools: ['WebFetch', 'mcp__fetch__fetch'],
      typicalExecutionTime: 90000, // 1.5 minutes
      costEstimate: {
        min: 0.06,
        max: 0.25,
        typical: 0.12
      }
    };
  }

  protected async handleAgentSpecificError(error: AgentError, context: ErrorContext): Promise<ErrorRecovery> {
    if (error.message.includes('curl') && error.message.includes('command not found')) {
      return {
        action: 'continue' as const,
        message: 'curl not available, skipping HTTP connectivity tests'
      };
    }

    if (error.message.includes('netstat') && error.message.includes('command not found')) {
      return {
        action: 'continue' as const,
        message: 'netstat not available, using alternative port checking methods'
      };
    }

    if (error.message.includes('docker') && error.message.includes('permission denied')) {
      return {
        action: 'retry' as const,
        message: 'Docker permission issues, attempting verification with available permissions'
      };
    }

    if (error.message.includes('connection refused') || error.message.includes('timeout')) {
      return {
        action: 'continue' as const,
        message: 'Service connectivity issues detected, documenting for investigation'
      };
    }

    if (error.message.includes('openssl') && error.message.includes('command not found')) {
      return {
        action: 'continue' as const,
        message: 'OpenSSL not available, skipping SSL certificate validation'
      };
    }

    return super.handleAgentSpecificError(error, context);
  }
}