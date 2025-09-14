# ClaudeOps - Requirements Document

## Overview

ClaudeOps is a full-stack TypeScript application that provides a modern web interface for managing and executing AI-powered agents locally. The MVP focuses on local agent execution with a polished dashboard experience, establishing the foundation for future remote deployment capabilities.

## Project Scope

### Phase 0 MVP (Weeks 1-6)
- Full-stack TypeScript application (Next.js 15.5.3 + Node.js 22.x)
- System Health Reporter agent implementation
- Real-time execution monitoring with WebSocket integration
- Built-in cost tracking via Claude Code TypeScript SDK
- Local agent execution (no SSH/remote complexity)
- Polished dashboard with modern UX

### Future Phases
- Docker Janitor and Backup Validator agents
- SSH-based remote node execution
- Multi-user authentication system
- Advanced node discovery and management
- Custom agent development framework
- Docker containerization

## Technical Architecture

### Core Technology Stack

**Frontend (React 19 + Next.js 15.5.3)**
- Framework: Next.js 15.5.3 with App Router
- Runtime: Node.js 22.x LTS (minimum 20.x fallback)
- UI Framework: React 19 with concurrent features
- Styling: TailwindCSS v4 + shadcn/ui components
- Build Tool: Turbopack (Next.js 15 default)
- Type Safety: TypeScript 5.7+

**Backend (Next.js API Routes)**
- API Framework: Next.js 15.5.3 API routes
- Database: SQLite with better-sqlite3
- ORM: Drizzle ORM for type-safe queries
- AI Integration: Claude Code TypeScript SDK
- WebSocket: ws library for real-time updates

**Agent Execution**
- Language: TypeScript (executed via Node.js)
- Execution Method: Local Node.js process execution
- Target: Localhost only (MVP scope)

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Local Development                    │
├─────────────────────────┐   ┌─────────────────────────┐
│   Next.js Frontend      │   │   Agent Execution       │
│   - React 19 Dashboard  │   │   - Local Node.js       │
│   - Real-time UI        │   │   - TypeScript Agents   │
│   - Cost Monitoring     │   │   - Claude SDK Powered  │
└─────────────────────────┘   └─────────────────────────┘
            │                              ▲
            │ HTTP/WebSocket               │
            ▼                              │
┌─────────────────────────┐               │
│   Next.js Backend       │───────────────┘
│   - API Routes          │   Local Process
│   - WebSocket Server    │   Execution
│   - SQLite Database     │
│   - Agent Orchestration │
└─────────────────────────┘
```

## User Experience Design

### Primary User Flows

**1. Initial Setup Flow**
1. Clone repository and install dependencies (`npm install`)
2. Set up environment variables (Claude API key)
3. Start development server (`npm run dev`)
4. Access dashboard at `http://localhost:3000`
5. Run first System Health Reporter agent locally

**2. Daily Operations Flow**
1. Open dashboard to view local system status
2. Select "System Health Check" quick action
3. View real-time execution logs via WebSocket
4. Review AI analysis and recommendations
5. Explore cost breakdown and execution history

**3. Cost Management Flow**
1. Monitor real-time cost meter in dashboard header
2. Review per-execution cost breakdowns
3. Set monthly budget alerts (future enhancement)
4. Optimize agent execution based on cost insights

### Dashboard Layout

**Header Components**
- Navigation menu with agent categories
- Real-time cost meter with monthly progress
- System status indicator
- User settings dropdown (future auth integration)

**Main Dashboard Sections**
- Quick Actions: One-click execution buttons for each agent
- Recent Executions: Table with status, cost, duration, and results
- System Overview: Visual health indicators for local system
- Live Execution Panel: Real-time log streaming during agent runs

## Core Agent Specifications

### System Health Reporter (MVP Priority)

**Purpose**: Comprehensive system analysis with AI-powered insights and trend detection

**Execution Cost**: ~$0.05 per run (estimated)

**Analysis Components**:
- Disk space usage trends and predictions
- Memory/CPU utilization patterns
- Service health monitoring (systemd services)
- Security audit (open ports, auth logs, package updates)
- Network connectivity and performance tests
- System log anomaly detection

**Output Format**:
```typescript
interface HealthReport {
  timestamp: string;
  overall_health: 'healthy' | 'warning' | 'critical';
  metrics: {
    disk_usage: DiskMetrics;
    memory_usage: MemoryMetrics;
    cpu_usage: CpuMetrics;
    services: ServiceStatus[];
    security: SecurityAudit;
    network: NetworkTests;
  };
  ai_analysis: {
    summary: string;
    recommendations: Recommendation[];
    trends: TrendAnalysis[];
    alerts: Alert[];
  };
  cost_breakdown: CostMetrics;
}
```

