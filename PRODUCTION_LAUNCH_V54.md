# LEVERAGE X V54 — Real Robinhood Chain Launch Path

V54 removes bundled token/demo market data from the hosted product and introduces the first real connected-wallet minting path.

## Canonical launch flow

1. Creator enters token identity and uploads PNG/JPG/WEBP/GIF/AVIF artwork.
2. The server stores artwork and deterministic JSON metadata in the public Supabase `token-media` bucket.
3. The browser switches the creator's injected EVM wallet to Robinhood Chain testnet (46630) or, only when explicitly enabled, mainnet (4663).
4. The browser estimates deployment gas against the configured V54 factory.
5. The creator's total launch budget remains exactly 0.001 ETH. The submitted creator buy equals 0.001 ETH minus the transaction's configured maximum gas cost.
6. The creator wallet calls `Leverage XLaunchFactoryV54.createMarket` directly. No server-held creator key is used.
7. The factory deploys a fixed one-billion-supply ERC-20 and its native-ETH spot market in one transaction.
8. The complete supply is minted once to the market. The creator receives only tokens bought by the genesis curve purchase.
9. The server independently verifies the canonical receipt, factory event, deployed token identity, metadata URI/hash, creator, factory, market, and exact supply before writing the public launch registry.
10. Markets and Movers hydrate only confirmed registry entries and read current price/reserves from the real market contract.

## Contracts

- `contracts/src/Leverage XLaunchFactoryV54.sol`
  - `Leverage XTokenV54`
  - `Leverage XSpotMarketV54`
  - `Leverage XLaunchFactoryV54`
- `contracts/test/Leverage XLaunchFactoryV54.t.sol`

The V54 token is a conventional ERC-20 with `name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`, `allowance`, `approve`, `transfer`, and `transferFrom`. It has no owner mint, transfer tax, blacklist, creator allocation, or privileged token withdrawal.

## Spot market

- Native ETH settlement
- Exponent-five bonding curve using `BattleCurveMathV24`
- 800 million curve allocation
- 0.25 ETH opening fully diluted valuation
- 0.30% fee
- 94% maximum curve-sold boundary
- Real `buy` and `sell` transactions
- Canonical `Trade` event
- Creator address reported as permanently perps-restricted

V54 intentionally proves real minting and spot trading before connecting the leveraged BattlePool to these production tokens.

## Metadata and discovery

- `supabase/v54_production_launch.sql`
- `/api/v54/metadata`
- `/api/v54/launches`
- `/api/v54/discovery`

The discovery feed exposes standard token, factory, market, creator, metadata, transfer, launch, and trade information for external indexers. This improves indexability but does not guarantee that a third-party platform understands LEVERAGE X's custom bonding curve.

## Production behavior

- `lib/data.ts` contains no bundled token.
- Markets and Movers render honest empty states until real launches exist.
- The hosted launch sandbox no longer exposes simulated balances or fake chain activity.
- The order-book panel does not fabricate depth.
- V54 Long and Short controls remain unavailable until the real leveraged settlement contract is attached.
- Mainnet launch is locked unless `NEXT_PUBLIC_V54_MAINNET_ENABLED=true` and deployment tooling is separately unlocked.

## Required environment variables

Browser-safe:

```env
NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com
NEXT_PUBLIC_V54_TESTNET_FACTORY_ADDRESS=
NEXT_PUBLIC_V54_MAINNET_FACTORY_ADDRESS=
NEXT_PUBLIC_V54_MAINNET_ENABLED=false
```

Server/deployment only:

```env
ROBINHOOD_TESTNET_RPC_URL=https://rpc.testnet.chain.robinhood.com
ROBINHOOD_MAINNET_RPC_URL=https://rpc.mainnet.chain.robinhood.com
V54_DEPLOYER_PRIVATE_KEY=
V54_FACTORY_OWNER=
V54_VERIFY_CONTRACT=false
V54_ALLOW_MAINNET_DEPLOY=false
```

Never put the deployer private key in Vercel, Supabase, GitHub, browser code, or any `NEXT_PUBLIC_` variable.

## Remaining execution gate

The code path is built, but no factory address is bundled or claimed as deployed. Before a creator can mint:

1. Run the V54 Supabase migration.
2. Compile and test the Solidity contracts with Foundry.
3. Fund a dedicated Robinhood Chain testnet deployer.
4. Deploy and verify the V54 factory on testnet.
5. Add the resulting factory address to Vercel.
6. Complete a real creator launch and second-wallet buy/sell.

Mainnet remains prohibited until that complete testnet path reconciles without unexplained differences.
