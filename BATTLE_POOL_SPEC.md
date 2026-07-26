# PERPHOOD BattlePool Specification — V20 Adaptive Sequencer

## 1. Product invariant

Each token has one public TOKEN/WETH battlefield.

- **Spot buy:** external WETH enters; tokens leave the curve.
- **Leveraged long:** the trader posts WETH collateral, the pool extends internal WETH credit, and the full notional buys tokens from the same curve.
- **Spot sell:** tokens enter; external WETH leaves.
- **Leveraged short:** the trader posts WETH collateral, borrows real tokens from the short-inventory bucket, and sells those tokens through the same curve.

There is no long-versus-short matching engine and no separate perp payout vault. The BattlePool is the counterparty and settlement balance sheet for everyone.

## 2. Token balance sheet

Current default supply is one billion tokens:

| Bucket | Initial tokens | Purpose |
|---|---:|---|
| Public BattleCurve | 800,000,000 | Spot buys, spot sells, long buys, and liquidation execution |
| Short inventory | 100,000,000 | Real tokens that can be borrowed and sold by shorts |
| Adaptive safety | 100,000,000 | Closeability reserve and dynamic short-capacity source |

The allocation is configurable. V20 does not treat 80/10/10 as permanent.

The conservation invariant is:

```text
curve real tokens
+ available short inventory
+ safety inventory
+ tokens locked in longs
+ circulating spot tokens
= total supply
```

Borrowed short tokens are a debt/accounting quantity, not an additional physical token bucket. The actual borrowed tokens remain somewhere inside curve inventory, spot circulation, or long inventory after being sold.

## 3. BattleCurve

V20 uses a bounded power curve rather than a pump-style constant product.

```text
P(s) = P0 × (1 - s / C)^(-e)
```

Where:

- `P0` is opening price: opening FDV divided by total supply.
- `s` is net curve tokens sold. It may become negative when short selling pushes more tokens into the curve than were previously removed.
- `C` is the initial public curve allocation.
- `e` is the curve exponent; current default is 5.

The cumulative cost is integrated analytically so buys, sells, forced closes, and quotes are deterministic.

Current opening target:

```text
Opening FDV: 0.25 ETH
Total supply: 1,000,000,000
Opening marginal price: 0.00000000025 ETH
```

A protected curve floor prevents buyers from consuming the final 6% of public curve inventory.

## 4. Fee semantics

### Spot

A spot buy amount includes its 0.30% fee. The remaining amount moves the curve.

A spot sell moves the curve and deducts 0.30% from the WETH proceeds.

### Leveraged positions

Perp entry fees are symmetric:

```text
entry fee = position notional × 0.30%
```

The fee is paid in addition to collateral. The complete notional moves the curve; the fee does not silently shrink one side’s trade.

At close, debt and accrued position costs have priority. A close fee is collected only from remaining positive equity. Fees never manufacture additional bad debt.

## 5. Leveraged long accounting

Example:

```text
Collateral: 0.10 ETH
Leverage: 10×
Notional: 1.00 ETH
Internal WETH credit: 0.90 ETH
```

Open:

1. User deposits 0.10 ETH collateral and the entry fee.
2. The pool records 0.90 ETH internal credit.
3. The full 1.00 ETH notional buys tokens through the BattleCurve.
4. Tokens are moved from curve inventory into locked-long inventory.
5. Price rises.

Close:

1. Locked tokens are sold through the BattleCurve.
2. Internal WETH credit is repaid.
3. Accrued costs and the close fee are deducted.
4. Positive residual equity is paid instantly in WETH.
5. If liquidated, residual equity remains in the BattlePool.
6. If sale proceeds cannot repay debt and accrued costs, the difference is bad debt.

## 6. Leveraged short accounting

Open:

1. User deposits WETH collateral and the entry fee.
2. Real tokens move from available short inventory into borrowed inventory.
3. Those tokens sell through the BattleCurve.
4. The WETH proceeds remain locked inside the position ledger.
5. Price falls.

Close:

1. Locked sale proceeds plus collateral buy the exact borrowed token amount through the BattleCurve.
2. Tokens return to short inventory.
3. Accrued costs and the close fee are deducted.
4. Positive residual equity is paid instantly in WETH.
5. If liquidated, residual equity remains in the BattlePool.
6. If buyback cost exceeds proceeds, collateral, and accrued-cost coverage, the difference is bad debt.

## 7. Correct liquidation equity

V18 incorrectly counted an entire original collateral amount as retained liquidation equity. V20 retains only the equity that actually remains after the forced close.

Long:

```text
available = forced token-sale proceeds
required = WETH debt + accrued costs
residual = max(0, available - required - payable close fee)
```

Short:

```text
available = locked short-sale proceeds + collateral
required = exact token-buyback cost + accrued costs
residual = max(0, available - required - payable close fee)
```

On liquidation:

```text
trader payout = 0
residual equity → BattlePool
```

The original collateral is not double-counted. It was already economically committed to the position.

## 8. WETH solvency

