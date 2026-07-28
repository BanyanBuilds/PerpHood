# leverage X V62 — First Real Mainnet Launch Runbook

## Gate 1 — application build

```powershell
npm install
npm run test:v62-fast
npm run build
```

## Gate 2 — full-stack read-only preflight

Place private local values in `.env.mainnet.local`, then run:

```powershell
npm run chain:v62:go-live-preflight
```

This signs and broadcasts zero transactions.

## Gate 3 — factory

If no factory exists:

```powershell
npm run chain:v59:preflight
```

After reviewing its funding report, use the separately confirmed closed/paused deployment command, then verify the source. Never retry a broadcast until the deployer nonce and explorer are checked.

## Gate 4 — one-wallet canary

```powershell
npm run chain:v60:canary:preflight
```

Then deliberately configure the first creator using the V60 confirmation lock. Import the generated Vercel environment block and redeploy.

## Gate 5 — first token

Open Launch Token using the allowlisted creator wallet. Enter name, ticker, image/GIF, optional description/social links, and the total initial launch spend. The created market remains paused.

Copy the confirmed public launch transaction hash into `V62_FIRST_LAUNCH_TX_HASH` and run:

```powershell
npm run chain:v62:first-launch-proof
```

The proof command signs and broadcasts nothing.

## Gate 6 — capped Spot

Only after the launch proof and Supabase registry agree, set the first market address locally and run the deliberately confirmed V60 canary-open command. Public launches and Long/Short remain disabled.

## Operator page

After deployment, read the same state at:

```text
/admin/go-live
```
