import { SystemHealthAgent } from './src/lib/agents/systemHealthAgent';
import type { ServiceStatus, Alert, Recommendation } from './src/lib/types/agent';

async function runHealthCheck() {
  console.log('🔍 Starting system health analysis...\n');
  
  const agent = new SystemHealthAgent();
  
  try {
    const result = await agent.execute({
      include_docker: true,
      include_security_scan: true,
      detailed_service_analysis: true,
      ai_analysis_depth: 'detailed',
      timeout_ms: 300000, // 5 minutes
      onLog: (message, level) => {
        const timestamp = new Date().toLocaleTimeString();
        const levelIcon = level === 'error' ? '❌' : level === 'warning' ? '⚠️' : level === 'success' ? '✅' : 'ℹ️';
        console.log(`[${timestamp}] ${levelIcon} ${message}`);
      }
    });
    
    if (result.status === 'completed') {
      console.log('✅ Health check completed successfully\n');
      
      // Header with summary  
      console.log('='.repeat(80));
      console.log(`🏥 SYSTEM HEALTH REPORT - ${new Date().toLocaleString()}`);
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
      console.error('❌ HEALTH CHECK FAILED');
      console.log('='.repeat(80));
      console.error('Error:', result.error);
      console.log('\n📋 Execution Logs:');
      console.log('-'.repeat(50));
      result.logs.forEach(log => console.log(log));
    }
    
  } catch (error) {
    console.error('❌ Failed to run health check:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⚠️  Health check interrupted');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Health check terminated');
  process.exit(0);
});

runHealthCheck().catch((error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});