# V65 GMGN Live Pool Architecture

## Why this architecture exists

A standard ERC-20 alone is not enough for reliable external charting. An indexer also needs a deterministic market, token ordering, price state, liquidity, and recognizable swap events. V65 creates that standard market from launch transaction one.

## Launch lifecycle

1. Creator submits name, ticker, required artwork metadata, optional description/socials, and the creator buy.
2. Factory deploys the fixed-supply ERC-20 using a per-block CREATE2 salt.
3. Factory creates and initializes the canonical token/WETH Uniswap V3 pool.
4. Factory mints the one-sided launch-range LP NFT directly to the permanent locker.
5. Factory transfers the final token reserve to the locker.
6. Factory routes the creator buy through SwapRouter02, producing a standard pool `Swap` event.
7. Factory emits `CanonicalPoolCreated` and `TokenLaunched` attribution events.
8. Supabase/indexer records the token→pool map and replays standard pool events.

## Graduation

When the pool reaches the fixed terminal tick, graduation additionally requires a 15-minute Uniswap oracle TWAP at or beyond that terminal level. This blocks a one-transaction/flash-price spike from graduating the market. Once both checks pass, anyone can call `graduateToken`. The locker removes the launch-range position, combines its assets with the locked reserve, and mints a permanently locked full-range position in the same pool. No market-address switch is required.

## External indexing

Indexers can replay:

- Factory: `CanonicalPoolCreated`, `TokenLaunched`, `TokenGraduated`
- Token: `Transfer`, `Approval`
- Pool: `Initialize`, `Mint`, `Swap`, `Burn`, `Collect`

The canonical pool address is available through `canonicalPoolForToken`, `marketForToken`, `getLaunchedToken`, `launchAt`, and the public V65 feeds.

## Security posture

- Factory closed by default.
- One-canary allowlist gate.
- Canonical Robinhood DEX address checks.
- Locker verifies the pool belongs to the official factory and contains exactly the token/WETH pair.
- Dynamic CREATE2 salt reduces predictable-next-address pool squatting.
- Pool oracle capacity is increased at creation, and graduation requires both the current tick and a 15-minute TWAP beyond the terminal tick.
- No creator LP withdrawal, rescue, free allocation, tax, blacklist, or future mint.
- No server/browser owner signing route.

## Remaining proof

The contracts still require actual Foundry compilation/tests, bytecode-size checks, mainnet closed deployment, Blockscout verification, first launch, independent trader buy/sell, pool-event backfill, and a real GMGN contract-search test.
