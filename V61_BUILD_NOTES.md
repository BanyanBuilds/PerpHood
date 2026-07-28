# leverage X V61 — Launchpad Creation + How It Works

V61 restores the fast launchpad workflow while keeping creators in control of the token identity.

## Token creation

- A connected wallet is required before the Launch Token sidecar opens.
- Required creator inputs: token name, ticker, and image/GIF.
- Optional inputs: description, website, X/Twitter, and Telegram.
- The empty artwork field is a standard click-or-drop upload surface; no fake emoji/image choices are shown.
- The Launch Token button becomes neon green only when all required values are valid.
- Migration target, fixed supply, curve rules, and creator-allocation policy remain protocol controlled and are not creator inputs.

## Initial creator buy

Clicking Launch Token opens a compact final-step popup. The creator selects the total ETH they want to spend on launch, with a protocol minimum of 0.001 ETH total inclusive of gas. The remaining amount after gas becomes the initial token buy. Mainnet canary limits remain enforced.

## Terminal layout

The launcher remains a non-modal right-side overlay. Opening it does not resize the underlying Markets/Movers grid or compress category settings. The live terminal remains visible.

## How It Works

A new How It Works overlay explains:

- Launching a memecoin
- Initial creator purchase
- Spot price formation
- Long and short positions
- Margin, leverage, PNL, voluntary closing, and liquidation
- Why 20x leverage moves liquidation closer rather than preventing liquidation

The overlay includes a local interactive example for margin, leverage, price movement, PNL, and illustrative liquidation distance.

## Safety boundaries

V61 does not deploy contracts, broadcast transactions, open public launching, or activate Long/Short trading by itself. Existing mainnet closed/paused deployment controls remain in place.
