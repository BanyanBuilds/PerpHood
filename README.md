# PERPHOOD V53 — Supabase User-State Synchronization

V53 is the current development baseline. It adds settings-only cross-device synchronization for Markets/Movers presets, saved three-left-sidecar workspaces, likes, watchlists, and per-market alerts. Local storage remains the automatic fallback, and the recovery key has no authority over funds, wallets, sessions, orders, or BattlePool settlement.

Open the internal user-state console at:

```text
/admin/user-state
```

Install `supabase/v53_user_state.sql`, then configure the server-only Supabase credentials described in `USER_STATE_SYNC_V53.md`. The application still deploys without those values and reports `local-only` mode.

Run the portable gate with:

```bash
npm run test:v53-fast
```

The GitHub build workflow runs `npm ci`, the V53 portable gate, and the real Next.js production build on every main/build branch push.

PERPHOOD remains build-mode software. V53 syncs preferences only and is not approval for testnet, public users, or public funds.

See `USER_STATE_SYNC_V53.md`, `V53_BUILD_NOTES.md`, and `V53_VALIDATION.md`.

---

# PERPHOOD V52 — Product Completion and Scale Foundation

V52 is the current development baseline. It adds an honest product-completion inventory, a Vercel-safe readiness endpoint, a 100K–1M-user service topology, deterministic market/account sharding, a Supabase/Postgres scale schema, and a GitHub production-build gate.

Open the completion console at:

```text
/admin/completion
```

PERPHOOD is still build-mode software. Public funds and testnet deployment remain blocked until the dashboard's production blockers are resolved, compiled contract campaigns pass, and independent audits are complete.

See `PRODUCT_COMPLETION_V52.md`, `SCALE_ARCHITECTURE_V52.md`, `V52_BUILD_NOTES.md`, and `V52_VALIDATION.md`.

---

# PERPHOOD V51 — Compiler-Backed Chain Assault

V51 binds every current terminal and keeper position action to a deadline and fresh execution limits, adds hostile Solidity actors for stale ordering, reentrancy, rejecting receivers, forced ETH, creator restrictions, and gas ceilings, and packages a complete Forge/Anvil/Cast assault lifecycle.

## Run V51

```bash
npm install
npm run test:v51
npm run build
npm run dev
```

After Foundry is installed, execute the compiled campaign:

```bash
npm run chain:test:v51
npm run chain:invariant:v51
npm run chain:assault:v51
```

Operations:

- Terminal and Markets/Movers: `/`
- V51 chain-assault console: `/admin/chain-assault`
- V50 invariant console: `/admin/invariants`
- V48 data plane: `/admin/data-plane`
- V47 indexer: `/admin/indexer`
- V46 keeper: `/admin/keeper`
- Funding and recovery: `/funding`

Read `COMPILER_CHAIN_ASSAULT_V51.md`, `V51_BUILD_NOTES.md`, and `V51_VALIDATION.md`.

> **Safety:** the portable suites pass, but Forge/Anvil/Cast were unavailable in the assembly environment. The compiled campaign is packaged, not claimed as executed. Never use public funds.

---

# PERPHOOD V50 — Formal Invariants and Adversarial Settlement

V50 hardens the V49 settlement layer with machine-checkable invariants, exhaustive mixed-position close ordering, a stateful adversarial engine, upward protocol-fee rounding that closes dust fragmentation, an on-chain invariant snapshot, and a live `/admin/invariants` safety console.

## Run V50

```bash
npm install
npm run test:v50
npm run build
npm run dev
```

Run the Solidity invariant campaign after Foundry is installed:

```bash
npm run chain:test:v50
```

Operations:

- Terminal and Markets/Movers: `/`
- V50 invariant console: `/admin/invariants`
- V48 data plane: `/admin/data-plane`
- V47 indexer: `/admin/indexer`
- V46 keeper: `/admin/keeper`
- Funding and recovery: `/funding`

Read `FORMAL_INVARIANTS_V50.md`, `V50_BUILD_NOTES.md`, and `V50_VALIDATION.md` for the exact properties, attack coverage, and remaining safety boundary.

> **Safety:** V50 is unaudited reference software. Foundry, external formal verification, production compilation, test-chain validation, and independent audits remain required. Never use public funds.

