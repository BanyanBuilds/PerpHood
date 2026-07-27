# LEVERAGE X V36 — One-demo chart workspace

V36 removes the empty discovery detour from the review build and opens directly into one complete `HOOD` chart workspace.

## Build changes

- Exactly one demo market in `lib/data.ts`.
- `/` redirects to `/market/perphood-demo`.
- Deterministic 1,200-second candle history plus a live 250 ms demo replay.
- Default 1-second candles and market-cap chart scale.
- 5m / 1h / 6h / 24h transaction, volume, trader, buy, and sell summaries.
- Holder count, top-10 concentration, creator share, bundled share, first-70 retention, insider count, and sniper count.
- Chart markers for creator, smart money, sniper, and liquidation activity.
- Tabs for Tape, Transactions, Orders, Positions, BattlePool, Top traders, Insiders, Holders, and Token info.
- Single-market layout removes the redundant market rail and gives the chart more room.
- Right-side Battle depth and unified Buy / Sell / Long / Short ticket remain visible.
- Existing one-BattlePool engine, executable PNL, liquidation map, readable typography, and 360 Hz option remain intact.

The replay data is explicitly labeled as demo data. It must be replaced by the authoritative Robinhood Chain event indexer before production.
