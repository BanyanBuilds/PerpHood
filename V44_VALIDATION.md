# PERPHOOD V44 Validation

Date: July 25, 2026

## Passed

`npm run test:v44`

This includes the complete inherited V21–V43 regression chain plus:

- V44 Trade event decoding;
- V44 PositionOpened event decoding;
- signed PositionClosed PNL decoding;
- V43 runtime-state to terminal-state mapping;
- wallet-confirmed Buy/Sell/Long/Short/Close static integration;
- exact `quotePositionEquityWei` terminal PNL integration;
- contract-state polling without a render-driven polling loop;
- contract receipt metadata persistence;
- direct-wallet automation restrictions;
- V44 UI execution-state coverage;
- TypeScript/TSX syntax checks across 189 files.

Inherited stress validation continues to include:

- 18,750 randomized BattlePool actions;
- 40 simultaneous 20× short liquidations with zero bad debt in the controlled cascade;
- 40 simultaneous 20× long liquidations with zero bad debt in the controlled cascade;
- fixed one-billion-token conservation;
- fixed-point curve and settlement verification;
- session-key tamper/replay/scope tests;
- terminal, chart, Movers, launchpad, and layout regressions.

## Not run in this assembly environment

- `npm run build`: project dependencies were not available. `npm ci` did not complete in the container.
- `forge test`: Foundry/Anvil were not installed.
- Live injected-wallet transaction test: requires a browser wallet, Anvil, compiled/deployed V43 contracts, and the generated deployment manifest.

These missing environment validations must be completed locally before the next chain milestone. V44 remains unaudited local software and must not receive public funds.
