# LEVERAGE X V32 — Floating PNL + Trading Identity

V32 adds the portable live-PNL experience traders expect without weakening Leverage X's one-wallet/no-multiwallet execution policy.

## Floating executable PNL

- Draggable anywhere in the terminal
- Close and reopen from the bottom utility bar or terminal settings
- Reset position independently from PNL history
- Reset the current session timestamp at any time
- Session, Today, 7D, 30D, and All-time modes
- Realized, live executable, total PNL, trade count, win rate, and best trade
- Expandable 35-day PNL calendar
- Persistent widget location and visibility
- Share-to-X card generation

Live values use the existing executable close quote engine. They are not calculated from a cosmetic mark-price shortcut.

## All-time PNL

The local prototype now retains up to 10,000 settled trades rather than only 120. The account sidebar shows:

- Realized PNL
- Current executable PNL
- Combined all-time PNL
- Trade count and win rate
- Best trade
- 35-day calendar

Production must replace browser-local history with an authoritative indexed account ledger keyed to the trading account.

## Wallet and X identity model

V32 locks the recommended architecture:

1. **External owner wallet** — user controlled; its private key remains in the user's wallet and is exportable there.
2. **Leverage X trading account** — contract account owned by the external wallet; funds can always be withdrawn by the owner.
3. **Session key** — non-exportable, scoped, revocable, and never owns funds.
4. **One active owner wallet at a time** — switching wallets revokes the current session authorization.
5. **One X profile per Leverage X identity** — used for verified profile, PNL sharing, and anti-abuse identity, not for custody.

Leverage X should never create an unexportable seed wallet that can trap user funds.

## Sharing

The browser generates a 1200×675 PNL card. Devices supporting file sharing can share the image directly. Desktop fallback downloads the PNG and opens the X composer with the PNL text.

## Branding

The newly supplied gold mark is tightly cropped and installed as:

- Header/app logo
- Next.js app icon
- Apple touch icon
- Browser favicon

The supplied upload is a raster PNG, so V32 preserves it faithfully rather than pretending it is true editable vector artwork.
