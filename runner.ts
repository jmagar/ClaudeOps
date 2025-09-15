import { AgentFactory, AgentUtils } from './src/lib/agents';

async function runAgent() {
  // Get agent type from command line or default to system-health
  const agentType = process.argv[2] || 'system-health';
  const serviceName = process.argv[3];
  
  console.log(`🔍 Starting ${agentType} agent...\n`);
  
  const agent = AgentFactory.create(agentType);
  
  try {
    // Build options based on agent type
    let options: any = {
      timeout_ms: 300000, // 5 minutes
    };
    
    // Add agent-specific options
    if (agentType === 'docker-deployment') {
      if (!serviceName) {
        console.error('❌ Docker deployment requires a service name');
        console.log('Usage: npx tsx runner.ts docker-deployment <service-name>');
        console.log('Example: npx tsx runner.ts docker-deployment jellyfin');
        process.exit(1);
      }
      options.serviceName = serviceName;
      options.environment = 'production';
      options.enableSSL = true;
      options.generateCredentials = true;
    } else if (agentType === 'system-health') {
      options.include_docker = true;
      options.include_security_scan = true;
      options.detailed_service_analysis = true;
      options.ai_analysis_depth = 'detailed';
    }
    
    // Add logging callbacks
    options.onLog = (message, level) => {
      // Show errors and warnings prominently
      if (level === 'error') {
        console.error(`❌ ${message}`);
      } else if (level === 'warn') {
        console.warn(`⚠️  ${message}`);
      } else if (agentType === 'docker-deployment') {
        // Special logging for docker deployment to show parallel execution
        if (message.includes('🚀') || message.includes('📊') || message.includes('⚙️') || message.includes('🔍')) {
          console.log(message); // Show phase transitions
        } else if (message.includes('✅')) {
          console.log(message); // Show completions
        } else if (message.includes('Phase')) {
          console.log(`\n${message}`); // Show phase headers
        }
      } else if (message.includes('💭 Claude:')) {
        // Show Claude's full thinking without extra formatting
        console.log(message);
      } else if (message.includes('🔧 Running:')) {
        // Show tool execution in simplified format
        const toolMatch = message.match(/🔧 Running: (\w+)/);
        if (toolMatch) {
          console.log(`  → Executing ${toolMatch[1]}...`);
        }
      } else if (message.includes('📊 Tool result:')) {
        // Show condensed tool results
        const result = message.replace('📊 Tool result: ', '');
        console.log(`  ✓ ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`);
      }
      // Skip other debug/info logs for cleaner output
    };
    
    const result = await agent.execute(options);
    
    if (result.status === 'completed') {
      console.log(`✅ ${agentType} completed successfully\n`);
      
      // Header with summary  
      console.log('='.repeat(80));
      console.log(`📊 ${agentType.toUpperCase()} REPORT - ${new Date().toLocaleString()}`);
      console.log('='.repeat(80));
      console.log(`💰 Analysis Cost: $${result.cost.toFixed(4)}`);
      console.log(`⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);
      console.log(`🔧 Tokens: ${result.usage.input_tokens} input / ${result.usage.output_tokens} output`);
      console.log('='.repeat(80));
      console.log();
      
      // Show Claude's analysis report directly
      console.log(result.result);
      console.log();
      console.log('='.repeat(80));


    } else {
      console.log('='.repeat(80));
      console.error(`❌ ${agentType.toUpperCase()} FAILED`);
      console.log('='.repeat(80));
      console.error('Error:', result.error);
      console.log('\n📋 Execution Logs:');
      console.log('-'.repeat(50));
      result.logs.forEach(log => console.log(log));
    }
    
  } catch (error) {
    console.error(`❌ Failed to run ${agentType}:`, error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️  Agent execution interrupted');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Agent execution terminated');
  process.exit(0);
});

// Show usage if no agent type specified
if (!process.argv[2]) {
  console.log('Usage: npx tsx runner.ts <agent-type> [options]');
  console.log('\nAvailable agents:');
  console.log('  system-health         - System health analysis');
  console.log('  docker-deployment     - Deploy Docker services (requires service name)');
  console.log('\nExamples:');
  console.log('  npx tsx runner.ts system-health');
  console.log('  npx tsx runner.ts docker-deployment jellyfin');
  process.exit(0);
}

runAgent().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});