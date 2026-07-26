# PERPHOOD V50 — Formal Invariants and Adversarial Settlement

V50 turns the V49 settlement formulas into continuously enforced safety properties. The goal is not to claim that the system is mathematically perfect; the goal is to make every critical accounting assumption explicit, machine-checkable, reproducible, and difficult to accidentally weaken.

## Core invariants

After every accepted state transition:

1. **Logical token conservation**

   ```text
   curve reserve
   + perps reserve
   + safety reserve
   + locked long tokens
   + circulating spot tokens
   = 1,000,000,000 tokens
   ```

2. **Physical token custody**

   The market's actual token balance equals every logical token bucket still held by the market.

3. **Collateral reconciliation**

   ```text
   locked collateral = locked long collateral + locked short collateral
   ```

4. **Short inventory reconciliation**

   ```text
   perps reserve + borrowed short tokens = initial perps allocation
   ```

5. **Position-book reconciliation**

   The sum of every active position record must exactly reproduce the aggregate long-token, long-debt, short-borrow, short-proceeds, and collateral ledgers.

6. **Guaranteed WETH solvency**

   ```text
   guaranteed position liabilities + protected WETH <= real WETH balance
   ```

7. **External ETH conservation in the reference engine**

   ```text
   sum(actor cash) + real BattlePool WETH = initial system ETH
   ```

   Synthetic notional may move the curve, but it cannot create or destroy external ETH.

## Fee-fragmentation hardening

Before V50, integer fee calculations rounded each fee down. A trader could split one sell into several dust sells and save a few wei because each individual fee discarded its remainder.

V50 changes protocol-fee rounding to **round upward** while retaining conservative downward rounding for token output and trader payout. Therefore:

- splitting a buy cannot reduce total protocol fees;
- splitting a sell cannot reduce total protocol fees;
- splitting a sell cannot increase total WETH proceeds;
- repeated buy/sell oscillation cannot manufacture value.

This changes execution by at most one wei of fee per action but removes a deterministic fragmentation advantage.

## Last-short-standing property

For a short opened at a higher curve state:

```text
payout = collateral + locked sale proceeds - exact full-token buyback - close fee
```

As the curve falls, the complete buyback becomes cheaper and the short payout rises monotonically. At the curve floor:

- the payout equals the exact maximum-short quote;
- profit cannot exceed original notional;
- payout cannot exceed collateral plus locked proceeds;
- closing repurchases every borrowed token and creates real buy pressure;
- the payout must still pass the post-close guarantee check.

## Adversarial verification included

### Exact-math attack suite

- 96 fee-fragmentation vectors;
- 500 repeated oscillation cycles;
- explicit last-short-at-floor settlement;
- 48 randomized five-position portfolios;
- all 120 close permutations for each portfolio;
- 5,760 total exhaustive close-order permutations;
- post-close solvency checked after every individual close.

### Stateful reference-engine suite

- 64 deterministic seeds;
- 384 actions per seed;
- 24,576 attempted actions;
- mixed spot buys/sells, longs, shorts, closes, rebalances, and liquidations;
- aggregate ledgers reconciled to active records after every step;
- real external ETH conservation checked after every step;
- unsafe transitions must reject without mutating the accepted state.

### Foundry invariant harness

`contracts/test/LaunchpadFactoryV50Invariant.t.sol` includes a stateful handler that targets:

- spot buys;
- spot sells;
- long opens;
- short opens;
- owner closes;
- permissionless liquidations.

The invariant campaign checks the contract's built-in assertions, live diagnostic snapshot, and active-position record sums after every randomized call. Foundry is configured for 512 runs and 128 calls per run with persistent counterexample storage.

## On-chain invariant diagnostics

The market now exposes:

```solidity
invariantSnapshot()
```

It reports raw values and pass/fail flags for:

- logical token conservation;
- physical token custody;
- collateral sub-ledgers;
- short inventory;
- guaranteed WETH solvency.

The terminal operations view is available at:

```text
/admin/invariants
```

## Security boundary

V50 materially strengthens verification, but it is not a substitute for:

- successful Solidity compilation;
- long-running Foundry invariant campaigns;
- Echidna or Medusa stateful fuzzing;
- symbolic execution or SMT proofs;
- mutation testing;
- independent economic review;
- independent smart-contract audits;
- controlled test-chain deployment.

No public funds are approved.
