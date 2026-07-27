# PERPHOOD V51 Vercel deployment repair

This repair addresses the production TypeScript failures exposed by the first clean Vercel build.

## Corrected

- Expanded the realtime-frame source type so V43 wallet, V45 account/session, and launchpad frames are valid.
- Corrected browser spot-entry pricing to use the sequenced spot execution's final price.
- Removed an undefined `setSelectedToken` call from the terminal clipboard search flow.
- Added an explicit execution-mode union annotation to the V45 account-ledger model.
- Removed duplicate object keys from the demo market fixture.
- Made chart volume-series initialization null-safe and explicitly typed dynamic price lines.
- Made outside-click dismissal support mixed HTML element refs safely.
- Scoped the V47 SQLite path for Vercel's writable `/tmp` filesystem and annotated the dynamic local path for Turbopack tracing.
- Added a GitHub Actions build check that runs the portable V51 guards and the real Next.js production build.

## Deployment behavior

Vercel is still only a frontend/development preview. Local SQLite data on Vercel lives in `/tmp` and is ephemeral. The future durable production database remains Postgres/Supabase.
