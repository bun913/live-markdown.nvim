#!/bin/bash
# Test with compiled binary
# Usage: ./test/run-binary.sh

cd "$(dirname "$0")/.."

# Build binary (includes mermaid.min.js download)
cd server && deno task build && cd ..

nvim -u test/init-binary.lua test/sample.md
