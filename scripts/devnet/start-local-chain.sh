#!/usr/bin/env bash
set -euo pipefail
command -v anvil >/dev/null || { echo "Foundry Anvil is required." >&2; exit 1; }
echo "Starting PERPHOOD local chain on http://127.0.0.1:8545"
exec anvil --chain-id 31337 --host 127.0.0.1
