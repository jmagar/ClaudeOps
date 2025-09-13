#!/usr/bin/env python3
"""Simple test script for the syslog agent."""

import asyncio

from syslog_agent import SyslogAgent


async def main() -> None:
    """Test the syslog agent."""
    print("Testing Syslog Agent...")

    # Test with a non-existent syslog file (safe for demo)
    agent = SyslogAgent("/tmp/fake_syslog")

    # Test parsing functionality
    test_log_lines = [
        "Dec 13 10:30:45 localhost sshd[1234]: authentication failure for user test",
        "Dec 13 10:31:00 localhost kernel: disk full on /var partition",
        "Dec 13 10:31:15 localhost systemd: Started nginx.service",
        "Dec 13 10:31:30 localhost apache2: connection refused from 192.168.1.100"
    ]

    print("\nTesting log parsing:")
    for line in test_log_lines:
        entry = agent.parse_log_entry(line)
        if entry:
            print(f"✓ Parsed: {entry.process} - {entry.message}")
            matches = agent.analyze_entry(entry)
            if matches:
                for match in matches:
                    print(f"  → Pattern: {match.name} ({match.severity})")
        else:
            print(f"✗ Failed to parse: {line}")

    print(f"\nAgent initialized with {len(agent.patterns)} patterns")
    for pattern in agent.patterns:
        print(f"  - {pattern.name}: {pattern.description}")

    print("\n✅ Syslog agent test completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())
