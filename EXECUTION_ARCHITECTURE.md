# PERPHOOD V20 Execution Architecture — Fast Battle Sequencing and Ordered State

## Objective

PERPHOOD should feel faster than any memecoin terminal while preserving one authoritative BattlePool state and never pretending an optimistic acknowledgement is settled money.

The user sees one action:

```text
Buy / Sell / Long / Short
```

The engine may internally cross many price and liquidation boundaries before that action is complete.


## One state frame for execution, chart, and PNL

After each deterministic mutation, the sequencer commits one monotonic state sequence and state hash. Chart movement, liquidation health, free-WETH capacity, and executable user PNL must all reference that same frame. A client must never combine a new chart price with stale position or reserve state.

```text
BattlePool execution
→ invariant reconciliation
→ sequence + state hash
→ signed state frame
→ WebSocket fanout
→ chart and PNL render together
```

The local V20 reference uses a market-keyed external store. Production requires signed frames, replay protection, gap recovery, and reconciliation to contract events.

## Settlement states

The interface must distinguish:

1. **accepted** — session authorization and local risk checks passed,
2. **sequenced** — a deterministic boundary plan was produced,
3. **broadcast** — the transaction or continuation batch reached Robinhood Chain infrastructure,
4. **included** — authoritative contract state changed,
5. **finalized** — the indexer observed the configured finality threshold.

Only included/finalized states may be presented as settled funds.

## Session-key flow

```text
Fund once
→ authorize a restricted session key
→ submit signed trade intents without wallet popups
→ edge gateway preflights the latest pool nonce
→ deterministic sequencer builds the execution route
→ route broadcasts to Robinhood Chain
→ contract events stream to every terminal
```

Session keys must be revocable and constrained by:

- chain ID and allowed contracts,
- expiration,
- maximum order size,
- maximum daily notional,
- maximum leverage,
- optional token allowlist,
- no withdrawal permission,
- no creator-wallet leverage on creator markets.

Withdrawals require the primary wallet or a stronger explicit policy.

## The V20 boundary sequencer

A large action cannot simply mutate price once and liquidate afterward. At 20×, a single jump can cross many maintenance thresholds and create bad debt.

The sequencer therefore converts one user intent into a deterministic plan:

```text
external order segment
→ health recomputation
→ unsafe position liquidation
→ forced curve trade
→ adaptive inventory rebalance
→ invariant check
→ next segment
```

The TypeScript simulator now jumps directly to the **next exact liquidation boundary** using deterministic binary search, while retaining an independent impact ceiling and invariant checks.

## Exact-boundary contract target

The Solidity implementation should reproduce the same result with fixed-point arithmetic, using an analytical solution where practical and bounded binary search otherwise. It solves the smallest input that causes any position to reach maintenance margin.

```text
remaining user input
→ next liquidation boundary amount
→ execute exactly to boundary
→ liquidate lowest health ratio
→ recompute next boundary
```

This preserves the V20 safety result while reducing gas and latency.

## Gas-aware execution modes

### Normal path

Most orders and small cascades should complete in one atomic contract call:

```text
executeBattleOrder(intent, limits, sessionProof)
```

The contract processes boundary segments, liquidations, fees, debt repayment, adaptive inventory, and final user output before returning.

### Extreme cascade path

A forty-position cascade may exceed a safe per-transaction gas budget. The protocol must not hide this risk.

The fallback is a pool-scoped continuation batch:

1. user input is escrowed,
2. the pool enters `EXECUTING_BATCH` with a strict nonce,
3. independent keepers advance deterministic boundary steps,
4. unrelated pools remain fully parallel,
5. the batch either completes or invokes a bounded emergency unwind,
6. user output becomes withdrawable only after completion.

No second wallet signature is required. The UI may show a fast sequencer acknowledgement, but it must not call the batch finalized before chain inclusion.

The production benchmark will determine whether the normal path can safely cover the expected 99th-percentile cascade without continuations.

## Hot path

```text
Terminal
  ↓ signed intent
Nearest execution gateway
  ↓ signature + nonce + creator restriction
In-memory exact BattlePool replica
  ↓ deterministic boundary plan
Direct RPC / private relay broadcast
  ↓ authoritative execution
BattlePool contract
  ↓ reserve + liquidation + batch events
Indexer / WebSocket fanout
  ↓
All open terminals update
```

