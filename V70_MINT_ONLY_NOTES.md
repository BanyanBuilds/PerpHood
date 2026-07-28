# Leverage X V70 — Mint-Only Compile Gate

V70 removes unrelated historical contracts from the Foundry compilation path.
The `mintpath` profile now compiles only:

- the V65/V70 real token and launch factory
- permanent Uniswap V3 liquidity locker
- canonical token/WETH pool creation
- creator initial buy
- graduation/locked-liquidity behavior
- the focused mint-path tests

This intentionally skips the website build, old BattlePool contracts, and historical test suites. The only purpose is to reach the first real Robinhood Chain mint as quickly as possible.

Run `START_V70_MINT_ONLY_GATE.cmd` on Windows. It never requests a private key and never broadcasts a transaction.
