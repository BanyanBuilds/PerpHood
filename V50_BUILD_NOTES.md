# V50 Build Notes

## Milestone

Formal invariants, adversarial settlement verification, and fee-fragmentation hardening above V49.

## Added

- `lib/formal-invariants-v50.ts`
- `scripts/v50-adversarial-math-smoke.mts`
- `scripts/v50-stateful-invariants-smoke.mts`
- `scripts/v50-static-smoke.mts`
- `contracts/test/LaunchpadFactoryV50Invariant.t.sol`
- `LaunchpadMarketV45.invariantSnapshot()`
- `readV50InvariantSnapshot()` chain client
- `/admin/invariants` live operations console
- V50 package scripts and Foundry configuration

## Math hardening

- Protocol fees now round upward in the TypeScript fixed-point reference and Solidity curve library.
- Entry and close fees use the same upward rule.
- Token output and trader payouts remain conservatively rounded downward.
- Exact-token buys still find the minimum gross amount that covers required net curve cost.

## Verification properties

- token conservation;
- physical custody reconciliation;
- collateral ledger reconciliation;
- short inventory reconciliation;
- active-position book reconciliation;
- guaranteed WETH solvency;
- external ETH conservation;
- fee-split resistance;
- no profitable oscillation;
- monotonic short payout toward the floor;
- maximum short profit bounded by notional;
- close-order solvency across exhaustive mixed-position permutations.

## Compatibility

V44, V45, and V48 package-name guards were extended to accept V50. Existing V49 settlement tests remain active in the inherited test chain.
