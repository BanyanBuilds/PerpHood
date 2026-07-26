# PERPHOOD V36 validation

## Complete regression

`npm run test:v36` passed.

- V21–V35 dependency-free regression: PASS
- V36 one-demo chart-workspace smoke: 10/10 PASS
- TypeScript/TSX syntax scan: 153 source files PASS
- Randomized BattlePool test: 18,750 attempted actions
- Safe executions: 18,662
- Unsafe routes rejected: 88
- Final token conservation: 1,000,000,000
- Forty simultaneous 20× short liquidations: zero bad debt
- Forty simultaneous 20× long liquidations: zero bad debt
- Fixed-point differential, custody, session-key, settlement, event-stream, Movers, X-feed, PNL, and terminal-interface regressions: PASS

## V36-specific assertions

- Exactly one demo token is exported.
- The root route opens that token's chart workspace.
- Discovery rail is removed when only one market exists.
- One-second deterministic candles render before a production feed is attached.
- Demo replay is clearly labeled.
- Market cap is the default chart scale and token price remains selectable.
- 5m / 1h / 6h / 24h transaction summaries are present.
- Creator, smart-money, sniper, and liquidation markers are present.
- Top traders, Insiders, Holders, Transactions, and BattlePool tabs are present.
- No explicit interface font declaration is below 11 px.

## Build limitation

A complete `next build` was not executed because `npm ci` could not install dependencies in the isolated build environment. `node_modules` is not bundled. Run `npm install` or `npm ci` locally before `npm run build`.
