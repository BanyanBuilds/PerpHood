# V90 — Vercel TypeScript Build Fix

This release fixes the strict Next.js 16 / TypeScript build failure in `lib/server/v87-live-state-store.ts`.

## Fix

- Imports `SQLInputValue` from the same built-in `node:sqlite` API used by the database layer.
- Types `marketArgs` and `posArgs` as `SQLInputValue[]` rather than `unknown[]`.
- Preserves the existing SQL queries and runtime behavior.

The original Vercel error was:

```text
Argument of type 'unknown' is not assignable to parameter of type 'SQLInputValue'.
```

No protocol mechanics, contracts, launch behavior, BattlePool behavior, or protocol-stat calculations were changed.
