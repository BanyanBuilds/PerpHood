# leverage X V64 validation

## Completed in the packaged build

- V64 first-mainnet-launch smoke: **20/20 passed**.
- V63 GMGN compatibility smoke: **25/25 passed**.
- V62 go-live regression: **11/11 passed** after allowing the current V64 versioned launch routes.
- V61 launchpad + How It Works regression: **20/20 passed**.
- V60 canary controls: **36/36 passed**.
- V60 Vercel nullability regression: **7/7 passed**.
- V59 deployment-preflight smoke: **37/37 passed**.
- V58 launcher UI regression: **21/21 passed**.
- V57 profile drawer regression: **15/15 passed**.
- V56 mainnet-candidate regression: **26/26 passed**.
- V55 Vercel regression: **12/12 passed**.
- TypeScript/TSX syntax smoke: **371 files passed**.
- Strict semantic TypeScript compilation for all new V64 local deployment/evidence scripts: **passed**.
- Isolated strict semantic TypeScript compilation for the V64 server routes and operator console: **passed**.
- Repository scan found no populated Alchemy endpoint or private-key assignment.

## Mandatory external gates not claimed here

The execution environment could not complete a clean npm dependency installation, and Foundry is unavailable. Therefore this package does **not** claim that either of these has run here:

```bash
npm run typecheck
npm run build
npm run chain:test:v63
```

Run them on the development machine and in Vercel before any signing step.

## First safe local sequence

```bash
npm install
npm run test:v64-fast
npm run build
npm run chain:test:v63
npm run chain:v64:factory:preflight
```

The factory and first-token preflight commands do not sign or broadcast. Signing remains locked behind exact confirmation phrases and local creator/trader keystores.

## Truth boundary

V64 packages the full deployment, first-token, separate-wallet Spot roundtrip, public discovery, and GMGN evidence workflow. It does not claim that a factory, token, trade, GMGN token page, or official GMGN launchpad label exists until public receipts and GMGN itself prove those outcomes.
