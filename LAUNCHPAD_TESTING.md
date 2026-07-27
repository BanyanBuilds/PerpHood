# Leverage X V42 Launchpad Test Sandbox

V42 keeps the complete browser creator-to-migration lifecycle and adds an executable Anvil launch/spot-curve path. It remains local-only, does not deploy to Robinhood Chain, and must not accept public funds.

## Open the local experience

```bash
npm install
npm run dev
```

- Main terminal: `http://localhost:3000/`
- Launcher: `http://localhost:3000/terminal?panel=launch`
- Launchpad test console: `http://localhost:3000/admin/launchpad`
- Selected market: `http://localhost:3000/market/<slug>`
- Launchpad health: `http://localhost:3000/api/launchpad/health`


## Executable Anvil mode

Start Anvil with `npm run chain:anvil`, then run `npm run chain:v42` in another terminal. Add the printed `NEXT_PUBLIC_V42_LAUNCHPAD_FACTORY_ADDRESS` to `.env.local`, restart Next.js, and select **Anvil contract** in the Launcher funding step. The local transaction deploys the token and market, executes the creator-buy remainder, and records the receipt addresses in the terminal. See `LOCAL_CHAIN_LAUNCHPAD_V42.md`.

## Launch accounting

The creator enters a **total launch spend**. The minimum is `0.001 ETH`, inclusive of estimated gas.

Example local quote:

```text
Total launch spend      0.00100 ETH
Estimated gas reserve   0.00018 ETH
Creator curve buy       0.00082 ETH
Free creator allocation 0 tokens
```

Gas is not deposited into the BattlePool. The remaining creator-buy value executes against the same exponent-5 curve used by every other spot buyer. The exact gas reserve is a quote and must be replaced by the real transaction estimate during chain integration.

## Local lifecycle

```text
Identity
→ Funding quote
→ Review
→ Local token + BattlePool record
→ New Pairs
→ Cooking
→ Migration safety gates
→ Migrating
→ Migrated
```

The same token object, balances, positions, event trail, and BattlePool accounting continue across migration. V41 does not reset open positions.

## Migration gates

A market cannot migrate merely because its displayed market cap reaches the target. All seven gates must pass:

1. USD market-cap target
2. Minimum real WETH depth
3. Free WETH covers position obligations plus buffer
4. Minimum short-side capacity remains available
5. Zero bad debt
6. Minimum independent trader participation
7. No active liquidation continuation or migration operation

The default test target is `$45,000`, with `$33,000`, `$40,000`, and `$50,000` available for local comparison. At the bundled `$3,200/ETH` reference, the `$45,000` curve estimate is about `1.209856 ETH` gross WETH and `44.267%` of total supply circulating. This is a deterministic test estimate, not a live oracle quote.

## Test console workflow

1. Open the Launcher and create a token.
2. Open `/admin/launchpad`.
3. Select the market.
4. Use **Advance to target** to seed distributed local flow across simulated wallets.
5. Run whale, cascade, and oracle-wick scenarios.
6. Inspect every migration gate.
7. Use **Migrate safely** only when every gate is green.
8. Open the token chart and verify that the same market and positions remain available.
9. Reset local state when the run is complete.

## Creator restriction

The creator wallet can buy and sell spot like any other holder, but it cannot open a long or short on its own token. V41 enforces this in the local provider and includes a reference contract assertion. Hard-linked-wallet enforcement remains future identity/risk infrastructure and must not rely on weak heuristics.

## Reference contracts

`contracts/src/LaunchpadFactoryV41.sol` provides an unaudited contract-shaped target for:

- one-billion fixed token supply;
- creator identity storage;
- creator-perps restriction;
- canonical token-to-market registry;
- bonding → migrating → migrated state machine;
- explicit migration gates and digest;
- token-address preservation.

It intentionally does **not** implement production BattlePool trading, WETH custody, oracle verification, keeper consensus, or a real Robinhood Chain deployment.

## Before public funds

Required external milestones remain:

- production factory and BattlePool contracts;
- audited WETH custody and withdrawal paths;
- authoritative Robinhood Chain RPC and event indexer;
- migration coordinator with live state proofs;
- redundant liquidators/keepers;
- sequencer outage and chain reorganization recovery;
- independent smart-contract and economic audits;
- closed testnet alpha with valueless funds;
- emergency pause, recovery, and reconciliation drills.
