# PERPHOOD V48 — Live Data Plane and Robinhood Chain Readiness

## Purpose

V48 turns the V47 single-host canonical index into a production-shaped live read plane without changing the settlement source of truth. Contracts remain authoritative for custody and execution. The V47 SQLite event history remains the canonical local reference. V48 adds independent RPC verification, finalized materialization, durable live delivery, operational alerts, recovery snapshots, and an optional Supabase/Postgres read replica.

## Canonical flow

```text
Robinhood Chain / local Anvil
        ↓
Independent RPC provider probes
        ↓
Majority block-hash quorum
        ↓
V47 finalized event indexer
        ↓
V48 candle + market-metric materializer
        ↓
Durable sequence-numbered SSE events
        ↓
Terminal, charts, Movers, operations UI
        ↓
Optional finalized Supabase/Postgres replica
```

## Chain configuration

`lib/server/v48-chain-config.ts` defines explicit local, testnet, and mainnet environments. Runtime overrides are accepted only through validated environment variables. The configuration controls chain ID, RPC endpoints, application confirmation depth, indexer batch size, explorer URL, and canonical WETH address.

The terminal never chooses a chain from an RPC response. Every provider must match the configured chain ID.

## RPC pool and quorum

Every V48 cycle probes all configured RPC endpoints for:

- chain ID;
- latest block number;
- latest block hash;
- latency;
- consecutive failures;
- wrong-chain responses;
- offline or degraded state.

For canonical indexing, V48 resolves the lowest common observed height and requires a configurable majority of healthy providers to return the same block hash. Divergent providers are isolated from the winning quorum and recorded for operations review.

Ordinary failover reads try healthy providers in latency order and surface a combined failure rather than silently returning stale placeholder data.

## Durable market data

V48 materializes canonical indexed trades into:

- 1-second OHLCV candles;
- 15-second OHLCV candles;
- 30-second OHLCV candles;
- buy and sell volume;
- buy and sell counts;
- 10-second, 60-second, 5-minute, and 1-hour volume;
- 60-second and 5-minute market-cap change;
- unique 5-minute traders;
- free WETH;
- long and short open interest;
- active-position count.

All candles and metrics are derived from indexed canonical events. No synthetic candles are generated when real events are absent.

## Durable live stream

`/api/v48/stream` exposes sequence-numbered server-sent events. Clients may reconnect with `Last-Event-ID` and replay missed events from SQLite rather than relying on an in-memory broadcast only.

Supported stream classes include:

- `market.updated`;
- `trade.confirmed`;
- `position.updated`;
- `account.updated`;
- `order.updated`;
- `system.health`;
- `reorg.recovered`.

The terminal subscribes to relevant contract-market events and immediately reconciles the affected market. Five-second polling remains as a safety fallback when SSE is enabled; one-second polling remains available when the stream is disabled.

## Markets and Movers execution behavior

Markets and Movers no longer open a trading sidecar.

- **Quick Buy** immediately submits the saved category buy amount and leaves the user on the same page.
- **Quick Long** and **Quick Short** are independent saved presets.
- Each preset contains its own enabled state, collateral amount, leverage, fee/priority behavior, slippage, and category filters.
- An unset Long or Short preset is visibly disabled and cannot submit an action.
- A configured preset such as `1 ETH at 10× Long` sends exactly that action with one click.
- Pending quick actions lock duplicate row actions until the first action resolves.

This behavior is independent for New Pairs, Cooking, Migrated, Movers, Most Liked, and Highest Market Cap.

## Three-panel left workspace

Markets and Movers may display up to three independent non-trading sidecars in the left dock at the same time. Examples include X Launch Feed, Watchlist, Wallets, Positions, Alerts, news, Launcher, and research/tracker tools.

- One panel receives the full left rail.
- Two panels split the rail equally.
- Three panels split the rail into three always-visible slots.
- Each panel owns its own internal scroll area.
- Panel placement, open panels, category presets, and workspace selection persist together.
- A fourth left-dock request opens as a floating panel instead of crushing or hiding the three visible slots.
- No trade ticket or trade drawer is reintroduced into Markets or Movers.

## Health and alerts

V48 records and resolves operational alerts for:

- insufficient healthy RPC quorum;
- block-hash divergence;
- canonical index lag;
- indexed-versus-contract reconciliation mismatches;
- active worker leases without healthy heartbeats.

The `/admin/data-plane` console shows canonical/finalized height, provider health, live stream sequence, market/candle counts, liquidity, active alerts, and readiness configuration.

## Backups

V48 creates a consistent SQLite snapshot with `VACUUM INTO`, records its source block and size, and computes a SHA-256 recovery proof. The snapshot remains a local operational backup; off-host encryption and retention policy are still required for production.

## Supabase/Postgres replication

V48 may replicate finalized read models to Supabase/Postgres using server-only credentials. Replication includes markets, metrics, finalized candles, sessions, orders, and durable data-plane events. Checkpoints prevent replaying the complete stream on every cycle.

The replica is intentionally a read model. It does not replace contracts, the canonical chain index, or custody accounting.

## Safety boundary

V48 is still unaudited financial software.

- SQLite remains a single-host canonical reference.
- The Postgres adapter is an optional read replica, not active-active consensus.
- Production RPC provider diversity and archive access are not configured in the repository.
- Session and order P-256 signatures remain relay-verified.
- Sequencer and keeper keys are not HSM-backed.
- Production oracle delivery is not complete.
- Final Robinhood Chain contract deployment and audits remain incomplete.
- Foundry, Anvil E2E, injected-wallet E2E, and the dependency-backed Next.js production build were not executed in the assembly environment.
- Public funds are not approved.
