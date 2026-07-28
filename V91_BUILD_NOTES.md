# V91 — Vercel Production Build Fix

- Fixed the ethers v6 dynamic contract typing failure in `lib/v80-deployment.ts`.
- Calls `bindFactory` through `BaseContract.getFunction("bindFactory")`, which is supported for ABI-loaded `ContractFactory.deploy()` return values.
- Preserves the deployment transaction, confirmation wait, and receipt checks.
- Includes the prior V89 protocol stats and V90 SQLite typing fix.
