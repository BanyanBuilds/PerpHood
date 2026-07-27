# V55 Vercel Deployment Fix

## Failure addressed

The latest Vercel build compiled the application but failed during TypeScript checking because `TerminalOrderBook` sent `"sell"` to a callback typed with the project’s `Direction` union (`"buy" | "long" | "short"`). The same build also reported filesystem/dynamic path tracing through the V46 orders route.

## Changes

- `components/TerminalOrderBook.tsx`
  - Added a local `SpotAction = "buy" | "sell"` type.
  - Typed the Spot order-book callback with `SpotAction`.
- `lib/server/v47-order-store.ts`
  - Removed filesystem and path imports.
  - Removed the one-time V46 JSON migration from the production request module.
- `lib/server/v47-order-migration.ts`
  - Added a worker-only migration module containing the legacy JSON import.
- `scripts/v47-indexer-worker.mts`
  - Imports the migration from the isolated worker-only module.
- `scripts/v55-vercel-deploy-fix-smoke.mts`
  - Added 12 regression assertions for the type boundary and production import graph.
- `package.json`
  - Added `test:v55-vercel` and included it in `test:v55-fast`.

## Verification

```bash
npm run test:v55
```

passes the full portable V55 release suite after the change. On a machine with dependencies available, the final deployment gate remains:

```bash
npm ci
npm run test:v55-fast
npm run build
```
