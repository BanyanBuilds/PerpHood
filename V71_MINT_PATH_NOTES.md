# Leverage X V71 — Mint Path Recovery

V71 fixes the first isolated V70 compiler blocker: the mint-only Foundry profile imported `BattleCurveMathV24.sol`, but that dependency was not included inside `contracts/mint-path-src`.

The active compile path now contains both required Solidity source files:

- `LeverageXLaunchFactoryV70.sol`
- `BattleCurveMathV24.sol`

The active Foundry profile remains isolated from the historical BattlePool contracts and old launch-factory tests. Its only target is the real token-launch path: ERC-20 deployment, canonical token/WETH pool creation, permanent liquidity locking, creator initial purchase, and graduation behavior.

`START_V71_MINT_PATH.cmd` displays compiler/test output directly and does not request or use a wallet, private key, RPC secret, or transaction.
