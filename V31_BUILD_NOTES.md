# PERPHOOD V31 — Pro Terminal Controls

V31 turns the terminal controls into a coherent, persistent professional workspace.

## Six independent category profiles

New Pairs, Cooking, Migrated, Movers, Most Liked, and Highest Market Cap each save their own:

- Manual quick-buy amount
- Economy, Fast, Turbo, or Custom fee preset
- Buy and sell priority-fee values
- Automatic or custom buy/sell slippage
- Default 2×, 5×, 10×, or 20× leverage
- Maximum acceptable price impact
- MEV/sandwich protection preference
- Minimum market cap, liquidity, and holder filters
- Maximum token age
- Positive-only, OG-only, and concentration filters

The settings currently drive local quick-buy fee-tier selection, quick-trade collateral/leverage defaults, and visible filtering. Production priority-fee, slippage, and MEV enforcement still requires the live relay and Robinhood Chain settlement integration.

## Persistent position/watchlist strip

The compact strip under the command bar can independently show or hide positions, watchlist, executable PNL, and market cap. The number of visible chips and strip density are saved.

## Multi-dock sidecars

Launcher, X Tracker, Trade Tracker, Watchlist, Wallets, Alerts, Perp Pulse, Positions, and Quick Trade may remain open simultaneously. Every sidecar supports:

- Move left
- Move right
- Detach into a draggable/resizable floating window
- Close

Panel placement persists with the workspace.

## Bottom utility dock

The Padre-style bottom bar can independently show/hide connection status, Launch, engine status, and labels, with a compact-height option.

## Interaction rules

- Temporary settings popovers close on outside click or Escape.
- Persistent sidecars remain until explicitly closed.
- Manual 360 FPS is never capped by Auto monitor detection. Auto remains the conservative recommendation.
