# LEVERAGE X V43 Build Notes — Unified BattlePool Settlement

V43 removes the largest architectural split in V42: the launchpad and spot curve no longer stop where leveraged settlement begins. `LaunchpadMarketV43` now owns one ordered state for spot buys, spot sells, collateralized longs, inventory-backed shorts, manual closes, and liquidations.

## Delivered

- New `LaunchpadFactoryV43` and `LaunchpadMarketV43` contracts.
- Fixed one-billion-token supply with 800M curve, 100M perp inventory, and 100M safety inventory.
- Creator genesis purchase against the public exponent-5 curve.
- Creator wallet blocked from perps at execution; factory owner can add defensible hard-linked restrictions.
- 2×–20× long and short positions.
- Long opens buy the curve; long closes and liquidations sell the curve.
- Short opens borrow inventory and sell the curve; short closes and liquidations buy the exact borrowed inventory back.
- 0.30% spot, entry, and close fee accounting retained inside the local market.
- Real collateral, synthetic long credit, locked short proceeds, open interest, active-position, and bad-debt ledgers.
- Reserve-aware long and short capacity.
- Curve headroom reserved for exact short repayment so later buys cannot strand existing shorts.
- Spot-sell limits preserve enough sold inventory to unwind locked longs.
- Bounded automatic liquidation sweep after price-moving actions.
- Monotonic `StateCommitted` sequence and state hash for chart/indexer authority.
- Migration blocked while positions remain open or bad debt is nonzero.
- V43 Launcher client and Anvil deployment command.
- Local bootstrap deploys a factory, launches HOOD, seeds risk reserve, executes spot/long/short transactions, and writes a manifest.
- Sandbox API reads real unified state from the demo market.
- Sandbox UI displays price, market cap, WETH, free liquidity, OI, capacities, positions, sequence, and bad debt.
- V43 browser reference-engine, chain-client, contract-static, UI, and TypeScript regression tests.

## Deliberate boundaries

V43 is an executable local settlement sandbox, not a public-money release. Native Anvil ETH stands in for canonical WETH. The normal terminal still uses the deterministic browser BattlePool for instant interaction; real V43 chain execution is currently exercised by the Launcher, bootstrap CLI, contract tests, and chain sandbox. A production terminal adapter, event indexer, session-key relay, keeper network, oracle, and Robinhood Chain deployment remain separate milestones.

V43 liquidations are swept after each contract action. Production must either execute price movement in liquidation-aware internal steps or enforce an equivalent verified sequencer frame so a large action cannot jump across multiple liquidation boundaries without ordered settlement.
