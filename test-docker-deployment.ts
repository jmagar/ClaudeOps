#!/usr/bin/env tsx

import { AgentFactory, AgentUtils } from './src/lib/agents';

/**
 * Real test of the Docker Deployment Agent
 * This will actually execute the agent with the framework
 */

async function testRealDockerDeployment() {
  const serviceName = process.argv[2] || 'jellyfin';
  
  console.log(`🚀 Starting real Docker deployment test for: ${serviceName}\n`);

  try {
    // Create the actual Docker deployment agent
    const agent = AgentFactory.create('docker-deployment');
    
    // Set up real logging and progress tracking
    const { onLog, onProgress } = AgentUtils.createCombinedCallbacks(`Docker-${serviceName}`);

    console.log(`📊 Agent Configuration:`);
    console.log(JSON.stringify(agent.getConfig(), null, 2));
    console.log(`\n🔧 Available Tools: ${agent.getAllowedTools().join(', ')}`);
    console.log(`\n🎯 Agent Type: ${agent.getAgentType()}\n`);

    // Execute the agent with real options
    console.log(`⚡ Starting deployment execution...\n`);
    
    const result = await agent.execute({
      serviceName: serviceName,
      environment: 'production',
      enableSSL: true,
      generateCredentials: true,
      securityScanEnabled: true,
      monitoringEnabled: true,
      
      // Framework options
      timeout_ms: 900000,  // 15 minutes
      maxTurns: 100,
      costLimit: 3.00,
      
      // Callbacks
      onLog,
      onProgress,
      
      // Hooks for monitoring
      hooks: {
        onError: async (error, context) => {
          console.error(`\n❌ Deployment Error:`, {
            type: error.type,
            subtype: error.subtype,
            message: error.message,
            turn: context.currentTurn,
            cost: context.totalCost
          });
          return { action: 'abort' };
        },
        
        onComplete: async (result) => {
          console.log(`\n✅ Deployment completed!`);
          console.log(`📊 Final Stats:`, {
            status: result.status,
            duration: `${(result.duration / 1000).toFixed(1)}s`,
            cost: `$${result.cost.toFixed(4)}`,
            executionId: result.executionId
          });
        }
      }
    });

    // Display detailed results
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎉 DEPLOYMENT RESULTS`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Service: ${serviceName}`);
    console.log(`Status: ${result.status}`);
    console.log(`Duration: ${(result.duration / 1000).toFixed(1)} seconds`);
    console.log(`Cost: $${result.cost.toFixed(4)}`);
    console.log(`Execution ID: ${result.executionId}`);
    console.log(`Agent Type: ${result.agentType}`);
    console.log(`Timestamp: ${result.timestamp}`);
    
    if (result.sessionId) {
      console.log(`Session ID: ${result.sessionId}`);
    }
    
    if (result.summary) {
      console.log(`\n📋 Summary:\n${result.summary}`);
    }
    
    if (result.error) {
      console.log(`\n❌ Error: ${result.error}`);
    }
    
    console.log(`\n📝 Logs (${result.logs.length} entries):`);
    result.logs.slice(-5).forEach((log, i) => {
      console.log(`  ${i + 1}. ${log}`);
    });

    return result;

  } catch (error) {
    console.error(`\n💥 Test failed:`, error.message);
    console.error(`Stack:`, error.stack);
    throw error;
  }
}

// Main execution
if (require.main === module) {
  console.log(`
🐳 Docker Deployment Agent - Real Test

This will execute the actual Docker Deployment Agent using the framework.
The agent will:
  1. Research the service online using WebSearch, WebFetch, and MCP tools
  2. Analyze the current system for existing Docker patterns
  3. Find available ports and configure networking
  4. Generate secure credentials and SSL certificates
  5. Create production-ready Docker Compose configuration
  6. Deploy and verify the service
  7. Set up monitoring and health checks
  8. Generate a comprehensive deployment report

Usage: npx tsx test-docker-deployment.ts [service-name]
Example: npx tsx test-docker-deployment.ts jellyfin
  `);

  const serviceName = process.argv[2];
  if (!serviceName) {
    console.log(`❌ Please provide a service name.`);
    console.log(`Example: npx tsx test-docker-deployment.ts jellyfin`);
    process.exit(1);
  }

  testRealDockerDeployment()
    .then(() => {
      console.log(`\n🎉 Test completed successfully!`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`\n💥 Test failed:`, error.message);
      process.exit(1);
    });
}