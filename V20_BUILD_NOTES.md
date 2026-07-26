# PERPHOOD V20 Build Notes — Speed and Executable Live PNL

## Ordered realtime layer

- Added a market-keyed external realtime store with monotonic state sequences.
- Added `useSyncExternalStore` subscriptions for low-overhead chart and PNL updates.
- BattlePool mutations publish immediately before the broader React state tree completes its next render.
- Added a terminal strip showing state sequence, frame age, authority source, and aggregate executable PNL.
- Local BattlePool state frames now feed the 1-second chart without fabricated candles.

## Executable PNL

- Replaced market-cap percentage shortcuts on Positions, Leaderboard, Profile, and terminal position rows.
- Perp PNL now simulates a complete close through the current shared pool.
- Spot value now simulates a complete spot sale through the current shared pool.
- Quotes include price impact, execution fee, funding, borrowing cost, debt repayment, and payout availability.
- A position that cannot be honored by current reserves is marked non-executable rather than displaying fictional withdrawable profit.

## Contract boundary

- Added `IBattlePoolV20.sol` with ordered state sequence, state hash, realtime state view, executable-PNL preview, and state-frame event.
- Updated the frontend ABI to the V20 boundary.
- The interface is unaudited reference work, not a deployed custody contract.

## Validation

- Existing smoke, parameter, fuzz, and 40-position cascade suites remain passing.
- Added executable-PNL regression tests.
- Added a local 40-position frame benchmark: 20,000 close-quote operations across 500 frames.
- Observed reference-machine result: 0.4238 ms average frame build, 0.6234 ms p95, 2.0534 ms p99.
- These numbers measure local deterministic math only and are not production network-latency claims.
