# Claude Agent Runner - Product Requirements Document

## Executive Summary

Claude Agent Runner is a self-hosted system for deploying and managing Claude Code SDK agents across homelab infrastructure. It enables homelabbers to automate infrastructure management tasks using AI-powered agents that can monitor ZFS pools, manage Docker containers, verify backups, and perform system maintenance - all from a modern React-based dashboard with real-time resource monitoring and token usage tracking.

## Target Audience

**Primary Users**: Homelab enthusiasts and self-hosters who:
- Run multiple servers (Unraid, TrueNAS, Proxmox, Ubuntu, etc.)
- Want to automate repetitive infrastructure tasks
- Prefer self-hosted solutions over cloud services
- Have basic Docker and Linux knowledge
- Value simplicity and maintainability over enterprise features

## Core Philosophy

- **Simple Over Complex**: No Kubernetes, no complex orchestration
- **Self-Contained**: Zero external dependencies or cloud services
- **Practical**: Solve real homelab problems
- **Maintainable**: Easy to understand, modify, and troubleshoot

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────┐
│         Management Server               │
│  ┌──────────────────────────────────┐  │
│  │   Web Dashboard (Port 3000)      │  │
│  │   - View all nodes               │  │
│  │   - Trigger agents               │  │
│  │   - View execution history       │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Orchestrator API (Port 8000)   │  │
│  │   - Schedule agents              │  │
│  │   - Manage nodes                 │  │
│  │   - Store results                │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │   Gotify Server (Port 8080)      │  │
│  │   - Send notifications           │  │
│  │   - Agent completion alerts      │  │
│  │   - Error notifications          │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
                    │
                    │ HTTP/WebSocket
                    ▼
┌─────────────────────────────────────────┐
│         Target Nodes (Your Servers)     │
│  ┌──────────────────────────────────┐  │
│  │  Agent Runner (Port 8100)        │  │
│  │  - Execute Claude agents         │  │
│  │  - Access host system            │  │
│  │  - Report status                 │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Deployment Model

- **Management Server**: Single Docker Compose stack on a dedicated machine or VM
- **Agent Nodes**: Lightweight Docker container on each managed server
- **Communication**: Simple HTTP REST APIs (no message queues or complex protocols)
- **Storage**: Postgresql for history, local filesystem for logs
- **Notifications**: Self-hosted Gotify server for push notifications

## Functional Requirements

### 1. Agent Management

#### 1.1 Pre-built Agents
The system ships with ready-to-use agents for common homelab tasks:

- **ZFS Health Monitor**: Check pool status, scrub results, disk health
- **Docker Manager**: Container health, orphaned images, resource usage
- **Backup Verifier**: Test restore procedures, check backup integrity
- **Security Scanner**: Check for exposed ports, weak permissions, outdated packages
- **Disk Space Manager**: Identify large files, old logs, cache cleanup opportunities
- **Service Monitor**: Check critical services, restart if needed

#### 1.2 Custom Agent Creation
- Simple Python template for creating new agents
- Hot-reload capability (edit and run without restart)
- Built-in access to Claude Code SDK

#### 1.3 Agent Execution
- Manual trigger via web UI
- Scheduled execution (cron-like)
- Event-based triggers (webhook support)
- Configurable timeout and retry logic

### 2. Node Management

#### 2.1 Node Registration
- Simple one-liner install script
- Manual registration via web UI
- Support for different OS types (Linux, Unraid, TrueNAS)

#### 2.2 Node Capabilities
- Define what agents can run on each node
- Tag nodes by type (storage, compute, network)

### 3. Web Dashboard

#### 3.1 Main Dashboard
- **Node Overview**: List all registered nodes with status
- **Recent Activity**: Last 50 agent executions
- **Quick Actions**: One-click agent execution
- **System Health**: Simple red/yellow/green indicators

#### 3.2 Agent Execution View
- Real-time streaming output
- Execution history per agent
- Success/failure statistics
- Download logs as text files

#### 3.3 Configuration
- Add/remove nodes
- Create/edit agent schedules
- Set up webhook endpoints
- Manage API keys
- Configure notification settings (Gotify integration)

#### 3.4 Notifications
- **Push Notifications**: Real-time alerts via Gotify mobile app
- **Agent Completion**: Success/failure notifications for scheduled agents
- **System Alerts**: Critical issues, node disconnections, resource warnings
- **Custom Rules**: User-defined notification triggers based on agent output
- **Notification Channels**: Different priority levels and routing options

### 4. Security

#### 4.1 Authentication
- Simple username/password for web UI
- API key authentication for node communication

