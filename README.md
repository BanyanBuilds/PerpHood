# leverage X V62 — Mainnet Go-Live Gate

**leverage X** is a Robinhood Chain-first memecoin launchpad and Spot × Perps terminal. V62 connects the finished launch experience to an authoritative, proof-driven mainnet release sequence: production storage readiness, closed/paused factory deployment, one allowlisted creator, one paused first market, public transaction proof, and capped Spot activation only after the chain and Supabase agree.

**Current truth:** this package does not deploy a factory, launch a token, open public trading, or move funds by itself. Owner-writing actions remain local, confirmation-locked, and encrypted-keystore based. Long/Short remains disabled until the BattlePool is separately deployed, validated, and activated.

## Start here

- `LEVERAGEX_MASTER_SPEC.md` — combined PerpHood 1–3 / leverage X specification
- `V62_BUILD_NOTES.md` — V62 scope and safety boundaries
- `V62_MAINNET_LAUNCH_RUNBOOK.md` — exact first-mainnet-launch sequence
- `V62_VALIDATION.md` — completed checks and environment limitations
- `.env.mainnet.example` — secret-free local configuration template
- `/admin/go-live` — read-only operator console after deployment

## Application validation

```bash
npm install
npm run test:v62-fast
npm run build
```

## Read-only go-live preflight

With Foundry installed and `.env.mainnet.local` configured:

```bash
npm run chain:v62:go-live-preflight
```

This command checks Robinhood Chain, both operator wallets, Supabase media/registry access, and the current factory state. It signs and broadcasts **zero transactions**.

## Controlled mainnet sequence

```bash
npm run chain:v59:preflight
npm run chain:v59:deploy
npm run chain:v59:verify
npm run chain:v60:canary:preflight
```

After the allowlisted creator launches the first paused market, record its public transaction hash locally and run:

```bash
npm run chain:v62:first-launch-proof
```

Capped Spot cannot open until the proof matches the deployed factory, token, market, metadata, fixed one-billion supply, and canonical Supabase registry row. Public launches and Long/Short remain locked.

Never store a wallet private key, seed phrase, keystore password, Alchemy endpoint, or Supabase service-role key in GitHub, Vercel browser variables, screenshots, or chat.
