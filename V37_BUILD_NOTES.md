# PERPHOOD V37 build notes

## Product rule

The selected-coin page follows Padre's overall information architecture and spacing, while the chart follows GMGN's configurable wallet-intelligence model. PerpHood keeps its own Buy × Sell × Long × Short BattlePool execution and liquidation overlays.

## Default screen

The desktop page does not scroll. It contains:

1. Compact token/market command bar
2. Chart-dominant center area
3. Fixed execution rail on the right
4. Optional live-trades rail beside the chart
5. Optional lower market-data panel
6. Compact status bar

The user can drag the horizontal divider to resize the chart and lower panel. Double-clicking the divider resets its height.

## Chart settings

One compact settings popup stores preferences in local storage and closes on outside click or Escape.

Display:
- Candles or line
- Market cap or token price
- Volume
- Grid
- OHLC
- Watermark
- Logarithmic scale
- Buy/sell prints

Trading layers:
- Entry
- Liquidation
- TP/SL
- Pending orders
- Public liquidation clusters

Wallet intelligence:
- Developer activity
- KOL/smart-wallet activity
- Sniper/insider activity
- Marker legend

## Clean defaults

Enabled by default:
- Candles
- Market cap
- Volume
- Grid
- OHLC
- Developer marker
- Public liquidation clusters
- User position/order lines

Disabled by default:
- Decorative watermark
- Buy/sell print markers
- KOL/smart-wallet markers
- Sniper/insider markers
- Marker legend
- Log scale

## Token safety

The execution rail preserves scam-detection information without crowding the chart. It includes top-holder concentration, creator holding, insiders, bundles, snipers, holder/fresh-buyer count, mint authority, freeze authority, and liquidity source.
