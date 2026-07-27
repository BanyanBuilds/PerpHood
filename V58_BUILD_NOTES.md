# Leverage X V58 — Launch Token UI

## Product direction

V58 replaces the cramped legacy launch form with a wider, non-modal token-creation workspace. The structure draws from the strongest interaction patterns in professional trading terminals and modern memecoin launchers while retaining an original Leverage X visual system.

## Changes

- Renamed the user-facing action from **Launch BattlePool** / **Launch market** to **Launch Token**.
- Removed the oversized “Mint a real one-billion-supply memecoin” marketing headline from the utility panel.
- Rebuilt the launch workflow into three clear phases:
  1. Coin details
  2. Launch setup
  3. Review
- Added a clean coin-details hierarchy with name, ticker, description, and collapsible social links.
- Added a large artwork/GIF upload surface, supported-format guidance, quick emoji placeholders, and a live token preview.
- Preserved OG/copy identity detection and artwork-similarity warnings.
- Flattened funding and review information into readable terminal rows rather than nested card piles.
- Kept the creator’s **0.001 ETH total budget inclusive of gas** explicit.
- Preserved mainnet factory truth: the final action stays locked until a verified factory address exists.
- Widened the right-docked and detached launch workspace while keeping the Markets/Movers terminal visible and interactive.
- Rebuilt the LX vector from the original monogram with a transparent canvas and app-icon optical padding.
- Regenerated favicon, Apple icon, PWA icons, transparent PNG mark, and social preview assets.
- Removed the remaining boxed/glowing treatment from the brand mark.

## Regression gates

- V55 real-terminal checks: 70/70
- V55 Vercel regression checks: 12/12
- V56 mainnet-candidate checks: 26/26
- V57 profile-drawer checks: 15/15
- V58 Launch Token UI checks: 21/21
- TypeScript/TSX syntax smoke: 315 files

## Remaining external gate

A clean `next build` requires dependency installation. The build environment used to package V58 could not download one uncached npm dependency from its package gateway, so Vercel remains the authoritative production compiler for this delivery.
