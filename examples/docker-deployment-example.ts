#!/usr/bin/env tsx

import { AgentFactory, AgentUtils } from '../src/lib/agents';
import type { DockerDeploymentAgent } from '../src/lib/agents/dockerDeploymentAgent';

/**
 * Example: Docker Deployment Agent Usage
 * 
 * This demonstrates how to use the Docker Deployment Agent to deploy services
 * in a production environment with comprehensive research, security, and monitoring.
 */

async function deployService(serviceName: string) {
  console.log(`\n🚀 Starting Docker deployment for service: ${serviceName}\n`);

  // Create the Docker deployment agent
  const agent = AgentFactory.create('docker-deployment') as DockerDeploymentAgent;

  // Set up logging and progress tracking
  const { onLog, onProgress } = AgentUtils.createCombinedCallbacks(`Docker-${serviceName}`);

  try {
    // Execute deployment with comprehensive options
    const result = await agent.execute({
      // Required service name
      serviceName: serviceName,
      
      // Deployment configuration
      environment: 'production',
      forceLatest: false,           // Use stable versions
      enableSSL: true,              // Enable SSL/TLS
      generateCredentials: true,    // Generate secure credentials
      securityScanEnabled: true,    // Enable security scanning
      monitoringEnabled: true,      // Enable monitoring setup
      
      // Optional custom configuration
      // customPorts: { web: 8080, admin: 8081 },
      // volumeMounts: { data: '/opt/app/data', logs: '/opt/app/logs' },
      // environmentVariables: { NODE_ENV: 'production' },
      
      // Framework options
      timeout_ms: 1800000,          // 30 minutes for complex deployments
      maxTurns: 150,                // Allow many turns for thorough research
      costLimit: 5.00,              // $5 limit for comprehensive deployment
      
      // Callbacks
      onLog,
      onProgress,
      
      // Error handling hooks
      hooks: {
        onError: async (error, context) => {
          console.error(`\n❌ Deployment Error:`, {
            type: error.type,
            subtype: error.subtype,
            message: error.message,
            turn: context.currentTurn,
            cost: context.totalCost
          });
          
          // Custom error recovery for deployment issues
          if (error.message.includes('port already in use')) {
            return { action: 'continue', message: 'Will find alternative port' };
          }
          
          return { action: 'abort' };
        },
        
        onComplete: async (result) => {
          console.log(`\n✅ Deployment completed successfully!`);
          console.log(`📊 Summary:`, {
            service: serviceName,
            status: result.status,
            duration: `${(result.duration / 1000).toFixed(1)}s`,
            cost: `$${result.cost.toFixed(4)}`,
            turns: result.usage.input_tokens ? 'Available' : 'N/A'
          });
          
          if (result.summary) {
            console.log(`\n📋 Executive Summary:\n${result.summary}`);
          }
        }
      }
    });

    // Display results
    console.log(`\n🎉 Deployment Results for ${serviceName}:`);
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(1)} seconds`);
    console.log(`Cost: $${result.cost.toFixed(4)}`);
    console.log(`Execution ID: ${result.executionId}`);
    
    if (result.sessionId) {
      console.log(`Session ID: ${result.sessionId} (can be resumed if needed)`);
    }

    return result;

  } catch (error) {
    console.error(`\n💥 Deployment failed for ${serviceName}:`, error.message);
    
    // Check if there's a session that can be resumed
    if (error.context?.sessionId) {
      console.log(`\n🔄 You can resume this deployment with session ID: ${error.context.sessionId}`);
    }
    
    throw error;
  }
}

async function deployMultipleServices() {
  const services = [
    'jellyfin',    // Media server
    'nextcloud',   // File sync
    'grafana',     // Monitoring dashboard
  ];

  console.log(`\n🚀 Deploying multiple services: ${services.join(', ')}\n`);

  for (const service of services) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🎯 Deploying: ${service}`);
      console.log(`${'='.repeat(60)}`);
      
      await deployService(service);
      
      console.log(`\n✅ ${service} deployment completed successfully`);
      
      // Wait between deployments to avoid resource conflicts
      if (services.indexOf(service) < services.length - 1) {
        console.log(`\n⏳ Waiting 30 seconds before next deployment...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
      
    } catch (error) {
      console.error(`\n❌ Failed to deploy ${service}:`, error.message);
      console.log(`\n⏭️ Continuing with next service...`);
    }
  }
}

// Example usage functions
export {
  deployService,
  deployMultipleServices
};

// Direct execution if run as script
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const command = args[0];
  const serviceName = args[1];

  async function main() {
    try {
      switch (command) {
        case 'deploy':
          if (!serviceName) {
            console.error('❌ Please provide a service name: npm run deploy:example deploy <service-name>');
            process.exit(1);
          }
          await deployService(serviceName);
          break;
          
        case 'deploy-multiple':
          await deployMultipleServices();
          break;
          
        case 'list-agents':
          console.log('Available agent types:', AgentFactory.getAvailableTypes());
          const config = AgentFactory.getAgentConfig('docker-deployment');
          console.log('\nDocker Deployment Agent Config:');
          console.log(JSON.stringify(config, null, 2));
          break;
          
        default:
          console.log(`
🐳 Docker Deployment Agent Examples

Usage:
  npm run deploy:example deploy <service-name>     Deploy a single service
  npm run deploy:example deploy-multiple          Deploy multiple services
  npm run deploy:example list-agents              Show available agents

Examples:
  npm run deploy:example deploy jellyfin          Deploy Jellyfin media server
  npm run deploy:example deploy nextcloud         Deploy Nextcloud file sync
  npm run deploy:example deploy grafana           Deploy Grafana monitoring

The agent will:
  ✅ Research the latest stable version and best practices
  ✅ Analyze existing infrastructure and find available ports
  ✅ Generate secure credentials and SSL certificates
  ✅ Create production-ready Docker Compose configuration
  ✅ Deploy and verify the service
  ✅ Set up monitoring and health checks
  ✅ Generate comprehensive deployment report
          `);
      }
    } catch (error) {
      console.error('❌ Execution failed:', error.message);
      process.exit(1);
    }
  }

  main().catch(console.error);
}