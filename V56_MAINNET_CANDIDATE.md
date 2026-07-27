# leverage X V56 — Mainnet Candidate

V56 prepares the project for a controlled Robinhood Chain mainnet rollout without a public testnet deployment.

## Safety state at deployment

The V56 factory deploys with:

- launch mode `Closed`
- global trading paused
- every new market paused by default
- a 0.01 ETH maximum canary buy
- a 5,000,000-token maximum canary sell
- two-step ownership transfer
- Spot only; public Long/Short remains disabled

No deployment command automatically opens launches or trading.

## Commands

```bash
npm run test:v56-fast
npm run chain:v56:preflight
npm run chain:v56:mainnet
npm run chain:v56:admin -- status
```

The private deployer/owner keys are local shell secrets only. They must never be committed or stored in Vercel or Supabase.