---

# PERPHOOD V48 — Live Data Plane and Robinhood Chain Readiness

V48 connects the V47 canonical index to a production-shaped live data layer: multi-provider RPC quorum, finalized event indexing, durable reconnectable SSE, indexed 1s/15s/30s candles, market metrics, health alerts, recovery snapshots, and optional Supabase/Postgres replication.

Markets and Movers now execute Quick Buy, Quick Long, and Quick Short directly in place. Long and Short work only through explicitly enabled category presets. Markets/Movers never open a trading sidecar. Up to three independent utility or research sidecars may remain visible in the left dock simultaneously, and their open state and placement persist with the workspace.

## Run V48

```bash
npm install
npm run test:v48
npm run build
npm run dev
```

Start the local execution and data stack in separate terminals:

```bash
npm run chain:anvil
npm run chain:v46
npm run data-plane:v48
npm run keeper:v46
npm run reconciler:v47
```

Optional finalized replica and backup workers:

```bash
npm run replicator:v48
npm run backup:v48
```

Operations:

- Terminal and Markets/Movers: `/`
- Funding and recovery: `/funding`
- V48 data plane: `/admin/data-plane`
- V47 canonical indexer: `/admin/indexer`
- V46 order keeper: `/admin/keeper`
- Launch lifecycle: `/admin/launchpad`
- BattlePool/account sandbox: `/admin/launchpad/sandbox`

Read `LIVE_DATA_PLANE_V48.md`, `V48_BUILD_NOTES.md`, and `V48_VALIDATION.md` for the exact architecture, interaction rules, validation, and safety boundary.

> **Safety:** V48 is unaudited local/reference software. Production RPC diversity, managed database failover, oracle delivery, HSM-backed keys, on-chain session validation, Robinhood Chain deployment, and independent audits remain incomplete. Never use public funds.

---

# PERPHOOD V47 — Authoritative Indexer and Recovery

V47 gives PERPHOOD one durable canonical history across the V45 account router, every discovered BattlePool, V46 durable orders, sessions, positions, keeper workers, and recovery operations. It replaces the live JSON order store with transactional SQLite, detects reorgs, rolls back to a common ancestor, deterministically replays projections, reconciles indexed liabilities/state hashes against the contracts, and exposes cross-device account/session history.

## Run V47

```bash
npm install
npm run test:v47
npm run build
npm run dev
```

Start the local execution stack in separate terminals:

```bash
npm run chain:anvil
npm run chain:v46
npm run indexer:v47
npm run keeper:v46
npm run reconciler:v47
```

Operations:

- Terminal: `/`
- Funding and recovery: `/funding`
- V47 indexer/reconciliation: `/admin/indexer`
- V46 order keeper: `/admin/keeper`
- Launch lifecycle: `/admin/launchpad`
- BattlePool/account sandbox: `/admin/launchpad/sandbox`

Read `AUTHORITATIVE_INDEXER_V47.md`, `V47_BUILD_NOTES.md`, and `V47_VALIDATION.md` for the exact architecture, scope, and safety boundary.

> **Safety:** V47 is unaudited local software. SQLite is not the final replicated production database, session/order signatures remain relay-verified, chain/RPC/oracle infrastructure is not production-ready, and the contracts have not been independently audited. Never use public funds.

---

# PERPHOOD V46 — Durable Orders and Keeper Execution

V46 adds real unattended local execution above V45's fully backed account ledger and V43's unified BattlePool. Limit orders, trigger orders, take profit, stop loss, two-stage breakeven protection, and batch liquidations are signed by the bounded V45 session, stored durably, evaluated from authoritative contract state, settled by a keeper, and reconciled into the terminal after receipt confirmation.

## Run the application

```bash
npm install
npm run test:v46
npm run build
npm run dev
```

## Run the local execution stack

```bash
npm run chain:anvil
# second terminal
npm run chain:v46
# third terminal after Next.js is running
npm run keeper:v46
```

Copy the V45 deployment values printed by `chain:v46` into `.env.local`, then add the V46 worker configuration:

