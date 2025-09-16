# Claude Code SDK Agent Framework

A comprehensive framework for building intelligent agents using the Claude Code TypeScript SDK. This framework provides a robust foundation for creating agents with advanced features like streaming, error handling, session management, and hook systems.

## Overview

The Claude Code SDK Agent Framework transforms how you build and deploy AI agents by providing:

- **Standardized Architecture**: Abstract base class with common functionality
- **Advanced Error Handling**: Sophisticated retry logic and recovery strategies  
- **Session Management**: Persistent sessions with checkpointing and resumption
- **Real-time Streaming**: Live updates and progress tracking
- **Hook System**: Extensible pre/post-tool execution hooks
- **Permission Management**: Fine-grained security controls
- **Factory Pattern**: Easy agent creation and management

## Architecture

### Core Components

```
src/lib/agents/
├── core/
│   ├── BaseAgent.ts          # Abstract base class for all agents
│   ├── ErrorHandler.ts       # Sophisticated error handling and recovery
│   ├── HookManager.ts        # Tool execution hooks and security
│   ├── PermissionManager.ts  # Security and permission controls
│   ├── SessionManager.ts     # Session persistence and resumption
│   ├── StreamHandler.ts      # Real-time streaming and updates
│   └── types.ts             # Type definitions and interfaces
├── systemHealthAgent.ts      # Reference implementation
├── templates/
│   └── ExampleAgent.ts      # Template for creating new agents
└── index.ts                 # Agent factory and exports
```

### Key Benefits

- **🚀 Rapid Development**: Focus on your agent's logic, not infrastructure
- **🔒 Built-in Security**: Rate limiting, command validation, and permission controls
- **📊 Real-time Monitoring**: Live progress updates and streaming capabilities
- **🔄 Fault Tolerance**: Advanced error handling with retry logic and recovery
- **💾 Session Persistence**: Resume long-running operations seamlessly
- **🎯 Type Safety**: Full TypeScript support with proper SDK types
- **🔧 Extensible**: Hook system for custom behaviors and monitoring

## Quick Start

### Installation

The framework is included with your Claude Code project. No additional installation required.

### Creating Your First Agent

1. **Use the AgentFactory** (Recommended):

```typescript
import { AgentFactory, AgentUtils } from './lib/agents';

// Create a system health agent
const agent = AgentFactory.create('system-health');

// Create with custom options and callbacks
const { onLog, onProgress } = AgentUtils.createCombinedCallbacks('MyAgent');
const result = await agent.execute({
  timeout_ms: 600000,
  maxTurns: 100,
  onLog,
  onProgress,
  include_docker: true,
  ai_analysis_depth: 'comprehensive'
});

console.log('Analysis completed:', result.summary);
```

2. **Direct Agent Creation**:

```typescript
import { SystemHealthAgent } from './lib/agents';

const agent = new SystemHealthAgent();
const result = await agent.execute({
  include_security_scan: true,
  detailed_service_analysis: true
});
```

### Creating Custom Agents

Extend the `BaseAgent` class to create your own agents:

```typescript
import { BaseAgent } from './lib/agents/core/BaseAgent';
import type { BaseAgentOptions, AgentConfig } from './lib/agents/core/types';

interface MyAgentOptions extends BaseAgentOptions {
  analysisDepth?: 'basic' | 'detailed' | 'comprehensive';
  includeNetworkScan?: boolean;
}

export class MyCustomAgent extends BaseAgent<MyAgentOptions> {
  getAgentType(): string {
    return 'my-custom-agent';
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Read', 'Grep', 'Glob'];
  }

  buildPrompt(options: MyAgentOptions): string {
    return `
    Conduct a ${options.analysisDepth || 'detailed'} analysis of the system.
    
    Your investigation should include:
    1. System resource analysis
    2. Service health checks
    3. Configuration validation
    ${options.includeNetworkScan ? '4. Network connectivity tests' : ''}
    
    Provide actionable recommendations based on your findings.
    `;
  }

  getSystemPrompt(): string {
    return `
    You are an expert system analyst with access to investigation tools.
    Use systematic methodology to analyze system health and provide
    evidence-based recommendations.
    `;
  }

  getConfig(): AgentConfig {
    return {
      name: 'My Custom Agent',
      version: '1.0.0',
      description: 'Custom agent for specialized analysis',
      defaultOptions: {
        timeout_ms: 300000,
        maxTurns: 50,
        permissionMode: 'acceptEdits'
      },
      capabilities: [
        'System analysis',
        'Configuration validation',
        'Performance assessment'
      ],
      requiredTools: ['Bash'],
      optionalTools: ['Read', 'Grep', 'Glob'],
      typicalExecutionTime: 120000,
      costEstimate: { min: 0.10, max: 1.50, typical: 0.50 }
    };
  }
}
```

## Key Features

### 1. Advanced Error Handling

The framework includes sophisticated error handling with exponential backoff, retry logic, and recovery strategies:

```typescript
const result = await agent.execute({
  hooks: {
    onError: async (error, context) => {
      if (error.type === 'rate_limit') {
        console.log('Rate limited, will retry automatically');
        return { action: 'retry', retryDelay: 5000 };
      }
      return { action: 'abort' };
    }
  }
});
```

### 2. Real-time Streaming

Monitor agent execution in real-time with streaming updates:

