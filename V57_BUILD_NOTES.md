# Leverage X V57 — Non-Modal Padre-Style Account Drawer

V57 continues the V56 Robinhood Chain mainnet-candidate baseline and replaces the oversized modal profile surface with a compact professional terminal drawer.

## Product changes

- Removed the full-screen black/blur profile backdrop.
- The account drawer now occupies only the right edge of the terminal.
- Markets remain visible while the drawer is open.
- Clicking a market behind the drawer closes the drawer and allows that click to continue.
- Escape and the close control still dismiss the drawer.
- Replaced the PH avatar with the Leverage X `LX` identity.
- Migrated X-profile local state to a Leverage X storage key while retaining legacy state compatibility.

## UI redesign

- Flattened the account experience into one continuous Padre-style utility surface.
- Removed the stack of independent boxed cards.
- Added a clean wallet identity row and a three-metric account strip.
- Retained PNL sharing, floating PNL access, win rate, realized/live/best PNL and the 35-day calendar.
- Consolidated navigation into Trading and Account groups with thin separators.
- Consolidated wallet, session key, X identity, settings recovery and synchronization into one compact Access & Sync section.
- Added a persistent minimal wallet-action footer.

## Safety and mainnet scope

V57 does not relax V56 deployment gates. Robinhood Chain mainnet deployment remains closed and paused by default, and public perpetual trading remains disabled until the BattlePool is ready and separately activated.