```env
NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS=0x...
V45_SEQUENCER_ACCOUNT=0x...
NEXT_PUBLIC_V45_DEMO_MARKET_ADDRESS=0x...
NEXT_PUBLIC_V45_DEMO_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_LOCAL_CHAIN_RPC=http://127.0.0.1:8545

NEXT_PUBLIC_V46_LOCAL_KEEPER_AUTORUN=false
PERPHOOD_APP_URL=http://localhost:3000
V46_KEEPER_SECRET=
V46_KEEPER_ACCOUNTS=0x...
V46_KEEPER_INTERVAL_MS=1500
V46_ORDER_STORE_PATH=.perphood/v46-orders.json
```

- Terminal: `/`
- Funding and session authorization: `/funding`
- Order and keeper operations: `/admin/keeper`
- Launcher: `/terminal?panel=launch`
- Lifecycle console: `/admin/launchpad`
- Account/BattlePool sandbox: `/admin/launchpad/sandbox`
- Architecture: `ORDER_KEEPER_NETWORK_V46.md`
- Build notes: `V46_BUILD_NOTES.md`
- Validation: `V46_VALIDATION.md`

### V46 scope

- signed durable Limit and Trigger entries;
- reduce-only Take Profit and Stop Loss;
- two-stage Breakeven activation and retrace;
- atomic local order persistence and idempotency;
- exclusive keeper leases and bounded retries;
- sequential keeper-account failover;
- batch liquidation scans;
- receipt and fill reconciliation into terminal holdings, positions, PNL, and tape;
- direct-wallet blocking of unenforced automation;
- continued V45 owner withdrawal, revocation, and direct-close escape paths.

> **Safety:** V46 is unaudited local software. The local JSON store is not a production database, P-256 signatures remain relay-verified, ETH/USD uses a fixed $3,200 development reference, reorg recovery is incomplete, keeper keys are not HSM-backed, and canonical Robinhood Chain WETH is not connected. Never use this build with public funds.

---

# PERPHOOD V45 — Authorized Account Execution

V45 adds the real account and authorization layer above the unified BattlePool. Users can deposit once, authorize a bounded local session, trade Spot Buy/Sell and Long/Short/Close without a wallet popup for every action, revoke the session on-chain, and withdraw through a direct owner-only path. The router continuously reconciles actual custody against ETH and token liabilities.

## Run the application

```bash
npm install
npm run test:v45
npm run build
npm run dev
```

## Run the V45 local chain

```bash
npm run chain:anvil
# in a second terminal
npm run chain:v45
```

Copy the printed values into `.env.local`, then restart Next.js:

```env
NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS=0x...
V45_SEQUENCER_ACCOUNT=0x...
NEXT_PUBLIC_V45_DEMO_MARKET_ADDRESS=0x...
NEXT_PUBLIC_V45_DEMO_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_LOCAL_CHAIN_RPC=http://127.0.0.1:8545
```

- Terminal: `/`
- Funding/account authorization: `/funding`
- Launcher: `/terminal?panel=launch`
- Lifecycle console: `/admin/launchpad`
- Account/BattlePool sandbox: `/admin/launchpad/sandbox`
- Architecture: `AUTHORIZED_ACCOUNT_EXECUTION_V45.md`
- Build notes: `V45_BUILD_NOTES.md`
- Validation: `V45_VALIDATION.md`

### V45 scope

- fully backed internal ETH and per-market token ledgers;
- direct deposits and owner-only withdrawals;
- bounded P-256 authorize-once sessions;
- nonce, deadline, replay, action, per-intent, and cumulative controls;
- sponsored six-action settlement through the local relay;
- direct owner fallback for trading, closing, revocation, and withdrawal;
- exact account and BattlePool reconciliation after every receipt;
- emergency Normal, CloseOnly, and Paused modes;
- creator-perps restrictions retained inside settlement.

> **Safety:** V45 is unaudited local software. P-256 signatures are verified by the local relay rather than by the Solidity router, native Anvil ETH stands in for canonical WETH, and the sequencer remains trusted within an active session's on-chain boundaries. Production indexing, durable replay storage, keeper automation, redundant sequencing, recovery, Robinhood Chain deployment, Foundry execution in this environment, and independent audits remain unfinished. Never use these contracts with public funds.

---

# PERPHOOD V44 — Terminal-to-Contract Execution