```typescript
const streamHandler = new StreamHandler();
streamHandler.addListener(async (update) => {
  console.log(`[${update.type}] ${update.content}`);
});

const result = await agent.execute({
  onProgress: (progress) => {
    console.log(`${progress.stage}: ${progress.message} (${progress.percentage}%)`);
  }
});
```

### 3. Session Management

Resume long-running operations with session persistence:

```typescript
const sessionManager = new SessionManager('./agent-sessions');

// Create a resumable session
const sessionId = await sessionManager.createSession(
  'system-health',
  'exec-123',
  { maxTurns: 100, timeout_ms: 600000 }
);

// Later, resume the session
const { session } = await sessionManager.resumeSession(sessionId);
const result = await agent.execute({ sessionId, ...session.options });
```

### 4. Hook System

Extend functionality with pre/post-tool execution hooks:

```typescript
const result = await agent.execute({
  hooks: {
    preToolUse: [
      async (toolName, input) => {
        console.log(`About to execute ${toolName}`);
        return true; // Allow execution
      }
    ],
    postToolUse: [
      async (toolName, input, result) => {
        console.log(`${toolName} completed in ${result.duration}ms`);
      }
    ],
    onComplete: async (result) => {
      console.log(`Agent completed: ${result.summary}`);
    }
  }
});
```

## Framework Components

### BaseAgent

The abstract base class that all agents extend. Provides:
- Claude SDK integration with proper types
- Standardized execution flow
- Built-in error handling and recovery
- Session management integration
- Hook system support
- Progress tracking and logging

### ErrorHandler

Sophisticated error handling with:
- Exponential backoff with jitter
- Error type-specific recovery strategies
- Retry limits and circuit breaker patterns
- Context-aware error analysis

### HookManager

Tool execution monitoring with:
- Security validation and rate limiting
- Pre/post-tool execution hooks
- Performance metrics collection
- Custom hook registration

### SessionManager

Persistent session support with:
- Session creation and restoration
- Automatic checkpointing
- Session cleanup and management
- Cross-execution state preservation

### StreamHandler

Real-time streaming capabilities:
- Live progress updates
- Tool execution monitoring
- Error broadcast system
- Buffered message management

## Available Agents

### SystemHealthAgent

Comprehensive system health analysis and monitoring:

```typescript
const agent = AgentFactory.create('system-health');
const result = await agent.execute({
  ai_analysis_depth: 'comprehensive',
  include_security_scan: true,
  include_docker: true,
  detailed_service_analysis: true
});
```

**Capabilities:**
- System resource analysis (CPU, memory, disk)
- Service health assessment
- Security vulnerability scanning
- Docker container analysis
- Performance bottleneck identification
- Actionable recommendations with specific commands

## Best Practices

### 1. Agent Design

- **Single Responsibility**: Each agent should have a clear, focused purpose
- **Proper Tool Selection**: Only include tools your agent actually needs
- **Meaningful Prompts**: Provide clear, specific instructions to Claude
- **Error Handling**: Implement agent-specific error recovery strategies

### 2. Security

- **Principle of Least Privilege**: Use minimal required permissions
- **Input Validation**: Validate all user inputs and options
- **Command Safety**: Never run destructive commands
- **Rate Limiting**: Respect tool usage limits

### 3. Performance

- **Timeout Management**: Set appropriate timeouts for your use case
- **Turn Limits**: Balance thoroughness with cost and time
- **Streaming**: Use progress callbacks for long-running operations
- **Session Management**: Use sessions for complex, multi-step operations

### 4. Monitoring

- **Logging**: Use structured logging with appropriate levels
- **Metrics**: Track agent performance and success rates
- **Alerting**: Implement monitoring for production deployments
- **Cost Tracking**: Monitor token usage and costs

## Migration Guide

### From Legacy Agents

If you have existing agents, migrate them to the framework:

1. **Extend BaseAgent** instead of implementing from scratch
2. **Move prompt logic** to `buildPrompt()` and `getSystemPrompt()`
3. **Update tool configuration** in `getAllowedTools()`
4. **Add agent metadata** in `getConfig()`
5. **Remove manual SDK calls** - the framework handles this
6. **Update error handling** to use the new error recovery system

### Example Migration

**Before** (Legacy):
```typescript
class MyAgent {
  async execute(options: any) {
    try {
      const result = await query({
        prompt: this.buildPrompt(options),
        options: { maxTurns: 50 }
      });
      // Manual message processing...
    } catch (error) {
      // Basic error handling...
    }
  }
}
```

**After** (Framework):
```typescript
class MyAgent extends BaseAgent<MyAgentOptions> {
  getAgentType() { return 'my-agent'; }
  getAllowedTools() { return ['Bash', 'Read']; }
  buildPrompt(options) { /* return prompt */ }
  getSystemPrompt() { /* return system prompt */ }
  getConfig() { /* return agent config */ }
  
  // That's it! Framework handles execution, errors, streaming, etc.
}
```

## Examples and Patterns

See [examples.md](./examples.md) for detailed usage patterns, advanced configurations, and real-world examples.

## API Reference

See [api-reference.md](./api-reference.md) for complete API documentation with all classes, methods, and interfaces.

## Contributing

When adding new agents to the framework:

1. Use the `ExampleAgent.ts` template as a starting point
2. Follow the established patterns and conventions
3. Include comprehensive error handling
4. Add your agent to the `AgentFactory`
5. Update documentation and examples
6. Write tests for your agent's functionality

## Support

For questions, issues, or contributions, please refer to the project's main documentation and issue tracking system.