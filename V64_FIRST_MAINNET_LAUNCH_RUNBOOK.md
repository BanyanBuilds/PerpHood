# leverage X V64 — First Robinhood Chain Mainnet Launch Runbook

V64 converts the V63 GMGN compatibility surface into one controlled, publicly provable launch. The factory bytecode remains the V63 contract candidate; V64 adds the release tooling and evidence gates without changing the factory immediately before deployment.

## Non-negotiable launch posture

- Robinhood Chain mainnet only: chain ID `4663`.
- The factory deploys `CLOSED`, globally paused, with future markets paused.
- One allowlisted creator may launch one market.
- The first market is born paused.
- Public launches remain disabled.
- Long/Short remains disabled.
- Owner, creator, and trader signing occurs locally from encrypted Foundry keystores—not Vercel, Supabase, or browser server routes.
- An official GMGN label is never claimed until GMGN accepts the integration.

## Phase 0 — application compiler gate

```powershell
npm install
npm run test:v64-fast
npm run build
```

Push only after all three commands pass. Then open:

- `/admin/first-launch`
- `/api/v64/first-launch-readiness`
- `/admin/gmgn`

## Phase 1 — local environment

```powershell
Copy-Item .env.mainnet.example .env.mainnet.local
notepad .env.mainnet.local
```

Add the private Alchemy HTTPS endpoint and existing Supabase values. Never commit `.env.mainnet.local`.

Create encrypted local keystores:

```powershell
cast wallet import leveragex-deployer --interactive
cast wallet import leveragex-creator --interactive
cast wallet import leveragex-trader --interactive
```

The expected public addresses are:

- Deployer/creator: `0x728fa84C70f7b88Ab59C86379745FdDBbDd7AD07`
- First trader: `0x1728DC75f70070DC74Ae2172EF94970e04D9830C`

Do not send private keys or seed phrases anywhere.

## Phase 2 — compile, test, and estimate the factory

```powershell
npm run chain:v64:factory:preflight
```

This command:

- checks chain ID `4663` and a fresh RPC head;
- compiles `LeverageXLaunchFactoryV63`, `LeverageXSpotMarketV63`, and `LeverageXTokenV63`;
- runs the V63 Foundry tests;
- checks EIP-170/EIP-3860 bytecode limits;
- estimates deployment gas and writes `deployments/v63-mainnet-preflight.json`;
- signs and broadcasts nothing.

Fund only the reported shortfall plus a small operational cushion, then rerun the preflight.

## Phase 3 — closed/paused factory deployment

Set only for the deliberate run:

```env
V59_MAINNET_DEPLOY_CONFIRM=DEPLOY_LEVERAGE_X_MAINNET_CLOSED_AND_PAUSED
```

Then:

```powershell
npm run chain:v64:factory:deploy
npm run chain:v64:factory:verify
```

The deploy script refuses to continue unless the signer, chain, balance, bytecode, owner, launch mode, pause state, and zero-market state agree. Import the generated public environment block from `deployments/v63-vercel-public.env` into Vercel and redeploy.

## Phase 4 — configure one creator

```powershell
npm run chain:v60:canary:preflight
```

After reviewing it, set:

```env
V60_CANARY_CONFIGURE_CONFIRM=CONFIGURE_LEVERAGE_X_MAINNET_CANARY_ALLOWLIST
```

Then:

```powershell
npm run chain:v60:canary:configure
```

Import `deployments/v60-vercel-canary.env` into Vercel and redeploy.

## Phase 5 — prepare the first token

Use the live Launch Token sidecar to upload the required image/GIF and produce a public metadata document, or use an already published metadata document from the same Supabase bucket. Put the exact values into `.env.mainnet.local`:

```env
V64_TOKEN_NAME=Example Name
V64_TOKEN_SYMBOL=EXAMPLE
V64_TOKEN_METADATA_URI=https://...
V64_CREATOR_TOTAL_SPEND_ETH=0.001
```

The name and ticker must exactly match the metadata JSON. The image is required. Description and social links remain optional. Migration target, supply, and curve parameters are protocol-controlled.

Run the zero-transaction launch preflight:

```powershell
npm run chain:v64:first-token:preflight
```

It verifies metadata, computes its SHA-256 hash, estimates the launch transaction, reserves estimated network gas from the creator-selected total spend, and reports the creator buy remainder.

## Phase 6 — launch exactly one paused token

Set only for the deliberate creator run:

```env
V64_FIRST_TOKEN_LAUNCH_CONFIRM=LAUNCH_FIRST_LEVERAGE_X_MAINNET_TOKEN
```

Then:

```powershell
npm run chain:v64:first-token:launch
```

Do not rerun after a transaction hash appears. The command writes:

- `deployments/v64-first-token-launch.json`
- `deployments/v64-vercel-launch.env`

Import the public environment values into Vercel and redeploy.

## Phase 7 — prove and register the launch

Apply the V63 Supabase migration before this phase if it has not already been applied:

```text
supabase/v63_gmgn_compatibility.sql
```

Set the launch transaction hash generated above, then run:

```powershell
npm run chain:v64:first-launch-proof
npm run chain:v63:gmgn:backfill
```

The proof verifies the receipt, token, market, fixed supply, metadata hash, public metadata document, creator, factory links, and canonical Supabase launch record.

## Phase 8 — open only the capped Spot canary

Set:

```env
V60_CANARY_OPEN_CONFIRM=OPEN_FIRST_LEVERAGE_X_MAINNET_SPOT_CANARY
V60_CANARY_MARKET_ADDRESS=0x...
```

Then:

```powershell
npm run chain:v64:open-spot
```

Public token creation remains disabled. Future markets remain paused.

## Phase 9 — outside-wallet buy and sell

Set only for the deliberate trader run:

```env
V64_TRADER_ROUNDTRIP_CONFIRM=RUN_FIRST_LEVERAGE_X_MAINNET_TRADER_ROUNDTRIP
V64_TRADER_BUY_ETH=0.001
V64_TRADER_SELL_BPS=2500
```

Then:

```powershell
npm run chain:v64:trader:roundtrip
```

The script performs one capped buy, one exact approval, and one partial sell from the separate trader wallet. It writes the public transaction evidence into `deployments/v64-trader-roundtrip.json` and `deployments/v64-vercel-roundtrip.env`.

## Phase 10 — GMGN evidence and onboarding

Import the generated transaction hashes into Vercel and redeploy. Then run:

```powershell
npm run gmgn:evidence:v64
```

The command refuses to generate the final package unless the public manifest and per-token discovery URL resolve the same real token and market. It writes:

- `deployments/v64-gmgn-canary-evidence.json`
- `deployments/V64_GMGN_ONBOARDING_MESSAGE.md`
- `deployments/v64-vercel-evidence.env`

Test the direct URL:

```text
https://gmgn.ai/robinhood/token/<TOKEN_ADDRESS>
```

Record what GMGN resolves automatically. Then send GMGN the onboarding message, factory address, deployment block, ABIs, event topics, token/market addresses, launch transaction, buy transaction, and sell transaction.

## Emergency stop

At any unexpected state:

```powershell
npm run chain:v60:emergency-lockdown
```

Do not continue until the factory and market are visibly paused on-chain.
