# V36 chart-workspace research

PerpHood V36 deliberately combines the strongest chart-page patterns without copying another terminal's branding or depending on a competitor's private APIs.

## DEX Screener patterns retained

- Dense 5m / 1h / 6h / 24h transaction, volume, trader, buy, and sell summaries.
- Fast access to public transaction history, top traders, holders, token information, liquidity, FDV/market cap, and contract context.
- Market-cap-first viewing for memecoin traders, with an immediate price toggle.

## Padre / Terminal patterns retained

- Chart-first workspace hierarchy with the execution ticket always available on the right.
- Compact CEX-like spacing, expected execution context, chart order lines, pending activity, and a fast market tape.
- One selected market remains inside the PerpHood shell rather than opening a disconnected microsite.

## GMGN patterns retained

- Wallet-intelligence overlays and dedicated Top traders, Insiders, and Holders views.
- Visible creator, smart-money, sniper, and liquidation chart markers.
- Holder concentration, creator ownership, bundled-wallet risk, early-buyer retention, and wallet labels.

## PerpHood-only layer

- Buy, Sell, Long, and Short all traverse one BattlePool.
- One-second candles are the default.
- Market-cap and price chart modes.
- Entry, liquidation, TP, SL, and trigger-order lines.
- Executable live PNL and public liquidation pressure.
- BattlePool reserve, obligation, short-inventory, liquidation-equity, and bad-debt accounting.
- Up to 360 Hz visual-state interpolation.

## Review-build rule

V36 contains exactly one deliberate demo token, `HOOD`, and `/` redirects directly into its chart workspace. The demo replay is clearly labeled and exists only so the complete workspace can be judged before a production Robinhood Chain feed is connected.
