# Leverage X — Authoritative Product Specification

**Status:** Current source of truth for the continuous project formerly discussed as PerpHood, PerpHood 2, and PerpHood 3.  
**Brand:** **Leverage X**  
**Product styling:** **leverage X** / **leverageX** where compact styling is needed  
**Primary domain:** **leverageX.fun**

This document supersedes conflicting product decisions in older version notes. Historical documents remain useful for implementation history, tests, and migration context, but the newest explicit decision in this file wins.

## 1. Product mission

Leverage X is a Robinhood Chain-first memecoin launchpad and high-speed Spot × Perps terminal. The product must become a real, controlled, verifiable trading system—not a visual demo. The immediate order of operations is:

1. Keep the hosted product free of fabricated market data and misleading production claims.
2. Compile, test, deploy, and verify the Leverage X launch contracts on Robinhood Chain testnet.
3. Mint the first real token through the connected creator wallet path.
4. Prove second-wallet Spot Buy and Spot Sell against canonical on-chain state.
5. Make created markets discoverable through the Leverage X registry and indexer surfaces.
6. Integrate and audit the real BattlePool Spot × Perps lifecycle.
7. Only then consider mainnet, public funds, broad release, and external discovery claims.

## 2. Non-negotiable truth rules

- No fake tokens, trades, order-book rows, volume, liquidity, PNL, holders, social posts, or indexer status in the hosted product.
- Empty live feeds must render an honest empty state.
- “Submitted” is not “confirmed”; “confirmed” is not “reconciled”; “reconciled” is not “indexed.”
- Never claim GMGN or another third party supports or indexes Robinhood Chain until that behavior is directly observed and integrated.
- P1/P2/P3 are honest execution profiles. They may alter fee ceilings, routing, deadlines, slippage, and price-impact limits; they must never be described as fake bribes.
- Mainnet, public funds, and live leveraged trading remain locked until their explicit release gates pass.

## 3. Launch lifecycle

- Every new token has a fixed total supply of **1,000,000,000 tokens**.
- The creator’s required launch spend is **0.001 ETH total, inclusive of network gas**. The token buy receives the remainder after gas.
- The creator receives no special creator-reward allocation or fee privilege. The creator participates as an ordinary holder under the same holder rules.
- The creator/deployer wallet is permanently prohibited from opening Long or Short positions on its own token.
- Hard-linked creator wallets may also be restricted where a cryptographic or operational link is enforceable. Weak heuristics alone must not be presented as proof.
- GIF token artwork is supported and remains animated in listings where the surface permits it.
- The launchpad must publish canonical token, market, creator, metadata, transaction, and lifecycle identifiers for explorer and indexer reconciliation.

## 4. Spot × Perps target model

- The target product uses a unified BattlePool for Spot and Perps.
- Long and Short should ultimately become available immediately after the first valid on-chain Spot price, with leverage options of **2×, 5×, 10×, and 20×**, subject to enforceable capacity and risk limits.
- Liquidations settle into the pool and must affect the same economic state used by Spot and Perps.
- The public trade tape exposes only **Buy** and **Sell** market activity. It must not reveal a user’s private Long/Short direction, leverage, entry, liquidation, TP/SL, or wallet-linked perp history.
- Position UI must clearly display entry, mark, liquidation, TP, SL, live PNL, executable PNL, and capacity where those values are canonical.
- The public leaderboard ranks Leverage X perp PNL only, using settled rules for realized values and explicitly labeled canonical unrealized values where supported.

## 5. Markets and Movers behavior

The terminal has six independent category profiles:

- New Pairs
- Cooking
- Migrated
- Movers
- Most Liked
- Highest Market Cap

Each profile independently stores:

- Quick Buy amount
- Quick Long enabled state, collateral, and leverage
- Quick Short enabled state, collateral, and leverage
- P1/P2/P3 execution profile
- Buy and Sell slippage
- Maximum network fee
- Maximum price impact
- Quote deadline
- Execution route / priority behavior
- MEV protection behavior where the chain path supports it
- Category-specific filters

Interaction rules:

- Quick Buy executes in place and keeps the user on Markets or Movers.
- Quick Long and Quick Short are preset-only instant actions.
- An unset Long/Short preset is visibly disabled and sends no transaction.
- Markets and Movers do not open a trading sidecar.
- Clicking a token row opens the selected-token workspace.
- Up to three non-trading left sidecars may remain open and persist independently. A fourth tool opens as a floating panel rather than silently replacing one of the three.

## 6. Terminal workspace

