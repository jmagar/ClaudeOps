"""Tests for the syslog agent."""

import re
from datetime import datetime

import pytest

from claude_agents.syslog_agent import LogEntry, SyslogAgent, SyslogPattern


class TestLogEntry:
    """Tests for LogEntry model."""

    def test_log_entry_creation(self) -> None:
        """Test creating a log entry."""
        entry = LogEntry(
            timestamp=datetime.now(),
            hostname="localhost",
            process="sshd",
            pid=1234,
            message="authentication failure"
        )

        assert entry.hostname == "localhost"
        assert entry.process == "sshd"
        assert entry.pid == 1234
        assert entry.message == "authentication failure"
        assert entry.severity == "info"  # default


class TestSyslogAgent:
    """Tests for SyslogAgent."""

    @pytest.fixture
    def agent(self) -> SyslogAgent:
        """Create a test agent."""
        return SyslogAgent()

    def test_agent_initialization(self, agent: SyslogAgent) -> None:
        """Test agent initializes correctly."""
        assert len(agent.patterns) > 0
        assert agent.syslog_path.name == "syslog"

    def test_parse_log_entry_valid(self, agent: SyslogAgent) -> None:
        """Test parsing a valid syslog entry."""
        log_line = "Dec 13 10:30:45 localhost sshd[1234]: authentication failure for user test"

        entry = agent.parse_log_entry(log_line)

        assert entry is not None
        assert entry.hostname == "localhost"
        assert entry.process == "sshd"
        assert entry.pid == 1234
        assert "authentication failure" in entry.message

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

    def test_analyze_entry_matches_pattern(self, agent: SyslogAgent) -> None:
        """Test that entries match expected patterns."""
        entry = LogEntry(
            timestamp=datetime.now(),
            hostname="localhost",
            process="sshd",
            pid=None,
            message="authentication failure for user test"
        )

        matches = agent.analyze_entry(entry)

        assert len(matches) > 0
        assert any(match.name == "Authentication Failure" for match in matches)

    def test_analyze_entry_no_matches(self, agent: SyslogAgent) -> None:
        """Test that normal entries don't match concerning patterns."""
        entry = LogEntry(
            timestamp=datetime.now(),
            hostname="localhost",
            process="cron",
            pid=None,
            message="normal system activity"
        )

        matches = agent.analyze_entry(entry)

        assert len(matches) == 0

    def test_generate_report(self, agent: SyslogAgent) -> None:
        """Test report generation."""
        entries = [
            LogEntry(
                timestamp=datetime.now(),
                hostname="localhost",
                process="sshd",
                pid=None,
                message="authentication failure"
            ),
            LogEntry(
                timestamp=datetime.now(),
                hostname="localhost",
                process="kernel",
                pid=None,
                message="disk full"
            )
        ]

        report = agent.generate_report(entries)

        assert report["total_entries"] == 2
        assert report["pattern_matches"]["Authentication Failure"] == 1
        assert report["pattern_matches"]["Disk Space Warning"] == 1


class TestSyslogPattern:
    """Tests for SyslogPattern model."""

    def test_pattern_matching(self) -> None:
        """Test pattern matching functionality."""
        pattern = SyslogPattern(
            name="Test Pattern",
            pattern=re.compile(r"error|fail", re.IGNORECASE),
            severity="error",
            description="Test pattern"
        )

        assert pattern.pattern.search("This is an error message")
        assert pattern.pattern.search("SYSTEM FAILURE")
        assert not pattern.pattern.search("normal operation")
