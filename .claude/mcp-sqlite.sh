#!/bin/bash
# Wrapper to ensure Node.js (Homebrew) is in PATH before launching the MCP SQLite server.
# Claude Code runs in a restricted environment without Homebrew in PATH.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin"
exec /opt/homebrew/bin/mcp-server-sqlite-npx "$@"
