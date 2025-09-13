"""Syslog analysis agent implementation using Claude AI."""

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any

from claude_code_sdk import query, AssistantMessage, TextBlock, ResultMessage
from pydantic import BaseModel
from rich.console import Console
from rich.markdown import Markdown


class LogEntry(BaseModel):
    """Represents a parsed syslog entry."""
    
    timestamp: datetime
    hostname: str
    process: str
    pid: int | None
    message: str
    raw_line: str


class SyslogAgent:
    """Agent for analyzing syslog files using Claude AI."""
    
    def __init__(self, syslog_path: str = "/var/log/syslog"):
        self.syslog_path = Path(syslog_path)
        self.console = Console()
    
    def parse_log_entry(self, line: str) -> LogEntry | None:
        """Parse a single syslog line into a LogEntry."""
        import re
        # Standard syslog format: timestamp hostname process[pid]: message
        pattern = re.compile(
            r"^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"  # timestamp
            r"(\S+)\s+"                                     # hostname
            r"([^:\[\s]+)(?:\[(\d+)\])?"                   # process[pid]
            r":\s*(.*)"                                     # message
        )
        
        match = pattern.match(line.strip())
        if not match:
            return None
            
        timestamp_str, hostname, process, pid_str, message = match.groups()
        
        # Parse timestamp (assuming current year)
        try:
            timestamp = datetime.strptime(
                f"{datetime.now().year} {timestamp_str}",
                "%Y %b %d %H:%M:%S"
            )
        except ValueError:
            return None
            
        return LogEntry(
            timestamp=timestamp,
            hostname=hostname,
            process=process,
            pid=int(pid_str) if pid_str else None,
            message=message,
            raw_line=line.strip()
        )
    
    async def read_syslog(self, tail_lines: int = 100) -> list[LogEntry]:
        """Read the last N lines from syslog file."""
        if not self.syslog_path.exists():
            self.console.print(f"[red]Syslog file not found: {self.syslog_path}[/red]")
            return []
            
        try:
            # Read last N lines using tail-like approach
            with self.syslog_path.open(encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
                recent_lines = lines[-tail_lines:] if len(lines) > tail_lines else lines
                
            entries = []
            for line in recent_lines:
                entry = self.parse_log_entry(line)
                if entry:
                    entries.append(entry)
                    
            return entries
            
        except PermissionError:
            self.console.print(f"[red]Permission denied accessing {self.syslog_path}[/red]")
            self.console.print(
                "[yellow]Try running with sudo or ensure user has read access[/yellow]"
            )
            return []
        except Exception as e:
            self.console.print(f"[red]Error reading syslog: {e}[/red]")
            return []
    
    async def analyze_with_claude(self, entries: list[LogEntry]) -> str:
        """Send log entries to Claude for AI-powered analysis."""
        if not entries:
            return "No log entries to analyze."
        
        # Prepare log data for Claude
        log_text = "\n".join([
            f"{entry.timestamp.strftime('%b %d %H:%M:%S')} {entry.hostname} "
            f"{entry.process}[{entry.pid or '-'}]: {entry.message}"
            for entry in entries
        ])
        
        prompt = f"""You are a system administrator expert. Analyze these system log entries and provide actionable insights:

LOG ENTRIES:
{log_text}

For each issue you identify, provide:

## 🚨 Critical Issues
- **Issue**: Description of the problem
- **Risk**: What could happen if not fixed  
- **Fix**: Exact commands/steps to resolve it

## ⚠️ Warnings & Patterns
- Notable trends or recurring events
- Potential issues to monitor

## 🔧 Recommended Actions
For each recommendation, provide:
1. **What to do**: Clear action item
2. **Why**: Explanation of benefit  
3. **How**: Specific commands or configuration changes
4. **Priority**: High/Medium/Low

## 📊 System Health Summary
Overall assessment with specific metrics if available

**Focus on providing executable fixes - include exact bash commands, config file changes, or specific steps to resolve each issue.**

Format response in clear markdown."""

        try:
            # Use Claude Code SDK to get analysis
            response_text = ""
            
            # Use the query function directly (no client needed)
            async for message in query(prompt=prompt):
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            response_text += block.text
                elif isinstance(message, ResultMessage):
                    # Handle result message if needed
                    pass
            
            return response_text
            
        except Exception as e:
            return f"Error analyzing with Claude: {e}"
    
    async def analyze_syslog(self, tail_lines: int = 100) -> dict[str, Any]:
        """Main method to analyze syslog using Claude AI."""
        self.console.print(f"[blue]Reading last {tail_lines} lines from {self.syslog_path}[/blue]")
        
        entries = await self.read_syslog(tail_lines)
        if not entries:
            return {
                "total_entries": 0,
                "analysis": "No entries found to analyze"
            }
        
        self.console.print(f"[green]Found {len(entries)} log entries. Analyzing with Claude...[/green]")
        
        # Get Claude's analysis
        analysis = await self.analyze_with_claude(entries)
        
        # Display results
        self.console.print("\n" + "="*60)
        self.console.print("[bold blue]🤖 Claude's Syslog Analysis[/bold blue]")
        self.console.print("="*60)
        
        # Render markdown analysis
        markdown = Markdown(analysis)
        self.console.print(markdown)
        
        return {
            "total_entries": len(entries),
            "analysis": analysis,
            "entries": [entry.dict() for entry in entries]
        }
    
    async def monitor_syslog(self, interval: int = 30) -> None:
        """Monitor syslog file continuously with Claude analysis."""
        self.console.print(
            f"[blue]Starting continuous monitoring with Claude analysis (every {interval}s)[/blue]"
        )
        self.console.print("[yellow]Press Ctrl+C to stop[/yellow]")
        
        try:
            while True:
                await self.analyze_syslog()
                self.console.print(f"\n[dim]Waiting {interval} seconds for next analysis...[/dim]\n")
                await asyncio.sleep(interval)
        except KeyboardInterrupt:
            self.console.print("\n[yellow]Monitoring stopped[/yellow]")


async def main() -> None:
    """Main function for testing the agent."""
    agent = SyslogAgent()
    await agent.analyze_syslog()


if __name__ == "__main__":
    asyncio.run(main())