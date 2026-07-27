# leverage X V58 — Mainnet Launch Token UI

**leverage X** (`leverageX.fun`) is a Robinhood Chain-first memecoin launch and Spot × Perps terminal. V58 keeps the controlled V56 mainnet-candidate contract posture, preserves the V57 non-modal account drawer, and replaces the old launch form with a professional **Launch Token** workspace.

**Current truth:** this ZIP does not deploy the Robinhood Chain mainnet factory. The V56 factory remains designed to deploy in `Closed` mode with global trading paused, new markets paused, and canary trade caps. The V58 launcher will not fabricate a launch when the verified factory address is missing.

## Start here

- `LEVERAGEX_MASTER_SPEC.md` — combined PerpHood 1–3 / leverage X specification
- `V58_BUILD_NOTES.md` — current Launch Token and vector-identity changes
- `V56_MAINNET_CANDIDATE.md` — mainnet deployment controls
- `LEVERAGEX_TAKEOVER_AUDIT_V55.md` — inherited implementation audit
- `V55_VERCEL_DEPLOY_FIX.md` — prior Vercel repair

## Validate

```bash
npm install
npm run test:v58-fast
npm run build
```

With Foundry installed:

```bash
npm run chain:test:v56
npm run chain:v56:preflight
```

Deployment and administration commands remain deliberately locked behind local confirmations. Never store a wallet private key in GitHub, Vercel, Supabase, or chat.
