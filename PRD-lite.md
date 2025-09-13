# Claude Agent Runner Lite - Product Requirements Document

## Executive Summary

Claude Agent Runner Lite is a streamlined AI-powered automation system for homelabs. It combines a modern React-based dashboard with a simplified backend architecture - a single management server that executes Python-based AI agents on your infrastructure via SSH. No complex orchestration, no Docker containers on target nodes, just simple, effective automation powered by Claude with a polished user experience.

## Core Philosophy

- **Simplified Backend**: One container, SSH execution, no orchestration
- **Modern Frontend**: Full React 19 stack for excellent UX
- **Cost-Conscious**: Built-in cost controls and optimization
- **Security-First**: SSH-based execution, no privileged containers
- **Quick Wins**: Solve real problems in weeks, not months

## What Changed from Original Vision

| Original | Lite Version | Why |
|----------|-------------|-----|
| Multiple Docker containers per node | SSH-based execution | Reduced attack surface |
| Complex orchestrator architecture | Single management server | Faster deployment |
| PostgreSQL database | SQLite embedded | Zero dependencies |
| Full WebSocket streaming | Hybrid polling + WebSocket for logs | Balanced complexity |
| 10+ pre-built agents at launch | 3-5 focused agents | Quality over quantity |
| Gotify notification server | Simple webhook/email initially | Reduce dependencies |
| 6-month timeline | 10-week MVP | Rapid iteration |

## System Architecture

### Simplified Overview

```
┌─────────────────────────────────────────┐
│      Claude Agent Runner Lite           │
│         (Single Container)               │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │   React 19 Dashboard (Port 3000)   │ │
│  │   - Modern, responsive UI          │ │
│  │   - Real-time updates              │ │
│  │   - Cost monitoring dashboard      │ │
│  └────────────────────────────────────┘ │
│                ↕ REST/WebSocket          │
│  ┌────────────────────────────────────┐ │
│  │   FastAPI Backend (Port 8000)      │ │
│  │   - Agent scheduler                │ │
│  │   - SSH executor                   │ │
│  │   - Cost tracker                   │ │
│  │   - WebSocket for live logs        │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │   SQLite Database                  │ │
│  │   - Agent configs                  │ │
│  │   - Execution history              │ │
│  │   - SSH credentials (encrypted)    │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
                    │
                    │ SSH
                    ▼
┌─────────────────────────────────────────┐
│         Target Nodes (Your Servers)     │
│                                          │
│  • No agent installation required        │
│  • Python 3.8+ only dependency          │
│  • Standard SSH access                  │
│                                          │
└─────────────────────────────────────────┘
```

### Execution Flow

1. **User schedules agent** → React UI
2. **API call to backend** → FastAPI
3. **Backend SSHs to target** → Copies Python script
4. **Script executes** → Using local Python
5. **Results streamed** → Via WebSocket to UI
6. **Claude analyzes** → If AI insights needed
7. **Results stored** → SQLite database
8. **UI updates** → Real-time display

## Target Audience

**Primary Users**: Homelab enthusiasts and self-hosters who:
- Run multiple servers (Unraid, TrueNAS, Proxmox, Ubuntu, etc.)
- Want to automate repetitive infrastructure tasks
- Prefer self-hosted solutions over cloud services
- Value both simplicity AND modern user interfaces
- Are cost-conscious but want AI-powered insights
- Have basic Docker and SSH knowledge

## Functional Requirements

### 1. MVP Agent Library (Phase 0)

#### 1.1 Core Agents

**System Health Reporter**
```python
# Comprehensive system analysis
- Disk space trends and predictions
- Memory/CPU usage patterns  
- Service health monitoring
- Security audit (ports, auth logs, updates)
- Network connectivity checks
- Cost: ~$0.05 per run
```

**Docker Janitor**
```python
# Intelligent Docker management
- Unused image/volume detection
- Container resource optimization
- Compose stack health checks
- Registry cleanup recommendations
- Cost: ~$0.10 per run
```

**Backup Validator**
```python
# Backup integrity verification
- Test restore procedures (dry-run)
- Backup age and retention analysis
- Storage efficiency recommendations
- Automated recovery testing
- Cost: ~$0.03 per run
```

#### 1.2 Agent Execution

- **Manual Trigger**: One-click from dashboard
- **Smart Scheduling**: Cron + intelligent triggers
- **Cost Estimation**: Real-time cost preview
- **Dry Run Mode**: Safe preview of actions
- **Batch Execution**: Run on multiple nodes

### 2. Modern Web Dashboard

#### 2.1 Dashboard Layout (React 19 + shadcn/ui)

