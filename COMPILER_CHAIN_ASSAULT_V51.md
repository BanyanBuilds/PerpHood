# LEVERAGE X V51 — Compiler-Backed Chain Assault

V51 moves the V50 settlement guarantees from model-only verification toward hostile compiled-contract execution. The milestone adds deadline and slippage constraints to every terminal and keeper position path, adversarial Solidity actors, a reproducible Foundry assault profile, and a complete Anvil lifecycle runner.

## Protected settlement methods

The BattlePool now exposes direct-wallet variants with explicit execution bounds:

- `buyWithLimits(minTokenOutWad, deadline)`
- `sellWithLimits(tokenAmountWad, minWethOutWei, deadline)`
- `openLongWithLimits(..., minTokenAmountWad, deadline)`
- `openShortWithLimits(..., maxBorrowedTokensWad, minLockedProceedsWei, deadline)`
- `closePositionWithLimits(positionId, minPayoutWei, deadline)`

The V45 account router exposes matching direct-account and authorized-session variants. A failed limit check reverts the entire nested market/router transition, including token transfers, account debits, position creation, events, and state-sequence changes.

## Why a short needs two entry bounds

A stale short quote can fail in two economically distinct ways:

1. The curve falls before inclusion, so the same notional requires borrowing more tokens.
2. The actual short sale produces less locked WETH than quoted.

V51 therefore binds both `maxBorrowedTokensWad` and `minLockedProceedsWei`. The terminal and keeper refresh those values immediately before signing or submitting.

## Terminal and keeper behavior

- Direct wallet actions use a 30-second deadline.
- Session actions embed the current session nonce and a 30-second deadline.
- Long entries require at least 98% of freshly quoted token inventory.
- Short entries permit at most 100.2% of freshly quoted borrowed inventory and require at least 98% of freshly quoted sale proceeds.
- Position closes require at least 98% of the current executable payout.
- V46 keepers re-quote at fill time and use the stricter of the signed order minimum and the fresh dynamic minimum.

Legacy unbounded functions remain for inherited compatibility, but current terminal, relay, and keeper execution paths use the protected methods.

## Solidity assault actors

`contracts/test/LaunchpadFactoryV51Assault.t.sol` contains 11 hostile tests covering:

- Front-run spot-buy output deterioration
- Stale long entry
- Stale short borrow requirements
- Stale position-close payout
- Expired deadlines
- Market payout reentrancy
- Router withdrawal reentrancy
- Rejecting ETH payout receivers
- Forced ETH surplus
- Creator-perps restriction retention
- Core accepted-action gas ceilings

Rejected transactions are required to leave market sequence, curve state, user custody, token custody, and position state unchanged.

## Compiled campaign

The `assault` Foundry profile uses:

- Solidity 0.8.28
- IR compilation
- 10,000 optimizer runs
- 4,096 fuzz runs
- 2,048 invariant runs
- 256 invariant depth
- Persisted invariant counterexamples
- Gas reports for the market and router

Run:

```bash
npm run chain:test:v51
npm run chain:invariant:v51
npm run chain:assault:v51
```

`chain:assault:v51` starts or reuses Anvil, compiles the contracts, runs the hostile test contract, runs the V50 stateful invariant handler, checks the gas snapshot, deploys the full account-router/BattlePool stack, and executes the V51 Anvil lifecycle.

## Anvil lifecycle

`scripts/v51-anvil-lifecycle.mts` performs:

1. Real internal-account deposit
2. Initial spot quote
3. Adversarial front-run buy
4. Submission of the now-stale protected buy
5. Proof that the reverted buy changed neither the account ledger nor market sequence
6. Successful freshly quoted protected buy
7. Protected long open
8. Protected short open
9. Protected long close
10. On-chain invariant snapshot validation
11. Router custody-versus-liability validation

The result is written to `public/local-chain/v51-chain-assault.json`.

## Operations console

Open `/admin/chain-assault` to see:

- Portable assault-layer readiness
- Forge, Anvil, and Cast availability
- Exact reproduction commands
- A visible distinction between passed portable checks and the not-yet-executed compiled campaign

## Safety boundary

The portable V21–V51 tests pass in the assembly environment. Forge, Anvil, and Cast are absent here, so the Solidity compilation, Foundry assault tests, live Anvil lifecycle, and gas snapshot have been packaged but not executed here. The contracts remain unaudited and public funds are prohibited.
