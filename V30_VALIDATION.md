# V30 Validation

## Movers-specific tests

- Broad participation outranked higher-frequency one-wallet wash activity.
- Repeated-wallet activity received the maximum configured manipulation penalty in the synthetic attack vector.
- Recent activity decayed out of all rolling windows after ten minutes.
- Scores remained bounded from 0 through 100.
- Every scored market produced exactly three readable reasons.
- A 1.5-point lead did not reorder rows.
- A 3-point lead cleared the 2.5-point hysteresis threshold and promoted the challenger.
- UI static tests confirmed score refresh, algorithm disclosure, reasons, and readable styles.

## Complete regression

`npm run test:v30` passed, including:

- Session-key and authorization tests
- Full-action settlement
- Custody and frame tests
- 18,750 randomized BattlePool actions
- One-billion-token conservation
- Forty 20× short liquidations with zero bad debt
- Forty 20× long liquidations with zero bad debt
- Fixed-point curve verification
- Synchronized candle and executable-PNL stream
- OG lineage search
- Adaptive 360 FPS controls
- Readable terminal typography
- Independent quick-buy amounts
- Gold logo integration
- Integrated Movers/search workspace

## Environment limitation

`node_modules` is not included, so a full `next build` was not executed in this environment. All dependency-free TypeScript syntax and project regression scripts passed.
