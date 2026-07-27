# leverage X V60 — Robinhood Chain Mainnet Canary Control

**leverage X** is a Robinhood Chain-first memecoin launch and Spot × Perps terminal. V60 preserves the professional Launch Token workspace and non-modal terminal UI, then adds the controlled owner-only path for the first real mainnet canary market.

**Current truth:** this package does not deploy a factory, create a token, open trading, or move funds by itself. It prepares a factory that deploys CLOSED and globally PAUSED, then allows exactly one configured creator and exactly one capped Spot market through explicit local owner transactions. Public launching and all Long/Short functionality remain disabled.

## Start here

- `LEVERAGEX_MASTER_SPEC.md` — combined PerpHood 1–3 / leverage X specification
- `V60_BUILD_NOTES.md` — V60 scope and safety boundaries
- `V60_MAINNET_CANARY_RUNBOOK.md` — exact first-market sequence
- `.env.mainnet.example` — secret-free local configuration template
- `V59_MAINNET_RUNBOOK.md` — factory preflight/deployment details

## Application validation

```bash
npm install
npm run test:v60-fast
npm run build
```

## Mainnet sequence

With Foundry installed and `.env.mainnet.local` configured:

```bash
npm run chain:v59:preflight
npm run chain:v59:deploy
npm run chain:v59:verify
npm run chain:v60:canary:preflight
```

No command above opens public trading. Owner-writing commands require exact confirmation phrases and an encrypted local Foundry keystore.

Never store a wallet private key, keystore password, Alchemy endpoint, or seed phrase in GitHub, Vercel, Supabase, browser code, screenshots, or chat.