```typescript
// Main dashboard components
<DashboardLayout>
  <Header>
    <NavigationMenu />
    <CostMeter current={3.42} limit={10} />
    <UserMenu />
  </Header>
  
  <MainContent>
    <QuickActions>
      <AgentCard agent="system-health" />
      <AgentCard agent="docker-janitor" />
      <AgentCard agent="backup-validator" />
    </QuickActions>
    
    <RecentExecutions>
      <ExecutionTable data={executions} />
    </RecentExecutions>
    
    <NodeStatus>
      <NodeGrid nodes={nodes} />
    </NodeStatus>
  </MainContent>
</DashboardLayout>
```

#### 2.2 Key UI Features

**Agent Execution View**
- Live log streaming with syntax highlighting
- Execution timeline visualization
- Cost breakdown per execution
- Export results as JSON/CSV

**Node Management**
- Visual node topology
- SSH connection health indicators
- Drag-and-drop agent assignment
- Bulk operations support

**Cost Analytics Dashboard**
- Interactive cost charts (Recharts)
- Per-agent cost breakdown
- Usage predictions
- Budget alerts

**Schedule Builder**
- Visual cron expression builder
- Calendar view of scheduled runs
- Conflict detection
- Template library

### 3. Security Model

#### 3.1 Authentication & Authorization
```typescript
// Multi-layer security
interface SecurityConfig {
  auth: {
    type: "local" | "oidc";
    mfa: boolean;
    sessionTimeout: number;
  };
  rbac: {
    roles: ["admin", "operator", "viewer"];
    permissions: PermissionMatrix;
  };
}
```

#### 3.2 SSH Security
```yaml
ssh_security:
  key_management:
    storage: "encrypted_sqlite"
    rotation: "90_days"
  connection:
    timeout: 300
    rate_limit: "10/hour"
    allowed_ips: ["10.0.0.0/8"]
  audit:
    log_commands: true
    retention: "30_days"
```

#### 3.3 Agent Permissions
- **Read-Only by Default**: No destructive operations in MVP
- **Explicit Confirmations**: Require user approval for changes
- **Audit Everything**: Log all SSH commands executed

### 4. Cost Management (Critical Feature)

#### 4.1 Smart Cost Optimization
```python
class CostOptimizer:
    strategies = {
        "response_caching": {
            "ttl": 86400,  # 24 hours
            "similarity_threshold": 0.95
        },
        "local_processing": {
            "simple_tasks": "regex_patterns",
            "complex_tasks": "claude_api"
        },
        "batch_requests": {
            "window": 60,  # seconds
            "max_batch": 10
        }
    }
```

#### 4.2 Cost Controls UI
- Real-time cost meter in header
- Per-execution cost estimates
- Monthly budget tracking
- Cost optimization suggestions
- Usage analytics and trends

### 5. Node Management

#### 5.1 Node Registration
- Manual SSH credential entry via web UI
- SSH key upload with password protection
- Connection testing and validation
- Support for different OS types (Linux, Unraid, TrueNAS)

#### 5.2 Node Capabilities
- Tag nodes by type (storage, compute, network)
- Define which agents can run on each node
- Resource monitoring (SSH-based checks)

## Technical Requirements

### Technology Stack

#### Backend (Simplified)
- **Python 3.11+**: Core runtime
- **FastAPI**: REST API + WebSocket support
- **SQLite**: Embedded database
- **Paramiko**: SSH library
- **APScheduler**: Cron scheduling
- **Pydantic**: Data validation
- **Claude Code SDK**: AI integration
- **Cryptography**: SSH key encryption

#### Frontend (Full Modern Stack)
- **React 19**: Latest React features
- **TypeScript 5.x**: Type safety
- **Vite**: Fast builds and HMR
- **TailwindCSS v4**: Modern utility CSS
- **shadcn/ui**: Accessible components
- **Tanstack Query**: Data fetching
- **Zustand**: State management
- **Recharts**: Data visualization
- **React Hook Form**: Form handling
- **Zod**: Schema validation

### Data Storage

#### Local Storage Only
- **SQLite Database**: Agent configurations, execution history, encrypted SSH credentials
- **Filesystem**: Logs, temporary files, SSH keys
- **Volume Mounts**: Persistent data in Docker volumes

### Deployment

#### Docker Compose Setup
```yaml
version: '3.8'
services:
  claude-runner-lite:
    image: clauderunner/lite:latest
    ports:
      - "3000:3000"  # Frontend
      - "8000:8000"  # API
    volumes:
      - ./data:/app/data
      - ./ssh-keys:/app/ssh-keys:ro
    environment:
      - CLAUDE_API_KEY=${CLAUDE_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    restart: unless-stopped
```

