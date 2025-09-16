import { Buffer } from 'node:buffer';
import { inspect } from 'node:util';
import { AgentFactory, AgentType } from './src/lib/agents';
import type { BaseAgentOptions } from './src/lib/agents/core/types';
import { redactSecrets } from './src/lib/utils/redactSecrets';

type AnalysisDepth = 'concise' | 'standard' | 'detailed';

interface RunnerAgentOptions extends BaseAgentOptions {
  serviceName?: string;
  environment?: string;
  enableSSL?: boolean;
  generateCredentials?: boolean;
  includeDocker?: boolean;
  includeSecurityScan?: boolean;
  detailedServiceAnalysis?: boolean;
  aiAnalysisDepth?: AnalysisDepth;
}

async function runAgent() {
  // Get agent type from command line or default to system-health
  const agentType: AgentType = process.argv[2] as AgentType;
  const serviceName = process.argv[3];
  
  const availableTypes = AgentFactory.getAvailableTypes();
  if (!availableTypes.includes(agentType)) {
    console.error(`❌ Invalid agent type: '${agentType}'`);
    console.error(`Supported agents: ${availableTypes.join(', ')}`);
    process.exit(1);
  }
  
  console.log(`🔍 Starting ${agentType} agent...\n`);
  
  try {
    // Build options based on agent type
    const options: RunnerAgentOptions = {
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
      
      // Validate service name (lowercase + trimmed)
      const normalizedServiceName = serviceName.toLowerCase().trim();
      const serviceNamePattern = /^[a-z0-9][a-z0-9._-]{0,62}$/;
      if (!serviceNamePattern.test(normalizedServiceName)) {
        console.error(`❌ Invalid service name: '${serviceName}'`);
        console.error('Service name must:');
        console.error('- Start with alphanumeric character');
        console.error('- Contain only lowercase letters, digits, dots, underscores, hyphens');
        console.error('- Be 1-63 characters long');
        console.error('Example: jellyfin, nginx-proxy, api.service');
        process.exit(1);
      }
      options.serviceName = normalizedServiceName;
      options.environment = 'production';
      options.enableSSL = true;
      options.generateCredentials = true;
    } else if (agentType === 'docker-composer') {
      if (!serviceName) {
        console.error('❌ Docker composer requires a service name');
        console.log('Usage: npx tsx runner.ts docker-composer <service-name>');
        console.log('Example: npx tsx runner.ts docker-composer overseerr');
        process.exit(1);
      }
      
      // Validate service name (lowercase + trimmed)
      const normalizedServiceName = serviceName.toLowerCase().trim();
      const serviceNamePattern = /^[a-z0-9][a-z0-9._-]{0,62}$/;
      if (!serviceNamePattern.test(normalizedServiceName)) {
        console.error(`❌ Invalid service name: '${serviceName}'`);
        console.error('Service name must:');
        console.error('- Start with alphanumeric character');
        console.error('- Contain only lowercase letters, digits, dots, underscores, hyphens');
        console.error('- Be 1-63 characters long');
        console.error('Example: overseerr, plex, jellyfin');
        process.exit(1);
      }
      options.serviceName = normalizedServiceName;
      options.environment = 'production';
      options.enableSSL = true;
    } else if (agentType === 'system-health') {
      options.includeDocker = true;
      options.includeSecurityScan = true;
      options.detailedServiceAnalysis = true;
      options.aiAnalysisDepth = 'detailed';
    }
    
    // Add AbortController for graceful shutdown
    const controller = new AbortController();
    globalController = controller;
    options.abortController = controller;
    
    // Create agent with options
    const agent = AgentFactory.create(agentType, options);
    
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
      } else if (message.includes('🔧') && message.includes(':')) {
        // Show tool execution with actual command - matches BaseAgent pattern: "🔧 ToolName: {input}"
        const toolMatch = message.match(/🔧\s*([A-Za-z0-9_-]+):\s*(.*)/);
        if (toolMatch) {
          const toolName = toolMatch[1];
          const input = toolMatch[2];
          // Parse command from input if it's Bash
          if (toolName === 'Bash' && input) {
            try {
              const parsedInput = JSON.parse(input);
              if (parsedInput.command) {
                console.log(`  → Executing Bash: ${parsedInput.command}`);
              } else {
                console.log(`  → Executing ${toolName}: ${input.substring(0, 100)}...`);
              }
            } catch {
              console.log(`  → Executing ${toolName}: ${input.substring(0, 100)}...`);
            }
          } else {
            console.log(`  → Executing ${toolName}...`);
          }
        }
      } else if (message.includes('✓')) {
        // Show condensed tool results with secret redaction - matches BaseAgent pattern: "✓ result"
        const resultMatch = message.match(/✓\s*(.*)/);
        if (resultMatch) {
          // Temporarily disable redaction to see raw output
          const rawResult = resultMatch[1];
          // Show more content but still truncate very long results
          const maxLength = 800;
          const truncated = rawResult.length > maxLength ? rawResult.substring(0, maxLength) + '...' : rawResult;
          console.log(`  ✓ ${truncated}`); 
        }
      } else {
        // Show ALL messages for full visibility
        console.log(`  ${message}`);
      }
    };
    
    // Execute the agent
    console.log(`🚀 Executing ${agentType} agent...`);
    const result = await agent.execute(options);
    
    // Show execution results
    if (result.status === 'completed') {
      console.log(`\n✅ ${agentType} agent completed successfully`);
      if (result.result) {
        console.log(`📋 Result: ${result.result}`);
      }
    } else {
      console.error(`\n❌ ${agentType} agent failed`);
      if (result.error) {
        const stringifiedError = typeof result.error === 'string' 
          ? result.error 
          : inspect(result.error, { depth: null, colors: false });
        console.error('Error:', stringifiedError);
      }
      console.log('\n📋 Execution Logs:');
      console.log('-'.repeat(50));
      if (Array.isArray(result.logs)) {
        result.logs.forEach((log: string) => console.log(log));
      }
    }
    
  } catch (error) {
    console.error(`❌ Failed to run ${agentType}:`, error);
    process.exit(1);
  }
}

