# PERPHOOD V53 — Supabase User-State Synchronization

V53 adds durable cross-device synchronization for low-frequency user preferences without placing funds, trading authority, private keys, custody balances, BattlePool reserves, positions, or settlement truth inside Supabase.

## Scope

V53 synchronizes these settings sections:

- all six Markets and Movers category configurations, including independent Quick Buy, Quick Long, and Quick Short amount/leverage presets;
- the saved terminal workspace, including up to three left-docked non-trading sidecars;
- liked-token state;
- watchlists;
- per-market alert rules and a bounded recent alert history;
- terminal display and workspace preferences already stored inside the saved layout.

Local storage remains active on every device. When Supabase is unavailable or not configured, the terminal continues operating in `local-only` mode and does not block the interface.

## Settings-only recovery identity

Each browser creates:

- a random 256-bit settings recovery key beginning with `ph53_`;
- a random device UUID;
- a local V53 settings document.

The recovery key is sent only to the same-origin `/api/v53/user-state` route. The API hashes it with SHA-256, derives a deterministic profile UUID, and stores only the hash in Postgres.

The recovery key can restore or modify settings. It cannot:

- sign a spot or leveraged order;
- authorize a session key;
- submit a sequencer command;
- close a position;
- withdraw funds;
- access an owner wallet or seed phrase;
- alter BattlePool settlement state.

A future verified-wallet identity layer may bind this settings profile to a wallet, but the settings key must remain separate from financial authority.

## Conflict model

The top-level state document has version `53` and contains independently timestamped sections:

```json
{
  "version": 53,
  "sections": {
    "terminal-layout-v1": {
      "updatedAt": 1785110400000,
      "value": {}
    }
  }
}
```

Postgres assigns a monotonically increasing snapshot revision. Writes include the expected revision:

1. concurrent first writes use `ON CONFLICT DO NOTHING` and return the canonical winner as a normal conflict instead of raising a unique-key failure;
2. matching revision → save the complete normalized document and increment the revision;
3. stale revision → return HTTP 409 with the canonical remote document;
4. browser merges each section independently using the newest `updatedAt` value;
5. merged state is retried against the new revision.

This avoids one device overwriting an unrelated setting changed on another device. It is not used for high-frequency market or financial data.

## Database security boundary

Run:

```text
supabase/v53_user_state.sql
```

The migration creates:

- `perphood_v53_profiles`;
- `perphood_v53_user_state`;
- `perphood_v53_devices`;
- `perphood_v53_state_events`;
- `perphood_v53_save_user_state(...)`.

RLS is enabled and no browser policies are created. The RPC function is revoked from `public`, `anon`, and `authenticated`; only `service_role` receives execute permission. The service-role key must remain server-only.

The application caps the normalized settings snapshot at 256 KiB. This path is designed for low-frequency settings and is not the event stream or execution ledger for the 100K–1M-user architecture.

## Environment

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
V53_USER_STATE_ENABLED=true
```

`NEXT_PUBLIC_SUPABASE_URL` is public configuration. `SUPABASE_SERVICE_ROLE_KEY` is secret and must never be prefixed with `NEXT_PUBLIC_` or committed to Git.

Set `V53_USER_STATE_ENABLED=false` to force local-only mode even when Supabase credentials are present.

## Operations

The profile sidebar shows sync status, revision, section count, and recovery controls. The internal console is available at:

```text
/admin/user-state
```

It displays the local device, remote revision, persisted sections, recovery-key controls, and the explicit settings-only authority boundary.

## Scale boundary

The V53 snapshot design is appropriate for preferences because writes are infrequent and small. It is not appropriate for trades, candles, live PNL, orders, positions, or market events. Those remain assigned to the partitioned execution, event bus, indexer, and streaming architecture defined by V52.

Before production, this endpoint still requires distributed rate limiting, abuse prevention, connection pooling, backups, retention policies, verified-wallet profile binding, and operational monitoring.