#### One-Line Install
```bash
curl -sSL https://get.claude-runner.dev | bash
```

## Non-Functional Requirements

### Performance
- Dashboard load: < 500ms
- API response: < 200ms (cached)
- SSH connection: < 5s timeout
- WebSocket latency: < 100ms
- Build size: < 2MB (gzipped)

### Reliability
- Automatic SSH retry (3 attempts)
- Graceful API rate limit handling
- Frontend error boundaries
- Offline mode for dashboard
- Daily SQLite backups

### Usability
- Installation in under 5 minutes
- No manual configuration file editing required
- Clear error messages with suggested fixes
- Responsive design for mobile/tablet
- Dark/light theme support

### Developer Experience
- Hot module replacement
- TypeScript strict mode
- Comprehensive Storybook
- E2E tests with Playwright
- API documentation (OpenAPI)

## Installation & Setup

### Quick Start Requirements
1. Docker and Docker Compose installed
2. Claude API key (or Claude Pro subscription)
3. SSH access to target nodes
4. Modern web browser

### Installation Process
```bash
# 1. One-line install
curl -sSL https://get.claude-runner.dev | bash

# 2. Configure environment
nano .env
# Set CLAUDE_API_KEY and ADMIN_PASSWORD

# 3. Start the system
docker compose up -d

# 4. Access dashboard
# http://your-server:3000

# 5. Add your first node via web UI
```

### Node Setup
```bash
# Target nodes only need:
# 1. Python 3.8+
# 2. SSH server running
# 3. User account with appropriate permissions

# No agent installation required!
```

## Implementation Phases

### Phase 0: Core MVP (Weeks 1-6)

**Weeks 1-2: Backend Foundation**
- FastAPI setup with SQLite
- SSH execution framework
- Basic authentication
- Cost tracking system

**Weeks 3-4: Frontend Foundation**
- React 19 + Vite setup
- shadcn/ui component library
- Basic dashboard layout
- API integration

**Weeks 5-6: Core Agents**
- System health agent
- Docker janitor agent
- Backup validator agent
- Testing and refinement

### Phase 1: Polish & Features (Weeks 7-10)

**Weeks 7-8: Enhanced UI**
- Live log streaming
- Cost analytics dashboard
- Visual schedule builder
- Mobile responsive design

**Weeks 9-10: Production Ready**
- MFA implementation
- Advanced cost optimization
- Performance optimization
- Documentation and tutorials

### Phase 2: Community Features (Month 3+)
- Plugin system for custom agents
- Community agent marketplace
- OIDC authentication
- Multi-user workspaces
- Local LLM support

## Example Use Cases

### Daily Health Check
```yaml
name: "Morning System Report"
schedule: "0 7 * * *"  # 7 AM daily
nodes: ["nas", "docker-host", "pihole"]
agent: "system_health"
notifications:
  webhook: "https://discord.com/api/webhooks/..."
estimated_cost: "$0.15/day"
```

### Weekly Docker Cleanup
```yaml
name: "Docker Maintenance"
schedule: "0 2 * * SUN"  # 2 AM Sunday
nodes: ["docker-*"]
agent: "docker_janitor"
options:
  dry_run: false
  keep_last: 3
estimated_cost: "$0.40/month"
```

### Backup Verification
```yaml
name: "Backup Health Check"
schedule: "0 3 * * MON"  # 3 AM Monday
nodes: ["backup-server"]
agent: "backup_validator"
options:
  test_restore: true
  check_integrity: true
estimated_cost: "$0.10/week"
```

## Example Configurations

### Dashboard Quick Actions
```typescript
// Predefined agent templates
const quickActions = [
  {
    name: "Morning Health Check",
    icon: <ActivityIcon />,
    agents: ["system-health"],
    nodes: "all",
    estimatedCost: "$0.15"
  },
  {
    name: "Docker Cleanup",
    icon: <Package2Icon />,
    agents: ["docker-janitor"],
    nodes: ["docker-*"],
    estimatedCost: "$0.30"
  }
];
```

### Cost Optimization Rules
```typescript
// Automatic cost management
const costRules = {
  daily_limit: 5.00,
  monthly_limit: 100.00,
  per_execution_limit: 1.00,
  optimization: {
    cache_similar_requests: true,
    use_local_for_simple: true,
    batch_window_seconds: 60
  }
};
```

## Success Metrics

### Phase 0 Success Criteria
- 25 beta users actively testing
- < $5/month average API cost
- 95% SSH execution success rate
- < 5 minute setup time
- 4.5+ user satisfaction score

### Phase 1 Targets
- 200 active installations
- 5 production-ready agents
- 99% uptime
- Community contributions (PRs)
- 100+ GitHub stars

