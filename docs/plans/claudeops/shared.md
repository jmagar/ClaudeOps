# ClaudeOps - Shared Architecture Document

ClaudeOps is a full-stack TypeScript application built on Next.js 15.5.3 that provides real-time agent execution monitoring with comprehensive cost tracking. The architecture combines modern React patterns with robust backend services, utilizing SQLite for data persistence and WebSocket for real-time updates. The system emphasizes type safety, performance optimization, and seamless integration with the Claude Code TypeScript SDK for AI-powered local agent execution.

## Relevant Files

### Core Application Structure
- `/app/layout.tsx`: Root Next.js 15 layout with App Router configuration
- `/app/page.tsx`: Main dashboard homepage component
- `/app/api/agents/route.ts`: Agent execution API endpoints with CRUD operations
- `/app/api/executions/route.ts`: Execution tracking and status API
- `/app/api/websocket/route.ts`: WebSocket server for real-time communication
- `/src/lib/db/index.ts`: Database connection management with better-sqlite3
- `/src/lib/db/schema/index.ts`: Comprehensive Drizzle ORM schema definitions
- `/src/lib/claude/client.ts`: Claude Code SDK integration and configuration
- `/src/components/features/dashboard/Dashboard.tsx`: Main dashboard interface
- `/src/components/features/execution/LogViewer.tsx`: Real-time log streaming component
- `/src/hooks/useWebSocket.ts`: WebSocket connection management hook
- `/src/hooks/useAgentExecution.ts`: Agent execution state management hook
- `/server.js`: Custom Next.js server with WebSocket support

### Database Layer
- `/src/lib/db/queries/executions.ts`: Type-safe execution tracking queries
- `/src/lib/db/queries/costs.ts`: Cost analysis and budget management queries
- `/src/lib/db/queries/analytics.ts`: Dashboard metrics and performance queries
- `/src/lib/db/migrations/`: Drizzle migration files for schema versioning
- `/src/lib/services/executionTracker.ts`: Agent execution lifecycle management
- `/drizzle.config.ts`: Drizzle Kit configuration for migrations

### Real-time Communication
- `/src/lib/websocket/server.ts`: WebSocket server implementation with `ws` library
- `/src/lib/websocket/messageHandler.ts`: Message routing and type-safe event handling
- `/src/lib/websocket/broadcaster.ts`: Multi-client message broadcasting
- `/src/contexts/WebSocketContext.tsx`: React context for WebSocket state

### Agent Integration
- `/src/lib/claude/orchestrator.ts`: Agent execution orchestration and workflow management
- `/src/lib/claude/costTracker.ts`: Real-time cost monitoring and budget enforcement
- `/src/lib/claude/errorHandler.ts`: Structured error handling with retry logic
- `/src/agents/system-health.ts`: System Health Reporter agent implementation

## Relevant Tables

### Core Execution Tracking
- **executions**: Primary execution records with status, timing, cost, and results
- **execution_steps**: Detailed step-by-step execution tracking for granular monitoring
- **cost_tracking**: Comprehensive cost breakdown with token usage and model information
- **monthly_cost_summaries**: Pre-aggregated monthly cost data for fast dashboard queries

### Agent Management
- **agent_configurations**: Agent type definitions, limits, and execution constraints
- **schedules**: Cron-based scheduling configuration for automated agent runs

### System Monitoring
- **system_metrics**: System health data including CPU, memory, disk, and network metrics
- **app_settings**: Application configuration and feature flags

## Relevant Patterns

**Next.js 15 App Router with Custom Server**: Combines App Router benefits with WebSocket support through custom server.js implementation, enabling real-time bidirectional communication for agent control.

**Drizzle ORM with SQLite Schema-First Design**: Type-safe database operations with comprehensive indexing strategy, supporting high-performance queries for execution tracking and cost analysis while maintaining local deployment simplicity.

**WebSocket + React Hook Integration**: Hierarchical connection management using custom hooks (useWebSocket, useAgentExecution, useLogStream) with React Context for global state, enabling real-time log streaming and execution control.

**Claude SDK Integration with Cost Tracking**: Event-driven architecture using ExecutionTracker class for lifecycle management, real-time cost monitoring with budget enforcement, and structured error handling with retry policies.

**Execution Orchestration Patterns**: Sequential and concurrent agent execution patterns with semaphore-based concurrency control, circuit breaker implementation for system stability, and resource monitoring for local process execution.

**Performance Optimization Strategy**: Query result caching with 30-second TTL for dashboard data, virtual scrolling for log viewers, message batching for WebSocket communication, and prepared statements for frequent database operations.

## Relevant Docs

**nextjs-patterns.docs.md**: You _must_ read this when working on Next.js App Router implementation, API route organization, component architecture, and TypeScript integration patterns.

**database-patterns.docs.md**: You _must_ read this when working on database schema design, migration strategies, query optimization, execution tracking implementation, and cost analysis features.

**websocket-patterns.docs.md**: You _must_ read this when working on real-time communication, log streaming, connection state management, error recovery, and WebSocket server implementation.

**claude-sdk-patterns.docs.md**: You _must_ read this when working on Claude SDK integration, cost tracking implementation, agent orchestration, error handling, and local process execution management.