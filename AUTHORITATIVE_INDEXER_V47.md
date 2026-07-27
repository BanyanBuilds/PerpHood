# LEVERAGE X V47 — Authoritative Indexer, Reconciliation, and Recovery

V47 replaces the single-node JSON execution history with a transactional SQLite reference database and introduces one canonical block/event history for the V45 account router, every V45 BattlePool market, V46 durable orders, keeper health, account recovery, and reorg-safe projection replay.

## Canonical pipeline

```text
V45 factory + every discovered BattlePool
  → finalized block polling
  → raw canonical blocks and logs
  → transactional SQLite commit
  → deterministic projections
  → account / session / market reconciliation
  → terminal and operations APIs
```

## Transactional database

The default database is:

```text
.perphood/v47-indexer.sqlite
```

SQLite runs in WAL mode with full synchronous commits, foreign keys, a five-second busy timeout, transactional worker leases, and an integrity-tested schema. The database stores:

- canonical block headers;
- append-only raw contract events;
- discovered markets and migration lifecycle;
- latest BattlePool state per market;
- public buy/sell history;
- open and closed positions;
- internal ETH liabilities;
- per-market token liabilities;
- active/revoked session state and nonces;
- account executions and intent hashes;
- V46 durable orders and keeper leases;
- worker heartbeats and leader leases;
- reconciliation checks;
- rollback/recovery jobs.

The V46 JSON order store remains only as an inherited compatibility fixture. The running V46 order APIs and keeper now use the V47 SQL order store. `npm run indexer:v47` imports any existing `.perphood/v46-orders.json` records idempotently.

## Factory-wide discovery

Each indexer cycle reads `marketCount()` and `markets(index)` from the configured V45 factory. It then indexes the factory and every discovered market address in one finalized block range. A newly created market is therefore included without maintaining a manual address list.

## Reorg protection

Before moving forward, V47 compares its canonical head hash with the live chain block at the same height. On mismatch it:

1. searches backward for the nearest common ancestor;
2. writes a recovery job;
3. removes orphaned blocks and events above the ancestor;
4. clears derived projections;
5. deterministically replays all remaining canonical raw events;
6. moves the indexed head to the ancestor;
7. continues indexing the replacement branch.

Manual rollback is available through the protected recovery API. Recovery never edits raw canonical history below the selected ancestor.

## Projection truth

V47 derives account state from events rather than browser memory:

- `Deposited` / `Withdrawn` set the router ETH liability;
- `TokenDeposited` / `TokenWithdrawn` set token liabilities;
- `AccountExecution` applies spot/perp debit and credit transitions;
- `SessionAuthorized`, `SessionNonceConsumed`, and `SessionRevoked` reconstruct authorization state;
- `Trade`, `PositionOpened`, `PositionClosed`, and `StateCommitted` rebuild market history;
- `MigrationStarted`, `MigrationCommitted`, and `PhaseChanged` rebuild launch lifecycle state.

After a rollback, these projections are regenerated solely from canonical events.

## Live reconciliation

The reconciler compares indexed truth against direct contract reads:

- `wethBalanceWei(account)`;
- `tokenBalanceWad(account, market)`;
- `sessionState(sessionId)`;
- `runtimeState()` including sequence, state hash, cap, free liquidity, open interest, and active positions.

Every comparison is persisted under a unique reconciliation run. A mismatch marks that run and the reconciler heartbeat degraded. Canonical health is based on the latest complete run, so a corrected replay can recover cleanly without deleting the historical mismatch audit trail.

## Worker leases and failover

Indexer and reconciler workers use SQL leader leases. A second worker cannot process the same role while the current lease is healthy. If the owner stops renewing, another worker can acquire the expired lease and continue from the canonical head. Completed one-shot workers release their leases and do not remain falsely degraded; an active lease without a healthy heartbeat is still surfaced immediately.

V46 order fills retain their per-order exclusive keeper leases. All indexer, keeper, and reconciler processes publish heartbeats with last block, status, lease time, and role metadata.

## Cross-device account recovery

The Funding page now reads the indexed account snapshot in addition to the direct contract state. A user can see:

- the indexed canonical block;
- indexed ETH and token liabilities;
- indexed position history;
- active sessions created on another device;
- session nonce and source block.

An owner wallet can revoke an indexed active session even when the original browser session key is unavailable. The private P-256 key itself is never reconstructed or copied across devices.

## Operations console

Open:

```text
/admin/indexer
```

The console displays:

- canonical/finalized head;
- block and event counts;
- discovered markets;
- BattlePool liquidity and open interest;
- active positions;
- worker heartbeats;
- recent canonical trades;
- recent reconciliation matches and mismatches;
- manual indexer, keeper, and reconciler cycle controls.

## Runtime commands

```bash
npm run indexer:v47
npm run indexer:v47:once
npm run reconciler:v47
npm run reconciler:v47:once
npm run keeper:v46
```

## Security boundary

V47 is a durable local reference architecture, not production financial infrastructure.

- Node's built-in SQLite API is experimental in the assembly runtime.
- SQLite WAL is transactional but is not a multi-region replicated production database.
- RPC access is not authenticated or quorum-verified.
- Production chain finality policy and maximum reorg depth are not finalized.
- Event projections have not been independently audited.
- P-256 session and order signatures remain relay-verified rather than Solidity-verified.
- Keeper and sequencer keys are not HSM-backed.
- Canonical Robinhood Chain WETH and a production ETH/USD oracle are not connected.
- Foundry compilation, live Anvil execution, and dependency-backed Next.js production compilation were unavailable in this assembly environment.

Never use V47 with public funds.