### Future Agents (Post-MVP)

**Docker Janitor** (when Docker integration added)
- Unused image/volume detection with size analysis
- Container resource optimization recommendations
- Compose stack health verification
- Registry cleanup suggestions
- Estimated cost: ~$0.10 per run

**Backup Validator**
- Automated backup integrity verification
- Test restore procedures (dry-run mode)
- Backup age and retention policy analysis
- Storage efficiency recommendations
- Estimated cost: ~$0.03 per run

## Data Management

### Database Schema (SQLite + Drizzle ORM)

```typescript
// Core Tables
const executions = sqliteTable('executions', {
  id: text('id').primaryKey(),
  agent_type: text('agent_type').notNull(),
  status: text('status').notNull(), // 'pending' | 'running' | 'completed' | 'failed'
  started_at: text('started_at').notNull(),
  completed_at: text('completed_at'),
  cost_usd: real('cost_usd'),
  duration_ms: integer('duration_ms'),
  result_summary: text('result_summary'),
  logs: text('logs'), // Full execution logs
  ai_analysis: text('ai_analysis'), // JSON
});

const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  agent_type: text('agent_type').notNull(),
  cron_expression: text('cron_expression').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  next_run: text('next_run'),
});
```

### Data Storage

**Local Development**:
- SQLite database stored in project directory
- Execution logs and results persisted locally
- No external dependencies or remote storage
- Simple file-based configuration

## API Design

### REST API Endpoints

```typescript
// Agent Execution
POST   /api/agents/execute           # Execute agent locally
GET    /api/executions               # List recent executions
GET    /api/executions/:id           # Get execution details
POST   /api/executions/:id/cancel    # Cancel running execution

// Scheduling  
GET    /api/schedules                # List scheduled jobs
POST   /api/schedules                # Create schedule
PUT    /api/schedules/:id            # Update schedule
DELETE /api/schedules/:id            # Delete schedule

// Cost Tracking
GET    /api/cost/current             # Current month spending
GET    /api/cost/history             # Historical cost data
GET    /api/cost/breakdown           # Cost by agent type

// System Status
GET    /api/system/health            # Local system health
GET    /api/system/info              # System information
```

### WebSocket Events

```typescript
// Real-time execution updates
interface WebSocketEvents {
  // Execution lifecycle
  'execution:started': { execution_id: string };
  'execution:log': { execution_id: string; log_line: string };
  'execution:progress': { execution_id: string; progress: number };
  'execution:completed': { execution_id: string; result: ExecutionResult };
  'execution:failed': { execution_id: string; error: string };
  
  // Cost updates
  'cost:updated': { current: number; monthly: number; execution_id: string };
  
  // System status
  'system:status': { status: 'healthy' | 'warning' | 'error' };
}
```

## Security Considerations

### MVP Security Model
- **No authentication** for localhost-only deployment
- Local process execution with limited privileges
- Audit logging for all agent executions
- Read-only operations by default (destructive actions require explicit confirmation)
- No network exposure (localhost binding only)

### Production Security (Future)
- JWT-based authentication with role-based access control
- Encrypted database storage for sensitive data
- TLS/SSL for web interface
- Remote SSH-based execution with proper key management
- IP allowlisting and firewall configuration

## Cost Management Integration

### Claude Code SDK Integration

```typescript
import { query } from '@anthropic/claude-code-sdk';

// Built-in cost tracking per execution
const result = await query({
  prompt: agentPrompt,
  options: {
    model: 'claude-3-5-sonnet-20241022',
    maxTurns: 5
  }
});

// SDK provides automatic cost tracking
for await (const message of result) {
  if (message.type === 'result') {
    const executionCost = message.total_cost_usd;
    const tokenUsage = message.usage;
    const duration = message.duration_ms;
    
    // Store in database for dashboard display
    await updateExecutionCosts(executionId, {
      cost_usd: executionCost,
      duration_ms: duration,
      token_usage: tokenUsage
    });
  }
}
```

### Cost Optimization Features
- **Real-time cost display**: Header meter showing current month spending
- **Per-execution breakdown**: Detailed cost analysis for each agent run
- **Budget alerts**: Configurable monthly spending limits (future)
- **Cost estimation**: Preview estimated cost before execution
- **Historical tracking**: Monthly and yearly cost trend analysis

