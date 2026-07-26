# PERPHOOD V20 Realtime Execution, Chart, and PNL Architecture

## One ordered state stream

Execution, chart movement, liquidation health, and live PNL must never be calculated from separate asynchronous models. Every accepted BattlePool mutation produces one monotonically increasing state frame:

```text
order accepted
→ deterministic BattlePool route executes
→ reserves and positions reconcile
→ state sequence increments
→ one frame publishes price, pool balances, position state, and executable PNL inputs
→ chart and all account surfaces render that same sequence
```

A client may optimistically acknowledge an order before chain settlement, but it must label the source and reconcile to the next authoritative sequencer or chain frame.

## Executable PNL, not headline PNL

V20 live PNL is the value obtainable by closing the position through the current shared pool. It includes:

- the position's full close price impact;
- the 0.30% execution fee;
- accrued funding and borrow costs;
- outstanding WETH or token debt;
- current free-WETH constraints;
- the exact pool reserve state used by spot trading and liquidations.

A marginal-price formula may be shown as analytics, but it is never labeled withdrawable PNL.

## Client state path

The V20 reference app uses a market-keyed external store and `useSyncExternalStore` subscriptions. This keeps chart and PNL surfaces subscribed to the same immutable frame without forcing unrelated terminal panels to rerender.

Current local source labels:

- `battlepool-local` — deterministic local reference engine;
- `sequencer` — future ordered production execution service;
- `chain` — future finalized contract state.

## Target production latency budget

These are engineering targets, not current mainnet measurements:

| Stage | Target |
|---|---:|
| Regional order acknowledgement | under 50 ms p95 |
| Sequencer execution and risk decision | under 25 ms p95 |
| State-frame fanout to active client | under 50 ms p95 |
| Chart and PNL render after frame receipt | one animation frame |
| Keeper reaction to liquidatable state | under 100 ms regional target |

Blockchain settlement and finality are separate from the user-facing acknowledgement path. The UI must always distinguish pending, sequenced, submitted, and finalized states.

## Production requirements still missing

- authenticated session keys with strict spend and market permissions;
- redundant regional sequencers with deterministic failover;
- signed state frames and state-hash verification;
- a Robinhood Chain contract implementation of `IBattlePoolV20`;
- replayable event storage and snapshot recovery;
- multi-provider RPC and WebSocket fanout;
- latency, sequence-gap, and stale-frame alerts;
- independent security review and professional smart-contract audits.

## V24 event-derived authority

V24 uses one monotonic committed event sequence for candles and executable PNL. Every frame carries curve sold inventory and the authoritative marginal price. The indexer rejects sequence gaps and computes:

- 1-second candles;
- 15-second candles;
- 30-second candles;
- exact long close proceeds after curve impact, fee, and debt;
- exact short close proceeds after exact-token buyback, fee, and locked-proceeds accounting.

An optimistic sequencer frame may be displayed immediately, but it is promoted to final only when the chain emits the same sequence and state hash.
