# leverage X V65 — GMGN Live Pool Build Notes

V65 replaces the prior custom-market-first GMGN strategy with a canonical standard-pool launch path.

## Product result

Every V65 token launch now creates, initializes, and trades through its canonical token/WETH Uniswap V3 pool in the same confirmed transaction. GMGN and other indexers no longer need to understand a private bonding-curve trade event to find the launch price or swaps.

## Contract architecture

- `LeverageXTokenV65`: fixed one-billion supply, 18 decimals, no transfer tax, no blacklist, no hidden mint.
- `LeverageXPermanentLiquidityLockerV65`: permanently owns the launch-range and final full-range LP NFTs; exposes no generic withdrawal or rescue path.
- `LeverageXLaunchFactoryV65`: deploys the token, creates/initializes the canonical pool, increases oracle observation capacity, locks one-sided launch liquidity, routes the creator buy through SwapRouter02, publishes stable attribution events, and permissionlessly graduates the same pool to full-range locked liquidity only after both the terminal tick and a 15-minute TWAP confirm the move.
- Factory deployment starts closed. One creator can be allowlisted for the canary before public launches are considered.
- Protocol-wide supply, fee tier, opening price, launch range, and graduation target are not creator-selectable.

## GMGN/indexer surface

- Public V65 manifest and well-known route.
- Public launch feed, per-token lookup, pool-event feed, and canary-evidence endpoint.
- Direct downloadable factory, token, locker, and canonical-pool ABIs.
- Reorg-aware backfill of factory attribution and standard Uniswap V3 pool events.
- Deployment-specific GMGN handoff-package generator.

## Terminal integration

- Launch Token uses `/api/v65/metadata` and `/api/v65/launches`.
- Confirmed launches are registered with token, canonical pool, DEX factory, pair token, position manager, locker, LP position, fee tier, token order, and fixed FDV rules.
- Spot Buy/Sell uses QuoterV2 + SwapRouter02. Sells unwrap received WETH back to ETH.
- V65 markets hydrate price and market cap from canonical pool state.

## Deliberate boundaries

- No public factory deployment happened while building V65.
- No mainnet transaction was signed or broadcast.
- Real Long/Short remains disabled.
- An official GMGN leverage X label still requires GMGN onboarding and approval.
