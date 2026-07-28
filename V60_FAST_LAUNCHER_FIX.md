# Leverage X V60.1 — Fast Launcher + Non-Compressing Sidecar

## Product behavior

The token launcher now follows the minimum Leverage X launch rule:

1. A wallet must be connected.
2. One image or animated GIF must be selected or dropped.
3. The neon-green Continue control unlocks.
4. Leverage X generates the contract-safe name, ticker, and default description automatically.
5. The user reviews the fixed launch facts and signs the launch from the connected wallet.

No user-entered name, ticker, description, website, social link, or migration target is required.

## Wallet gate

Opening Launch Token while disconnected starts the wallet-connect flow first. The launch sidecar opens automatically after the wallet connection succeeds.

## Protocol-fixed migration

The migration target is no longer a user setting. The client always encodes the Leverage X protocol target, and `LeverageXLaunchFactoryV60` rejects any nonzero custom target that differs from the protocol constant. A zero input resolves to the same protocol constant for ABI compatibility.

## Sidecar behavior

The right-docked Launch Token panel is removed from the terminal grid flow and positioned over the workspace. Market and Movers columns keep their original width and category controls are no longer compressed. The rest of the terminal is not dimmed and remains visible; only the area physically covered by the launcher is occupied.

## Mainnet truth retained

This UI change does not activate mainnet launching. Launch signing remains blocked until the verified factory address, mainnet activation variable, and canary creator controls are valid.