The off-chain gateway never becomes the financial authority. It quotes, sequences, simulates, broadcasts, and reports. Contract state remains authoritative.

## Same-pool ordering and cross-pool parallelism

Every token has an independent BattlePool. Different tokens can execute in parallel.

All actions against one pool must follow one state nonce because each action changes:

- marginal price,
- spot exit value,
- position equity,
- liquidation order,
- available WETH,
- short inventory utilization.

The gateway may preflight many intents concurrently, but only the route matching the current pool nonce can settle.

## Keeper design

- Multiple independent keepers maintain identical deterministic replicas.
- Keepers can submit normal liquidations and extreme-batch continuations.
- First valid execution receives a bounded incentive.
- Duplicate attempts revert or become no-ops by nonce.
- A keeper cannot choose liquidation order; the contract enforces lowest health ratio, then age, then position ID.
- Keeper compensation comes from payable positive equity/fees, never by manufacturing bad debt.

## Market-data path

WebSocket deltas should include:

- pool nonce,
- curve token reserve,
- real WETH balance,
- free WETH,
- reserved position equity,
- marginal price and FDV,
- open long and short debt,
- short inventory utilization,
- adaptive inventory release/reclaim,
- sequenced step count,
- liquidation events,
- retained liquidation equity,
- realized bad debt.

Clients request a full snapshot whenever a sequence number is missed.

## MEV and manipulation controls

Required controls:

- user minimum output / maximum input,
- strict deadline,
- expected pool nonce or bounded reserve state,
- private routing where supported,
- deterministic liquidation ordering,
- creator and proven linked-wallet self-token leverage prohibition,
- same-block self-trade surveillance,
- maximum position/liquidation impact,
- circuit breakers for replica divergence,
- batch gas ceilings and safe continuation rules,
- replay-protected session authorization.

## Performance targets

Engineering targets—not current claims:

- pure quote: under 5 ms,
- exact-boundary plan for a normal order: under 15 ms,
- edge acknowledgement after signature verification: under 50 ms,
- WebSocket fanout after indexed event: under 100 ms,
- one wallet authorization per session,
- no client polling on the trading path,
- zero bad debt from a route accepted by the sequencer.

Robinhood Chain inclusion and finality remain external constraints. PERPHOOD should not claim “fastest” until independent end-to-end benchmarks prove it.

## Mandatory benchmark suite

1. Quote throughput per core.
2. Exact-boundary solver latency.
3. One hot pool under concurrent intents.
4. Thousands of pools in parallel.
5. Forty-short 20× squeeze.
6. Forty-long 20× cascade.
7. Maximum safe single-transaction cascade.
8. Continuation-batch completion and recovery.
9. RPC failure and private-route fallback.
10. WebSocket gap recovery.
11. Keeper competition and duplicate handling.
12. Session revocation during pending execution.
13. Acknowledgement, inclusion, and finality latency distributions.

## V21 custody settlement path

V21 introduces a real local EVM settlement spine without slowing the user-facing sequencer.

```text
intent accepted
→ deterministic execution and liquidation routing
→ optimistic chart + executable PNL frame
→ balanced token/WETH settlement payload
→ LocalBattlePoolV21 commit
→ ordered chain frame
→ internal payout immediately withdrawable
```

The browser runtime snapshot is optimized to two parallel RPC requests per poll:

1. `runtimeState()` for the complete frame, available pool WETH, and custody status;
2. `eth_blockNumber` for chain progress.

The default local target is 120 ms. Robinhood Chain production should replace HTTP polling with redundant WebSocket subscriptions and signed sequencer frames while keeping HTTP as a failover path.

## V22 no-popup order path

The target acknowledgement path is:

```text
click → local P-256 signature → relay acceptance → optimistic chart/PNL frame
```

The settlement path is:

```text
relay verification → deterministic reserve quote → sponsored sequencer transaction → ordered contract frame
```

The UI must distinguish signing latency, relay latency, chain finality, and frame age. A fast visual acknowledgement must never be presented as finalized custody before the ordered contract frame arrives.

## V24 verified settlement path

```text
signed intent
→ deterministic fixed-point proof
→ optimistic UI acknowledgement
→ encoded 964-byte verified settlement
→ contract recomputes curve and inventory transition
→ contract commits state hash or reverts
→ ordered event updates chart + PNL together
```

The V24 relay must never submit a frame whose price or market cap was computed separately from the included curve proof.