#### 4.3 Agent Permissions
- Read-only vs read-write agent modes
- Approval required for destructive operations
- Audit log of all executions

## Technical Requirements

### Technology Stack

#### Core Components
- **Python 3.11+**: Primary language
- **FastAPI**: REST APIs and WebSocket support
- **Postgresql**: Local database (no external DB required)
- **Docker & Docker Compose**: Deployment and isolation
- **Claude Code SDK**: AI agent functionality
- **Gotify**: Self-hosted push notification service

#### Frontend
- **React 19**: Modern UI framework with latest features
- **TypeScript**: Type-safe JavaScript development
- **Vite**: Fast build tool and development server
- **TailwindCSS v4**: Utility-first CSS framework
- **shadcn/ui**: Pre-built accessible component library
- **WebSockets**: Real-time log streaming

### Data Storage

#### Local Storage Only
- **Postgresql Database**: Agent configurations, execution history
- **Filesystem**: Logs, temporary files
- **Volume Mounts**: Persistent data in Docker volumes

## Non-Functional Requirements

### Reliability
- Automatic agent restart on failure
- Management server survives node disconnections
- Execution history retained for 90 days
- Graceful handling of Claude API rate limits

### Usability
- Installation in under 10 minutes
- No manual configuration file editing required
- Clear error messages with suggested fixes
- Single docker-compose.yml for entire management stack

### Maintainability
- All configuration via environment variables
- Standard Python logging throughout
- Docker health checks for all services
- Upgrade path via Docker image tags

## Installation & Setup

### Quick Start Requirements
1. Docker and Docker Compose installed
2. Claude Max subscription or Anthropic API key
3. Basic understanding of Docker networking
4. Mobile device for Gotify notifications (optional)

### Installation Process
```bash
# 1. Clone repository
git clone https://github.com/user/claude-agent-runner
cd claude-agent-runner

# 2. Configure environment
cp .env.example .env
# Edit .env with your Claude API key and notification settings

# 3. Start management server
docker compose up -d

# 4. Access dashboard
# http://your-server:3000

# 5. Configure notifications (optional)
# http://your-server:8080 (Gotify web UI)
# Install Gotify mobile app and add server URL
```

### Node Setup
```bash
# One-liner install on target node
curl -sSL https://your-server:8000/install | bash
```

## Example Use Cases

### Daily Maintenance Routine
```yaml
Schedule: "0 2 * * *"  # 2 AM daily
Agents:
  - zfs_health_check
  - docker_cleanup
  - backup_verify
Nodes: all
On_Success: gotify_notification_low_priority
On_Failure: gotify_notification_high_priority
```

### Storage Server Monitoring
```yaml
Node: truenas.local
Agents:
  - zfs_scrub_status
  - disk_temperature_check
  - snapshot_management
Frequency: every_6_hours
```

### Emergency Response
```yaml
Trigger: webhook
Condition: "alert == critical"
Agent: emergency_diagnostics
Mode: immediate
Output: stream_to_dashboard
```
## Constraints & Limitations

### What This Is NOT
- Not a Kubernetes replacement
- Not a monitoring/metrics platform (use Netdata for that)
- Not a configuration management tool (use Ansible for that)
- Not a backup solution (agents can verify, not perform backups)
- Not for production business workloads

## Development Roadmap

### Phase 1: MVP (Month 1-2)
- Core agent runner functionality
- Basic web dashboard
- 5 pre-built agents
- Simple scheduling

### Phase 2: Enhancement (Month 3-4)
- Additional agents (10+ total)
- Webhook support
- Agent marketplace concept
- Improved error handling

### Phase 3: Polish (Month 5-6)
- Setup wizard
- Agent template generator
- Community agent repository
- Video tutorials

## Appendix: Agent Examples

### ZFS Health Check Agent
```python
# agents/zfs_health.py
async def run(config):
    """Check ZFS pool health and report issues"""
    checks = [
        "zpool status -x",
        "zpool list -H -o name,health,size,free",
        "check for degraded pools",
        "verify snapshot count < 100",
        "check scrub age < 30 days"
    ]
    # Claude analyzes output and provides recommendations
```

### Docker Cleanup Agent
```python
# agents/docker_cleanup.py
async def run(config):
    """Remove unused Docker resources"""
    tasks = [
        "identify orphaned volumes",
        "find images not used in 30 days",
        "remove stopped containers > 7 days old",
        "calculate space to be reclaimed"
    ]
    # Claude determines safe cleanup operations
```

## Documentation Requirements

### API Reference
- REST API endpoints documentation
- WebSocket event types
- Agent SDK interface
- Authentication methods
