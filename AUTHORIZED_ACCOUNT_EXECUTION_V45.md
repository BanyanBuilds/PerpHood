# LEVERAGE X V45 — Authorized Account Execution

## Purpose

V45 removes the wallet-confirmation requirement from normal local trading without handing withdrawal authority to the LEVERAGE X sequencer. It places a fully backed account router above the V43 unified BattlePool and supports two execution paths:

1. **Authorized session path:** the browser signs a bounded P-256 intent and the local sequencer sponsors the transaction.
2. **Direct owner path:** the connected wallet calls the account router directly when no session exists, when the relay is unavailable, or when the user wants to revoke, close, or withdraw independently.

## Account custody model

The V45 factory is also the local account router. It tracks:

- each account's ETH balance;
- each account's token balance per market;
- total ETH liabilities;
- total token liabilities per market;
- actual router ETH and token custody;
- a solvency flag comparing custody with liabilities.

Spot purchases debit the user's internal ETH and credit internal tokens. Spot sales debit internal tokens and credit internal ETH. Long and short opens debit the exact collateral plus entry fee. Position closes credit the exact contract settlement payout.

Market payouts sent back to the router are deliberately ignored by `receive()` and are credited exactly once by the settlement function. This prevents a market payout from being counted both as a plain deposit and as trading proceeds.

## Session authorization

An authorization records:

- account owner;
- P-256 public-key hash;
- expiration time;
- next valid nonce;
- per-intent notional cap;
- cumulative notional cap;
- cumulative notional already used;
- six-action permission bitmap;
- active/revoked state.

The supported actions are:

1. Spot Buy
2. Spot Sell
3. Open Long
4. Open Short
5. Close Long
6. Close Short

Each browser intent is bound to the router, owner, market, session, nonce, deadline, amounts, leverage, position, slippage floor, and unique client order ID. The relay verifies the P-256 signature and current on-chain session state before submitting the transaction. The router independently enforces owner, nonce, deadline, action bitmap, replay hash, per-intent limit, cumulative limit, and execution mode.

## Trust boundary

The current local contract does **not** verify the P-256 signature on-chain. The local relay verifies it before the configured sequencer calls the router. Therefore, the sequencer remains trusted not to invent an otherwise session-permitted intent.

The damage boundary is narrower than custodial exchange authority:

- the sequencer cannot call the owner-only ETH withdrawal path;
- the sequencer cannot call the owner-only token withdrawal path;
- it cannot exceed on-chain action permissions, expiry, nonces, or ETH-notional caps for opening actions;
- the owner can revoke the session directly;
- the owner can still close positions and withdraw directly.

However, a compromised sequencer could still perform permitted trades within those boundaries. Production requires audited chain-native signature validation or a proven smart-account/session-key standard, hardened relayer authentication, redundant sequencing, and operational recovery.

## Emergency modes

- **Normal:** all supported account actions are available.
- **CloseOnly:** new spot buys and leveraged openings are blocked; exits remain available.
- **Paused:** market trading actions are blocked for emergency containment. Owner withdrawal remains separate from market trading.

## Terminal behavior

A configured V45 market automatically uses:

- `v45-session` when a valid local session key and on-chain authorization are present;
- `v45-account` for direct owner-confirmed account-router execution when no active session is available;
- the older V43 direct-market path only for V43 deployments;
- the deterministic browser engine for markets without a configured contract.

After every confirmed V45 action, the terminal refreshes the account ledger and the same BattlePool state used for chart price, reserves, capacity, positions, and executable PNL.

## Current limitations

- Local Anvil ETH stands in for canonical Robinhood Chain WETH.
- Session signatures are verified off-chain, not in the Solidity router.
- The included relay uses unlocked local accounts and an in-memory order lock.
- Factory-wide persistent indexing is not complete.
- Limit orders, trigger orders, TP/SL, partial leveraged closes, and unattended liquidations still require a durable keeper/order coordinator.
- No production rate limiting, durable replay database, HSM, multi-relayer quorum, or reorg recovery exists.
- The contracts are unaudited and were not compiled with Foundry in the assembly environment.

Never use this build with public funds.
