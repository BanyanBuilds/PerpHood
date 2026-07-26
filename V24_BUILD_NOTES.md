# PERPHOOD V24 build notes

## Objective

Move pricing authority from floating-point sequencer output into reproducible contract math while preserving the sub-second execution, chart, and live-PNL experience.

## Delivered

### Fixed-point curve

- Added `lib/fixed-point-battle-curve.ts`.
- Added `contracts/src/BattleCurveMathV24.sol`.
- Both implementations use WAD integers and the same rounding direction.
- Added exact-input buys, exact-token buys, and exact-token sells.
- Protected inventory remains enforced at 94% maximum sold curve allocation.

### Verified contract

- Added `contracts/src/LocalBattlePoolV24.sol`.
- Added `contracts/interfaces/ILocalBattlePoolV24.sol`.
- Added `lib/battle-pool-v24-abi.ts`.
- User actions require session scope plus a curve proof.
- Contract recomputes price, cost, fee, token quantity, market cap, and inventory transitions.
- Fake frame prices revert.
- Unverified V23 settlement functions are not exposed by the V24 contract.

### Verified calldata

- Added `lib/chain/v24-settlement.ts`.
- Encodes the full fixed-point proof into the V24 authorized settlement call.
- Rejects non-conserving deltas and frame prices/market caps not derived from the proof before relay submission.

### Liquidation continuation

- Added batch ID, starting state hash, positions root, exact cursor, and total count.
- Maximum 16 liquidations per chunk.
- New user actions are paused while a liquidation batch is active.
- Final state is committed after every bounded chunk.

### Event stream

- Added `lib/chain/v24-event-stream.ts`.
- One ordered stream derives 1s/15s/30s candles and executable PNL.
- Sequence gaps throw immediately.
- Position PNL uses executable curve close values rather than marginal mark-to-market values.

### UI

- Added `/admin/v24-verification`.
- Added a V24 navigation entry.
- Verification lab exposes fixed-point rules, continuation limits, candle counts, event processing time, executable PNL, and token conservation.

## Important remaining limitation

The V24 contract verifies the curve and inventory movement, but position ownership, collateral, debt, PNL, and liquidation eligibility are still represented by committed roots. Those proofs must become independently verifiable before production.
