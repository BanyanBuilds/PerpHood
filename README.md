# leverage X V56 — Robinhood Chain Mainnet Candidate

**leverage X** (`leverageX.fun`) is a Robinhood Chain-first memecoin launch and Spot × Perps terminal. V56 converts the current project into a controlled mainnet candidate while preserving V55 compatibility.

**Current truth:** the V56 factory is not deployed by this ZIP. Its deployment script creates a factory in `Closed` mode with global trading paused, new markets paused, and canary trade caps. Spot must be proven before perps can be activated.

## Start here

- `LEVERAGEX_MASTER_SPEC.md` — combined PerpHood 1–3 / leverage X specification
- `LEVERAGEX_TAKEOVER_AUDIT_V55.md` — inherited implementation audit
- `V56_MAINNET_CANDIDATE.md` — current deployment controls
- `V55_VERCEL_DEPLOY_FIX.md` — prior Vercel repair

## Validate

```bash
npm run test:v56-fast
```

With Foundry installed:

```bash
npm run chain:test:v56
npm run chain:v56:preflight
```

The deployment and admin commands are deliberately locked behind local environment confirmations. Never store a private key in GitHub, Vercel, Supabase, or chat.
