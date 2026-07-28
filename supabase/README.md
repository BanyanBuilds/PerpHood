# Leverage X V20 Supabase foundation

`schema.sql` is a production-shaped **indexer and user-state mirror** for profiles, one-wallet sessions, terminal layouts, alerts, launch drafts, market identity, adaptive BattlePool configurations, reserve snapshots, open leveraged positions, atomic execution batches, settled history, and fee records.

The current application still runs from local deterministic state and does not require Supabase.

Supabase must never become the authoritative BattlePool ledger. Audited Robinhood Chain contracts remain authoritative for token reserves, WETH reserves, debt, collateral, positions, liquidations, fees, and payouts. Trusted indexers mirror finalized contract events into public read models.

Before connecting this schema publicly:

1. Create a fresh Supabase project.
2. Review every table, constraint, policy, and function with database and security engineers.
3. Run `schema.sql` in the SQL editor.
4. Keep the service-role key server-only.
5. Replace local wallet authentication with signed challenges, nonces, and expiring session keys.
6. Write contract and indexer records only through trusted services.
7. Reconcile every snapshot against emitted contract events and block state.
8. Add reorg handling, finality thresholds, idempotency, replay tooling, and monitoring.
9. Treat browser-submitted execution state as untrusted.
10. Preserve V20's zero-bad-debt and token-conservation assertions in indexer reconciliation.

Leverage X supports one active trading wallet per profile. `tracked_wallets` remains read-only intelligence and never authorizes multiwallet execution.

Creator and holder reward routing is intentionally absent. The existing referral/reward persistence placeholders are inactive future infrastructure, not executable BattlePool economics.


## V20 ordered-state requirements

`battle_pool_snapshots`, `battle_pool_events`, and `battle_execution_batches` now carry state sequences and state hashes. The production indexer must reject sequence gaps, duplicate sequences with different hashes, and event streams that do not reconcile to the contract's current `realtimeState()`. Chart and PNL APIs must reference the same sequence.

## V52 scale foundation

`v52_scale_foundation.sql` adds the current product configuration and service-coordination layer:

- Independent Buy, Long and Short presets for all six Markets/Movers categories.
- Saved workspaces with a database constraint limiting the left dock to three sidecars.
- Watchlist/like state.
- An idempotent, partition-keyed command outbox.
- Hash-partitioned canonical market-event projections.
- Service heartbeats, leases and recovery checkpoints.
- Owner-only RLS for presets, workspaces and watchlists.
- No browser access to command, worker, event or recovery tables.

This migration does not authorize custody or settle trades. BattlePool contracts remain authoritative. A dedicated stream tier must fan out high-frequency data instead of connecting large client populations directly to Postgres Changes.

## V63 GMGN compatibility

Run `v63_gmgn_compatibility.sql` after the existing production launch schema. It adds a canonical raw-event mirror and indexer checkpoint table. Service-role credentials are required for writes; only canonical events are publicly readable.

## V65 GMGN live pool

After the V55 and V63 migrations, run `v65_gmgn_live_pool.sql`. It adds canonical Uniswap V3 pool attribution to confirmed launch records and creates the reorg-aware standard pool-event mirror/checkpoint tables used by `/api/v65/gmgn/*` and `npm run chain:v65:gmgn:backfill`.
