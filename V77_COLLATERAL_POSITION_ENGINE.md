# Leverage X V77 — Collateral Vault and Position Engine

V77 is the first contract that can custody ETH margin and enforce a real isolated long or short position against a V76-approved market.

## Included

- Free ETH collateral deposits and withdrawals at the protocol level; users still pay unavoidable network gas.
- One isolated-margin position per wallet per market.
- Long and short positions from 1× through the V76 market cap, never above 20×.
- V76 creator-wallet and proven-linked-wallet restrictions enforced on every open.
- Configurable per-market maintenance margin, open fee, close fee, oracle age, and notional ceiling.
- Stale and zero-price oracle rejection.
- Keeper-only liquidation after equity reaches maintenance margin.
- Open-interest tracking by side.
- Fees accounted separately from user collateral.
- No negative user balances and no position deletion without settlement or liquidation.

## Intentionally not claimed

This is not yet production-safe or ready for public deposits. V77 does not yet include a hardened Uniswap TWAP oracle, insurance fund, funding payments, partial liquidation, multi-keeper incentives, ADL, bad-debt resolution, or a completed external audit.

## Isolated contract validation

```text
START_V77_CONTRACT_TESTS.cmd
```

## Mainnet deployment

```text
START_V77_DEPLOY_PERPS_ENGINE.cmd
```

Deployment remains blocked until the V76 registry and a hardened mark oracle are actually live.
