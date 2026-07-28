# Leverage X V75 — Spot-to-Perps Activation

V75 connects the successful mint path to the product's core differentiator.

After V74 proves a real Robinhood Chain token and canonical pool, V75 reads the pool directly and refuses activation unless all of the following are true:

- Robinhood Chain ID is 4663.
- The canonical pool has deployed bytecode.
- The pair is exactly the launched token and canonical wrapped ETH.
- Pool liquidity is greater than zero.
- `slot0` contains a nonzero initialized price.
- The pool is unlocked.
- The immutable token creator matches the launch evidence.

When those checks pass, V75 creates an engine-ready market activation manifest containing:

- canonical token and pool addresses;
- the first valid spot-price state;
- maximum leverage of 20×;
- a permanent creator-wallet trading block;
- a strict linked-wallet policy that requires strong cryptographic or operational evidence;
- launch transaction and block evidence.

V75 does not fabricate GMGN support and does not bypass the future perps engine's own solvency, oracle, margin, funding, slippage, and liquidation controls. It establishes the deterministic handoff from a valid Leverage X launch to perps-market eligibility.

Run after V74 verification:

```text
START_V75_ACTIVATE_FIRST_PERPS_MARKET.cmd
```

Outputs:

```text
deployments/v75-perps-market-activation.json
runtime/perps/markets/<token-address>.json
```
