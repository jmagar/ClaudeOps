# ClaudeOps Parallel Implementation Plan

ClaudeOps is a full-stack TypeScript application providing a web interface for managing and executing AI-powered agents locally, with real-time monitoring and cost tracking capabilities. This MVP implementation focuses on the System Health Reporter agent with comprehensive execution tracking, cost management, and real-time logging through WebSocket integration. The system uses Next.js 15.5.3 with App Router, SQLite with Drizzle ORM, and the Claude Code TypeScript SDK for AI agent execution.

## Critically Relevant Files and Documentation
- `/home/jmagar/code/agents/docs/plans/claudeops/shared.md`
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md`
- `/home/jmagar/code/agents/docs/plans/claudeops/claude-sdk-patterns.docs.md`
- `/home/jmagar/code/agents/docs/plans/claudeops/database-patterns.docs.md`
- `/home/jmagar/code/agents/docs/plans/claudeops/nextjs-patterns.docs.md`
- `/home/jmagar/code/agents/docs/plans/claudeops/websocket-patterns.docs.md`

## Implementation Plan

### Phase 1: Project Foundation

#### Task 1.1: Next.js 15.5.3 Project Initialization [Depends on: none]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/shared.md` (Core technology stack)
- `/home/jmagar/code/agents/docs/plans/claudeops/nextjs-patterns.docs.md` (Next.js configuration patterns)

**Instructions**

Files to Create
- `package.json`
- `next.config.js`
- `tsconfig.json`
- `tailwind.config.js`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/lib/utils.ts`
- `components.json`
- `.gitignore` (update existing)
- `.env.local.example`

Initialize Next.js 15.5.3 project with TypeScript, TailwindCSS v4, and shadcn/ui. Set up proper directory structure with src/ folder, configure App Router, and establish TypeScript path mapping. Install core dependencies including React 19, TypeScript 5.7+, and Turbopack configuration.

#### Task 1.2: Database Schema and ORM Setup [Depends on: 1.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/shared.md` (Database tables structure)
- `/home/jmagar/code/agents/docs/plans/claudeops/database-patterns.docs.md` (Schema definitions and patterns)

**Instructions**

Files to Create
- `src/lib/db/schema/executions.ts`
- `src/lib/db/schema/executionSteps.ts`
- `src/lib/db/schema/executionCosts.ts`
- `src/lib/db/schema/agentConfigs.ts`
- `src/lib/db/schema/schedules.ts`
- `src/lib/db/schema/systemMetrics.ts`
- `src/lib/db/schema/index.ts`
- `src/lib/db/connection.ts`
- `src/lib/db/migrations/migrate.ts`
- `drizzle.config.ts`
- `data/` (directory)

Files to Modify
- `package.json` (add Drizzle ORM dependencies)

Set up SQLite database with Drizzle ORM, create all 7 table schemas with proper indexes, configure database connection with WAL mode, and implement migration system. Include comprehensive TypeScript types and establish connection singleton pattern for Next.js 15 App Router compatibility.

#### Task 1.3: shadcn/ui Component Library Setup [Depends on: 1.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (UI components needed)
- `/home/jmagar/code/agents/docs/plans/claudeops/nextjs-patterns.docs.md` (Component patterns)

**Instructions**

Files to Create
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/label.tsx`
- `src/components/ui/table.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/progress.tsx`
- `src/components/ui/toast.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/select.tsx`

Initialize shadcn/ui component library with TailwindCSS v4 compatibility, install essential UI components needed for dashboard interface, and configure proper theming with CSS variables for dark/light mode support.

### Phase 2: Core API Infrastructure

#### Task 2.1: Database Service Layer [Depends on: 1.2]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/database-patterns.docs.md` (Service layer patterns)
- `/home/jmagar/code/agents/docs/plans/claudeops/shared.md` (Database operations)

**Instructions**

Files to Create
- `src/lib/services/executionService.ts`
- `src/lib/services/costService.ts`
- `src/lib/services/agentService.ts`
- `src/lib/services/metricsService.ts`
- `src/lib/services/scheduleService.ts`
- `src/lib/types/database.ts`
- `src/lib/types/api.ts`

Implement comprehensive database service layer with type-safe CRUD operations, query builders for complex analytics queries, cost tracking aggregations, and execution history management. Include proper error handling and performance optimization with prepared statements.

#### Task 2.2: Next.js API Routes Foundation [Depends on: 2.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (API endpoints specification)
- `/home/jmagar/code/agents/docs/plans/claudeops/nextjs-patterns.docs.md` (API route patterns)

**Instructions**

