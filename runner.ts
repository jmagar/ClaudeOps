import { AgentFactory } from './src/lib/agents';

type AgentType = 'system-health' | 'docker-deployment' | 'infrastructure-analysis' | 'service-research' | 'config-generator' | 'security-credentials' | 'deployment-executor' | 'verification';

interface AgentOptions {
  timeout_ms: number;
  serviceName?: string;
  environment?: string;
  enableSSL?: boolean;
  generateCredentials?: boolean;
  includeDocker?: boolean;
  includeSecurityScan?: boolean;
  detailedServiceAnalysis?: boolean;
  aiAnalysisDepth?: string;
  onLog?: (message: string, level?: string) => void;
}

async function runAgent() {
  // Get agent type from command line or default to system-health
  const agentType: AgentType = process.argv[2] as AgentType;
  const serviceName = process.argv[3];
  
  console.log(`🔍 Starting ${agentType} agent...\n`);
  
  const agent = AgentFactory.create(agentType);
  
  try {
    // Build options based on agent type
    const options: AgentOptions = {
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
      options.includeDocker = true;
      options.includeSecurityScan = true;
      options.detailedServiceAnalysis = true;
      options.aiAnalysisDepth = 'detailed';
    }
    
    // Add logging callbacks
    options.onLog = (message, level) => {
      if (typeof message !== 'string') return;
      // Show errors and warnings prominently
      if (level === 'error') {
        console.error(`❌ ${message}`);
      } else if (level === 'warn') {
        console.warn(`⚠️  ${message}`);
      } else if (level === 'debug') {
        console.debug(`🔎 ${message}`);
      } else if (message.includes('🔧 Running:')) {
        // Show tool execution in simplified format
        const toolMatch = message.match(/🔧 Running:\s*([A-Za-z0-9_-]+)/);
        if (toolMatch) {
          console.log(`  → Executing ${toolMatch[1]}...`);
        }
      } else if (message.includes('📊 Tool result:')) {
        // Show condensed tool results with secret redaction
        let toolResult = message.replace('📊 Tool result: ', '');
        // Redact sensitive information
        toolResult = toolResult.replace(/(?:token|secret|password|api[_-]?key)=\S+/gi, '[REDACTED]');
        console.log(`  ✓ ${toolResult.substring(0, 200)}${toolResult.length > 200 ? '...' : ''}`);
      } else if (agentType === 'docker-deployment') {
        // Docker-specific logging comes after general tool handling
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
      const cost = typeof result.cost === 'number' ? result.cost : 0;
      console.log(`💰 Analysis Cost: $${cost.toFixed(4)}`);
      const durationSec = typeof result.duration === 'number' ? (result.duration / 1000).toFixed(2) : 'N/A';
      console.log(`⏱️  Duration: ${durationSec}s`);
      const input = result.usage?.input_tokens ?? 0;
      const output = result.usage?.output_tokens ?? 0;
      console.log(`🔧 Tokens: ${input} input / ${output} output`);
      console.log('='.repeat(80));
      console.log();
      
      // Robustly print the analysis report
      let analysisOutput: string;
      if (result.result == null) {
        analysisOutput = '[No result returned]';
      } else if (Buffer.isBuffer(result.result) || result.result instanceof Uint8Array) {
        analysisOutput = Buffer.from(result.result).toString('utf-8');
      } else if (typeof result.result === 'object') {
        try {
          analysisOutput = JSON.stringify(result.result, null, 2);
        } catch (e) {
          analysisOutput = String(result.result);
        }
      } else {
        analysisOutput = String(result.result);
      }
      console.log(analysisOutput);
      console.log();
      console.log('='.repeat(80));


    } else {
      console.log('='.repeat(80));
      console.error(`❌ ${agentType.toUpperCase()} FAILED`);
      console.log('='.repeat(80));
      console.error('Error:', result.error);
      console.log('\n📋 Execution Logs:');
      console.log('-'.repeat(50));
      (Array.isArray(result.logs) ? result.logs : []).forEach(log => console.log(log));
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

function getAgentDescription(type: string): string {
  const descriptions: Record<string, string> = {
    'system-health': 'System health analysis',
    'docker-deployment': 'Deploy Docker services (requires service name)',
    'infrastructure-analysis': 'Infrastructure analysis',
    'service-research': 'Service research',
    'config-generator': 'Configuration generator',
    'security-credentials': 'Security credentials management',
    'deployment-executor': 'Deployment executor',
    'verification': 'Verification agent'
  };
  return descriptions[type] || 'Agent for specialized tasks';
}

// Show usage if no agent type specified
if (!process.argv[2]) {
  const availableAgents = AgentFactory.getAvailableTypes();
  console.log('Usage: npx tsx runner.ts <agent-type> [options]');
  console.log('\nAvailable agents:');
  availableAgents.forEach(type => {
    console.log(`  ${type.padEnd(24)} - ${getAgentDescription(type)}`);
  });
  console.log('\nExamples:');
  console.log(`  npx tsx runner.ts ${availableAgents[0]}`);
  console.log(`  npx tsx runner.ts docker-deployment jellyfin`);
  process.exit(0);
}

runAgent().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});