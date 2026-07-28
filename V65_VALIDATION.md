# leverage X V65 Validation

## Completed in the build environment

- V65 GMGN live-pool static controls: 32/32 passed.
- V63 GMGN compatibility regression: 25/25 passed.
- V64 first-mainnet-launch regression: 20/20 passed.
- TypeScript/TSX syntax validation: 395 files passed.
- Selected V65 scripts, chain client, server modules, and API routes passed strict semantic TypeScript validation using the available global TypeScript compiler and local dependency shims.
- Graduation now requires a 15-minute pool-oracle TWAP in addition to the current terminal tick; the static contract test suite includes a one-block manipulation rejection case.
- V65 GMGN operator console passed isolated strict semantic TypeScript validation.
- Public V65 ABI JSON files parse successfully.
- Secret scan and ZIP-integrity checks are required again on the final packaged artifact.

## Not completed in this environment

- `npm install` could not complete because the package gateway returned HTTP 503.
- Full `tsc --noEmit` and `next build` therefore did not run with the project’s real dependency tree.
- Foundry, `forge`, `cast`, and `solc` are unavailable in this container.
- The V65 Solidity contract has not yet been compiled or executed here.
- No Robinhood Chain mainnet transaction was signed or broadcast.
- No token/pool has been tested on GMGN yet.

## Mandatory external gates

1. Clean `npm install`.
2. `npm run test:v65-fast`.
3. `npm run build`.
4. `npm run chain:test:v65`.
5. `npm run chain:v65:preflight`.
6. Review bytecode sizes, gas report, DEX code checks, and funding recommendation.
7. Closed factory/locker deployment and Blockscout verification.
8. One-token canary launch and separate-wallet buy/sell.
9. Pool-event backfill and GMGN contract search.
10. Independent smart-contract security review before public launch creation.
