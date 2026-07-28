# leverage X V65 — Closed Mainnet Canary Runbook

## 1. Local application gate

```powershell
npm install
npm run test:v65-fast
npm run build
```

## 2. Supabase migration

Run `supabase/v65_gmgn_live_pool.sql` in the existing project before enabling V65 launch registration or pool-event replay.

## 3. Foundry zero-transaction gate

```powershell
forge --version
cast --version
npm run chain:test:v65
npm run chain:v65:preflight
```

Do not fund or deploy until the generated `deployments/v65-mainnet-preflight.json` has been reviewed.

## 4. Closed deployment

Use an encrypted Foundry keystore. Set the deliberate confirmation only for the deployment process:

```powershell
$env:V65_MAINNET_DEPLOY_CONFIRM="DEPLOY_V65_CANONICAL_POOLS_CLOSED"
npm run chain:v65:deploy
Remove-Item Env:V65_MAINNET_DEPLOY_CONFIRM
npm run chain:v65:verify
```

Copy only the generated public values from `deployments/v65-vercel-public.env` to Vercel. Never put a private key or keystore password in Vercel.

## 5. One-creator canary

```powershell
$env:V65_CANARY_CONFIGURE_CONFIRM="ENABLE_ONE_V65_CANARY_CREATOR"
npm run chain:v65:configure-canary
Remove-Item Env:V65_CANARY_CONFIGURE_CONFIRM
```

## 6. First token

Set the public identity/metadata values in `.env.mainnet.local`, then:

```powershell
npm run chain:v65:first-token:preflight
$env:V65_FIRST_TOKEN_LAUNCH_CONFIRM="LAUNCH_FIRST_V65_GMGN_CANARY"
npm run chain:v65:first-token:launch
Remove-Item Env:V65_FIRST_TOKEN_LAUNCH_CONFIRM
```

Record the verified token and pool addresses.

## 7. Independent-wallet roundtrip

```powershell
$env:V65_TRADER_ROUNDTRIP_CONFIRM="RUN_V65_REAL_SPOT_ROUNDTRIP"
npm run chain:v65:trader:roundtrip
Remove-Item Env:V65_TRADER_ROUNDTRIP_CONFIRM
```

This proves a real buy, approval, sell, and WETH→ETH unwrap from the separate trader wallet.

## 8. Index and GMGN package

```powershell
npm run chain:v65:gmgn:backfill
npm run gmgn:package:v65
```

Paste the canary token address into GMGN, record what resolves, and attach the generated handoff folder to the onboarding request.

## 9. Do not open publicly yet

Public launch creation and real perps remain disabled until the canary evidence, recovery path, monitoring, and GMGN behavior have been reviewed.
