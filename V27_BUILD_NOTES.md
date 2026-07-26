# PERPHOOD V27 — Readable Terminal + Independent Quick Buys

## Typography correction

V27 reverses the over-compressed V26 type scale. Functional UI text is no longer intentionally rendered below 11 px. The terminal now uses a practical hierarchy:

- 16–18 px: brand, token ticker, primary panel titles
- 13–15 px: prices, controls, category titles, primary values
- 11–12 px: metadata, secondary metrics, labels, badges, utility controls

The header, terminal toolbar, category headers, token rows, trade controls, search overlay, settings, account sidebar, tool dock, and legacy/admin surfaces all receive the readable minimum.

## Per-category quick-buy amounts

New Pairs, Cooking, and Migrated each expose an independent ETH amount field in the category header.

- Values are typed manually rather than cycled through presets.
- Each category value persists through the existing terminal workspace localStorage.
- Clicking a token's green quick-buy button uses the amount from the exact category where that button was clicked.
- The amount is displayed directly on the quick-buy button.
- Accepted range: 0.0001–100 ETH.
- Enter commits, Escape restores, blur commits.

## Layout adjustments

Readable typography required corresponding geometry changes:

- 58 px product header
- 54 px terminal toolbar
- 62 px category headers
- 118 px token rows
- 54 px token artwork
- Wider action rail for amount-bearing quick-buy buttons

The layout remains a three-column pro terminal, but it no longer sacrifices legibility for row count.
