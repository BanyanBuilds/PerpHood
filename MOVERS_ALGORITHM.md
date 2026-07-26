# PerpHood Movers Algorithm

PerpHood Movers is a discovery ranking—not a price feed and not a promise of future performance. The score reacts to broad, fast participation while reducing visibility for activity that appears concentrated, repetitive, insolvent, or easily manufactured.

## Public category weights

| Signal | Weight |
|---|---:|
| Transaction velocity | 25% |
| Net WETH inflow | 20% |
| Unique-wallet growth | 15% |
| Market-cap acceleration | 12% |
| Battle intensity | 10% |
| Real liquidity growth | 8% |
| Like velocity | 5% |
| Quality | 5% |

Each non-quality signal is normalized against the currently eligible PerpHood market universe. This keeps a single raw number—such as volume—from permanently controlling the table across different market conditions.

## Time weighting

- Last 15 seconds: 45%
- Last 1 minute: 35%
- Last 5 minutes: 20%

The score is recalculated every second from authoritative events. Score values update immediately; visible row promotion requires a 2.5-point lead over the coin directly above it. This preserves speed without producing unreadable rank flicker.

## BattlePool-native inputs

Unlike a standard launchpad, PerpHood can include:

- Leveraged long and short entry velocity
- Open-interest pressure relative to the market
- Nearby long and short liquidation clusters
- Liquidation and fee equity retained by the same pool
- Free WETH, obligations, bad debt, and settlement quality

These inputs do not create a second price. They describe pressure around the same Spot × Long × Sell × Short BattlePool.

## Anti-manipulation behavior

The public weights are transparent, but exact detection thresholds should remain server-side and adjustable. V30 applies visibility penalties for:

- Repeated transactions from the same actor
- High linked-wallet concentration
- Existing bad debt
- Weak oracle confidence
- Poor free-WETH coverage of obligations

A token can still appear with a warning, but manufactured volume should not automatically outrank broad independent participation.

## Row explanations

The top three contributing reasons are shown on each Movers row, such as:

- `74 trades/min`
- `+0.820 ETH/min`
- `31 active wallets`
- `MC accel +18.2%`
- `8 liqs nearby`
- `+0.140 ETH depth/min`

When manipulation risk is material, one reason is replaced with the visible penalty.

## Data quality

- `LIVE`: at least four qualifying events in the last five minutes
- `WARMING`: one to three qualifying events
- `ESTIMATED`: no recent event history; conservative token-level fallback inputs are used

Estimated scores receive a freshness reduction and should be replaced by live indexer events as soon as the production feed is connected.
