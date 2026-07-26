# PERPHOOD V21 local-chain architecture

## Purpose

V21 proves the boundary between PERPHOOD's ultra-fast deterministic execution layer and conservative on-chain custody.

The local contract does not yet recompute the complete nonlinear BattleCurve. Instead, it enforces the properties that cannot be negotiable even while execution remains sequencer-driven:

1. one ordered state sequence;
2. one previous-state hash;
3. no reused intent hash;
4. exact WETH delta conservation;
5. exact token delta conservation;
6. no negative user or pool balances;
7. reserved payouts never exceed pool WETH;
8. physical ETH covers pool and user WETH claims;
9. physical tokens cover pool and user token claims;
10. users can withdraw their internal payouts directly.

## Custody model

The contract holds:

- real native test ETH;
- the entire one-billion-token physical supply;
- pool WETH claims;
- pool token claims;
- user internal WETH balances;
- user internal token balances.

A settlement frame only moves claims inside the contract. The total claim for each asset remains constant.

```text
sum(user WETH deltas) + pool WETH delta = 0
sum(user token deltas) + pool token delta = 0
```

Deposits and withdrawals are the only operations that change physical custody.

## Speed path

The browser calls `runtimeState()` to retrieve the complete frame plus available liquidity and custody-solvency status in one contract call. It requests `eth_blockNumber` in parallel.

Default local cadence:

```text
120 ms poll target
2 parallel RPC calls
1 static ABI frame
0 third-party web3 dependencies
```

The client includes a dependency-free Keccak-256 implementation and static ABI encoder/decoder. Known Ethereum selector and event vectors are regression-tested.

## Sequencer settlement adapter

`lib/chain/settlement-frame.ts` transforms a deterministic fill into the exact static ABI payload for `commitSingleAccountFrame`.

The adapter rejects any frame where trader and pool deltas do not conserve before the transaction reaches the RPC.

## Trust boundary

V21 still trusts the configured sequencer to calculate:

- executable price;
- curve movement;
- position health;
- liquidation order;
- PNL;
- open-interest roots;
- balance roots.

The contract does not trust the sequencer on accounting conservation, replay, order, reserves, or physical custody.

## Next security boundary

V22 should add session-key intents and sequencer signatures. V23 should move fixed-point curve verification and liquidation-boundary verification into contract libraries and differential tests.

## V22 session authorization layer

V22 adds a wallet-authorized session above the V21 custody spine. The wallet does not transfer custody to the browser key. It grants only a bounded trading authority defined by owner, P-256 public-key hash, expiry, action bitmap, maximum notional, and monotonically increasing nonce.

The local sponsored relay verifies the P-256 signature and reconstructs a spot-buy settlement from authoritative reserves. `LocalBattlePoolV22` then independently enforces session scope, ordered state, replay protection, conservation, reserves, and physical custody.

See `SESSION_KEY_ARCHITECTURE.md` for the canonical intent format and trust boundary.
