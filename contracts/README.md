# PERPHOOD V43 unified BattlePool contracts

`LaunchpadFactoryV43.sol` deploys an executable local market where spot and leveraged actions share one exponent-5 curve, one physical token inventory, one native-test-ETH reserve, and one ordered state stream. Longs buy and later sell real curve inventory. Shorts borrow the dedicated perp inventory, sell it into the curve, and later buy the exact token amount back. Manual closes and liquidations use those same paths.

```bash
forge test --match-path contracts/test/LaunchpadFactoryV43.t.sol -vvv
```

The market enforces one-billion-token conservation, physical market custody, collateral reconciliation, short inventory reconciliation, creator/hard-linked perps restrictions, reserve-aware capacity, long and short closeability reservations, migration gates, and real-WETH obligation coverage.

V43 remains an unaudited Anvil sandbox. Native ETH must be replaced by canonical Robinhood Chain WETH, and production still requires a liquidation-aware sequencer, indexer, session-key custody, redundant keepers, recovery, migration custody, formal review, and independent audits. Never deploy it with public funds.

---

# PERPHOOD V42 local launchpad contracts

`LaunchpadFactoryV42.sol` is the first executable local launchpad/spot-curve sandbox. It deploys one-billion-token markets, executes the creator's genesis purchase against the exponent-5 curve, supports native-test-ETH spot buys and sells, retains the 0.30% fee in the market, enforces the direct creator-wallet perps prohibition, and commits migration lifecycle digests.

```bash
forge test --match-path contracts/test/LaunchpadFactoryV42.t.sol -vvv
```

This contract is intentionally narrower than the full V24 BattlePool verifier. It does not settle leveraged positions, provide a USD oracle, or implement final production migration custody. It is unaudited and must never be deployed with public funds.

---

# PERPHOOD V23 contracts

## `LocalBattlePoolV23.sol`

V23 is the local EVM custody, ordered-settlement, full-action session authorization, and keeper-liquidation prototype.

It deploys `BattleTokenV23`, holds the fixed one-billion physical supply, accepts local ETH custody, maintains internal user claims, commits balanced sequencer frames, and lets wallet-authorized sessions settle sponsored Buy × Sell × Long × Short actions without another wallet popup.

### Enforced by the contract

- exact token/WETH delta conservation;
- monotonic frame sequence and previous-state hash;
- intent-hash replay protection;
- physical custody coverage;
- reserved WETH ceiling;
- nonnegative pool and user claims;
- non-reentrant withdrawals;
- one owner per session key;
- active and unexpired sessions;
- exact session nonce ordering;
- action bitmap for SpotBuy, SpotSell, OpenLong, CloseLong, OpenShort, and CloseShort;
- maximum signed notional per intent;
- on-chain revocation and nonce preservation during reauthorization;
- sequencer-only liquidation batch frames with zero invented user payout.

### Enforced by the deterministic V23 engine and relay

- exponent-5 BattleCurve execution;
- leveraged token/WETH inventory and debt accounting;
- exact user position ownership on closes;
- partial position closes;
- price and slippage limits;
- liquidation-boundary processing;
- zero-bad-debt route rejection;
- durable staged state before chain submission;
- authoritative receipt and frame reconciliation before state promotion.

### Still required before production

- fixed-point on-chain BattleCurve verification;
- P-256 verification or an audited account-abstraction/session module on-chain;
- permissionless or redundant sequencer design;
- MEV-resistant ordering and private transaction delivery;
- creator-linked-wallet enforcement;
- Robinhood Chain testnet/mainnet integration;
- independent audits and adversarial economic review.

## Foundry

```bash
forge test --match-path contracts/test/LocalBattlePoolV23*.t.sol -vvv
```

These contracts are unaudited local prototypes. Never deploy them with real funds.
