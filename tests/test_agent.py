"""Tests for the Claude-powered syslog agent."""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from claude_agents.syslog_agent import LogEntry, SyslogAgent


class TestLogEntry:
    """Tests for LogEntry model."""
    
    def test_log_entry_creation(self) -> None:
        """Test creating a log entry."""
        entry = LogEntry(
            timestamp=datetime.now(),
            hostname="localhost",
            process="sshd",
            pid=1234,
            message="authentication failure",
            raw_line="Dec 13 10:30:45 localhost sshd[1234]: authentication failure"
        )
        
        assert entry.hostname == "localhost"
        assert entry.process == "sshd"
        assert entry.pid == 1234
        assert entry.message == "authentication failure"
        assert "authentication failure" in entry.raw_line


class TestSyslogAgent:
    """Tests for Claude-powered SyslogAgent."""
    
    @pytest.fixture
    def agent(self) -> SyslogAgent:
        """Create a test agent."""
        return SyslogAgent()
    
    def test_agent_initialization(self, agent: SyslogAgent) -> None:
        """Test agent initializes correctly."""
        assert agent.syslog_path.name == "syslog"
        assert agent.console is not None
    
    def test_parse_log_entry_valid(self, agent: SyslogAgent) -> None:
        """Test parsing a valid syslog entry."""
        log_line = "Dec 13 10:30:45 localhost sshd[1234]: authentication failure for user test"
        
        entry = agent.parse_log_entry(log_line)
        
        assert entry is not None
        assert entry.hostname == "localhost"
        assert entry.process == "sshd"
        assert entry.pid == 1234
        assert "authentication failure" in entry.message
        assert entry.raw_line == log_line
    
    def test_parse_log_entry_no_pid(self, agent: SyslogAgent) -> None:
        """Test parsing a syslog entry without PID."""
        log_line = "Dec 13 10:30:45 localhost kernel: disk full on /var"
        
        entry = agent.parse_log_entry(log_line)
        
        assert entry is not None
        assert entry.hostname == "localhost"
        assert entry.process == "kernel"
        assert entry.pid is None
        assert "disk full" in entry.message
    
    def test_parse_log_entry_invalid(self, agent: SyslogAgent) -> None:
        """Test parsing an invalid log line."""
        log_line = "invalid log format"
        
        entry = agent.parse_log_entry(log_line)
        
        assert entry is None
    
    @pytest.mark.asyncio
    async def test_read_syslog_file_not_found(self, agent: SyslogAgent) -> None:
        """Test reading from non-existent syslog file."""
        agent.syslog_path = agent.syslog_path / "nonexistent"
        
        entries = await agent.read_syslog()
        
        assert entries == []
    
    @pytest.mark.asyncio
    @patch('claude_agents.syslog_agent.query')
    async def test_analyze_with_claude(self, mock_query: AsyncMock, agent: SyslogAgent) -> None:
        """Test Claude analysis functionality."""
        # Mock Claude response
        mock_message = AsyncMock()
        mock_message.content = [AsyncMock()]
        mock_message.content[0].text = "## Critical Issues\nDisk full detected"
        
        mock_query.return_value = [mock_message]
        
        entries = [
            LogEntry(
                timestamp=datetime.now(),
                hostname="localhost",
                process="kernel",
                pid=None,
                message="disk full on /var",
                raw_line="Dec 13 10:30:45 localhost kernel: disk full on /var"
            )
        ]
        
        result = await agent.analyze_with_claude(entries)
        
        assert "Critical Issues" in result
        assert "Disk full detected" in result
        mock_query.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_analyze_with_claude_empty_entries(self, agent: SyslogAgent) -> None:
        """Test Claude analysis with empty entries."""
        result = await agent.analyze_with_claude([])
        
        assert result == "No log entries to analyze."
    
    @pytest.mark.asyncio
    @patch('claude_agents.syslog_agent.query')
    async def test_analyze_with_claude_error(self, mock_query: AsyncMock, agent: SyslogAgent) -> None:
        """Test Claude analysis error handling."""
        mock_query.side_effect = Exception("API Error")
        
        entries = [
            LogEntry(
                timestamp=datetime.now(),
                hostname="localhost",
                process="test",
                pid=None,
                message="test message",
                raw_line="test line"
            )
        ]
        
        result = await agent.analyze_with_claude(entries)
        
        assert "Error analyzing with Claude" in result
        assert "API Error" in result