Files to Create
- `src/app/api/executions/route.ts`
- `src/app/api/executions/[id]/route.ts`
- `src/app/api/executions/[id]/cancel/route.ts`
- `src/app/api/agents/route.ts`
- `src/app/api/agents/[type]/route.ts`
- `src/app/api/costs/route.ts`
- `src/app/api/costs/summary/route.ts`
- `src/app/api/system/health/route.ts`
- `src/lib/middleware/errorHandler.ts`
- `src/lib/middleware/validation.ts`

Implement REST API endpoints with proper HTTP methods, request/response validation using Zod, error handling middleware, and integration with database service layer. Include pagination, filtering, and sorting capabilities for data endpoints.

#### Task 2.3: Claude SDK Integration Layer [Depends on: 2.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/claude-sdk-patterns.docs.md` (SDK integration patterns)
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (Cost tracking requirements)

**Instructions**

Files to Create
- `src/lib/claude/sdkManager.ts`
- `src/lib/claude/costTracker.ts`
- `src/lib/claude/configFactory.ts`
- `src/lib/claude/executionWrapper.ts`
- `src/lib/claude/errorHandler.ts`
- `src/lib/types/claude.ts`

Files to Modify
- `package.json` (add Claude SDK dependency)

Integrate Claude Code TypeScript SDK with proper configuration management, real-time cost tracking, execution orchestration patterns, error handling with circuit breakers, and budget management. Include streaming mode support and query control implementation.

### Phase 3: WebSocket Infrastructure

#### Task 3.1: WebSocket Server Implementation [Depends on: 1.1, 2.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/websocket-patterns.docs.md` (WebSocket server patterns)
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (Real-time features)

**Instructions**

Files to Create
- `server.js` (Custom Next.js server)
- `src/lib/websocket/server.ts`
- `src/lib/websocket/connectionManager.ts`
- `src/lib/websocket/messageTypes.ts`
- `src/lib/websocket/rateLimiter.ts`
- `src/lib/websocket/backpressureHandler.ts`

Files to Modify
- `package.json` (add WebSocket dependencies)
- `next.config.js` (custom server configuration)

Set up Next.js custom server with WebSocket support using 'ws' library, implement connection management with backpressure handling, message batching for high-frequency log streaming, rate limiting, and proper error recovery mechanisms.

#### Task 3.2: Execution Tracking Service [Depends on: 3.1, 2.3]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/database-patterns.docs.md` (Execution tracking patterns)
- `/home/jmagar/code/agents/docs/plans/claudeops/websocket-patterns.docs.md` (Real-time tracking)

**Instructions**

Files to Create
- `src/lib/services/executionTracker.ts`
- `src/lib/services/logStreamer.ts`
- `src/lib/services/processManager.ts`
- `src/lib/types/execution.ts`
- `src/lib/utils/logBuffer.ts`

Implement execution tracking service with WebSocket integration, real-time log streaming with message batching, process lifecycle management, step-by-step execution monitoring, and database persistence with optimized writes.

#### Task 3.3: Client-Side WebSocket Hooks [Depends on: 3.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/websocket-patterns.docs.md` (Client-side patterns)
- `/home/jmagar/code/agents/docs/plans/claudeops/nextjs-patterns.docs.md` (React hooks patterns)

**Instructions**

Files to Create
- `src/hooks/useWebSocket.ts`
- `src/hooks/useExecutionLogs.ts`
- `src/hooks/useExecutionStatus.ts`
- `src/hooks/useSystemStatus.ts`
- `src/lib/contexts/WebSocketContext.tsx`
- `src/lib/utils/websocketClient.ts`

Implement React hooks for WebSocket connection management, real-time log streaming with virtual scrolling support, execution status updates, system health monitoring, and proper connection lifecycle handling with automatic reconnection.

### Phase 4: Agent Implementation

#### Task 4.1: System Health Reporter Agent [Depends on: 2.3, 3.2]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (System Health Reporter specifications)
- `/home/jmagar/code/agents/docs/plans/claudeops/claude-sdk-patterns.docs.md` (Agent execution patterns)

**Instructions**

Files to Create
- `src/agents/systemHealthReporter.ts`
- `src/agents/base/agentRunner.ts`
- `src/agents/utils/systemInfo.ts`
- `src/agents/utils/healthChecks.ts`
- `src/lib/types/agents.ts`

Files to Modify
- `package.json` (add system information dependencies)

Implement System Health Reporter agent with comprehensive system analysis (CPU, memory, disk, network, processes), integration with Claude SDK for AI-powered analysis, structured output formatting, and proper error handling with detailed logging.

