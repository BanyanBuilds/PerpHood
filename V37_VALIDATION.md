# LEVERAGE X V37 validation

## Result

`npm run test:v37` — PASS

## UI checks

- No-scroll fixed desktop chart viewport
- Draggable chart/lower-panel divider
- Optional live-trades rail
- Optional lower data panel
- Simple four-action order rail
- Compact token-safety section
- Persistent chart preferences
- Outside-click settings dismissal
- Curated wallet/liquidation layers
- Clean default marker set
- Market-cap/token-price toggle
- Padre structure + GMGN chart controls

## Financial regression

- 18,750 randomized actions attempted
- 18,662 safe actions executed
- 88 unsafe actions rejected
- 1,000,000,000 tokens conserved
- 40 simultaneous 20× shorts liquidated with zero bad debt
- 40 simultaneous 20× longs liquidated with zero bad debt

## Source validation

- 156 TypeScript/TSX files passed syntax validation
- Readable typography check passed; no explicit interface font below 11 px
- V21–V37 dependency-free regression suite passed

## Limitation

The complete Next.js production compile requires `npm install`. No `node_modules` directory is bundled in the project archive.
