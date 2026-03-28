#!/bin/bash
# Download pre-built server binary from GitHub Releases.
# Usage: ./scripts/install.sh

set -euo pipefail

REPO="bun913/live-markdown.nvim"
BIN_DIR="$(cd "$(dirname "$0")/.." && pwd)/bin"

# Detect OS and architecture
detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux)  os="linux" ;;
    Darwin) os="darwin" ;;
    *)      echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)             echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac

  echo "live-markdown-${os}-${arch}"
}

# Get latest release tag
get_latest_tag() {
  curl --silent --fail "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed -E 's/.*"tag_name":\s*"([^"]+)".*/\1/'
}

ASSET="$(detect_platform)"
TAG="$(get_latest_tag)"

if [ -z "$TAG" ]; then
  echo "Error: could not determine latest release" >&2
  exit 1
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"

echo "Downloading ${ASSET} (${TAG})..."
mkdir -p "$BIN_DIR"
curl --fail --location --silent --show-error --output "${BIN_DIR}/live-markdown" "$URL"
chmod +x "${BIN_DIR}/live-markdown"
echo "Installed to ${BIN_DIR}/live-markdown"
