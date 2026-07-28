# Leverage X V66 Build Notes

## Release objective

Convert V65 from a packaged mainnet candidate into a safer execution-gate release without changing the canonical V65 launch-contract architecture.

## Main correction

The old browser path correctly treated 0.001 ETH as total launch spend inclusive of gas, while the old operator script required 0.001 ETH as `msg.value` and then paid gas on top. V66 removes that mismatch.

## Added

- `scripts/v66-mainnet-execution-gate.mts`
- `scripts/v66-mainnet-execution-smoke.mts`
- `.env.mainnet.example`
- `MAINNET_EXECUTION_V66.md`
- `START_V66_MAINNET_GATE.ps1`
- `V66_VALIDATION.md`
- `V66_VALIDATION.json`
- `V66_RELEASE.json`

## Updated

- `scripts/v65-mainnet-common.mts`
- `scripts/v65-first-token-preflight.mts`
- `scripts/v65-create-first-token.mts`
- `scripts/v65-configure-canary.mts`
- `contracts/src/LeverageXLaunchFactoryV65.sol`
- `.env.example`
- `package.json`
- `package-lock.json`

## Safety posture

- No deployment was attempted.
- No signing was attempted.
- No private key or RPC secret was added.
- Public launching remains disabled.
- Perps remain disabled.
- The contract candidate remains V65 until Foundry compile/tests and the live zero-transaction preflight pass.
