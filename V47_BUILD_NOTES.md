# LEVERAGE X V47 Build Notes

## Shipped

- Transactional SQLite/WAL database at `.perphood/v47-indexer.sqlite`
- Factory-wide V45 market discovery
- Finalized block polling and canonical block headers
- Raw event persistence with transaction/log uniqueness
- Deterministic projections for markets, migrations, trades, positions, accounts, tokens, sessions, and account executions
- Reorg common-ancestor detection
- Rollback plus full deterministic projection replay
- Recovery-job audit records
- SQL-backed V46 durable orders
- Idempotent V46 JSON-to-SQL migration
- SQL order leasing and fill finality
- Indexer/reconciler leader leases, expiry-based failover, and stale-worker health cleanup
- Indexer, keeper, and reconciler heartbeats
- Live indexed-versus-contract reconciliation with per-run audit IDs and latest-run recovery health
- Cross-device Funding session visibility and owner revocation
- Indexed snapshot API
- Protected manual rollback API
- `/admin/indexer` operations console
- V47 worker and validation commands

## Added runtime files

- `lib/server/v47-database.ts`
- `lib/server/v47-indexer.ts`
- `lib/server/v47-reconciler.ts`
- `lib/server/v47-order-store.ts`
- `lib/chain/v47-indexed-client.ts`
- `components/V47IndexerConsole.tsx`
- `app/admin/indexer/page.tsx`
- `app/api/v47/**`
- `scripts/v47-indexer-worker.mts`
- `scripts/v47-reconciler-worker.mts`
- `scripts/v47-*-smoke.mts`

## Compatibility

The V21–V46 engines, contracts, terminal behavior, V45 account execution, and V46 order semantics remain intact. The old JSON order-store module and smoke test are retained to prove historical compatibility, but live API/keeper imports now resolve to the V47 SQL store.

## Still required

- PostgreSQL or another replicated production database
- Multi-provider RPC quorum and archive access
- Production Robinhood Chain finality parameters
- WebSocket/SSE fanout from indexed canonical events
- HSM-backed sequencer and keeper keys
- On-chain P-256/smart-account validation
- Production oracle integration
- Full migration asset transfer and post-migration adapter
- Foundry and browser E2E execution
- Independent security and accounting audits