V44 connects the normal PERPHOOD terminal to the executable V43 unified BattlePool contract for configured local-chain markets. **Buy, Sell, Long, Short, and full Close now submit real wallet transactions, wait for confirmed receipts, decode execution events, and reconcile the terminal from the contract's authoritative state.**

## Run the application

```bash
npm install
npm run test:v44
npm run build
npm run dev
```

## Run the local contract market

```bash
npm run chain:anvil
# in a second terminal
npm run chain:v44
```

Copy the printed values into `.env.local`, then restart Next.js:

```env
NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_V43_DEMO_MARKET_ADDRESS=0x...
NEXT_PUBLIC_V43_DEMO_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_LOCAL_CHAIN_RPC=http://127.0.0.1:8545
```

- Terminal: `/`
- Launcher: `/terminal?panel=launch`
- Lifecycle console: `/admin/launchpad`
- Unified chain sandbox: `/admin/launchpad/sandbox`
- Execution architecture: `TERMINAL_CONTRACT_EXECUTION_V44.md`
- Build notes: `V44_BUILD_NOTES.md`
- Validation: `V44_VALIDATION.md`

### V44 terminal scope

- wallet-confirmed spot buys and sells;
- wallet-confirmed 2×–20× long and short opens;
- wallet-confirmed full position closes;
- ERC-20 approval handling for spot sells;
- confirmed receipt and execution-event decoding;
- one-second contract reserve, capacity, fee, debt, and sequence refresh;
- exact per-position executable equity and PNL from `quotePositionEquityWei`;
- confirmed transaction hash and block metadata in terminal state;
- connected-wallet native and token balance reconciliation;
- automatic browser-engine fallback for markets without a configured contract;
- duplicate-action protection while wallet confirmation or mining is pending.

### Intentionally withheld in direct-wallet contract mode

V44 does not pretend unsupported automation is live. Limit orders, trigger orders, TP/SL automation, collateral additions, fractional leveraged closes, and unattended liquidation execution are disabled for contract-backed markets until the authorized-session executor and keeper layer exist. Spot holdings may still be sold fractionally because each sale is an explicit wallet transaction.

> **Safety:** V44 is unaudited local software. It currently maps one configured demo market, uses native Anvil ETH instead of canonical Robinhood Chain WETH, and requires a wallet confirmation for every contract action. Factory-wide discovery, authoritative indexing, session-key execution, deposits and withdrawals, sponsored gas, redundant keepers, reorg recovery, production builds, Robinhood Chain deployment, and independent audits remain unfinished. Never use these contracts with public funds.

---

# PERPHOOD V43 — Unified BattlePool Settlement

V43 is the first executable local settlement bridge where **spot buys, spot sells, leveraged longs, leveraged shorts, manual closes, and liquidations all mutate one ordered exponent-5 BattlePool**. The creator launches a fixed one-billion-token market, receives no free allocation, buys from the same public curve, and is blocked from perps on the token at the contract layer.

## Run the application

```bash
npm install
npm run test:v43
npm run build
npm run dev
```

## Run the executable local chain

```bash
npm run chain:anvil
# in a second terminal
npm run chain:v43
```

Copy the printed `NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS` into `.env.local`, restart Next.js, and select **Anvil contract** in the Launcher. The bootstrap deploys the V43 factory, creates a demo market, seeds risk reserve, and submits real spot, long, and short transactions.

- Terminal: `/`
- Launcher: `/terminal?panel=launch`
- Lifecycle console: `/admin/launchpad`
- Unified chain sandbox: `/admin/launchpad/sandbox`
- Architecture: `UNIFIED_BATTLEPOOL_V43.md`
- Build notes: `V43_BUILD_NOTES.md`
- Validation: `V43_VALIDATION.md`

### V43 contract scope

- one shared curve and reserve state for spot and perps;
- real long-buy, long-sell, short-sell, and exact-token short-buyback pressure;
- 2×–20× leverage with reserve-aware position capacity;
- 0.30% local settlement fee accounting;
- creator and explicitly hard-linked wallet perps restrictions;
- closeability reservations for open longs and shorts;
- bounded liquidation sweeps;
- ordered sequence and state-hash commitments;
- migration blocked by open positions or bad debt;
- live contract state shown in the V43 sandbox.

