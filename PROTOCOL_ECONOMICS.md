# LEVERAGE X V20 Economics — Adaptive BattlePool Working Model

## One market, one counterparty

Every spot and leveraged action traverses the same conserved TOKEN/WETH BattlePool.

- Spot buy: WETH enters, tokens leave, price rises.
- Leveraged long: collateral plus reserve-capped WETH credit buys real tokens, price rises.
- Spot sell: tokens enter, WETH leaves, price falls.
- Leveraged short: real borrowed tokens sell into the curve, price falls.

There is no matched long-versus-short settlement layer and no separate perp payout vault. The BattlePool is the counterparty, and every position must remain executable from its real reserves.

## Genesis

- Target opening FDV: **0.25 ETH**
- Total token supply: **1,000,000,000**
- Minimum creator launch spend: **0.001 ETH total**, with gas reserved first and the remainder used for the creator's first spot purchase
- Free creator allocation: **none**
- Creator fee privilege: **none**
- Creator/creator-linked leverage on the creator's own market: **prohibited where enforceable**

A creator or genesis whale receives only the tokens purchased through the public curve. A large early purchase is visible and attackable by shorts; the buyer is never guaranteed to recover the original WETH.

## Current execution fee

The simulator charges **0.30%** on executed actions.

- Spot buys: fee is included in the user's gross WETH input.
- Spot sells: fee is deducted from gross WETH output.
- Leveraged opens: fee is charged symmetrically on notional and paid in addition to collateral.
- Position closes: fee is paid only from positive residual equity after debt and accrued costs; a close fee cannot manufacture bad debt.

During V20 testing, fees remain inside BattlePool equity. Creator and holder reward extraction remain disabled.

## Leveraged long

1. Trader posts WETH collateral and entry fee.
2. The BattlePool extends reserve-capped WETH credit.
3. Collateral plus credit purchases real tokens through the BattleCurve.
4. Those exact tokens remain locked inside the position.
5. Closing or liquidation sells those tokens through the same curve.
6. WETH debt and accrued costs are repaid first.
7. A normal close pays remaining equity instantly; liquidation retains remaining equity in the pool.

## Leveraged short

1. Trader posts WETH collateral and entry fee.
2. The BattlePool lends real tokens from dynamic short inventory.
3. Those tokens sell through the same curve.
4. Sale proceeds stay locked as a position obligation.
5. Closing or liquidation uses locked proceeds and collateral to buy the tokens back through the curve.
6. Token debt and accrued costs are repaid first.
7. A normal close pays remaining WETH instantly; liquidation retains remaining equity in the pool.

## Liquidation equity

V20 retains only the equity that actually survives the forced close—not the trader's original collateral amount.

- Short liquidation: force-buy creates genuine upward pressure.
- Long liquidation: force-sell creates genuine downward pressure.
- Residual liquidated equity remains in the same pool.
- A sequence that would realize bad debt is rejected by the deterministic simulator.

## Atomic boundary sequencing

One large user order remains one user-visible action. Internally, V20 advances to the nearest of:

1. the next exact liquidation boundary,
2. the configured price-impact boundary,
3. the final requested fill.

At each boundary, liquidations settle deterministically before the remaining order continues. This prevents a large order from jumping over many 20× liquidation thresholds and producing avoidable insolvency.

## Adaptive supply configuration

The current tested starting point is:

| Bucket | Tokens | Initial share |
|---|---:|---:|
| Public BattleCurve | 800,000,000 | 80% |
| Short-borrow inventory | 100,000,000 | 10% |
| Adaptive safety inventory | 100,000,000 | 10% |

This is not a permanent tokenomics promise. V20 may release safety inventory into short-borrow inventory when utilization is high and real WETH depth is adequate, then reclaim unused inventory when demand cools.

Current policy bounds:

- Minimum safety floor: 4% of supply
- Maximum total short inventory: 22% of supply
- Release trigger: 65% utilization
- Reclaim trigger: 22% utilization
- Target utilization after rebalance: 52%
- Maximum movement per rebalance: 1% of supply
- Minimum real WETH depth before release: 0.5 ETH

Parameter searches remain authoritative over intuition. Allocations can change whenever better simulations demonstrate a safer or more effective market.

## Solvency rules

An action must be rejected before execution when it would violate:

- token conservation,
- protected curve inventory,
- protected WETH reserve,
- maximum pool utilization,
- collateral subledger reconciliation,
- locked short-proceeds obligations,
- synthetic long-credit obligations,
- available short inventory,
- executable close/liquidation paths,
- zero-bad-debt sequencing.

Displayed leverage and allowed size are separate. A market may support up to 20× while permitting only tiny positions until real reserve depth grows.

## Current non-goals

V20 is not production custody and does not yet claim audited:

- Robinhood Chain smart contracts,
- real deposits or withdrawals,
- protocol treasury extraction,
- creator or holder rewards,
- referral payouts,
- live oracle/indexer settlement,
- production keeper operation.

Those layers must preserve the same conserved accounting and instant-payout rules.
