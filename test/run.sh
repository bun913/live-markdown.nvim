#!/bin/bash
# Test launch script (dev mode)
# Usage: ./test/run.sh

cd "$(dirname "$0")/.."

# Ensure vendored assets (mermaid.min.js) are downloaded
cd server && deno task setup && cd ..

nvim -u test/init.lua test/sample.md
