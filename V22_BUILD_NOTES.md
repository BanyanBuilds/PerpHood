# LEVERAGE X V22 build notes

## Added

- `contracts/src/LocalBattlePoolV22.sol`
- Scoped session authorization, revocation, nonce, expiry, action bitmap, and maximum notional
- Nonce preservation across session reauthorization
- `commitAuthorizedSingleAccountFrame(...)` sponsored settlement boundary
- P-256 browser session-key generation, binding, signing, and verification
- Canonical signed trading intent format
- Sponsored spot-buy quote using the exact exponent-5 adaptive BattleCurve and liquidation sequencer
- Server-side local relay at `/api/v22/relay` with receipt-confirmed two-phase sequencer-state persistence
- `/admin/session-keys` authorization and no-popup execution lab
- Wallet-authorize-once flow
- Separate signing, sequencer, chain-finality, fill, boundary, and liquidation metrics
- V22 Solidity interfaces and frontend ABI
- Session ledger reference model
- Session crypto, exact-engine quote, encoding, replay, scope, expiry, revocation, and benchmark tests

## Contract-enforced session properties

- Session belongs to one wallet
- Session public-key hash is fixed by authorization
- Session must be active
- Session and intent must be unexpired
- Nonce must equal the exact next nonce
- Action must be allowed by bitmap
- Notional must be positive and within limit
- Intent hash cannot be consumed twice
- Reauthorization does not reset nonce
- All existing V21 custody and conservation properties remain

## Current sponsored execution coverage

- Complete browser signature flow: implemented
- On-chain authorization/revocation: implemented
- Gas-sponsored local spot buy: implemented
- Generic signed intent schema for all trade actions: implemented
- Generic authorized settlement calldata: implemented
- Long/short/open/close relay adapters: next build
- Production secure key storage: not implemented
- Permissionless/decentralized signature verification: not implemented

## Environment limitation

Foundry and npm dependency installation were unavailable in the build container. The Solidity source and Foundry test suite are included but were not compiled here. All dependency-free TypeScript financial, session-key, settlement, ledger, syntax, and benchmark suites passed.
