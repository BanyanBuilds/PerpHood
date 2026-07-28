# Leverage X V87 — Persistent Live State

V87 converts validated V85/V86 events into durable, idempotent SQLite read models. The terminal can now reload or reconnect without relying on the temporary in-memory SSE buffer.

## Added
- `v87_applied_events` replay ledger
- durable market snapshots with price, market cap, OI, active positions, trade count and buy/sell volume
- durable position snapshots through open, close and liquidation states
- transactional event materialization before fanout
- `GET /api/live/state` with chain, market, owner, closed-position and limit filters
- replay-safe duplicate handling

## Production boundary
The current store inherits V47 SQLite and is appropriate for controlled single-host/indexer operation. Vercel `/tmp` is ephemeral; production multi-instance deployment must point materialization at durable Postgres/Supabase or another replicated database before public funds.
