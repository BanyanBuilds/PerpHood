# LEVERAGE X V43 Validation

## Completed in this package

```bash
npm run test:v43
```

Result: **PASS**.

The command runs the complete inherited V21–V42 dependency-free regression chain, then V43-specific validation:

- mixed spot, long, short, and close engine path;
- one-billion-token conservation;
- zero bad debt in the controlled mixed close path;
- V43 contract requirement and brace/static checks;
- deterministic V43 factory calldata and event decoding;
- short-repayment headroom requirement;
- creator-perps restriction requirement;
- migration position/bad-debt gate requirement;
- Launcher V43 transaction integration;
- live unified-state sandbox integration;
- health/config reporting;
- TypeScript/TSX syntax across 186 files.

The inherited suite also includes 18,750 randomized BattlePool actions, parameter sweeps, long and short cascades, fixed-point curve differential checks, ordered event-stream checks, session authorization checks, and all terminal UI regressions through V42.

## Not executed in this environment

```bash
npm run chain:test:v43
npm run build
```

Foundry and local project dependencies were not installed in the build environment used to assemble this ZIP. Solidity source/tests and the Foundry configuration are included, but V43 must be compiled and its Foundry tests run on the development machine before treating the contract as executable evidence. The Next.js production build likewise requires `npm install` first.

## Required local validation

```bash
npm install
npm run test:v43
npm run build
npm run chain:test:v43
```

Then start Anvil and exercise the actual local chain:

```bash
npm run chain:anvil
# second terminal
npm run chain:v43
npm run chain:v43:status
```

No V43 contract is audited. Never use it with public funds.
