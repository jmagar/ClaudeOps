"""CLI entry point for claude_agents."""

import asyncio
import sys
from pathlib import Path

from claude_agents.syslog_agent import SyslogAgent


async def main() -> None:
    """Main CLI function."""
    if len(sys.argv) > 1:
        syslog_path = sys.argv[1]
    else:
        syslog_path = "/var/log/syslog"
    
    agent = SyslogAgent(syslog_path)
    
    if len(sys.argv) > 2 and sys.argv[2] == "--monitor":
        # Continuous monitoring mode
        await agent.monitor_syslog()
    else:
        # Single analysis
        await agent.analyze_syslog()


if __name__ == "__main__":
    asyncio.run(main())