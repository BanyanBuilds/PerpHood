# Leverage X V67 — Contract Compile Gate

V67 is a focused mainnet-readiness correction build created from the V66 full project after the first real Windows/Foundry execution pass.

## Corrections

- Added the missing `Waves` icon import that blocked TypeScript.
- Corrected the V65 Uniswap position-manager mint tuple declaration.
- Converted the four Robinhood Uniswap address literals to Solidity-required EIP-55 checksum casing without changing any address value.
- Updated the stale V54 and V55 zero-genesis-buy tests to expect the implemented `InvalidGenesisBuy` custom error.
- Made the execution gate invoke `npm.cmd` on Windows while retaining `npm` on macOS/Linux.
- Added focused V67 static controls and a V67 strict gate.

## Safety

No wallet credential is included. No transaction is signed or broadcast. Public launch and perps activation remain closed.

## Windows helper

`RUN_V67_CONTRACT_TEST.cmd` can be double-clicked. It temporarily adds the standard Foundry install directory to PATH, installs dependencies when needed, runs TypeScript validation, and runs the V65 Foundry contract test. It never signs or broadcasts a transaction.
