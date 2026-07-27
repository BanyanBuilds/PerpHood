# LEVERAGE X V53 Build Notes

## Milestone

V53 connects LEVERAGE X's user-facing preferences to a settings-only Supabase/Postgres synchronization layer with automatic local fallback.

## Added

- `UserStateProvider` at the application root.
- Versioned, section-based V53 user-state document utilities.
- 256-bit settings recovery keys and independent device IDs.
- Same-origin `GET`/`PUT /api/v53/user-state` route.
- SHA-256 recovery-key hashing and deterministic profile IDs.
- Optimistic remote revisions and HTTP 409 conflict recovery.
- Race-safe concurrent first-write handling in Postgres.
- Newest-section-wins cross-device merge behavior.
- 650 ms debounced remote writes and manual Sync Now.
- 256 KiB normalized payload limit.
- Supabase migration with profiles, snapshots, devices, audit events, RLS, and service-role-only RPC access.
- Terminal-layout and all category-preset synchronization.
- Three-left-sidecar saved-workspace synchronization.
- Likes, watchlists, and per-market alert synchronization.
- Profile-menu copy/import recovery controls.
- `/admin/user-state` operations console.
- `V53_USER_STATE_ENABLED=false` local-only override.
- GitHub build gate upgraded to `test:v53-fast` plus `next build`.

## Preserved

- No trading sidecar on Markets or Movers.
- Quick Buy executes in place.
- Quick Long and Quick Short submit only explicitly enabled independent presets.
- Up to three non-trading sidecars remain docked on the left.
- A fourth left-dock request floats instead of compressing the page.
- BattlePool contracts remain the only intended financial settlement authority.
- Existing local storage remains the offline fallback.
- V49–V51 settlement, liability, fee, and stale-quote guards remain unchanged.

## Security boundary

The V53 recovery key is a capability for settings only. Anyone possessing it can change synchronized preferences, so it should still be protected, but it cannot move funds or authorize execution. The server stores only its SHA-256 hash.

The V53 API currently remains an unauthenticated capability endpoint and has no distributed rate limiter. Before production it requires abuse controls, wallet-profile verification, pooling, backups, and monitoring.

## Known unexecuted checks in this assembly environment

- Next.js production build, because dependencies could not be installed in this container.
- Live Supabase migration and REST/RPC round trip.
- Browser E2E across two real devices.
- Forge, Anvil, and Cast campaigns.

The Vercel/GitHub build gate is configured to run the dependency-backed production build after the project is pushed.
