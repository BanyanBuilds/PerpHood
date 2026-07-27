# LEVERAGE X V44 — Terminal Contract Execution

V44 connects the normal LEVERAGE X trading terminal to the executable V43 unified BattlePool on the local Anvil chain. A configured V43 market is no longer isolated inside the admin sandbox: Buy, Sell, Long, Short, and full Close actions are submitted by the user's injected EVM wallet, confirmed on-chain, decoded from V43 events, and reconciled back into terminal state.

## Authority model

For a token with `chainDeploymentMode: "anvil-v43"` and a valid `chainMarketAddress`, the V43 contract is authoritative for:

- marginal spot price and market cap;
- real and free WETH;
- curve, perps, safety, long-lock, spot-circulation, and short-borrow inventory;
- long and short open interest;
- active position count and bad debt;
- leverage-specific long capacity and short capacity;
- ordered state sequence/hash;
- exact position close equity through `quotePositionEquityWei`.

Other tokens continue using the deterministic browser BattlePool so the application remains usable without Anvil.

## Transaction lifecycle

1. The terminal recognizes a configured contract market.
2. The user selects a market action.
3. The injected wallet switches/adds Anvil chain `31337` and requests the account.
4. LEVERAGE X submits the V43 calldata and exact ETH value.
5. The client waits for a successful transaction receipt.
6. Trade, PositionOpened, or PositionClosed events are decoded.
7. `runtimeState()` and the wallet balance are read after confirmation.
8. The terminal updates reserves, price, capacity, holdings, positions, PNL, public Buy/Sell tape, transaction hash, block number, sequence, and state hash.
9. Contract positions are polled every second for exact executable equity and active status.

## Supported V44 actions

- Spot buy through `buy()`
- Spot sell through ERC-20 approval plus `sell(uint256)`
- 2×–20× long through `openLong(uint16,uint16,uint256)`
- 2×–20× short through `openShort(uint16,uint16,uint256)`
- Full manual perp close through `closePosition(uint256)`

## Deliberately withheld until authorized execution

Direct wallet confirmation cannot safely power unattended automation. V44 therefore does not pretend to support these features on contract markets:

- limit orders;
- trigger orders;
- take-profit or stop-loss automation;
- automatic local liquidation handling;
- margin additions;
- fractional perp closes;
- sponsored transactions;
- authorize-once session execution.

The V43 contract itself remains responsible for bounded automatic liquidation sweeps during executable actions. The next custody/session milestone will provide the authority needed for unattended orders and keepers.

## Known boundary

V44 is a local-chain execution bridge, not a production exchange. It still lacks canonical Robinhood Chain WETH, deposits and withdrawals, a production ledger, session-key custody, a durable event indexer, reorg recovery, redundant keepers, production RPC failover, audits, and public-fund readiness.