The contract’s real WETH balance is shared capital, but current executable position equity is reserved before new withdrawals or leverage can consume it.

```text
free WETH = real WETH balance
          - current executable long equity
          - current executable short equity
          - protected WETH floor
```

Position equity is calculated using a real close through the current curve—not a simple market-cap percentage shortcut.

Every settled state must satisfy:

```text
position obligations + protected WETH ≤ real WETH balance
```

## 9. Atomic liquidation sequencing

A single large user order must not jump across many 20× liquidation boundaries and only liquidate afterward. That creates avoidable bad debt.

V20 treats the user action as one atomic order but internally advances to the nearest exact liquidation boundary, configured impact ceiling, or final fill.

For each segment:

1. solve the smallest input that moves a healthy position to maintenance margin,
2. apply the partial spot buy or sell to that boundary,
3. identify liquidatable positions,
4. liquidate the lowest health ratio first,
5. route the forced close through the same curve,
6. repeat until no unsafe positions remain,
7. verify WETH and token invariants,
8. continue the original order.

If a candidate route would produce bad debt, the simulator halves the step and retries. If no safe route exists, the transaction is rejected before state mutation.

This is an internal execution algorithm. The user should experience one fill, one receipt, and no wallet signature per sub-step.

## 10. Cascade ordering

Liquidations are deterministic:

1. lowest health ratio,
2. oldest open timestamp,
3. position ID as a final tie-breaker.

Each liquidation changes the next executable price. A short liquidation buys tokens and can make additional shorts unsafe. A long liquidation sells tokens and can make additional longs unsafe.

## 11. Adaptive short inventory

V20 can move tokens between safety and available short inventory.

Current policy:

- release trigger: 65% short-inventory utilization,
- reclaim trigger: 22%,
- target utilization after rebalance: 52%,
- maximum dynamic short inventory: 22% of total supply,
- minimum remaining safety inventory: 4% of total supply,
- maximum movement per rebalance: 1% of total supply,
- minimum real WETH depth before release: 0.5 ETH.

A release is capped by four independent constraints:

1. safety floor,
2. maximum short-inventory fraction,
3. desired utilization,
4. closeability headroom.

Closeability headroom preserves the rule that protected curve inventory plus remaining safety can source every borrowed token during a squeeze.

When utilization cools, dynamically released but unused tokens return to safety.

## 12. Current deterministic results

Default 80/10/10, exponent 5:

- 1 ETH genesis buyer receives about 42.60% of total supply.
- After an immediate short attack, the full developer exit returns about 0.509 ETH before broader market activity.
- Forty 20× shorts with 0.001 ETH collateral each are admitted after a 1.5 ETH seed.
- One 0.5 ETH sequenced spot buy liquidates all forty shorts.
- Short-squeeze bad debt: 0 ETH.
- Short-squeeze retained liquidation equity: about 0.013684 ETH.
- Short-squeeze final spot move: about +257.96%.
- Short-squeeze internal user-order segments: 8.
- Forty equivalent 20× longs are liquidated by a sequenced 10% seed-holder spot sale.
- Long-cascade bad debt: 0 ETH.
- Long-cascade retained liquidation equity: about 0.016000 ETH.
- Long-cascade internal user-order segments: 52.
- All one billion tokens remain conserved.

These are simulator outputs, not promises of production performance.

## 13. Production boundary

The TypeScript engine is a deterministic specification and local simulator. It is not an audited contract.

Before real funds:

- translate curve math into fixed-point Solidity,
- prove rounding bounds,
- property-test all transitions,
- fuzz transaction ordering and sandwich conditions,
- verify sequencer/contract state equivalence,
- audit session keys and sponsored gas,
- audit creator-linked-wallet restrictions,
- audit emergency pause and withdrawal behavior,
- complete legal and regulatory review.

## V21 ordered custody invariant

The local settlement contract adds a physical-custody layer around the reference engine.

For every committed execution frame:

```text
Σ trader WETH deltas + pool WETH delta = 0
Σ trader token deltas + pool token delta = 0
```

And after every mutation:

```text
physical ETH ≥ pool WETH claims + user WETH claims
physical token balance ≥ pool token claims + user token claims
reserved payout WETH ≤ pool WETH claims
```

The sequence number must increase by exactly one, the submitted previous hash must equal the stored state hash, and a nonzero intent hash may be consumed only once.

## V24 contract-authoritative curve boundary

V24 removes floating-point math from the settlement authorization path. The sequencer still computes and previews the route for speed, but `LocalBattlePoolV24` independently recomputes:

- exponent-5 cumulative curve cost;
- exact-input token output;
- exact-token short repayment cost;
- sell proceeds;
- 30-bps protocol fees rounded upward to prevent dust fragmentation;
- protected inventory ceiling;
- marginal price and market cap;
- spot, long, short, and safety inventory transitions.

A mismatched price, token amount, fee, or inventory bucket reverts the entire settlement.

Liquidation cascades use a committed cursor and at most 16 verified closes per transaction. User action settlement pauses while a batch is active. A stalled batch can be expired after ten minutes and restarted from the latest authoritative state.