#### Task 4.2: Agent Execution Framework [Depends on: 4.1, 3.2]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/claude-sdk-patterns.docs.md` (Execution orchestration)
- `/home/jmagar/code/agents/docs/plans/claudeops/database-patterns.docs.md` (Execution tracking)

**Instructions**

Files to Create
- `src/lib/services/agentOrchestrator.ts`
- `src/lib/services/executionEngine.ts`
- `src/lib/utils/processRunner.ts`
- `src/lib/utils/resourceMonitor.ts`
- `src/lib/types/orchestration.ts`

Implement agent execution framework with local Node.js process management, resource monitoring, execution isolation, timeout handling, cancellation support, and comprehensive logging with execution step tracking.

#### Task 4.3: Agent Configuration Management [Depends on: 4.1, 2.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/claude-sdk-patterns.docs.md` (Configuration patterns)
- `/home/jmagar/code/agents/docs/plans/claudeops/shared.md` (Agent configurations)

**Instructions**

Files to Create
- `src/lib/config/agentConfigs.ts`
- `src/lib/config/defaultConfigs.ts`
- `src/lib/services/configService.ts`
- `src/app/api/agents/configs/route.ts`
- `src/lib/types/config.ts`

Implement agent configuration management with database persistence, configuration validation, environment-specific settings, default configuration templates, and API endpoints for configuration CRUD operations.

### Phase 5: Dashboard Implementation

#### Task 5.1: Layout and Navigation Components [Depends on: 1.3, 3.3]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (Dashboard layout specifications)
- `/home/jmagar/code/agents/docs/plans/claudeops/nextjs-patterns.docs.md` (Component patterns)

**Instructions**

Files to Create
- `src/components/layout/DashboardLayout.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/Breadcrumbs.tsx`
- `src/components/navigation/NavItems.tsx`
- `src/components/common/LoadingSpinner.tsx`
- `src/components/common/ErrorBoundary.tsx`

Implement dashboard layout with responsive sidebar navigation, header with system status indicators, breadcrumb navigation, proper loading states, error boundaries, and integration with WebSocket connection status.

#### Task 5.2: Execution Management Dashboard [Depends on: 5.1, 3.3]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (Execution dashboard features)
- `/home/jmagar/code/agents/docs/plans/claudeops/websocket-patterns.docs.md` (Real-time UI patterns)

**Instructions**

Files to Create
- `src/app/dashboard/page.tsx`
- `src/components/dashboard/ExecutionOverview.tsx`
- `src/components/dashboard/RecentExecutions.tsx`
- `src/components/dashboard/SystemStatus.tsx`
- `src/components/dashboard/QuickActions.tsx`
- `src/components/executions/ExecutionCard.tsx`
- `src/components/executions/StatusBadge.tsx`

Implement main dashboard with execution overview, recent executions list, system health status, quick action buttons, real-time status updates via WebSocket, and responsive design for various screen sizes.

#### Task 5.3: Execution Detail and Log Viewer [Depends on: 5.2, 3.3]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (Log viewer requirements)
- `/home/jmagar/code/agents/docs/plans/claudeops/websocket-patterns.docs.md` (Log streaming patterns)

**Instructions**

Files to Create
- `src/app/executions/[id]/page.tsx`
- `src/components/executions/ExecutionDetails.tsx`
- `src/components/executions/LogViewer.tsx`
- `src/components/executions/ExecutionSteps.tsx`
- `src/components/executions/ExecutionControls.tsx`
- `src/components/logs/VirtualLogList.tsx`
- `src/components/logs/LogEntry.tsx`

Implement execution detail page with comprehensive execution information, real-time log viewer with virtual scrolling for performance, execution step tracking, control buttons (cancel, restart), and cost breakdown display.

### Phase 6: Cost Management

#### Task 6.1: Cost Tracking Dashboard [Depends on: 5.1, 2.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (Cost management features)
- `/home/jmagar/code/agents/docs/plans/claudeops/claude-sdk-patterns.docs.md` (Cost tracking patterns)

**Instructions**

Files to Create
- `src/app/costs/page.tsx`
- `src/components/costs/CostOverview.tsx`
- `src/components/costs/BudgetStatus.tsx`
- `src/components/costs/CostChart.tsx`
- `src/components/costs/CostBreakdown.tsx`
- `src/components/charts/LineChart.tsx`
- `src/components/charts/BarChart.tsx`

Files to Modify
- `package.json` (add charting library)

Implement cost management dashboard with budget tracking, cost trends visualization, execution cost breakdown, monthly summaries, budget alerts, and interactive charts for cost analysis over time.

#### Task 6.2: Budget Management System [Depends on: 6.1, 2.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/claude-sdk-patterns.docs.md` (Budget management patterns)
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (Budget requirements)

