#!/bin/bash
# Test with pre-built binary (no Go build)
# Usage: ./test/run-binary.sh

cd "$(dirname "$0")/.."

if [ ! -x bin/live-markdown ]; then
  echo "Binary not found. Run 'go build -o bin/live-markdown ./cmd/live-markdown' or scripts/install.sh first."
  exit 1
fi

nvim -u test/init.lua test/sample.md
