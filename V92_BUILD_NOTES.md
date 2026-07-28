# V92 — Production Deployment Gate

- Fixed the same ethers v6 dynamic-contract typing issue in `lib/v81-deployment.ts` that had already been fixed in V80.
- Both deployment paths now call `bindFactory` through `BaseContract.getFunction("bindFactory")`.
- Added `test:v92`, a regression gate that fails if either deployment module reintroduces an untyped direct `locker.bindFactory(...)` call.
- Preserves V89 protocol stats, V90 SQLite typing, V91 deployment behavior, BattlePool logic, launch mechanics, and immediate-perps-at-mint behavior.
