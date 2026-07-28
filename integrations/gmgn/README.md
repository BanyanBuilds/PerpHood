# leverage X — GMGN integration package (V65)

V65 is the GMGN-first launch architecture. Every confirmed token launch creates a standard ERC-20 and its canonical token/WETH Uniswap V3 pool in the same transaction.

## Attribution

- Chain: Robinhood Chain (`4663`)
- Launchpad ID: `leverage-x-robinhood`
- Factory: set after verified V65 mainnet deployment
- Deployment block: set after verified V65 mainnet deployment
- Pair token: canonical Robinhood Chain WETH
- Pool type: canonical Uniswap V3, fee tier `10000` (1%)

## Discovery and replay

1. Replay `CanonicalPoolCreated` and `TokenLaunched` from the verified factory deployment block.
2. Map each token directly to the indexed pool address.
3. Replay standard `Initialize`, `Mint`, `Swap`, `Burn`, and `Collect` logs from each discovered pool.
4. Preserve block hash, transaction index, and log index for reorg recovery.
5. `TokenGraduated` does not change the pool address. It replaces the one-sided launch-range LP NFT with a permanently locked full-range LP NFT in the same pool.

## Public feeds

- `/api/v65/gmgn/manifest`
- `/api/v65/gmgn/launches`
- `/api/v65/gmgn/token/{address}`
- `/api/v65/gmgn/pool-events?pool={address}`
- `/api/v65/gmgn/evidence`
- `/.well-known/leveragex-launchpad`
- `/integrations/gmgn/abi/LeverageXLaunchFactoryV65.json`
- `/integrations/gmgn/abi/LeverageXTokenV65.json`
- `/integrations/gmgn/abi/LeverageXPermanentLiquidityLockerV65.json`
- `/integrations/gmgn/abi/LeverageXCanonicalPoolV65.json`

## Commands

```powershell
npm run chain:v65:gmgn:backfill
npm run gmgn:package:v65
```

The generated handoff package includes the verified factory and locker, deployment block, canary token/pool, launch transaction, independent-wallet buy/sell evidence, public endpoints, and ABIs.
