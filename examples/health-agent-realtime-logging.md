# SystemHealthAgent - Real-time Logging Example

The SystemHealthAgent now supports real-time logging during execution, allowing you to see progress as it happens instead of waiting for the final result.

## Basic Usage with Real-time Logging

```typescript
import { SystemHealthAgent } from '@/lib/agents/systemHealthAgent';

const agent = new SystemHealthAgent();

const result = await agent.execute({
  include_docker: true,
  include_security_scan: true,
  detailed_service_analysis: true,
  ai_analysis_depth: 'detailed',
  
  // Add real-time logging callback
  onLog: (message, level = 'info') => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
  }
});
```

## Advanced Logging with Colors and Filtering

```typescript
const result = await agent.execute({
  include_docker: true,
  onLog: (message, level = 'info') => {
    // Color-coded logging
    const colors = {
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow  
      error: '\x1b[31m',   // Red
      debug: '\x1b[90m'    // Gray
    };
    const reset = '\x1b[0m';
    
    // Filter out debug messages in production
    if (level === 'debug' && process.env.NODE_ENV === 'production') {
      return;
    }
    
    console.log(`${colors[level]}[SystemHealth] ${message}${reset}`);
  }
});
```

## Integration with Web Sockets for Real-time UI Updates

```typescript
// In your API route or service
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    if (data.toString() === 'start-health-check') {
      
      const result = await agent.execute({
        include_docker: true,
        onLog: (message, level) => {
          // Stream logs to connected WebSocket clients
          ws.send(JSON.stringify({
            type: 'log',
            message,
            level,
            timestamp: new Date().toISOString()
          }));
        }
      });
      
      // Send final result
      ws.send(JSON.stringify({
        type: 'result',
        data: result
      }));
    }
  });
});
```

## Example Real-time Output

When you run the agent with logging enabled, you'll see output like this:

```
🚀 Starting comprehensive system health analysis...
📋 Execution ID: cm123abc456def
⚙️  Configuration: Docker=true, Security=true, Analysis=detailed
📊 Step 1/5: Collecting system metrics (CPU, Memory, Disk)...
  🔄 Scanning CPU, memory, and disk usage...
  ✅ System metrics collected: CPU 23.4%, Memory 67.8%, Disk 45.2%
🐳 Step 2/5: Collecting Docker container metrics...
  🔄 Checking Docker daemon and containers...
  ✅ Docker metrics collected: 12 containers (8 running)
  ℹ️  Found 4 stopped containers
🔧 Step 3/5: Collecting system service health metrics...
  🔄 Scanning system services and daemons...
  ✅ Service metrics collected: 127 total services (0 failed)
  ✅ 119 services running normally
🧠 Step 4/5: Performing AI-powered health analysis...
🔍 Analyzing system patterns and generating recommendations...
  🤖 Invoking Claude CLI for intelligent analysis...
  ✅ AI analysis completed - Cost: $0.0045, Model: claude-3-5-sonnet-20241022
  🎯 Parsed analysis: 3 recommendations, 1 alerts
📄 Step 5/5: Compiling comprehensive health report...
✅ Analysis completed successfully in 18.7s
💚 Overall health status: HEALTHY
📈 Health score: 87/100
💡 Generated 3 optimization recommendations
```

## Log Levels

The logging system supports four levels:

- **info**: General progress information (default)
- **warn**: Warning messages about potential issues
- **error**: Error messages for failures or critical problems  
- **debug**: Detailed debugging information

## Benefits

- **Transparency**: See exactly what the agent is doing at each step
- **Progress Tracking**: Monitor long-running analysis operations
- **Real-time Feedback**: Immediate visibility into system metrics as they're collected
- **Better Debugging**: Detailed logs help troubleshoot issues
- **User Experience**: Keep users informed during the ~20 second execution time

## Migration from Previous Version

If you were using the agent without real-time logging, no changes are required. The `onLog` callback is optional:

```typescript
// This still works exactly as before
const result = await agent.execute({
  include_docker: true
});

// Logs are still available in result.logs array
console.log('All logs:', result.logs);
```