> **Safety:** V43 is unaudited local software. Native Anvil ETH is a stand-in for canonical WETH. The normal terminal still uses the deterministic browser engine while the local-chain path is exercised through the Launcher, CLI, tests, and sandbox. Production terminal settlement, liquidation-aware internal stepping, custody, session keys, indexers, keepers, recovery, Robinhood Chain deployment, and audits remain unfinished. Never use these contracts with public funds.

---

# PerpHood V42 — Executable Local-Chain Launchpad Sandbox

V42 adds an honest local-chain execution layer to the V41 launchpad lifecycle. The Launcher now supports **Browser Simulator** and **Anvil Contract** modes. Contract mode deploys a real one-billion-token local market, executes the creator's post-gas genesis buy against the exponent-5 curve, supports local spot buys and sells, and records the factory, market, token, creator, block, and transaction receipt inside PerpHood.

### Start browser testing

```bash
npm install
npm run dev
```

### Start executable Anvil testing

```bash
npm run chain:anvil
# in a second terminal
npm run chain:v42
```

Then copy the printed factory address into `.env.local`, restart Next.js, and select **Anvil contract** in the Launcher funding step.

- Terminal: `/`
- Launcher: `/terminal?panel=launch`
- Lifecycle console: `/admin/launchpad`
- Chain sandbox: `/admin/launchpad/sandbox`
- Full local-chain guide: `LOCAL_CHAIN_LAUNCHPAD_V42.md`
- Build notes: `V42_BUILD_NOTES.md`
- Validation: `V42_VALIDATION.md`

> V42 is an unaudited local sandbox. Its executable contract covers launch creation and the spot bonding curve. Full perps settlement, canonical WETH, a trusted USD oracle, keeper redundancy, recovery, audits, and Robinhood Chain deployment are not complete.

---

# PerpHood V41 — Launchpad Test Alpha

V41 turns the existing terminal and BattlePool simulator into a complete **local creator-to-migration launchpad test harness**. Create test tokens from the terminal Launcher, reserve gas inside the creator's 0.001 ETH minimum total spend, execute the remaining value as the creator's real curve buy, observe the token under New Pairs, stress the shared pool, and migrate only after all seven safety gates pass.

### Start here

```bash
npm install
npm run dev
```

- Terminal: `/`
- Launcher: `/terminal?panel=launch`
- Launchpad test console: `/admin/launchpad`
- Full guide: `LAUNCHPAD_TESTING.md`
- Build notes: `V41_BUILD_NOTES.md`
- Validation: `V41_VALIDATION.md`

> V41 is local test software. The V41 Solidity files are unaudited references, not production contracts, and nothing in this build deploys to Robinhood Chain or accepts public funds.

---

# PERPHOOD V39 — Clean Shell + Full-Row Navigation

V39 keeps the V38 BattlePool, chart, alerts, Movers, sidecars, PNL, and spacious three-column terminal while simplifying the top navigation and making every non-control area of a token row open its market workspace.

See `V39_BUILD_NOTES.md` and `V39_VALIDATION.md` for this revision.

# PERPHOOD V36 — One-Demo Chart Research Workspace

V36 opens directly into one complete `HOOD` chart workspace so the terminal can be judged without placeholder-token clutter. It combines DEX Screener-style market-data density, Padre-style execution hierarchy, GMGN-style wallet intelligence, and PerpHood's own Buy × Sell × Long × Short BattlePool overlays.

See `CHART_WORKSPACE_RESEARCH.md`, `V36_BUILD_NOTES.md`, and `V36_VALIDATION.md`.

# PERPHOOD V35 — Complete Coin Trading Workspace

V35 makes the selected coin the primary professional trading workspace: one-second charting, unified Buy/Sell/Long/Short execution, live BattlePool solvency, liquidation mapping, executable PNL, partial position management, keyboard shortcuts, and saved Trade/Focus/Research layouts.

See `V35_BUILD_NOTES.md` and `V35_VALIDATION.md`.

# PERPHOOD V32 — Floating PNL + Trading Identity

V32 adds a draggable live-PNL window, session/today/7D/30D/all-time modes, a 35-day PNL calendar, Share to X, a 10,000-trade local history cap, and the recommended owner-wallet + contract-account + revocable session-key architecture. The external owner wallet remains user-controlled; the session key is non-exportable because it never owns the funds.

