# LEVERAGE X V32 Validation

Status: **PASS**

## V32-specific checks

- Floating live-PNL component present
- Drag, close, reset-position, reset-session, and reopen controls present
- Session / Today / 7D / 30D / All-time calculations validated
- 35-day calendar aggregation validated
- Share-to-X PNG card and X intent fallback present
- Owner-wallet / contract-account / session-key model visible in account sidebar
- One-active-wallet rule visible
- Closed-trade retention increased to 10,000 for local all-time prototype
- New gold logo installed in app icon, Apple icon, favicon, and shared brand asset
- No terminal font declaration below 11px

## Full regression

`npm run test:v32` passed, including:

- 18,750 randomized BattlePool actions
- 18,662 valid actions
- 88 unsafe routes rejected
- One billion tokens conserved
- 40 simultaneous 20× short liquidations with zero bad debt
- 40 simultaneous 20× long liquidations with zero bad debt
- Fixed-point BattleCurve proofs
- Session-key and authorized-settlement checks
- Dual OG ticker search
- Movers ranking engine
- Manual 360 FPS mode
- Multi-dock sidecars and outside-click settings dismissal
- 137 TypeScript/TSX files syntax validated

## Environment limitation

The complete Next.js production build still requires installed npm dependencies. `node_modules` is intentionally not bundled. Foundry contracts remain unaudited and must not receive real funds.
