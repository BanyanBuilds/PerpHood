# PERPHOOD V52 — 100K to 1M User Scale Foundation

The one-million-user requirement is a design target, not a capacity claim. V52 introduces deterministic partition planning and explicit service boundaries so later work does not create a single-host bottleneck.

## Core rule: scale around ordered markets

A single BattlePool market must have one canonical command order. Global traffic can scale horizontally by assigning markets to deterministic execution shards. Hot markets can be isolated or moved through a controlled shard-ownership transition without allowing two sequencers to write the same market concurrently.

## Target service topology

1. **Edge web** — CDN-hosted terminal shell and cacheable public reads.
2. **Stateless API gateways** — profiles, presets, order admission and account history.
3. **Market sequencers** — strictly ordered commands per market partition.
4. **Durable event bus** — replayable command, receipt, market and recovery events.
5. **Realtime gateways** — WebSocket/SSE fan-out by market partition.
6. **PostgreSQL** — profiles, presets, workspaces, orders, projections and audit records.
7. **Distributed cache** — rate limits, idempotency windows, leases and hot snapshots.
8. **Worker fleets** — indexers, keepers, liquidators, reconcilers, candles and backups.
9. **RPC quorum** — independent chain providers with block/hash agreement and failover.

## Planning tiers

| Tier | Registered users | Peak connected clients | Execution shards | Stream gateways | Queue partitions |
|---|---:|---:|---:|---:|---:|
| Foundation | 100,000 | 10,000 | 64 | 8+ | 64 |
| Growth | 500,000 | 50,000 | 256 | 32+ | 256 |
| Mass | 1,000,000 | 100,000 | 512 | 64+ | 512 |

These are starting topology targets. Replica counts, partition counts and hardware must be revised from measured load tests.

## Deterministic sharding

`lib/v52-scale-foundation.ts` exposes stable market and account shard functions. The V52 test suite maps 4,096 generated addresses across 512 market shards and 256 account shards and proves stable, balanced assignment for that deterministic vector.

## Supabase/Postgres boundary

`supabase/v52_scale_foundation.sql` provides:

- Independent category/action trading presets.
- Saved workspaces constrained to three left sidecars.
- Watchlists and likes.
- Idempotent command admission.
- Hash-partitioned market-event projections.
- Worker heartbeats and recovery checkpoints.
- Owner-scoped RLS for user settings.

Postgres is not the BattlePool settlement authority. High-frequency client fan-out must use dedicated stream gateways, not raw Postgres Changes subscriptions for every connected terminal.
