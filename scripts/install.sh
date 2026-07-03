#!/usr/bin/env bash
set -eu

REPO="wilfredinni/noodle"
BIN_NAME="noodle"
INSTALL_DIR="${NOODLE_INSTALL_DIR:-$HOME/.local/bin}"
VERSION="${NOODLE_VERSION:-latest}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

detect_platform() {
  local os arch

  case "$(uname -s)" in
    Darwin) os="macos" ;;
    Linux)  os="linux" ;;
    *)
      echo -e "${RED}Error: Unsupported OS: $(uname -s)${NC}" >&2
      echo "noodle supports macOS and Linux only." >&2
      exit 1
      ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64)   arch="x86_64" ;;
    aarch64|arm64)  arch="arm64" ;;
    *)
      echo -e "${RED}Error: Unsupported architecture: $(uname -m)${NC}" >&2
      echo "noodle supports x86_64 and arm64 only." >&2
      exit 1
      ;;
  esac

  echo "${os}-${arch}"
}

PLATFORM=$(detect_platform)

if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BIN_NAME}-${PLATFORM}"
else
  DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${BIN_NAME}-${PLATFORM}"
fi

echo -e "${GREEN}Installing noodle ${VERSION} for ${PLATFORM}...${NC}"

mkdir -p "$INSTALL_DIR"

TMP_FILE=$(mktemp)
trap 'rm -f "$TMP_FILE"' EXIT

echo "Downloading $DOWNLOAD_URL..."
if ! curl -LsSf "$DOWNLOAD_URL" -o "$TMP_FILE"; then
  echo -e "${RED}Error: Failed to download from $DOWNLOAD_URL${NC}" >&2
  echo "Check that the version exists and your platform is supported." >&2
  exit 1
fi

chmod +x "$TMP_FILE"
mv "$TMP_FILE" "$INSTALL_DIR/$BIN_NAME"

echo -e "${GREEN}Installed to $INSTALL_DIR/$BIN_NAME${NC}"

if ! echo "$PATH" | tr ':' '\n' | grep -qxF "$INSTALL_DIR"; then
  echo -e "${YELLOW}Warning: $INSTALL_DIR is not in your PATH.${NC}"
  echo "Add this to your shell config (~/.bashrc, ~/.zshrc, etc.):"
  echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
fi

echo ""
echo "Run 'noodle --help' to get started."
