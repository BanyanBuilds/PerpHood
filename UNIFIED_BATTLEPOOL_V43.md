# Unified BattlePool V43

## Authoritative state

Every executable action mutates the same market state:

```text
curve sold inventory
curve token reserve
perp inventory
safety inventory
locked long inventory
circulating spot inventory
borrowed short inventory
real WETH balance
locked collateral
synthetic long credit
locked short proceeds
open interest
active positions
bad debt
state sequence and hash
```

The terminal chart, market cap, position equity, liquidation eligibility, capacity, and migration eligibility must ultimately be indexed from this state—not from a second mark-price system.

## Action mapping

```text
Spot buy       real WETH enters; curve tokens leave; price rises
Spot sell      tokens return; real WETH exits; price falls
Open long      collateral enters; synthetic debt buys real curve inventory
Close long     locked long inventory sells; debt is retired; residual is paid
Long liq.      same real curve sale, with residual retained by the pool
Open short     perp inventory is borrowed and sold into the curve
Close short    exact borrowed inventory is bought back and returned
Short liq.     same forced exact-token buy, creating real buy pressure
```

The public trade event intentionally reports only buy or sell direction. It does not expose whether a print came from spot, a position, a close, or a liquidation.

## Closeability reservations

V43 protects two unwind paths:

1. `maxSpotSellTokensWad()` prevents spot sellers from reducing curve-sold inventory below the tokens locked by open longs.
2. `maxCurveSoldWithShortReservationWad()` subtracts all borrowed short tokens from the maximum curve domain. New spot and long buys cannot consume the exact-token headroom required to close those shorts.

These reservations are intentionally conservative. Production can later improve capital efficiency with audited netting, but it cannot remove deterministic closeability.

## Solvency

`positionObligationsWei()` values all open long and short exposure against executable curve exits. `freeWethWei()` subtracts those obligations and the protected WETH buffer from real custody. New leveraged capacity is limited by both curve domain and free WETH.

Every state-changing path checks:

- logical one-billion-token conservation;
- physical market token custody;
- collateral-ledger reconciliation;
- short inventory reconciliation;
- executable position obligations versus real WETH.

## Ordering

Each action increments `stateSequence` and commits a chained `stateHash`. The committed state includes price, market cap, real WETH, inventory, OI, active positions, cumulative fees, and bad debt. This is the starting point for the production indexer and 1s/15s/30s candles.

## Production bridge after V43

The next settlement milestone is to connect normal terminal actions to the deployed V43 market through:

- canonical Robinhood Chain WETH custody;
- deposit and withdrawal ledger;
- revocable session-key authorization;
- deterministic sequencer frames;
- liquidation-aware internal action stepping;
- redundant keepers and permissionless fallback;
- authoritative event indexer and receipt reconciliation;
- production migration custody;
- audits and adversarial economic testing.
