# LEVERAGE X V18 Build Notes

## Completed in this build

- Replaced the V17 $0 opening-auction direction with direct BattlePool genesis near 0.25 ETH FDV.
- Enforced a 0.001 ETH minimum creator genesis spot purchase.
- Added a deterministic bounded-power BattleCurve.
- Added configurable supply allocation and curve parameters.
- Selected the current default through a closeability-constrained parameter sweep:
  - 80% public curve inventory
  - 10% short-borrow inventory
  - 10% adaptive safety inventory
  - exponent 5
- Added one conserved token/WETH balance sheet for spot buys, spot sells, leveraged longs, and leveraged shorts.
- Added real reserve mutations for all four actions.
- Added exact token/debt accounting for leveraged positions.
- Added forced spot purchases for short liquidations.
- Added forced spot sales for long liquidations.
- Added dynamic executable-position-equity reservation so spot exits cannot spend WETH currently required for leveraged payouts.
- Added split long/short collateral accounting.
- Added a closeability invariant requiring protected curve inventory plus safety inventory to cover the full short-borrow allocation.
- Added safe adaptive inventory release bounded by remaining closeability headroom.
- Added creator-wallet self-perp prohibition in the local engine.
- Replaced old fee language with one 0.30% execution fee retained in BattlePool equity.
- Removed active creator/community reward claims from V18 documentation and persistence design.
- Added BattlePool balance-sheet statistics to market screens.
- Added an interactive private BattlePool Risk Lab.
- Rebuilt the private Economics Lab around V18 pool-retained fees.
- Updated the Supabase schema with BattlePool configurations, reserve snapshots, on-chain event mirrors, and open-position accounting.
- Added low-latency session-key, gateway, keeper, and WebSocket execution architecture.
- Moved incompatible V17 local financial state into a clean V18 storage namespace.

## Validation completed

### Deterministic smoke test

```text
PASS
genesis share                        42.60%
dev exit after short attack          0.510484 ETH
profitable short payout              0.534939 ETH
short liquidation price impact       +60.04%
long liquidation price impact        -21.82%
final token conservation             1,000,000,000
```

### Parameter search

- 16 closeable candidate configurations survived the first constrained sweep.
- The current 80/10/10, exponent-5 default ranked first under the initial scoring model.
- The scoring model is a search aid, not proof of global optimality.

### Randomized invariant run

```text
PASS
75 deterministic seeds
18,750 attempted mixed actions
18,663 successful state transitions
87 safely rejected unsafe actions
```

Every surviving leveraged position retained a deterministic liquidation path.

### Type validation

- Core BattlePool TypeScript passed strict standalone compilation.
- Modified engine/UI files passed selected TypeScript validation with local dependency stubs.

## Validation limitation

A clean `npm install` could not complete inside the packaging environment, so a full Next.js production build was not executed here. The project contains its complete `package.json` and `package-lock.json`; run `npm install`, `npm run test:battle-pool`, `npm run test:parameters`, `npm run test:fuzz`, and `npm run build` locally before treating the UI build as validated.

## Still required before real funds

- fixed-point Solidity BattlePool implementation
- Foundry invariant and differential tests against the TypeScript model
- session-key contracts and withdrawal authorization
- Robinhood Chain deployment configuration
- direct RPC/sequencer broadcast service
- keeper mesh and liquidation incentives
- indexer and WebSocket infrastructure
- MEV and transaction-ordering defenses
- bank-run, mass-liquidation, and one-sided inventory parameter search
- independent economic review
- independent smart-contract audits
- legal and jurisdiction review