**Instructions**

Files to Create
- `src/lib/services/budgetService.ts`
- `src/components/costs/BudgetSettings.tsx`
- `src/components/costs/AlertSettings.tsx`
- `src/app/api/budget/route.ts`
- `src/lib/utils/budgetCalculator.ts`
- `src/lib/types/budget.ts`

Implement budget management with configurable limits, threshold alerts, usage predictions, automatic execution blocking when budget exceeded, budget reset schedules, and integration with cost tracking service.

### Phase 7: System Integration

#### Task 7.1: System Health Monitoring [Depends on: 4.1, 5.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (System monitoring requirements)
- `/home/jmagar/code/agents/docs/plans/claudeops/shared.md` (System metrics structure)

**Instructions**

Files to Create
- `src/lib/services/systemMonitor.ts`
- `src/components/system/SystemHealth.tsx`
- `src/components/system/ResourceUsage.tsx`
- `src/components/system/ServiceStatus.tsx`
- `src/app/api/system/metrics/route.ts`
- `src/lib/utils/systemCollector.ts`

Implement system health monitoring with real-time metrics collection, resource usage tracking, service status monitoring, health check endpoints, automatic alerting for system issues, and dashboard integration.

#### Task 7.2: Error Handling and Logging [Depends on: 7.1, 3.1]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/claude-sdk-patterns.docs.md` (Error handling patterns)
- `/home/jmagar/code/agents/docs/plans/claudeops/websocket-patterns.docs.md` (Error recovery patterns)

**Instructions**

Files to Create
- `src/lib/utils/logger.ts`
- `src/lib/services/errorReporter.ts`
- `src/lib/middleware/errorBoundary.ts`
- `src/components/errors/ErrorDisplay.tsx`
- `src/lib/types/errors.ts`
- `src/lib/utils/errorCategories.ts`

Implement comprehensive error handling with structured logging, error categorization, automatic error recovery strategies, user-friendly error displays, error reporting service, and integration with execution tracking.

#### Task 7.3: Development and Production Configuration [Depends on: 7.2]

**READ THESE BEFORE TASK**
- `/home/jmagar/code/agents/docs/plans/claudeops/requirements.md` (Deployment requirements)
- `/home/jmagar/code/agents/docs/plans/claudeops/nextjs-patterns.docs.md` (Configuration patterns)

**Instructions**

Files to Create
- `.env.local`
- `.env.production`
- `scripts/setup.js`
- `scripts/migrate.js`
- `src/lib/config/environment.ts`
- `Dockerfile` (optional)
- `docker-compose.yml` (optional)

Files to Modify
- `package.json` (add scripts)
- `next.config.js` (production optimizations)

Configure environment-specific settings, database migration scripts, development setup automation, production build optimizations, deployment configuration, and comprehensive documentation for setup and deployment.

## Advice

- **Database Initialization is Critical**: Ensure database connection and migration runs before any API calls. The singleton pattern in database connection must handle Next.js 15 App Router properly
- **WebSocket Backpressure Must Be Implemented**: High-frequency log streaming will fail without proper backpressure handling and message batching. This is not optional for ClaudeOps
- **Claude SDK Integration Requires Careful Error Handling**: The SDK has specific error types and result message subtypes that must be handled correctly to prevent runtime failures
- **Virtual Scrolling is Essential**: Log viewer will become unusable without virtual scrolling implementation for performance with large log volumes
- **Cost Tracking Should Be Real-Time**: Budget limits must be enforced immediately to prevent runaway costs. Implement both soft and hard limits
- **Custom Next.js Server is Required**: WebSocket functionality cannot be implemented without custom server setup in Next.js 15 - this is a hard requirement
- **TypeScript Strict Mode is Mandatory**: The complexity of the system requires strict typing to prevent runtime errors, especially around database queries and WebSocket messages
- **Message Batching Window Must Be Optimized**: 50ms batching window with max 25 messages provides good balance of real-time feel and performance
- **Connection Health Monitoring is Critical**: WebSocket connections must be monitored with automatic reconnection to handle network issues gracefully
- **Database Indexes Are Performance-Critical**: The execution and cost tracking queries will be slow without proper composite indexes on frequently queried columns
- **Agent Process Isolation is Required**: Each agent execution must run in isolated processes with proper resource monitoring and cleanup
- **Error Recovery Should Be Automatic**: Circuit breaker patterns and exponential backoff must be implemented to handle Claude SDK rate limits and temporary failures
- **Local Development Database Should Be Separate**: Use different database files for development vs production to prevent data corruption during testing