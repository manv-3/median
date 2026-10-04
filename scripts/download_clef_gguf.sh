#!/usr/bin/env bash
# Convenience runner for downloading Clef-Flash GGUF
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_ROOT/.venv/bin/activate" ]; then
    source "$PROJECT_ROOT/.venv/bin/activate"
fi

python3 "$SCRIPT_DIR/download_clef_gguf.py"
