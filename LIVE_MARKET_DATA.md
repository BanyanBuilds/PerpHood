# PERPHOOD V16 Live Market Data Contract

PERPHOOD does not generate or seed candles. The chart is empty until a real historical or live trade source is configured.

## WebSocket

Set `NEXT_PUBLIC_MARKET_WS_URL`.

On connection the client sends:

```json
{"action":"subscribe","channel":"trades","market":"token-slug"}
```

Accepted trade message fields:

```json
{"market":"token-slug","price":0.00000123,"size":450000,"timestamp":1784810000000,"side":"buy"}
```

`slug`, `token`, or `address` may replace `market`. `amount` or `volume` may replace `size`. Unix seconds and milliseconds are accepted.

## Historical 1-second candles

Set `NEXT_PUBLIC_MARKET_HISTORY_URL`. PERPHOOD calls:

`GET <url>?market=<slug>&interval=1s&limit=3000`

Return an array or `{ "candles": [] }` with `time`, `open`, `high`, `low`, `close`, and `volume`.

All larger timeframes are deterministically aggregated from the 1-second source. The 1-second chart is therefore the canonical chart stream.
