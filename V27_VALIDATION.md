# LEVERAGE X V27 Validation

## Readability and quick-buy UI

- TypeScript/TSX syntax smoke: **passed across 122 files**
- Independent New Pairs quick-buy input: **passed**
- Independent Cooking quick-buy input: **passed**
- Independent Migrated quick-buy input: **passed**
- Source-column amount routing into row quick buys: **passed**
- Enter / Escape / blur commit behavior present: **passed**
- Quick-buy amount rendered directly on each green row button: **passed**
- Workspace localStorage persistence retained: **passed**
- Explicit CSS font declarations below 11 px: **none**

## Financial regression

- Randomized actions attempted: **18,750**
- Safe executions: **18,662**
- Unsafe routes rejected: **88**
- Final token conservation: **1,000,000,000**

### 40 × 20× short battle

- Liquidations: **40/40**
- Internal execution boundaries: **8**
- Bad debt: **0 ETH**
- Spot movement: **+257.96%**

### 40 × 20× long battle

- Liquidations: **40/40**
- Internal execution boundaries: **52**
- Bad debt: **0 ETH**
- Spot movement: **−68.59%**

## Full suite

`npm run test:v27` passed the V21–V27 dependency-free engine, authorization, settlement, fixed-point, search, 360 FPS, OG lineage, syntax, and UI regression suite.

## Runtime note

A complete `next build` still requires installed npm dependencies. The full lockfile and clean-install scripts are included.
