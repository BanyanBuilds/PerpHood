# LEVERAGE X V21 build notes

## Added

- `contracts/src/LocalBattlePoolV21.sol`
- Minimal `BattleTokenV21` with one-billion fixed supply
- `contracts/interfaces/ILocalBattlePoolV21.sol`
- Foundry configuration
- Solidity unit and invariant tests
- Anvil start/deploy/demo scripts for Windows
- Dependency-free Keccak-256, ABI, RPC, wallet, and contract clients
- Sequencer settlement frame builder
- Local custody ledger reference model
- Local chain React store and hook
- `/admin/local-chain` dashboard
- Chain authority display in terminal speed strip
- Runtime frame and ABI decoding benchmarks

## Contract-enforced properties

- Monotonic sequence
- Previous-state-hash match
- Intent replay protection
- WETH conservation
- Token conservation
- No negative claims
- Reserved liquidity ceiling
- Physical ETH coverage
- Physical token coverage
- User ETH/token withdrawals

## Deliberately not claimed

- Audited custody
- Production Robinhood Chain deployment
- Trustless curve pricing
- Trustless liquidations
- Session keys
- MEV protection
- Permissionless sequencer operation

## Environment limitation

Foundry and npm dependencies were not available in the build container, so the Solidity suite and full Next.js production build could not be executed here. The project includes the complete Foundry test suite and local scripts. All dependency-free TypeScript financial, frame, ABI, custody-model, and syntax tests passed.