// Global AbortController for signal handling
let globalController: AbortController | null = null;

// Fallback timers for graceful shutdown
let sigintTimer: NodeJS.Timeout | null = null;
let sigtermTimer: NodeJS.Timeout | null = null;

process.on('SIGINT', () => {
  console.log('\n⚠️  Agent execution interrupted');
  if (globalController) {
    globalController.abort();
    
    // Start fallback timer
    sigintTimer = setTimeout(() => {
      console.log('\n⚠️  Force exit after timeout');
      process.exit(1);
    }, 4000); // 4 second fallback
    
    // Clear timer if abort completes normally
    sigintTimer.unref();
  }
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Agent execution terminated');
  if (globalController) {
    globalController.abort();
    
    // Start fallback timer
    sigtermTimer = setTimeout(() => {
      console.log('\n⚠️  Force exit after timeout');
      process.exit(1);
    }, 4000); // 4 second fallback
    
    // Clear timer if abort completes normally
    sigtermTimer.unref();
  }
});

// Clear timers on exit to prevent dangling resources
process.on('exit', () => {
  if (sigintTimer) clearTimeout(sigintTimer);
  if (sigtermTimer) clearTimeout(sigtermTimer);
});

function getAgentDescription(type: string): string {
  try {
    // Prefer dynamic description if the agent exposes one
    const cfg = AgentFactory.getAgentConfig(type as AgentType);
    if (cfg?.description) return cfg.description;
  } catch {
    // ignore and fall back to static map
  }
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
  
  if (availableAgents.length === 0) {
    console.log('Usage: npx tsx runner.ts <agent-type> [options]');
    console.log('\n❌ No agents available');
    console.log('\nExample usage:');
    console.log('  npx tsx runner.ts system-health');
    console.log('  npx tsx runner.ts docker-deployment <service-name>');
    process.exit(0);
  }
  
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