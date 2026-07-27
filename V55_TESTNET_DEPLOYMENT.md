# Leverage X V55 Controlled Testnet Deployment

This guide is for the next controlled milestone. Use a dedicated test wallet and Robinhood Chain testnet ETH only.

## 1. Database

Run these migrations in Supabase SQL Editor in order:

1. `supabase/v52_scale_foundation.sql`
2. `supabase/v53_user_state.sql`
3. `supabase/v55_production_launch.sql`

Confirm the `leveragex-token-media` bucket and `leveragex_v55_launches` table exist.

## 2. Local deployment environment

Create `.env.local` without committing it:

```env
ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
V55_DEPLOYER_PRIVATE_KEY=0x...
V55_FACTORY_OWNER=0x...
V55_VERIFY_CONTRACT=false
V55_ALLOW_MAINNET_DEPLOY=false
```

Never add `V55_DEPLOYER_PRIVATE_KEY` to Vercel.

## 3. Compile and test

```bash
forge build --contracts contracts/src
npm run chain:test:v55
```

Do not proceed if either command fails.

## 4. Deploy the testnet factory

```bash
npm run chain:v55:testnet
```

The command checks chain ID 46630, deploys the factory and writes `deployments/v55-testnet.json`.

## 5. Configure Vercel

Add the printed public address only:

```env
NEXT_PUBLIC_V55_TESTNET_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_V55_MAINNET_ENABLED=false
```

Keep the existing Supabase variables. Redeploy after saving the address.

## 6. First launch criteria

The first launch is accepted only after all of these are observed:

- Creator wallet spends no more than the 0.001 ETH launch cap under the submitted gas limit
- One-billion-supply token address exists
- Spot-market address exists
- Factory `MarketCreated` event exists
- Creator receives only purchased tokens
- Supabase registry independently verifies the receipt and token metadata
- Token appears in Leverage X with a fresh contract-state timestamp
- A second wallet can Buy and Sell on testnet
- Balances and reserves reconcile with explorer receipts

Mainnet remains locked after this test.
