# Leverage X V59 Mainnet Runbook

## 1. Local environment

Copy `.env.mainnet.example` to `.env.mainnet.local` and paste the private Alchemy **HTTPS** endpoint into `ROBINHOOD_MAINNET_RPC_URL`.

Do not use a WebSocket URL for deployment. Do not put a signing key in Vercel.

## 2. Install Foundry

Use the official Foundry installer inside WSL/Ubuntu on Windows, then confirm `forge --version` and `cast --version`.

## 3. Import the deployer securely

Preferred:

```bash
cast wallet import leveragex-deployer --interactive
```

The imported key must resolve to:

```text
0x728fa84C70f7b88Ab59C86379745FdDBbDd7AD07
```

Set `V59_KEYSTORE_PASSWORD_FILE` only to an absolute file outside the project if using the automated deploy command. The fallback `V59_DEPLOYER_PRIVATE_KEY` is local-only and must never be committed.

## 4. Run preflight

```bash
npm run chain:v59:preflight
```

This compiles, tests, checks bytecode limits, probes chain ID 4663, and writes the buffered funding target without broadcasting.

## 5. Fund only after the estimate

Use `deployments/v59-mainnet-preflight.json` as the estimate source. Rerun preflight after funding. Do not proceed until `fundedForBufferedEstimate` is true.

## 6. Deliberate deployment

Set locally:

```text
V59_MAINNET_DEPLOY_CONFIRM=DEPLOY_LEVERAGE_X_MAINNET_CLOSED_AND_PAUSED
```

Then run:

```bash
npm run chain:v59:deploy
```

The deployed factory must report:

- launch mode: closed
- global trading paused: true
- new markets paused: true
- market count: 0
- owner: confirmed deployer/owner address

## 7. Verify source

```bash
npm run chain:v59:verify
```

Review the contract and constructor argument on Robinhood Chain Blockscout.

## 8. Add public values to Vercel

After explorer review, import `deployments/v59-vercel-public.env`. It intentionally keeps mainnet UI activation false.

## 9. Stop

Do not open allowlist launching, unpause trading, or enable the website. The next release must wire the indexer and Supabase registry to the exact verified factory deployment first.
