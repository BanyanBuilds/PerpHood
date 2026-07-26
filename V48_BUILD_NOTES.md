# PERPHOOD V48 Build Notes

## Shipped

- Explicit local, Robinhood Chain testnet, and Robinhood Chain mainnet configuration
- Configurable canonical WETH and application-finality settings
- Multi-provider RPC probing and chain-ID enforcement
- Majority block-hash quorum and divergent-provider isolation
- Latency-ordered failover requests
- Persistent RPC provider health and failure counters
- V47 canonical-index integration using quorum-approved RPC state
- 1s, 15s, and 30s OHLCV materialization from canonical indexed trades
- Rolling market metrics and unique-trader activity
- Durable sequence-numbered SSE with reconnect replay
- Terminal contract-market SSE reconciliation with polling fallback
- Operational health alerts for quorum, divergence, lag, reconciliation, and workers
- Consistent SQLite recovery snapshots with SHA-256 proof
- Optional finalized Supabase/Postgres read-model replication
- V48 data-plane worker, replicator, backup CLI, APIs, and `/admin/data-plane` console
- Markets/Movers in-place Quick Buy
- Independent preset-only Quick Long and Quick Short
- Disabled Long/Short actions until the exact category preset is configured
- Three simultaneous non-trading sidecars in the left Markets/Movers dock
- Persisted open sidecars and panel placement
- Safe fourth-panel floating fallback

## Added runtime files

- `lib/server/v48-chain-config.ts`
- `lib/server/v48-rpc-pool.ts`
- `lib/server/v48-database.ts`
- `lib/server/v48-materializer.ts`
- `lib/server/v48-data-plane.ts`
- `lib/server/v48-health.ts`
- `lib/server/v48-backup.ts`
- `lib/server/v48-replication.ts`
- `components/V48DataPlaneConsole.tsx`
- `app/admin/data-plane/page.tsx`
- `app/api/v48/**`
- `scripts/v48-data-plane-worker.mts`
- `scripts/v48-replicator-worker.mts`
- `scripts/v48-backup-cli.mts`
- `scripts/v48-*-smoke.mts`
- `supabase/v48_data_plane.sql`

## Markets/Movers interaction lock

The following rule is now regression-protected:

```text
Quick Buy → execute saved buy amount in place
Quick Long → execute enabled collateral + leverage preset in place
Quick Short → execute enabled collateral + leverage preset in place
Unset Long/Short preset → disabled, no transaction
```

No action above opens or requires a trading sidecar.

The left dock supports three utility/research sidecars simultaneously. Each remains visible and internally scrollable. A fourth requested left panel opens floating.

## Compatibility

The V21–V47 engines, V43 unified settlement, V44 receipt reconciliation, V45 account/session execution, V46 durable orders/keepers, and V47 SQL index/recovery behavior remain intact.

## Still required

- Independently operated production RPC providers and archive access
- Production Robinhood Chain deployment and finality validation
- Production oracle adapter and manipulation controls
- Replicated transactional primary database or managed failover design
- HSM-backed sequencer/keeper keys and on-chain session validation
- End-to-end reorg tests against a controllable live EVM node
- Real browser wallet E2E and load tests
- Foundry compilation and contract tests in the final deployment environment
- Independent smart-contract, accounting, infrastructure, and application audits