- The terminal is the persistent home experience; major tools open without full-page navigation or reload.
- The outer desktop workspace should not scroll. Individual lists and panels may scroll internally.
- Default theme is dark gray near **#212121**, with readable 11–16 px+ typography and Padre-like breathing room.
- The selected-token page uses Padre’s overall structure with GMGN-style chart behavior.
- Default chart view is minimal and no-scroll, with adjustable height and an optional trades section below.
- Supported primary candle intervals include **1 second (default), 15 seconds, and 30 seconds**.
- Advanced chart settings remain available in a compact panel: price/market-cap mode, candle style, volume, indicators, markers, wallet/developer/KOL/sniper labels, position and risk lines, liquidation clusters, and appearance.
- The positions/watchlist strip, bottom utility area, floating PNL box, panel order, panel sizes, fonts, layouts, and saved workspaces have persistent settings.
- Search supports ticker, token name, and contract address, with clear OG/lineage labeling where proven.

## 7. Wallet and execution account

- One active owner wallet/account controls trading.
- No multiwallet execution or bundling is part of this product.
- The owner wallet remains exportable through the wallet provider’s normal controls.
- A session key, when enabled, is non-exportable, revocable, scoped, time-bounded, action-bounded, and value-bounded.
- Deposited/internal-balance execution may reduce repeated signing, but custody, authorization, reconciliation, withdrawal, and gas sponsorship must be explicit and auditable.
- Quick actions require a fresh canonical quote and must enforce slippage, price-impact, deadline, and network-fee ceilings before submission.

## 8. Fees and holder economics

- All unavoidable gas and every protocol fee must be shown explicitly.
- There is no hidden spread, setup fee, rent fee, or fabricated priority tip.
- The earlier working proposal is a 1% trade fee distributed 10% to the house and 90% to eligible holders, but this remains an economic parameter until the deployed contracts and final legal/accounting design lock it.
- Holder rewards are weighted primarily by time held and secondarily by amount held. The older 80% time / 20% amount model is the current design reference, not a claim of deployed behavior.
- Creator wallets earn only under the same holder rules as everyone else.

## 9. Scale and operations

- Architecture must be designed for a path from controlled testnet use to 100K–1M users.
- Vercel may host the frontend and request/response APIs, but authoritative indexers, keepers, reconciliation, queues, and durable order state require persistent services and databases.
- Chain events and reconciled contract state are authoritative. Browser state and API acknowledgements are not settlement truth.
- Every release should preserve emergency controls: disable quick actions, cancel eligible orders, close eligible positions, pause affected markets, and display service/indexer health.

## 10. Current release gate

The current V55 code is allowed to claim source readiness for controlled Spot testnet work only. It may not claim:

- a deployed V55 factory,
- a completed real token mint,
- live V55 leveraged trading,
- mainnet readiness,
- public-funds readiness,
- external indexer or GMGN support.

The next release gate is a clean production build followed by compiled Foundry tests, Robinhood Chain testnet deployment and verification, a creator mint, a second-wallet Buy/Sell lifecycle, and registry/indexer reconciliation.

## 11. V63 GMGN compatibility priority

Until leverage X launches are externally discoverable, GMGN compatibility takes priority over unrelated UI expansion and public perps activation.

Every launch must expose:

- a standard fixed-supply, taxless ERC-20 token;
- immutable creator and launch-factory attribution;
- required token artwork plus name and ticker, with optional description and social links;
- stable launch, market, trade, and graduation events;
- deterministic token enumeration and historical backfill;
- a public metadata URI and metadata hash;
- an authoritative pre-graduation Spot market;
- an explicit canonical external pool mapping after graduation;
- public machine-readable launchpad and token feeds.

The codebase must never promise an official GMGN launchpad label or automatic chart/trading support before GMGN resolves the real deployed canary. Official launchpad attribution depends on external GMGN onboarding. The immediate release sequence is: V63 compile/preflight → verified closed/paused factory → first real token and capped buy/sell lifecycle → direct GMGN contract-address test → integration handoff and any adapter corrections.


## V65 GMGN-first canonical market decision

The authoritative Spot launch architecture now creates a standard token/WETH Uniswap V3 pool from the first confirmed launch transaction. Leverage X attribution remains available through the V65 factory events and public feeds, while price, liquidity, and swaps are externally legible through standard pool state/events. Graduation changes the permanently locked liquidity range in the same pool rather than switching market addresses. Public launching remains behind a closed/allowlisted canary gate, and official GMGN launchpad labeling is not assumed until GMGN approves the integration.