See `V32_BUILD_NOTES.md` and `V32_VALIDATION.md`.

# PERPHOOD V31 — Pro Terminal Controls + Multi-Dock

V31 adds six independent Markets/Movers execution profiles, fee presets, saved filters, a configurable positions/watchlist strip, a configurable Padre-style bottom utility bar, uncapped manual 360 FPS, and sidecars that can remain open together, move left/right, or detach into draggable floating windows. Every temporary settings menu dismisses on outside click or Escape.

See `V31_BUILD_NOTES.md` and `V31_VALIDATION.md`.

# PERPHOOD V30 — Live Movers Ranking Engine

V30 replaces the placeholder “largest percentage move” sort with PerpHood’s real rolling Movers algorithm. Rankings now combine transaction velocity, net WETH inflow, independent-wallet growth, market-cap acceleration, BattlePool pressure, liquidation proximity, real liquidity growth, like velocity, and market quality.

- **Rolling windows:** 15 seconds (45%), 1 minute (35%), and 5 minutes (20%).
- **Anti-wash ranking:** repeated actors, linked-wallet concentration, bad debt, and weak custody quality reduce visibility.
- **BattlePool-native signals:** leveraged activity and nearby liquidations influence ranking alongside spot flow.
- **Readable reasons:** each Movers row explains its strongest live ranking factors.
- **Stable discovery:** scores refresh every second, while a 2.5-point promotion threshold prevents rows from flickering.
- **Transparent weighting:** an in-terminal information panel shows the public category weights without exposing exploitable detection thresholds.
- **Most Liked and Highest Market Cap:** remain independent, straightforward rankings.

See `MOVERS_ALGORITHM.md`, `V30_BUILD_NOTES.md`, and `V30_VALIDATION.md`.

# PERPHOOD V28 — Official Gold Brand Mark

The current baseline keeps V27's readable terminal scale, independent New Pairs/Cooking/Migrated quick-buy amounts, #333333 identity, adaptive rendering up to 360 FPS, OG lineage search, account sidebar, and fixed-point BattlePool. V28 installs the new gold PerpHood symbol throughout the application, crops it tightly for small-size legibility, and adds production app, Apple, and favicon assets.

See `V28_BUILD_NOTES.md` and `V28_VALIDATION.md` for the brand integration details.


PERPHOOD is a Robinhood Chain-first memecoin market where **spot buys, leveraged longs, spot sells, and leveraged shorts all traverse one TOKEN/WETH BattlePool**. The pool—not a matched long/short order book—is the counterparty to every action.

V24 moves the most important financial boundary out of floating-point simulation and into an integer-only contract verifier.

## What V24 adds

- Integer-only exponent-5 BattleCurve reference in TypeScript and Solidity
- Identical WAD units and explicit down-rounding on both sides
- On-chain recomputation of curve price, cost, fees, protected inventory, and token movement
- Verified inventory transitions for Spot Buy × Long × Spot Sell × Short
- Exact-output token buy path for short repayment/liquidation
- Contract rejection of fake sequencer prices or mismatched curve deltas
- Logical conservation across all one billion tokens
- Gas-bounded liquidation continuation, capped at 16 liquidations per transaction
- Exact liquidation cursor and committed restart roots
- One ordered event indexer for 1s, 15s, and 30s candles plus executable PNL
- `/admin/v24-verification` visual verification lab
- Foundry V24 unit-test sources and dependency-free differential tests

## One BattlePool

```text
Spot buy     → WETH enters; tokens leave curve; price rises
Open long    → collateral enters; internal borrowed WETH buys real curve tokens
Spot sell    → tokens return; WETH exits; price falls
Open short   → adaptive inventory is borrowed and sold into the same curve
Close long   → locked tokens sell through the curve; debt is repaid
Close short  → exact borrowed tokens are bought back through the curve
Long liq.    → forced real sell
Short liq.   → forced exact-token real buy
```

There is no long-versus-short matching layer and no separate perp payout vault.

## Fixed-point authority

V24 uses:

