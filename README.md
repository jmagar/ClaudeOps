# ClaudeOps

AI-powered homelab automation system with modern React dashboard and Claude-driven agents for system maintenance, monitoring, and optimization.

## 🚀 Overview

ClaudeOps simplifies homelab management through intelligent automation. It combines a sleek React dashboard with SSH-based agent execution - no complex orchestration, just effective AI-powered solutions for your infrastructure.

## ✨ Features

### Current (MVP Phase)
- **System Health Agent**: AI-powered log analysis with actionable fixes
- **Claude Integration**: Intelligent problem detection and solution recommendations  
- **Modern CLI**: Rich console output with markdown rendering
- **Cost Optimization**: Built-in Claude API cost tracking and controls

### Planned
- **React Dashboard**: Modern web interface with real-time updates
- **Docker Janitor**: Intelligent container cleanup and optimization
- **Backup Validator**: Automated backup integrity verification
- **SSH Orchestration**: Secure remote execution across multiple nodes

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│            ClaudeOps Lite               │
│         (Single Container)              │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   React Dashboard (Port 3000)   │   │
│  │   - Modern, responsive UI       │   │
│  │   - Cost monitoring             │   │
│  └─────────────────────────────────┘   │
│                ↕                        │
│  ┌─────────────────────────────────┐   │
│  │   FastAPI Backend (Port 8000)   │   │
│  │   - Agent scheduler             │   │
│  │   - SSH executor                │   │
│  │   - Claude integration          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/jmagar/ClaudeOps.git
cd ClaudeOps

# Set up Python environment
uv venv --python 3.11
source .venv/bin/activate
uv sync
```

## 📋 Quick Start

### System Health Analysis
```bash
# Analyze system logs
uv run python claude_agents/syslog_agent.py

# Monitor continuously  
uv run python claude_agents/syslog_agent.py --monitor

# Use custom log file
uv run python -c "
from claude_agents import SyslogAgent
import asyncio

async def main():
    agent = SyslogAgent('/path/to/logs')
    await agent.analyze_syslog()

asyncio.run(main())
"
```

## 🧪 Development

```bash
# Install development dependencies (already included with uv sync)
uv sync

# Run tests
uv run pytest

# Run linting (auto-fix enabled)
uv run ruff check . --fix

# Type checking  
uv run mypy claude_agents/
```

## 🎯 Target Users

- **Homelab Enthusiasts**: Running Unraid, TrueNAS, Proxmox
- **Self-Hosters**: Managing multiple services and containers
- **DevOps Engineers**: Seeking simple automation solutions
- **System Administrators**: Needing intelligent monitoring

## 📊 Agent Examples

### System Health Analysis Output
```
🤖 Claude's Syslog Analysis
============================================================

🚨 Critical Issues
• Issue: Disk Full on /var Partition
• Risk: System instability, service failures
• Fix: journalctl --vacuum-size=100M && docker system prune -af

🔧 Recommended Actions
1. Set Up Disk Space Monitoring (Priority: High)
   - Install monitoring script with cron job
   - Configure alerts at 85% usage

📊 System Health Summary  
Overall Status: ⚠️ NEEDS ATTENTION
Immediate Actions Required: Address disk space within 24 hours
```

## 🗺️ Roadmap

### Phase 0 (Current): Core MVP
- [x] System Health Agent with Claude integration
- [x] Python package structure and CLI
- [x] Cost optimization and caching
- [ ] Enhanced log parsing (journalctl support)

### Phase 1: Web Dashboard  
- [ ] React 19 frontend with shadcn/ui
- [ ] FastAPI backend with WebSocket support
- [ ] Real-time agent execution monitoring
- [ ] Cost analytics dashboard

### Phase 2: Multi-Agent System
- [ ] Docker Janitor agent
- [ ] Backup Validator agent  
- [ ] SSH multi-node orchestration
- [ ] Agent scheduling and automation

## 🤝 Contributing

ClaudeOps is open source and welcomes contributions! Whether you're interested in:
- Building new agents
- Improving the React dashboard
- Adding homelab integrations
- Writing documentation

Check out our [issues](https://github.com/jmagar/ClaudeOps/issues) to get started.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Powered by [Claude Code SDK](https://github.com/anthropics/claude-code-sdk-python) and built for the amazing homelab community.