# PERPHOOD V25 Validation

## Result

PASS for all dependency-free V25 and inherited V24 regression suites.

## V25 terminal checks

- Default dark surface centered on `#333333`.
- Terminal-only header with no Terminal / Launch / Portfolio / Speed / V24 navigation links.
- Right-side account drawer replaces the profile dropdown.
- Adaptive visual targets include Auto, 60, 120, 144, 240, and 360 FPS.
- Auto rendering can reduce its target after sustained missed frames and recover upward only after stable windows.
- Dual ticker search returns chronological lineage and market-cap-ranked results simultaneously.
- Absolute ticker origin remains first in lineage results.
- First ticker + artwork pairing receives a Robinhood-green OG mark.
- OG terminal rows receive a visible green identity rail.

## Search regression

The fixture `$COIN` lineage produced:

- Left: old origin → middle copy → newest pumping market.
- Right: newest pumping market → middle copy → old origin.
- New artwork with an existing ticker can receive a ticker+art OG mark without replacing the absolute ticker origin.

## Inherited financial regression

- 18,750 randomized BattlePool actions.
- 18,662 valid executions.
- 88 unsafe routes rejected.
- 1,000,000,000 tokens conserved.
- Forty 20× short liquidations: zero bad debt.
- Forty 20× long liquidations: zero bad debt.
- 1s / 15s / 30s candles and executable PNL remain synchronized to ordered BattlePool frames.

## Environment limitation

The full Next.js production build was not executed because npm dependencies are not installed in this environment. The TypeScript/TSX syntax smoke covered 120 source files, and all dependency-free V25/V24 suites passed.
