# PERPHOOD V20 Supabase foundation

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

PERPHOOD supports one active trading wallet per profile. `tracked_wallets` remains read-only intelligence and never authorizes multiwallet execution.

Creator and holder reward routing is intentionally absent. The existing referral/reward persistence placeholders are inactive future infrastructure, not executable BattlePool economics.


## V20 ordered-state requirements

`battle_pool_snapshots`, `battle_pool_events`, and `battle_execution_batches` now carry state sequences and state hashes. The production indexer must reject sequence gaps, duplicate sequences with different hashes, and event streams that do not reconcile to the contract's current `realtimeState()`. Chart and PNL APIs must reference the same sequence.
