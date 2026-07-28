# Leverage X V66 — Mainnet Execution Gate

V66 keeps `LeverageXLaunchFactoryV65` as the contract candidate and turns the project into a safer, reproducible path to the first real Robinhood Chain mint and GMGN discovery test.

## What changed

- The browser and operator CLI now use the same launch-budget rule.
- `0.001 ETH` means the **total transaction budget ceiling including gas**.
- The live maximum gas cost is reserved first; the remainder becomes `msg.value` for the creator genesis buy.
- The first-token preflight verifies chain ID, factory bytecode, canary state, canary creator, contract creator-buy cap, wallet balance, metadata, gas estimate, gas limit, and gas price.
- The launch command pins the preflight gas limit and gas-price ceiling, then reconciles actual gas cost and actual total spend from the confirmed receipt.
- The launch aborts if actual spend ever exceeds the signed total budget.
- A focused `.env.mainnet.example` replaces guesswork during operator setup.
- `npm run gate:v66` produces a zero-transaction readiness report.

## Current execution sequence

1. `npm ci`
2. `npm run gate:v66:strict`
3. `npm run chain:v65:preflight`
4. `npm run chain:v65:deploy`
5. `npm run chain:v65:verify`
6. `npm run chain:v65:configure-canary`
7. `npm run chain:v65:first-token:preflight`
8. `npm run chain:v65:first-token:launch`
9. `npm run chain:v65:trader:roundtrip`
10. `npm run chain:v65:gmgn:backfill`
11. `npm run gmgn:package:v65`

Steps 4, 6, 8, and 9 remain locked by exact confirmation phrases. Keep every confirmation variable blank until the immediately preceding read-only gate passes.

## Required operator inputs

These are not needed for static development. They become necessary only at the execution gate:

- A private Robinhood Chain mainnet HTTPS RPC endpoint.
- Foundry (`forge` and `cast`) installed locally.
- The encrypted local deployer keystore or a local-only private-key fallback.
- Enough ETH on the deployment/creator wallet for deployment, gas, and the selected canary budget.
- Final first-token name, ticker, HTTPS metadata URI, and SHA-256 metadata hash.
- A separate trader wallet with a small amount of ETH for the independent buy/sell proof.

Never put private keys in GitHub, Vercel, Supabase, screenshots, ZIPs, or chat.

## Destination

The immediate destination is one confirmed token contract with:

- a canonical token/WETH Uniswap V3 pool created in the same launch transaction;
- permanently locked launch liquidity;
- a real creator buy;
- a real independent-wallet buy and sell;
- public factory, token, pool, swap, and metadata evidence;
- direct GMGN contract discovery and a monitored New Pairs appearance test.

Automatic GMGN New Pairs placement is not claimed until the first canary is observed in GMGN's live index.
