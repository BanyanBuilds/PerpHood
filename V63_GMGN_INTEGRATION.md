# leverage X V63 — GMGN Integration Runbook

## Before deployment

1. Install dependencies and run `npm run test:v63-fast`.
2. Run `npm run build` and confirm the Vercel production build is green.
3. Install Foundry and run `npm run chain:test:v63`.
4. Configure `.env.mainnet.local` with the private Robinhood Chain RPC and encrypted-keystore settings.
5. Run `npm run chain:v63:preflight`. This must report chain ID 4663, the expected deployer, passing contract tests, valid bytecode sizes, and the deployment funding estimate.

## Deploy and verify

The factory deployment is owner-controlled and begins closed/paused.

1. Fund only the dedicated deployer with the reviewed amount.
2. Run `npm run chain:v63:deploy` with the exact deployment confirmation phrase.
3. Run `npm run chain:v63:verify`.
4. Confirm the deployed runtime bytecode matches the compiled artifact.
5. Record the factory address and deployment block in Vercel and `.env.mainnet.local`.
6. Apply `supabase/v63_gmgn_compatibility.sql` in Supabase.

## First canary launch

1. Configure only the approved creator wallet.
2. Launch one token with name, ticker, required artwork, optional description/socials, and a small creator buy.
3. Keep the new market paused until the launch proof passes.
4. Confirm the token, market, creator, total supply, metadata hash, transaction receipt, and Supabase registry all agree.
5. Open capped Spot trading and execute small creator/trader buys and a trader sell.

## Generate the handoff

```bash
npm run chain:v63:gmgn:backfill
npm run gmgn:package:v63
```

Collect:

- verified factory address and deployment block;
- factory/token/market ABIs;
- `TokenLaunched`, `MarketCreated`, `Trade`, and `TokenGraduated` signatures/topics;
- public manifest and launch-feed URLs;
- first token, market, creator, launch transaction, buy transaction, and sell transaction;
- pricing reads before graduation;
- canonical pool mapping after graduation;
- historical replay instructions.

## GMGN test

1. Paste the first token contract address into GMGN Robinhood Chain search.
2. Record whether GMGN resolves the ERC-20 metadata, chart, price, liquidity, and executable market.
3. If the token is visible but the custom bonding market is not priced, send the complete integration package for a launchpad adapter.
4. Request the official **leverage X** launchpad attribution only after the factory and sample lifecycle are publicly verifiable.

## Important limitation

Before graduation, leverage X uses its own native-ETH bonding market. After graduation, `TokenGraduated` points indexers to the external canonical pool. Automatic GMGN chart/trading support for the custom pre-graduation market is not guaranteed until GMGN recognizes the adapter or leverage X migrates into a standard supported pool.