### Phase 2 Goals
- 1,000+ active users
- 20+ community agents
- Unraid Community Applications integration
- $0 ongoing operational costs

## Risk Mitigation

### Technical Risks
| Risk | Mitigation | Priority |
|------|------------|----------|
| React 19 stability | Pin to stable version, test thoroughly | High |
| SSH connectivity | Robust retry logic, connection pooling | High |
| SQLite scaling | Plan PostgreSQL migration path | Medium |
| Bundle size | Code splitting, lazy loading | Medium |
| Claude API costs | Aggressive caching, local fallbacks | High |

### Market Risks
| Risk | Mitigation | Priority |
|------|------------|----------|
| Complex setup | One-click Docker install | High |
| Cost concerns | Free tier, cost calculator | High |
| Learning curve | Interactive tutorials | Medium |
| Security fears | Extensive audit logging | High |

### Product Risks
| Risk | Mitigation | Priority |
|------|------------|----------|
| Scope creep | Stick to core homelab use cases | High |
| Over-engineering | Embrace "good enough" solutions | Medium |
| Poor documentation | Invest heavily in setup guides | High |

## Development Resources

### Required Skills
- **Backend**: Python, FastAPI, SSH, Docker
- **Frontend**: React, TypeScript, TailwindCSS
- **DevOps**: Docker, Linux, Homelab experience
- **UI/UX**: Dashboard design, data visualization

### Development Environment
```bash
# Frontend development
cd frontend
npm install
npm run dev  # Vite dev server with HMR

# Backend development
cd backend
poetry install
poetry run uvicorn main:app --reload

# Full stack
docker-compose up --build
```

### Team Requirements
- 1 full-stack developer (Python + React)
- 1 DevOps/homelab specialist for testing
- 10-20 community beta testers
- UI/UX feedback from homelab community

## Constraints & Anti-Features

### What This Is NOT
- ❌ Not a monitoring/metrics platform (use Netdata)
- ❌ Not a configuration management tool (use Ansible)  
- ❌ Not a container orchestrator (use Portainer)
- ❌ Not for production business workloads
- ❌ Not a full observability stack

### What This IS
- ✅ Simple AI-powered automation with modern UI
- ✅ Cost-effective Claude integration
- ✅ Quick wins for common homelab tasks
- ✅ Gateway drug to AI automation
- ✅ Community-driven and open source

## Competitive Advantages

1. **Modern UI**: React 19 with beautiful components
2. **Simple Backend**: Single container, no complexity
3. **Cost Control**: Industry-leading optimization
4. **SSH Security**: No agents on target nodes
5. **Developer Friendly**: Full TypeScript, great DX
6. **Fast Setup**: Under 5 minutes to value
7. **AI-Native**: Claude integration from day one

## Appendix: Agent Examples

### System Health Agent
```python
# agents/system_health.py
async def run(ssh_client, config):
    """Comprehensive system health check"""
    checks = [
        "df -h",  # Disk space
        "free -m",  # Memory usage
        "systemctl --failed",  # Failed services
        "ss -tulpn | grep LISTEN",  # Open ports
        "last -n 10",  # Recent logins
        "apt list --upgradable"  # Available updates
    ]
    
    results = {}
    for cmd in checks:
        stdout, stderr = ssh_client.exec_command(cmd)
        results[cmd] = {"stdout": stdout, "stderr": stderr}
    
    # Claude analyzes results and provides insights
    analysis = await claude_analyze(results, "system_health")
    return {"raw": results, "analysis": analysis}
```

### Docker Janitor Agent
```python
# agents/docker_janitor.py
async def run(ssh_client, config):
    """Intelligent Docker cleanup"""
    commands = [
        "docker system df",  # Space usage
        "docker images --filter dangling=true",  # Dangling images
        "docker volume ls -q | wc -l",  # Volume count
        "docker ps -a --filter status=exited"  # Stopped containers
    ]
    
    cleanup_plan = await claude_analyze(commands, "docker_cleanup")
    
    if config.get("dry_run", True):
        return {"plan": cleanup_plan, "executed": False}
    
    # Execute cleanup with user approval
    return execute_cleanup_plan(ssh_client, cleanup_plan)
```

## Conclusion

Claude Agent Runner Lite maintains the polished, modern frontend experience while dramatically simplifying the backend architecture. This approach delivers a production-quality user interface that homelabbers will love, while keeping deployment and maintenance simple. The 10-week timeline is aggressive but achievable with the simplified backend and established frontend tooling.

The key insight remains: homelabbers want powerful automation with a great UI, but without the complexity of enterprise orchestration systems. By combining React 19's excellent developer experience with SSH-based simplicity, we can deliver both sophistication and maintainability.