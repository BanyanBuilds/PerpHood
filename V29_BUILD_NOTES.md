# V29 Build Notes

## One Leverage X shell

- Removed the duplicate site header from the primary application route.
- Removed visible `Terminal` and `Trenches` product labels from the main shell.
- Merged branding, view selection, chain status, compact search, FPS, account controls, and settings into one command bar.
- Removed nonfunctional 3-column/grid/customize controls rather than leaving dead buttons in the interface.

## Integrated Movers workspace

The new `Markets / Movers` switch changes the center workspace instantly and preserves all side drawers, the account sidebar, tool dock, FPS mode, quick-buy settings, OG indicators, and Buy/Long/Short actions.

The Movers workspace contains three scrollable columns:

1. **Movers** — absolute live price movement, then volume.
2. **Most Liked** — community likes, then volume.
3. **Highest Market Cap** — every active market ranked from largest to smallest.

Each ranking column has an independently saved ETH quick-buy amount and its own search field.

## Search overlay

- Moved the search modal to the true viewport center.
- Reduced the backdrop to a light smoky 34% shade and 2 px blur.
- Kept the modal itself nearly opaque for readability.
- Reduced the command-bar search width so it no longer dominates the header.
- Preserved the two-list OG lineage + current market-cap leader experience.
