# Leverage X V88 — Immediate Perps at Mint

V88 makes the product rule enforceable in contract flow: **a token cannot be successfully minted unless its Spot pool and Perps market are created in the same transaction.**

## Atomic launch sequence

1. Deploy fixed-supply token.
2. Create and initialize the canonical token/WETH pool.
3. Lock launch liquidity.
4. Execute the creator genesis Spot buy.
5. Register the pool as a Perps market with leverage up to 20×.
6. Enable conservative bootstrap risk limits in the Perps engine.
7. Commit the launch record and emit launch events.

If steps 5 or 6 fail, the entire transaction reverts. There is no valid V88 state where a Leverage X token exists as Spot-only.

## Deployment wiring

- Deploy `LeverageXLaunchFactoryV88`.
- Deploy `LeverageXPerpsMarketRegistryV76` with the V88 factory address.
- Deploy `LeverageXImmediatePerpsEngineV88`.
- Deploy `LeverageXImmediatePerpsHookV88`.
- Registry owner authorizes the hook as an activator.
- Engine owner sets the hook as `marketBootstrapper`.
- Factory owner sets the hook with `setImmediatePerpsHook`.
- Keep `requireImmediatePerps = true` in production.

The creator wallet remains permanently blocked by the registry from longing or shorting its own token. Maximum position notional is deliberately bounded at birth and can expand later through audited risk updates as liquidity grows.
