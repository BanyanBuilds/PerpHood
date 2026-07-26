# PERPHOOD V49 — Settlement Math Verification

V49 hardens the economic core of PERPHOOD. Its purpose is not to claim that the protocol is mathematically "perfect" before formal verification and audit. Its purpose is to make every displayed leveraged payout traceable to one exact settlement path, prove the important invariants independently, and reject new exposure whenever all existing positions cannot remain payable.

## The authoritative rule

PERPHOOD does not calculate leveraged PNL as a simple market-cap percentage multiplied by leverage. Every position is settled by executing the complete reverse trade across the shared BattleCurve:

- A long closes by selling its exact locked token inventory back down the curve.
- A short closes by buying its exact borrowed token inventory back up the curve.
- The close fee is charged on the full reverse curve action.
- Debt, collateral, locked short proceeds, and bad debt are reconciled in the same quote.
- The terminal calls a quote executable only when the payout and every remaining guaranteed liability fit after the close.

## Exact short behavior at the curve floor

For a short position:

```text
funds = collateral + locked sale proceeds
buyback cost = exact integral required to repurchase every borrowed token
close fee = min(buyback cost × fee rate, positive surplus)
payout = max(funds - buyback cost - close fee, 0)
PNL = payout - collateral
```

As the shared curve falls, the exact full-inventory buyback becomes cheaper and the short payout rises monotonically. At the minimum executable curve state, the position reaches its maximum possible payout:

```text
maximum short payout = collateral + locked proceeds
                       - exact floor-to-repayment buyback cost
                       - close fee
```

The trader does not receive infinite profit, and the result is not simply `leverage × displayed price decline`. The payout is bounded by the funds reserved for the position and the complete reverse path. Profit cannot exceed the original notional exposure in the verified model.

## The V49 reserve correction

The audit found a material aggregate-accounting edge case in the previous obligation calculation. It combined gross equity and debt across different positions. An underwater position could therefore reduce the aggregate reserve attributed to another profitable position.

V49 no longer cross-nets heterogeneous position liabilities.

The guaranteed reserve now conservatively includes:

1. Every short's complete collateral and locked sale proceeds.
2. The gross curve value required to close all locked long inventory at the highest curve state reachable after existing shorts repurchase their borrowed tokens.
3. The protected liquidity reserve.

Debt and close fees can reduce the eventual payout, but they are not allowed to reduce the amount reserved for somebody else's position.

## New on-chain settlement quote

`quotePositionSettlement(positionId)` returns:

- direction;
- gross reverse-curve amount;
- close fee;
- payout;
- signed PNL;
- bad debt;
- guaranteed obligations remaining after the close;
- projected contract balance;
- whether the payout is payable now;
- whether the position is liquidatable.

`quoteMaximumShortPayoutWei(positionId)` returns the exact short payout at the curve floor.

The terminal now distinguishes:

- **Quoted PNL:** the mathematical settlement result at the current state.
- **Executable PNL:** the quote has also passed the post-close solvency test.

A close is disabled rather than advertised as executable when the quote cannot preserve all remaining guaranteed obligations.

## Prospective solvency

Both `quoteOpenLong` and `quoteOpenShort` now calculate the guaranteed liabilities that would exist after the proposed opening. The position is rejected before execution when:

```text
post-open guaranteed obligations
+ post-open protected reserve
> post-open contract balance
```

This intentionally reduces leverage capacity. Capacity is a solvency output, not a marketing setting.

## Independent mathematical oracle

The production curve uses conservative fixed-point arithmetic. V49 adds a separate BigInt rational implementation of the exponent-five marginal-price function and its exact mathematical integral. The verification suite compares the production fixed-point path against this independent oracle rather than testing the implementation against a copy of itself.

The tested curve is:

```text
P(s) = P0 × (A / (A - s))^5
```

with cumulative cost:

```text
C(s) = (P0 × A / 4) × ((A / (A - s))^4 - 1)
```

where `A` is curve allocation and `s` is sold curve inventory.

## Verified properties

The V49 suite checks:

- exact-rational marginal price and integral vectors;
- conservative fixed-point rounding;
- spot round trips cannot create value;
- long and short same-state reversals restore curve inventory and pay deterministic fees;
- short payout never decreases as the curve falls;
- floor payout equals the advertised maximum short payout;
- short profit does not exceed original notional;
- every tested close ordering is covered by guaranteed liabilities;
- an underwater position cannot net away another position's reserve;
- `payableNow` includes post-close obligations and protected reserves;
- terminal PNL and close controls consume the same contract quote.

## Safety boundary

V49 is a major mathematical correction and verification milestone, not a completed proof of protocol safety. Production still requires:

- successful Solidity compilation and Foundry invariant tests;
- stateful fuzzing with Echidna or Medusa;
- symbolic analysis and SMT-backed properties;
- independent economic review;
- independent smart-contract audits;
- adversarial test-chain execution;
- oracle, finality, sequencer, keeper, and custody audits.

No public funds are approved.
