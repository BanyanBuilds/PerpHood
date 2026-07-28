# leverage X V62 — Mainnet Go-Live Gate

V62 turns the existing closed/paused deployment tooling into one authoritative launch sequence.

## Added

- `/admin/go-live` full-stack operator console.
- `/api/v62/go-live-readiness` server-side readiness endpoint.
- Live checks for Robinhood Chain RPC, factory state, Vercel public/server factory consistency, canary wallet restriction, Supabase media bucket, registry writes, and public discovery reads.
- Versioned V62 metadata, launch-registry, and discovery endpoints.
- `chain:v62:go-live-preflight`, which signs and broadcasts nothing.
- `chain:v62:first-launch-proof`, which proves the first confirmed launch from its public transaction hash.
- Proof of token identity, one-billion supply, creator/factory/market links, metadata SHA-256, first-market state, and optional Supabase registry agreement.
- Explicit non-guarantee for GMGN indexing until GMGN resolves the deployed contract.

## Preserved safety

- Factory deployment remains closed and globally paused.
- The first creator remains allowlisted.
- The first market is created paused.
- Spot opens only through the owner-controlled capped canary command.
- Public launching and Long/Short remain locked.
- Vercel never receives a wallet private key and cannot sign owner transactions.
