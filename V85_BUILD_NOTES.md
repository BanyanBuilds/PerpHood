# Leverage X V85 — Live Data Engine

V85 adds a production-oriented real-time delivery layer on top of the existing chain indexer.

## Added

- Strict shared schema for launch, trade, price, position, risk, and liquidation events.
- Idempotent bounded event buffer with cursor-based replay.
- Server-Sent Events endpoint at `/api/live/events`.
- Authenticated event-ingestion endpoint at `/api/live/ingest`.
- Health endpoint at `/api/live/health`.
- Reconnecting client hook for terminal components.
- Static smoke coverage for validation, replay, deduplication, and capacity limits.

## Required Vercel secret

`LIVE_EVENT_INGEST_SECRET`

The secret must be configured only in Vercel and must never be committed to GitHub.

## Architecture boundary

The existing V47 chain indexer remains the source that decodes canonical on-chain logs. Workers publish normalized events into the V85 ingestion endpoint. Browsers subscribe to the SSE endpoint and receive a replay snapshot followed by live updates.

For multi-instance production deployment, replace the process-local buffer with Redis Streams, Supabase Realtime, or another durable fan-out layer while keeping the V85 event contract unchanged.