## Deployment Strategy

### Local Development Setup

```bash
# Clone and setup
git clone <repository-url>
cd claudeops
npm install

# Environment configuration
cp .env.example .env
# Add Claude API key to .env

# Start development server
npm run dev

# Access at http://localhost:3000
```

### Production Build

```bash
# Build for production
npm run build
npm start

# Or using PM2 for process management
npm install -g pm2
pm2 start npm --name "claudeops" -- start
```

## Testing Strategy

### Unit Testing
- Jest for business logic testing
- React Testing Library for component tests
- Supertest for API endpoint testing

### Integration Testing
- Local test environment setup
- Agent execution testing with mocked Claude responses
- WebSocket integration testing
- Database integration testing

### End-to-End Testing
- Playwright for full user journey testing
- Agent execution testing in local environment
- Cost tracking validation

## Performance Requirements

### Response Time Targets
- Dashboard load: < 2 seconds
- Agent execution start: < 5 seconds
- WebSocket log streaming: < 100ms latency
- API responses: < 500ms average

### Scalability Considerations
- Local execution with reasonable resource limits
- Concurrent execution limit: 5 agents (local MVP)
- Database size limit: 1GB (SQLite practical limit)
- WebSocket connections: 10 concurrent clients (local development)

## Monitoring and Observability

### Application Metrics
- Execution success/failure rates
- Average execution duration by agent type
- Cost per execution trends
- Node connectivity status

### Error Handling
- Structured logging with Winston
- Error boundaries in React components
- SSH connection retry logic with exponential backoff
- Graceful degradation for offline nodes

## Development Workflow

### Local Development Setup
```bash
# Clone repository
git clone <repository-url>
cd claudeops

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with Claude API key

# Start development server
npm run dev

# Access at http://localhost:3000
```

### Project Structure
```
claudeops/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   ├── dashboard/          # Dashboard pages
│   │   └── layout.tsx          # Root layout
│   ├── components/             # React components
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── dashboard/          # Dashboard-specific
│   │   └── agents/             # Agent-related
│   ├── lib/
│   │   ├── db/                 # Database schema & queries
│   │   ├── claude/             # Claude SDK integration
│   │   ├── execution/          # Local agent execution
│   │   └── utils/              # Utility functions
│   ├── agents/                 # Agent TypeScript files
│   │   ├── system-health.ts    # System Health Reporter
│   │   ├── docker-janitor.ts   # Docker Janitor (future)
│   │   └── backup-validator.ts # Backup Validator (future)
│   └── types/                  # TypeScript type definitions
├── scripts/                    # Utility scripts
├── tests/                      # Test files
├── data/                       # SQLite database storage
├── .env.example                # Environment template
└── README.md                   # Setup instructions
```

## Success Metrics

### MVP Success Criteria
- [ ] Complete System Health Reporter implementation
- [ ] Real-time WebSocket log streaming functional
- [ ] Local agent execution working seamlessly
- [ ] Cost tracking displaying accurate SDK data
- [ ] Dashboard responsive and intuitive
- [ ] Simple development setup with npm run dev

### User Adoption Metrics
- Time to first successful agent execution: < 10 minutes
- Agent execution success rate: > 95%
- User satisfaction with real-time updates: Subjective feedback
- Setup completion rate: > 90% of attempts

## Risk Mitigation

### Technical Risks
- **Local process management**: Proper cleanup of agent processes
- **Node.js version compatibility**: Support matrix for Node.js 20.x and 22.x
- **Claude API rate limits**: Built-in backoff and retry mechanisms
- **WebSocket connection stability**: Auto-reconnection and state recovery

### Security Risks
- **Local process execution**: Sandboxed agent execution with limited privileges
- **Unauthorized access**: Localhost-only binding for MVP
- **Code injection**: Validated agent script execution
- **Data persistence**: Regular SQLite database backups

## Future Enhancements

### Near-term (Months 2-3)
- Docker Janitor and Backup Validator agents (local execution)
- Visual cron expression builder
- Agent scheduling with calendar view
- Basic user authentication system

### Long-term (Months 4-6)
- SSH-based remote execution capability
- Docker containerization for easy deployment
- Custom agent development framework
- Network discovery for automatic node detection
- Advanced cost analytics with forecasting
- Mobile-responsive progressive web app
- Multi-tenant support for team environments

---

*Document Version: 1.0*  
*Created: January 2025*  
*Last Updated: January 2025*