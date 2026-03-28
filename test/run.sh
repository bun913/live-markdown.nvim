#!/bin/bash
# テスト用起動スクリプト
# 使い方: ./test/run.sh

cd "$(dirname "$0")/.."
nvim -u test/init.lua test/sample.md
