# PERPHOOD V19 Build Notes

## Financial-engine corrections

- Made leveraged entry fees symmetric between longs and shorts.
- Corrected liquidation accounting so only actual residual equity remains in the pool.
- Prevented close fees from creating or increasing bad debt.
- Strengthened token, collateral, debt, proceeds, and free-WETH reconciliation.

## Adaptive token inventory

- Kept the 1B supply allocation configurable rather than permanent.
- Added controlled safety-to-short inventory releases under high utilization.
- Added inventory reclaim when short demand cools.
- Added safety floors, short-inventory ceilings, depth gates, and closeability bounds.

## Atomic liquidation sequencing

- Added deterministic health ordering for simultaneous liquidations.
- Added exact next-liquidation-boundary search for large spot orders.
- A single user action may contain multiple internal curve/liquidation stages while remaining one atomic settlement intent.
- Any candidate route that produces bad debt is retried at a safer boundary or rejected.

## Interface and persistence

- Added a BattlePool terminal ledger showing real/free WETH, reserved equity, short utilization, adaptive inventory, retained liquidation equity, fees, and bad debt.
- Rebuilt the Risk Lab around mass 20× short squeezes and long cascades.
- Added adaptive policy fields and atomic execution-batch records to Supabase schema.
- Moved local application state to the V19 storage namespace with V18 fallback migration.

## Current deterministic results

- Smoke suite: PASS
- Parameter search: PASS
- 75-seed / 18,750-action fuzz suite: PASS
- 40-short 20× squeeze: PASS, zero bad debt
- 40-long 20× cascade: PASS, zero bad debt
- Token conservation: exactly 1,000,000,000

The TypeScript engine remains a mathematical reference implementation, not an audited custody contract.
