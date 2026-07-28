# leverage X V63 — Validation

## Completed in the build environment

- V55 real-terminal regression: 70/70.
- V55 Vercel regression: 12/12.
- V56 mainnet candidate: 26/26.
- V57 profile drawer: 15/15.
- V58 Launch Token UI: 21/21.
- V59 mainnet preflight static gate: 37/37.
- V60 canary controls: 36/36.
- V60 Vercel nullability: 7/7.
- V61 launchpad + How It Works: 20/20.
- V62 go-live gate: 11/11.
- V63 GMGN compatibility: 25/25.
- TypeScript/TSX syntax parsing: 358 files.
- GMGN integration-package generation: passed.
- Public versioned ABI assets and event-topic manifest: passed.
- GMGN onboarding submission template: packaged.
- Changed V63 application modules: semantic TypeScript check with local dependency stubs passed.

## Not completed in this environment

- `npm ci`, full `tsc --noEmit`, and `next build`: blocked because the package gateway did not have `zod-validation-error@4.0.2` cached and returned an installation error.
- Foundry compile/test: `forge` is not installed in this environment.
- Mainnet deployment, source verification, token launch, Spot trades, GMGN discovery, and GMGN onboarding: not performed.

## Mandatory external gates

```bash
npm install
npm run test:v63-fast
npm run build
npm run chain:test:v63
npm run chain:v63:preflight
```

Do not deploy if any gate fails.
