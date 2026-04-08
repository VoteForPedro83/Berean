#!/usr/bin/env python3
"""
Berean — JS Syntax Check Hook
Runs after Claude writes or edits any file.
If the file is a .js file, checks syntax with `node --check`.
On error: exits with code 2 so Claude sees the error and self-corrects.
On success: exits silently with code 0.
"""
import json
import sys
import subprocess
import os

# Read the hook payload from stdin
try:
    data = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # Can't parse payload — don't block anything

# Get the file path from the tool input
file_path = data.get('tool_input', {}).get('file_path', '')

# Only check .js files
if not file_path.endswith('.js'):
    sys.exit(0)

# Skip files that don't exist or are inside node_modules
if not os.path.exists(file_path) or 'node_modules' in file_path:
    sys.exit(0)

# Run Node's built-in syntax checker (no ESLint needed)
result = subprocess.run(
    ['/usr/local/bin/node', '--check', file_path],
    capture_output=True,
    text=True
)

if result.returncode != 0:
    # Exit code 2 = blocking error.
    # Claude Code feeds stderr back to Claude as an error message.
    # Claude will see this and fix the syntax before continuing.
    print(f"Syntax error in {os.path.basename(file_path)}:", file=sys.stderr)
    print(result.stderr, file=sys.stderr)
    sys.exit(2)

# Exit 0 = all good, carry on silently
sys.exit(0)
