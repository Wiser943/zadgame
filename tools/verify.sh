#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${GAME_RUNTIME:-$PROJECT_DIR/.manus-game-tools}"
if [[ ! -f "$RUNTIME_DIR/verify.mjs" ]]; then
  echo "Set GAME_RUNTIME to the Game runtime directory returned by init/attach." >&2
  exit 1
fi
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--export" ) ]]; then
  echo "Usage: tools/verify.sh [--export]" >&2
  exit 2
fi
cd "$PROJECT_DIR"
# The shared verifier owns import/error handling and game-verification.json.
node "$RUNTIME_DIR/verify.mjs"
if [[ "${1:-}" == "--export" ]]; then
  node "$RUNTIME_DIR/build.mjs"
  node "$RUNTIME_DIR/verify.mjs" --pack
fi
