# PERPHOOD V35 Validation

## Complete regression

`npm run test:v35` passed.

This includes the entire V21–V34 suite plus the V35 trading-workspace checks.

## Financial engine

- 75 deterministic fuzz seeds
- 18,750 attempted actions
- 18,662 safe executions
- 88 unsafe actions rejected
- One billion tokens conserved
- 40 simultaneous 20× short liquidations: zero bad debt
- 40 simultaneous 20× long liquidations: zero bad debt

## V35 UI checks

- Trade / Focus / Research layout switching
- Keyboard Buy / Sell / Long / Short commands
- Keyboard amount and leverage presets
- Unified four-action ticket
- BattlePool risk/solvency ribbon
- Real account liquidation map
- Partial position closes
- Collateral additions
- Breakeven and take-profit controls
- Spot executable-value manager
- Selected market, chart, positions, and data within one workspace
- Readable 11–15 px V35 type hierarchy

## Source validation

- TypeScript/TSX syntax smoke passed for 150 source files.
- V35 static workspace smoke passed 10/10 checks.

## Build limitation

A complete `next build` was not completed in this environment. `npm ci` could not finish before the environment timeout, so generated/partial `node_modules` content was removed before packaging. Run `npm install` or `npm ci` locally before the production compile.
