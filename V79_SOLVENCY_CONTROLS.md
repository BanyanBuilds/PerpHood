# Leverage X V79 — Insurance Reserves and Solvency Controls

V79 replaces unrestricted per-market exposure with enforceable protocol risk limits.

## Added

- ETH-funded global and per-market insurance accounting.
- Per-market long, short, and combined open-interest caps.
- Maximum long/short skew limit.
- Minimum insurance floor before a market can accept positions.
- Fee splitting between protocol revenue and insurance reserves.
- Solvency checkpoint events after state-changing risk actions.
- Protected-liability, free-surplus, and solvency-ratio views.
- Owner insurance withdrawals limited to true surplus and blocked below the market floor.
- V76 creator/tradability enforcement and V78 TWAP pricing remain mandatory.

## Safety position

V79 is a controlled mainnet candidate, not an audited public-deposit release. The initial canary must use strict OI caps, meaningful insurance funding, one approved keeper, and small user limits. Public capital should remain disabled until an independent Solidity audit and adversarial economic review are complete.

## Run

1. `START_V79_CONTRACT_TESTS.cmd`
2. `START_V79_DEPLOY_SOLVENCY_ENGINE.cmd`
3. `PUSH_TO_GITHUB.cmd`
