# Leverage X V59 — Mainnet Preflight & Closed Factory Deployment

V59 turns the V56 closed/paused factory candidate into a deliberate, inspectable mainnet deployment workflow. It does **not** deploy or activate the factory by itself.

## Added

- Canonical version-independent factory variables:
  - `LEVERAGEX_FACTORY_ADDRESS`
  - `NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS`
  - `NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED`
- `.env.mainnet.example` with the confirmed public deployer and first-trader addresses.
- `npm run chain:v59:preflight`
  - confirms Robinhood Chain ID `4663`
  - rejects stale RPC heads
  - checks the deployer is an EOA
  - clean-compiles the contracts
  - runs the V56 factory test suite
  - checks EIP-170 runtime and EIP-3860 initcode sizes
  - hashes creation/runtime bytecode
  - estimates deployment gas and calculates the buffered funding shortfall
  - writes `deployments/v59-mainnet-preflight.json`
  - never signs or broadcasts
- `npm run chain:v59:deploy`
  - requires an exact mainnet confirmation phrase
  - reruns preflight immediately before signing
  - verifies the configured signer matches the confirmed deployer address
  - dry-runs the exact transaction before broadcast
  - validates the mined receipt
  - byte-for-byte matches compiled and on-chain runtime code
  - confirms owner, closed launch mode, global pause, new-market pause, and zero markets
  - writes a canonical deployment manifest and public Vercel import block
  - never enables public mainnet launching or trading
- `npm run chain:v59:verify`
  - submits the exact source and constructor argument to Robinhood Chain Blockscout
- `npm run chain:v59:status`
  - reads the deployed factory directly from Robinhood Chain
- `/api/v59/readiness`
  - live server-only RPC probe with no endpoint/key exposure
- `/admin/mainnet`
  - internal live mainnet readiness console

## Signing security

V59 prefers an encrypted Foundry keystore via `V59_KEYSTORE_ACCOUNT`. A local private-key fallback exists only for controlled deployment machines. Signing secrets are prohibited from GitHub, Vercel, Supabase, browser code, and chat.

## Contract truth

V59 deployment tooling still targets `LeverageXLaunchFactoryV56.sol`, the latest factory candidate in this repository. Spot remains unavailable until an explicit later canary activation. Long/Short remains disabled.
