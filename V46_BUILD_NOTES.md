# PERPHOOD V46 Build Notes

## Milestone

V46 converts the V45 authorize-once account layer into a real unattended local order network. Conditional orders are no longer browser-only objects: they are signed, durably stored, evaluated from on-chain state, leased to a keeper, settled through the V45 router, and reconciled into the terminal after confirmation.

## Added

### Order domain

- `lib/chain/v46-order.ts`
- Canonical signed intents for limit, trigger, take-profit, stop-loss, and breakeven orders
- Signed cancellations
- Owner/session binding
- Trigger comparator semantics
- Two-state breakeven activation and retrace logic
- Expiry and retry-backoff rules
- Fill and receipt metadata

### Durable service

- `lib/server/v46-order-store.ts`
- Atomic temp-file persistence
- Idempotent creation
- Exclusive keeper leases
- Status transitions and bounded history
- Owner and market filtering

### Keeper

- `lib/server/v46-keeper.ts`
- Authoritative contract-state trigger checks
- Fill-time V45 session and nonce validation
- Keeper-account failover
- Receipt/event decoding
- Retry and terminal-failure handling
- Batch liquidation scans

### APIs and worker

- `/api/v46/orders`
- `/api/v46/orders/cancel`
- `/api/v46/keeper/run`
- `/api/v46/keeper/status`
- `scripts/v46-keeper-worker.mts`

### Terminal

- Durable Limit/Trigger execution for V45-session markets
- Reduce-only TP/SL/Breakeven arming after a confirmed position open
- Durable pending-order synchronization
- Filled spot/perp/close reconciliation
- Signed cancellation
- V46 execution labels and transaction states

### Operations

- `/admin/keeper`
- Order and keeper metrics
- Manual keeper cycle
- Receipt/failure visibility

### Validation

- V46 order-engine smoke
- P-256 order/cancellation signature smoke
- Atomic store and lease smoke
- Static integration checks
- Complete inherited V21–V45 chain

## Compatibility corrections

The V44 and V45 regression assertions were updated to preserve their intended guarantee under V46:

- wallet-only contract execution still cannot create unattended orders;
- only active V45 authorized sessions can use V46 conditional execution;
- V44 and V45 execution modes remain fully supported inside the V46 package.

## Unfinished production work

- replicated SQL/event-sourced order database;
- authoritative ETH/USD oracle instead of the $3,200 local reference;
- on-chain P-256 or audited smart-account verification;
- multi-region keeper quorum and HSM-backed keys;
- production rate limits and abuse controls;
- reorg rollback and receipt-finality coordinator;
- factory-wide persistent chain indexer;
- Robinhood Chain deployment and canonical WETH;
- dependency-backed Next.js production build in this environment;
- Foundry compilation/tests in this environment;
- security audits and public-fund validation.
