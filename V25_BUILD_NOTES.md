# PERPHOOD V25 — 360 FPS Dark Terminal

V25 turns the application into a terminal-only product surface and establishes the default visual identity around dark `#333333` surfaces.

## Terminal-only shell

- Removed the unused Terminal / Launch / Portfolio / Speed / V24 top navigation.
- Kept one compact brand/status/account header.
- Account controls now open a full-height right sidebar rather than a dropdown.
- Increased high-value terminal text from the legacy 5–8 px range into a readable 9–13 px professional terminal scale.

## Adaptive visual refresh

- User targets: Auto, 60, 120, 144, 240, or 360 FPS.
- Auto mode uses display refresh, hardware tier, and sustained measured frame rate.
- Auto mode steps down when sustained performance falls materially below target and only steps back up after stable recovery windows.
- The FPS target controls visual interpolation. It does not fabricate BattlePool events or alter authoritative execution state.
- Chart movement and live PNL remain sourced from the same ordered BattlePool frames.

## Dual ticker lineage search

Clicking the terminal search opens a high-opacity center-screen market finder with two simultaneous result lists:

1. **Ticker lineage** — ticker origin first, then oldest to newest.
2. **Market-cap leaders** — largest to smallest, so the currently pumping version is immediately visible.

The search accepts `$TICKER`, token names, and contract identifiers.

## OG identity

- The absolute first observed use of a ticker is marked as the ticker origin.
- The first observed ticker + artwork pairing receives a Robinhood-green `OG` badge.
- Reusing the same ticker with genuinely new artwork may establish a new ticker+art OG pairing, while the original ticker listing remains first in lineage search.
- Compact terminal views suppress noisy COPY badges and emphasize OG markets with a green badge and left-edge rail.
- OG is first-seen metadata, not an endorsement or ownership verification.

## Validation

- Existing V24 deterministic BattlePool suite remains unchanged.
- Added a dual-search regression test for chronological lineage, market-cap ranking, and ticker+art OG assignment.
- Added a static terminal test for the #333 theme, removed nav, profile sidebar, OG rail, and adaptive 360 FPS mode.
