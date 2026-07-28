# leverage X V65 — GMGN Live Pool

V65 is the current authoritative project baseline. Every V65 launch creates a standard fixed-supply ERC-20 and a canonical token/WETH Uniswap V3 pool in the first confirmed launch transaction, then publishes deterministic factory attribution and standard pool events for external indexers.

## Current truth

- Mainnet target: Robinhood Chain (`4663`).
- Factory deployment: not yet performed.
- Public launching: disabled.
- Real Spot: wired for V65 canonical pools, pending first deployed canary.
- GMGN: technical integration surface built; real token test and official launchpad onboarding still pending.
- Real Long/Short: intentionally disabled until the separate BattlePool phase is audited.

## Immediate commands

```powershell
npm install
npm run test:v65-fast
npm run build
npm run chain:test:v65
npm run chain:v65:preflight
```

Read `V65_MAINNET_RUNBOOK.md`, `V65_GMGN_LIVE_POOL.md`, and `V65_VALIDATION.md` before any deployment.

---


**leverage X** is a Robinhood Chain memecoin launchpad and Spot × Perps terminal. V64 turns the V63 GMGN compatibility surface into a controlled first-mainnet-launch workflow: deploy closed/paused, launch one paused token, prove one separate-wallet Spot buy/sell, and generate the real GMGN onboarding package.

## V64 start here

```bash
npm install
npm run test:v64-fast
npm run build
```

Then follow `V64_FIRST_MAINNET_LAUNCH_RUNBOOK.md`. The read-only operator surface is `/admin/first-launch`; the public evidence endpoint is `/api/v64/gmgn/evidence`.

## Current truth

V63 is an integration-ready source package. It does **not** deploy the mainnet factory, launch a real token, create an external DEX pool, or guarantee an official GMGN launchpad label by itself. Those require the controlled deployment sequence, a real canary token with buys/sells, and GMGN onboarding.

The mainnet factory still deploys **closed**, **globally paused**, and with new markets paused. Public launching, public Spot trading, and Long/Short remain behind separate activation gates.

## V63 GMGN surface

- `LeverageXLaunchFactoryV63` with stable `TokenLaunched`, `MarketCreated`, and `TokenGraduated` events.
- Public factory reads: `getLaunchedToken`, `getTokenInfo`, `isLeverageXToken`, `tokenCount`, `allTokens`, and `graduationStatus`.
- Fixed-supply, taxless ERC-20 launches with public metadata URI and no hidden minting or blacklist.
- Canonical Robinhood wrapped-native token attribution.
- Public manifest and launch feeds:
  - `/api/v63/gmgn/manifest`
  - `/api/v63/gmgn/launches`
  - `/api/v63/gmgn/token/{address}`
  - `/.well-known/leveragex-launchpad`
- Reorg-aware historical factory backfill into Supabase.
- Self-contained handoff assets under `integrations/gmgn/`.
- Read-only operator page at `/admin/gmgn`.

## Validate the application

```bash
npm install
npm run test:v63-fast
npm run build
```

## Compile and test the contracts

Foundry is required:

```bash
npm run chain:test:v63
npm run chain:v63:preflight
```

`chain:v63:preflight` signs and broadcasts nothing.

## Controlled mainnet sequence

After all local and Vercel gates pass:

```bash
npm run chain:v63:deploy
npm run chain:v63:verify
npm run chain:v60:canary:preflight
```

Do not run the deployment command until the preflight output and deployer funding amount have been reviewed. Use an encrypted Foundry keystore; never put a private key in Vercel, GitHub, Supabase, browser code, screenshots, or chat.

## GMGN handoff sequence

After the verified factory and first real canary launch exist:

```bash
npm run chain:v63:gmgn:backfill
npm run gmgn:package:v63
```

Then test the token contract address directly in GMGN and provide GMGN the generated integration package, verified factory, deployment block, sample launch, and sample buy/sell transactions.

## Start here

- `LEVERAGEX_MASTER_SPEC.md`
- `V63_BUILD_NOTES.md`
- `V63_GMGN_INTEGRATION.md`
- `V63_VALIDATION.md`
- `V60_MAINNET_CANARY_RUNBOOK.md`
- `.env.mainnet.example`

## V74 Canary Evidence Pipeline
Use `START_V74_PREPARE_CANARY_METADATA.cmd` before launch and `START_V74_VERIFY_CANARY_LAUNCH.cmd` after the transaction confirms.
