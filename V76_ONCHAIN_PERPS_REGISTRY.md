# Leverage X V76 — On-Chain Perps Market Registry

V76 converts the V75 eligibility manifest into enforceable Robinhood Chain state.

## What is enforced on-chain

- Only tokens whose immutable `launchFactory()` equals the configured Leverage X factory can activate.
- The submitted pool must be the canonical Uniswap V3 factory pool for the token/WETH pair and fee tier.
- The pool must have nonzero liquidity, a nonzero initialized price, and be unlocked.
- Maximum leverage can never exceed 20×.
- The immutable creator wallet is permanently blocked at activation.
- Proven linked wallets may be permanently blocked only with a nonzero evidence hash.
- Emergency pause can disable trading, but cannot erase market identity or creator blocks.
- Execution services can call `requireTradable()` before accepting every order.

## Deliberate boundary

This registry is the protocol admission and wallet-enforcement layer. It does not yet custody collateral, calculate funding, liquidate positions, or settle PNL. Those actions must be wired to this registry so no order bypasses its checks.

## Windows actions

1. `START_V76_DEPLOY_PERPS_REGISTRY.cmd`
2. `START_V76_ACTIVATE_FIRST_MARKET.cmd`

Both actions verify Robinhood Chain before sending transactions. Private keys are hidden and never written to project files.
