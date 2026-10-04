#!/usr/bin/env bash
# Convenience runner for downloading Clef-Flash GGUF
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node "$SCRIPT_DIR/download-model.mjs"
