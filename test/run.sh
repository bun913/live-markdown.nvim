#!/bin/bash
# Test launch script (dev mode)
# Usage: ./test/run.sh

cd "$(dirname "$0")/.."

# Build Go binary
go build -o bin/live-markdown ./cmd/live-markdown

nvim -u test/init.lua test/sample.md