```text
1 token     = 1e18 token units
1 ETH/WETH  = 1e18 WAD
Opening FDV = 0.25 ETH
Opening price = 250,000,000 wei per whole token
Curve allocation = 800,000,000 tokens
Initial short inventory = 100,000,000 tokens
Initial safety inventory = 100,000,000 tokens
Curve exponent = 5
Fee = 0.30%
Protected curve inventory = 6%
```

The 80/10/10 split remains a tested starting configuration—not an immutable product rule. Inventory permissions can adapt, but total supply can never exceed one billion tokens.

For sold amount `s`, allocation `A`, opening price `P₀`:

```text
price(s) = P₀ × (A / (A − s))⁵
cost(s)  = (P₀ × A / 4) × ((A / (A − s))⁴ − 1)
```

The Solidity verifier recomputes these values from integers. A sequencer cannot submit a chart price independently from the executable curve state.

## Gas-bounded liquidations

A large cascade may not fit safely into one EVM transaction. V24 therefore:

1. Starts a batch with an exact position count and positions root.
2. Pauses new user settlement while the batch is active.
3. Processes at most 16 liquidations per keeper transaction.
4. Commits the exact next cursor and state hash.
5. Resumes from that cursor until complete.

This preserves ordering without allowing a keeper to skip or reorder the unresolved battle.

## Unified chart + PNL stream

Every committed state event contains the same sequence, price, sold inventory, pool reserves, position root, balance root, and state hash.

That single stream generates:

- 1-second candles
- 15-second candles
- 30-second candles
- liquidation health
- executable close values
- live PNL

There is no separate chart-only price feed that can drift from payouts.

## Routes

- `/` — terminal and movers
- `/market/[slug]` — focused BattlePool terminal
- `/positions` — executable live PNL
- `/admin/risk-lab` — allocation and cascade simulator
- `/admin/local-chain` — V21 custody view
- `/admin/session-keys` — authorize-once execution
- `/admin/execution` — V23 full signed action pipeline
- `/admin/v24-verification` — fixed-point and event-stream verification

## Validation

```bash
npm install
npm run test:v24
npm run test:v24-benchmark
npm run chain:test:v24   # requires Foundry
npm run dev
```

Latest dependency-free local results:

```text
V23 regression suite: PASS
18,750 randomized BattlePool actions: PASS
40 × 20× short squeeze: 40 liquidations, 0 bad debt
40 × 20× long cascade: 40 liquidations, 0 bad debt
V24 floating/fixed differential: PASS
V24 six-action logical conservation: PASS
V24 ordered event stream: PASS
TypeScript/TSX syntax: PASS
```

Local V24 speed benchmarks:

```text
2,000 fixed-point curve operations
Average: 0.006535 ms
P95:     0.009284 ms
P99:     0.031046 ms

2,000 state frames × 40 positions = 80,000 executable PNL quotes
Average/frame: 0.143651 ms
P95/frame:     0.219838 ms
P99/frame:     0.334538 ms
```

These measurements exclude RPC transport, sequencer queueing, and blockchain finality.

## Security status

V24 is an **unaudited local prototype**. Never send real funds to these contracts.

V24 now verifies curve math and inventory movement on-chain, but production still requires:

- successful Foundry compilation and execution in the target environment;
- complete on-chain verification of position ownership, debt, collateral, PNL, and liquidation eligibility;
- Robinhood Chain test deployment and gas profiling;
- non-exportable device-backed session keys;
- redundant sequencers and relays;
- private MEV-resistant transaction delivery;
- independent smart-contract audits and formal verification;
- economic red-team simulation and legal review.

Read `V24_BUILD_NOTES.md`, `V24_VALIDATION.md`, `FIXED_POINT_BATTLECURVE.md`, `REALTIME_PNL_ARCHITECTURE.md`, `BATTLE_POOL_SPEC.md`, and `PRODUCTION_STATUS.md` before modifying settlement logic.

## V34 — Native X Launch Feed

The generic X tracker has been replaced by a launch-specific, official-API-backed feed. Each matched post can generate five editable ticker suggestions and populate the Launcher without closing the X sidecar. See `X_LAUNCH_FEED.md`.


## V34 clean status hierarchy

Read-only terminal information is now plain text. The refresh target renders only as `360 Hz` (or the currently selected target), while borders are reserved for clickable controls and inputs.
