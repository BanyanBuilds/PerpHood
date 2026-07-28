# Leverage X V86 — Chain-to-Live Bridge

V86 connects the existing reorg-aware V47 Robinhood Chain indexer to the V85 terminal event stream.

## What is implemented

- Runs the existing finalized-chain indexer before every bridge cycle.
- Maps canonical indexed launches, spot trades, price/state updates, position opens/closes, and liquidations into strict V85 events.
- Delivers batches to `/api/live/ingest` using the Vercel-only bearer secret.
- Stores a durable destination-specific `(block, logIndex)` cursor inside the indexer SQLite database.
- Advances the cursor only after successful delivery, so HTTP failures are retried without silently losing events.
- Uses deterministic event IDs, allowing the V85 hub to reject duplicate replays.
- Ignores removed/non-canonical logs.

## Required secrets/settings

Set these in the environment running the worker; never commit real values:

- `ROBINHOOD_RPC_URL`
- `V47_FACTORY_ADDRESS`
- `LIVE_EVENT_INGEST_URL=https://<your-domain>/api/live/ingest`
- `LIVE_EVENT_INGEST_SECRET` (same value stored in Vercel)
- `ROBINHOOD_CHAIN_ID`

## Windows / local commands

One synchronized cycle:

```cmd
npm run indexer:v86:once
```

Continuous worker:

```cmd
npm run indexer:v86
```

Validation:

```cmd
npm run test:v86-live-bridge
```

The worker must run in a persistent worker/VM/container. Vercel functions are not suitable for an endless polling process.
