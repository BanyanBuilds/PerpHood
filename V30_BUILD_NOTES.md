# V30 Build Notes — Live Movers Engine

## Built

- Added `lib/movers-engine.ts` as the single ranking authority.
- Replaced absolute 24-hour percentage sorting in the Movers column.
- Added 15-second, 1-minute, and 5-minute rolling event windows.
- Added transaction, net-flow, actor-diversity, acceleration, BattlePool, liquidation, liquidity, engagement, and quality components.
- Added repeated-actor, linked-wallet, bad-debt, and solvency penalties.
- Added one-second score decay and refresh.
- Added 2.5-point rank-promotion hysteresis.
- Added readable 0–100 score, state label, data-quality label, and three live reasons to each Movers row.
- Added a terminal popover describing public weights and time windows.
- Preserved independent quick-buy amounts, Buy/Long/Short controls, likes, OG badges, search, 360 FPS controls, and account sidebar.

## Product rule

Most Liked remains based on likes. Highest Market Cap remains based on market cap. Only the Movers column uses the composite momentum algorithm.

## Production feed requirement

The current engine accepts real `MarketEvent[]`, positions, pool balances, and token state. Production ranking quality depends on the Robinhood Chain indexer publishing actor-resolved events and authoritative reserve frames without delay.
