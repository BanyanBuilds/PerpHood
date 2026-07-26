#!/usr/bin/env bash
set -euo pipefail

command -v forge >/dev/null || { echo "forge is required" >&2; exit 127; }
command -v anvil >/dev/null || { echo "anvil is required" >&2; exit 127; }
command -v cast >/dev/null || { echo "cast is required" >&2; exit 127; }

mkdir -p .perphood/v51
ANVIL_PID=""
cleanup() {
  if [[ -n "${ANVIL_PID}" ]]; then kill "${ANVIL_PID}" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

if ! cast chain-id --rpc-url "${LOCAL_CHAIN_RPC:-http://127.0.0.1:8545}" >/dev/null 2>&1; then
  anvil --chain-id 31337 --host 127.0.0.1 --disable-code-size-limit > .perphood/v51/anvil.log 2>&1 &
  ANVIL_PID=$!
  for _ in $(seq 1 80); do
    if cast chain-id --rpc-url "${LOCAL_CHAIN_RPC:-http://127.0.0.1:8545}" >/dev/null 2>&1; then break; fi
    sleep 0.1
  done
fi

forge --version | tee .perphood/v51/forge-version.txt
cast chain-id --rpc-url "${LOCAL_CHAIN_RPC:-http://127.0.0.1:8545}" | tee .perphood/v51/chain-id.txt
forge clean
FOUNDRY_PROFILE=assault forge build --sizes 2>&1 | tee .perphood/v51/forge-build.log
FOUNDRY_PROFILE=assault forge test --match-path 'contracts/test/LaunchpadFactoryV51Assault.t.sol' -vvvv 2>&1 | tee .perphood/v51/assault.log
FOUNDRY_PROFILE=assault forge test --match-path 'contracts/test/LaunchpadFactoryV50Invariant.t.sol' -vvvv 2>&1 | tee .perphood/v51/invariants.log
FOUNDRY_PROFILE=assault forge snapshot --check 2>&1 | tee .perphood/v51/gas-snapshot.log
npm run chain:v45 2>&1 | tee .perphood/v51/deployment.log
npm run chain:lifecycle:v51 2>&1 | tee .perphood/v51/lifecycle.log
