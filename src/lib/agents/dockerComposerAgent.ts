import { BaseAgent } from './core/BaseAgent';
import { BaseAgentOptions, AgentConfig } from './core/types';

// Docker Composer specific options
export interface DockerComposerOptions extends BaseAgentOptions {
  serviceName?: string; // Service to generate compose config for
  outputDirectory?: string; // Where to write the config files
  useOfficialExamples?: boolean; // Whether to search for official examples
}

export class DockerComposerAgent extends BaseAgent<DockerComposerOptions> {
  getAgentType(): string {
    return 'docker-composer';
  }

  buildPrompt(options: DockerComposerOptions): string {
    return this.getTaskPrompt(options);
  }

  getAllowedTools(): string[] {
    return ['Bash', 'Glob', 'Grep', 'Read', 'Write', 'Edit', 'MultiEdit', 'WebFetch', 'mcp__fetch__fetch', 'mcp__searxng__search', 'mcp__github-chat__index_repository', 'mcp__github-chat__query_repository'];
  }

  getTaskPrompt(options: DockerComposerOptions): string {
    const serviceName = options.serviceName || 'the requested service';
    return `
# Simple Docker Compose Generator

Generate a MINIMAL Docker Compose configuration for **${serviceName}**.

## STEP 1: Find Official Example
**Search for official docker-compose.yml examples:**
1. Search official GitHub repo for ${serviceName}
2. Look for docker-compose.yml in their documentation  
3. Find the simplest official example

## STEP 2: Check Existing Patterns
**Analyze existing containers on this system:**
1. \`docker ps\` - see what's running
2. Find existing docker-compose files: \`find /home -name "docker-compose*.yml" 2>/dev/null | head -5\`
3. Check volume mount patterns: \`docker inspect \$(docker ps -q) | grep -A5 -B5 Mounts | head -20\`

## STEP 3: Generate SIMPLE Config
**Create MINIMAL configuration:**
1. Create directory: ${options.outputDirectory || `./docker-configs/${serviceName}`}/
2. Use the OFFICIAL example as base
3. Adapt volume paths to match existing system patterns
4. NO Traefik, NO nginx, NO SSL, NO backup scripts, NO security hardening
5. Just the basic service container

## OUTPUT FILES:
- docker-compose.yaml (basic service only)
- .env (minimal variables)

## REQUIREMENTS:
- Use official examples as starting point
- Match existing volume patterns on system
- Keep it SIMPLE - one service container only
- NO reverse proxies, SSL, or complex networking
- Modern format (no version field)

**Present the docker-compose.yaml and ask for approval.**
`;
  }

  getSystemPrompt(): string {
    return `
You are a Docker Compose Configuration Assistant focused on simple, practical deployments.

CORE APPROACH:
1. **Find Official Examples**: Search for official docker-compose.yml from the service's GitHub repo or documentation
2. **Follow Existing Patterns**: Analyze existing docker-compose files on the system to match naming, volume, and port patterns
3. **Keep It Simple**: Generate minimal configurations without unnecessary complexity

RESEARCH PRIORITY:
1. Search official docs/GitHub for existing docker-compose examples
2. Check what's already running on the system for pattern consistency
3. Use the official examples as the base, adapting only for local patterns

CONFIGURATION PRINCIPLES:
- Start with official examples when available
- Match existing volume mount patterns on the system
- Use standard port configurations
- Avoid adding complexity (no reverse proxies, SSL, etc. unless explicitly requested)
- Modern Docker Compose format (no version field)

ANALYSIS METHODOLOGY:
- Always use tools to check existing infrastructure patterns
- Search official documentation and repositories first
- Generate clean, minimal configurations based on official examples

OUTPUT REQUIREMENTS:
- Generate simple, working configurations
- Follow existing system patterns for consistency  
- Present configurations clearly for user approval

Your role is configuration generation and presentation only. You do not deploy or execute anything - that's handled by the DockerDeploymentAgent after user approval.
`;
  }

  getConfig(): AgentConfig {
    return {
      name: 'Docker Composer Configuration Generator',
      version: '1.0.0',
      description: 'Generates simple Docker Compose configurations based on official examples and existing system patterns',
      defaultOptions: {
        timeout_ms: 900000, // 15 minutes for thorough analysis and generation
        maxTurns: 50, // Allow for comprehensive analysis and generation
        permissionMode: 'acceptEdits',
        includePartialMessages: true
      },
      capabilities: [
        'Docker infrastructure analysis and assessment',
        'Service-specific research and best practice implementation',
        'Simple Docker Compose generation',
        'Environment configuration management',
        'User approval workflow integration'
      ],
      requiredTools: ['Bash', 'Read', 'Write'],
      optionalTools: ['Glob', 'Grep', 'Edit', 'MultiEdit', 'WebFetch', 'mcp__fetch__fetch', 'mcp__searxng__search', 'mcp__github-chat__index_repository', 'mcp__github-chat__query_repository'],
      typicalExecutionTime: 600000, // 10 minutes
      costEstimate: {
        min: 0.15,
        max: 2.50,
        typical: 0.75
      }
    };
  }

  /**
   * Get agent capability information (legacy method)
   */
  getCapabilities(): Record<string, any> {
    const config = this.getConfig();
    return {
      name: config.name,
      version: config.version,
      description: config.description,
      capabilities: config.capabilities,
      requiredTools: config.requiredTools,
      optionalTools: config.optionalTools,
      typicalExecutionTime: config.typicalExecutionTime,
      costEstimate: config.costEstimate
    };
  }
}