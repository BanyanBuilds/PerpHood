# V49 Build Notes

## Goal

Make LEVERAGE X's leveraged settlement mathematically explicit, independently testable, and payable by construction—especially the maximum-profit short case where the shared curve falls toward its floor.

## Contract changes

- Added `SettlementQuote` to `LaunchpadFactoryV45.sol`.
- Added `quotePositionSettlement(positionId)`.
- Added `quoteMaximumShortPayoutWei(positionId)`.
- Added `currentPositionObligationsWei()` and `maximumShortFloorLiabilityWei()`.
- Replaced aggregate debt/equity netting with conservative, non-cross-netted guaranteed liabilities.
- Added prospective post-open solvency checks to long and short quotes.
- Reused the strengthened obligation calculation in close and invariant checks.
- Added Foundry fixtures for exact short-floor settlement and remaining-liability preservation.

## Independent math implementation

Added `lib/settlement-math-v49.ts` with:

- exact BigInt rational price evaluation;
- exact BigInt rational cumulative integral evaluation;
- independent long settlement;
- independent short settlement;
- maximum short-floor payout;
- post-close guaranteed liabilities;
- post-close payability.

## Terminal changes

- Contract positions track `chainSettlementPayable`.
- Short positions track `chainMaximumPayoutEth`.
- Positions track post-close obligations.
- Terminal PNL is marked executable only after the contract's solvency test.
- Short cards display the exact floor maximum.
- A mathematically quoted but unpayable close is disabled and labeled `reserve locked`.

## Simulation changes

The deterministic browser BattlePool now uses the same conservative non-cross-netted reserve rule. Controlled short-attack fixtures seed an explicit risk reserve because spot exits may no longer consume funds reserved for maximum short settlement.

The stricter reserve rule causes more unsafe randomized actions to be rejected. This is expected and desirable.

## Validation entry points

```bash
npm run test:v49-math
npm run test:v49-static
npm run test:v49-fast
npm run test:v49
```

The full Solidity Foundry suite is included but still must be compiled and executed in an environment with Foundry installed.
