# leverage X → GMGN Robinhood Chain launchpad onboarding

## Request

Please index **leverage X** as a Robinhood Chain token launchpad and attribute its V65 factory launches in GMGN discovery alongside other supported Robinhood Chain launchpads.

## Public identity

- Launchpad: `leverage X`
- Launchpad ID: `leverage-x-robinhood`
- Chain: Robinhood Chain (`4663`)
- Website: `https://perp-hood.vercel.app` until the leverageX.fun domain is connected
- V65 factory: add verified address
- V65 permanent liquidity locker: add verified address
- Factory deployment block: add verified block

## Machine-readable surface

- Manifest: `/api/v65/gmgn/manifest`
- Launch feed: `/api/v65/gmgn/launches`
- Token lookup: `/api/v65/gmgn/token/{tokenAddress}`
- Pool event feed: `/api/v65/gmgn/pool-events?pool={poolAddress}`
- Evidence: `/api/v65/gmgn/evidence`
- Well-known manifest: `/.well-known/leveragex-launchpad`
- ABIs: `/integrations/gmgn/abi/`

## Attribution events

- `CanonicalPoolCreated(address,address,address,address,address,address,uint24,uint256,bool,int24,int24)`
- `TokenLaunched(address,address,address,address,address,address,address,uint256,uint24,bool,uint256,uint256,uint256,bytes32)`
- `TokenGraduated(address,address,uint256,address,uint24)`

Each canonical pool emits standard Uniswap V3 `Initialize`, `Mint`, `Swap`, `Burn`, and `Collect` events.

## Canary evidence to attach

- Verified factory and locker explorer URLs
- First token and canonical pool explorer URLs
- Launch transaction
- Independent trader buy transaction
- Independent trader approval, sell, and unwrap transactions
- Public metadata and artwork URLs
- `deployments/v65-gmgn-live-backfill.json`
- `deployments/gmgn-v65-handoff/gmgn-v65-integration.json`

## Requested result

1. Resolve each V65 token by contract address.
2. Read its price/liquidity/swaps from the canonical pool created in the launch transaction.
3. Attribute the token to leverage X.
4. Include leverage X in Robinhood Chain launchpad discovery after verification.

## Boundary

The contracts and feeds make launches technically indexable. The official leverage X label remains controlled by GMGN and is not self-asserted by this project.
