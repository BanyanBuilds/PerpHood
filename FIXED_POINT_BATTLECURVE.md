# V24 fixed-point BattleCurve

## Units

- Token amounts: token-WAD (`1 token = 1e18`)
- WETH values: WAD (`1 ETH = 1e18`)
- Prices: WAD ETH per whole token
- Fee and protection ratios: basis points

## Constants

```text
Total supply:              1,000,000,000 tokens
Curve allocation:            800,000,000 tokens
Initial perp inventory:       100,000,000 tokens
Initial safety inventory:     100,000,000 tokens
Opening FDV:                            0.25 ETH
Opening token price:              250,000,000 wei
Exponent:                                      5
Trade fee:                                  30 bps
Maximum curve sold:                       9,400 bps
```

## Rounding policy

- Fees round down.
- Exact-input buy output rounds down.
- Exact-token buy gross input rounds up to the minimum sufficient amount.
- Sell proceeds round down.
- Market price and market cap are recomputed after the verified inventory transition.

This rounding policy always favors solvency over optimistic payout.

## Verification boundary

For each user action, the contract receives a proposed proof and independently verifies:

- gross curve WETH;
- curve token amount;
- curve fee;
- sold-token state;
- marginal price;
- market cap;
- locked-long tokens;
- borrowed-short tokens;
- perp inventory;
- safety inventory;
- circulating spot inventory;
- physical account/pool delta conservation.

The contract rejects a state frame whose displayed price does not equal the executable integer curve price.
