# LEVERAGE X V23 build notes

## Completed

- Extended the signed intent from spot-buy-only fields to a complete action envelope.
- Added user action constants and a six-action authorization bitmap.
- Added sequenced leveraged-open and position-close engines.
- Bound positions to wallet owners and client order IDs.
- Added partial close accounting across collateral, notional, debt, inventory, and fees.
- Replaced the V22 relay with generic V23 action routing.
- Added authoritative V23 state and keeper-liquidation APIs.
- Added a full-action admin console.
- Added `LocalBattlePoolV23`, interface, ABI, Foundry tests, and liquidation-batch action.
- Updated local deployment scripts and sequencer journal versioning.
- Added full-action deterministic regression coverage.

## Validation result

- Full action lifecycle: pass
- P-256 signing/tamper rejection: pass
- Authorized settlement calldata: pass
- Session replay/scope/size/expiry/revocation model: pass
- Solidity V23 static safety checks: pass
- TypeScript/TSX syntax: pass
- 18,750-action fuzz suite: pass
- 40-short squeeze: zero bad debt
- 40-long cascade: zero bad debt

## Not executed in this environment

Foundry/Anvil were unavailable, so Solidity compilation and live local-chain transactions were not executed here. npm packages were not installed, so a complete `next build` was not performed. The dependency-free financial, signing, settlement, syntax, and benchmark suites passed.
