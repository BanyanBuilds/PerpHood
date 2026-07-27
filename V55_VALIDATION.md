# Leverage X V55 Validation

## Portable suite

`npm run test:v55` passed with exit code 0.

Evidence retained:

- P1/P2/P3 Markets/Movers preset guard: 13/13
- Three-left-sidecar guard: 13/13
- Exact curve vectors: 3,001
- Short settlement scenarios: 20
- Close-order permutations: 24
- Fee-fragmentation vectors: 96
- Oscillation cycles: 500
- Stateful adversarial transitions: 24,576
- Liquidations inside the V50 stateful campaign: 2,747
- Mixed-portfolio close permutations: 5,760
- V51 stale-ordering assault: PASS
- V53 user-state merge/recovery: PASS
- V55 real terminal assertions: 70/70
- Package and lockfile identity: Leverage X V55
- TypeScript/TSX syntax: 305 files

## Production build boundary

A clean dependency installation could not complete in the assembly container because its internal npm gateway returned HTTP 503 for registry packages. Therefore, the Next.js production build is not claimed as executed here. The included GitHub workflow and Vercel deployment must run `npm ci`, `npm run test:v55-fast`, and `npm run build` after push.

## Contract boundary

Forge/Anvil/Cast were unavailable here. Solidity compilation, Foundry tests, contract deployment, explorer verification and browser-wallet minting remain the next controlled steps. Public funds and mainnet remain locked.
