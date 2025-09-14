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
      timeout_ms: 300000 // 5 minutes
    });
    
    if (result.status === 'completed') {
      console.log('✅ Health check completed successfully\n');
      
      const healthData = JSON.parse(result.result);
      
      // Header with summary
      console.log('='.repeat(80));
      console.log(`🏥 SYSTEM HEALTH REPORT - ${new Date(healthData.timestamp).toLocaleString()}`);
      console.log('='.repeat(80));
      console.log(`📊 Overall Health: ${healthData.overall_health.toUpperCase()}`);
      console.log(`🎯 Health Score: ${healthData.ai_analysis.health_score}/100`);
      console.log(`💰 Analysis Cost: $${result.cost}`);
      console.log(`⏱️  Duration: ${(result.duration / 1000).toFixed(2)}s`);
      console.log();

      // System Metrics
      console.log('🖥️  SYSTEM METRICS');
      console.log('-'.repeat(50));
      if (healthData.metrics.cpu_usage) {
        const cores = healthData.metrics.cpu_usage.cores || 'N/A';
        console.log(`CPU Usage:    ${healthData.metrics.cpu_usage.usage_percent?.toFixed(1) || 'N/A'}% (${cores} cores)`);
      }
      if (healthData.metrics.memory_usage) {
        const memUsage = healthData.metrics.memory_usage.usage_percent?.toFixed(1) || 'N/A';
        const memUsed = healthData.metrics.memory_usage.used_gb?.toFixed(1) || 'N/A';
        const memTotal = healthData.metrics.memory_usage.total_gb?.toFixed(1) || 'N/A';
        console.log(`Memory:       ${memUsage}% (${memUsed}GB / ${memTotal}GB)`);
      }
      if (healthData.metrics.disk_usage) {
        const diskUsage = healthData.metrics.disk_usage.usage_percent?.toFixed(1) || 'N/A';
        const diskUsed = healthData.metrics.disk_usage.used_gb?.toFixed(1) || 'N/A';
        const diskTotal = healthData.metrics.disk_usage.total_gb?.toFixed(1) || 'N/A';
        console.log(`Disk:         ${diskUsage}% (${diskUsed}GB / ${diskTotal}GB)`);
      }
      if (healthData.metrics.network) {
        const txMB = healthData.metrics.network.tx_bytes_per_sec ? (healthData.metrics.network.tx_bytes_per_sec / 1024 / 1024).toFixed(2) : 'N/A';
        const rxMB = healthData.metrics.network.rx_bytes_per_sec ? (healthData.metrics.network.rx_bytes_per_sec / 1024 / 1024).toFixed(2) : 'N/A';
        console.log(`Network:      ↑ ${txMB}MB/s ↓ ${rxMB}MB/s`);
      }
      console.log();

      // Docker Containers
      if (healthData.metrics.docker_containers) {
        console.log('🐳 DOCKER CONTAINERS');
        console.log('-'.repeat(50));
        console.log(`Total:        ${healthData.metrics.docker_containers.total_containers}`);
        console.log(`Running:      ${healthData.metrics.docker_containers.running_containers}`);
        console.log(`Stopped:      ${healthData.metrics.docker_containers.stopped_containers}`);
        console.log(`Images:       ${healthData.metrics.docker_containers.images_count}`);
        console.log();
      }

      // Services
      if (healthData.metrics.services && healthData.metrics.services.length > 0) {
        console.log('⚙️  SYSTEM SERVICES');
        console.log('-'.repeat(50));
        const runningServices = healthData.metrics.services.filter((s: ServiceStatus) => s.status === 'active').length;
        const failedServices = healthData.metrics.services.filter((s: ServiceStatus) => s.status === 'failed').length;
        console.log(`Active:       ${runningServices}`);
        console.log(`Failed:       ${failedServices}`);
        console.log(`Total:        ${healthData.metrics.services.length}`);
        
        if (failedServices > 0) {
          console.log('\n❌ Failed Services:');
          healthData.metrics.services
            .filter((s: ServiceStatus) => s.status === 'failed')
            .forEach((service: ServiceStatus) => {
              console.log(`  • ${service.name} (${service.status})`);
            });
        }
        console.log();
      }

      // Security
      if (healthData.metrics.security) {
        console.log('🔒 SECURITY STATUS');
        console.log('-'.repeat(50));
        console.log(`Firewall:     ${healthData.metrics.security.firewall_status || 'Unknown'}`);
        console.log(`Updates:      ${healthData.metrics.security.updates_available || 0} available`);
        if (healthData.metrics.security.last_security_scan) {
          console.log(`Last Scan:    ${new Date(healthData.metrics.security.last_security_scan).toLocaleString()}`);
        }
        console.log();
      }

      // AI Analysis
      console.log('🤖 AI ANALYSIS');
      console.log('-'.repeat(50));
      if (healthData.ai_analysis.summary) {
        console.log(`Summary: ${healthData.ai_analysis.summary}`);
        console.log();
      }

      // Alerts
      if (healthData.ai_analysis.alerts && healthData.ai_analysis.alerts.length > 0) {
        console.log('🚨 ALERTS');
        console.log('-'.repeat(30));
        healthData.ai_analysis.alerts.forEach((alert: Alert, index: number) => {
          const icon = alert.level === 'critical' ? '🔴' : alert.level === 'warning' ? '🟡' : '🔵';
          console.log(`${icon} ${alert.message}`);
          if (alert.recommended_action) {
            console.log(`   └─ Recommendation: ${alert.recommended_action}`);
          }
        });
        console.log();
      }

      // Recommendations
      if (healthData.ai_analysis.recommendations && healthData.ai_analysis.recommendations.length > 0) {
        console.log('💡 RECOMMENDATIONS');
        console.log('-'.repeat(30));
        healthData.ai_analysis.recommendations.forEach((rec: Recommendation, index: number) => {
          console.log(`${index + 1}. ${rec.title}`);
          if (rec.description && rec.description !== rec.title) {
            console.log(`   └─ ${rec.description}`);
          }
        });
        console.log();
      }

      // Priority Actions
      if (healthData.ai_analysis.priority_actions && healthData.ai_analysis.priority_actions.length > 0) {
        console.log('⚡ PRIORITY ACTIONS');
        console.log('-'.repeat(30));
        healthData.ai_analysis.priority_actions.forEach((action: string, index: number) => {
          console.log(`${index + 1}. ${action}`);
        
        });
        console.log();
      }

      // Trends
      if (healthData.ai_analysis.trends && healthData.ai_analysis.trends.length > 0) {
        console.log('📈 TRENDS');
        console.log('-'.repeat(30));
        healthData.ai_analysis.trends.forEach((trend: any, index: number) => {
          if (typeof trend === 'object') {
            const metric = trend.metric || 'Trend';
            const description = trend.direction || trend.description || trend.message || JSON.stringify(trend);
            console.log(`• ${metric}: ${description}`);
          } else {
            console.log(`• ${trend}`);
          }
        });
        console.log();
      }

      // Footer
      console.log('='.repeat(80));
      console.log(`Model: ${healthData.cost_breakdown.model_used}`);
      console.log(`Tokens: ${healthData.cost_breakdown.tokens_used.input_tokens} input / ${healthData.cost_breakdown.tokens_used.output_tokens} output`);
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