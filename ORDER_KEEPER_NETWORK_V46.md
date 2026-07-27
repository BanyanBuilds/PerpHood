# LEVERAGE X V46 — Order and Keeper Network

V46 adds a durable conditional-order and liquidation layer above the V45 custody router and V43 unified BattlePool. The terminal can sign orders once with the active bounded V45 session key, persist them outside browser memory, and let a keeper settle them through the same on-chain nonce, action, expiry, replay, and cumulative-opening limits used by immediate authorized trades.

## Execution path

```text
Terminal order ticket
  → canonical V46 order intent
  → P-256 session signature
  → durable atomic order store
  → authoritative BattlePool market-cap read
  → exclusive keeper lease
  → V45 authorized router action
  → confirmed receipt and decoded fill
  → account, holdings, positions, PNL, tape, and pool reconciliation
```

## Supported order types

- Spot Buy limit and trigger orders
- Leveraged Long limit and trigger orders
- Leveraged Short limit and trigger orders
- Reduce-only Take Profit
- Reduce-only Stop Loss
- Two-stage Breakeven protection

A breakeven order first waits for its activation market cap. After activation it changes to `watching` and fills only if price retraces to the configured breakeven trigger.

## Durable order guarantees

The local V46 order service provides:

- canonical order hashes and P-256 tamper detection;
- deterministic owner/session binding;
- signed owner cancellation;
- atomic temporary-file writes followed by rename;
- idempotent order creation;
- exclusive time-bounded keeper leases;
- order expiry;
- bounded retry attempts with exponential backoff;
- final fill metadata including transaction hash and block number;
- a maximum retained local history of 20,000 orders.

The default local store is `.perphood/v46-orders.json`. Production must replace it with a replicated transactional database and append-only audit history.

## Keeper behavior

Each keeper cycle:

1. Loads armed, watching, and retryable failed orders.
2. Reads the market's authoritative on-chain BattlePool state.
3. Evaluates the trigger against market cap derived from that state.
4. Expires stale orders or activates breakeven orders.
5. Acquires an exclusive lease before settlement.
6. Re-reads the V45 session and current nonce at fill time.
7. Verifies session owner, public-key hash, expiry, action permission, and available opening limits.
8. Submits through the first available configured keeper account.
9. Waits for a successful receipt and decodes the fill.
10. Persists receipt and settlement data or schedules a bounded retry.

Keeper accounts are configured with `V46_KEEPER_ACCOUNTS`, with `V45_SEQUENCER_ACCOUNT` as the local fallback.

## Liquidation worker

V46 also scans active positions for `isLiquidatable` and sends bounded batches of up to 32 position IDs through `liquidatePositions(uint256[])`. Liquidations remain tied to the same BattlePool reserves and therefore create the real buy or sell pressure established in V43.

## Terminal integration

A V45 account-routed market with an active session enables:

- Limit and Trigger controls in both trade tickets
- TP, SL, and Breakeven controls for new perp positions
- Durable pending-order state
- Signed order cancellation
- Filled-order reconciliation into holdings and positions
- Reduce-only close reconciliation
- Confirmed receipt and block metadata
- Public Buy/Sell tape updates without exposing Long/Short origin

Direct-wallet V43/V44 execution does not expose unattended conditional controls. V46 orders require a live, bounded V45 authorization.

## Operations

The operations console is available at:

```text
/admin/keeper
```

It displays order counts, statuses, triggers, owners, markets, attempts, failures, and receipts, and provides a manual local keeper cycle.

The standalone worker runs with:

```bash
npm run keeper:v46
```

A one-cycle check runs with:

```bash
npm run keeper:v46:once
```

## Security boundary

V46 remains a local reference implementation, not production custody software.

- P-256 order signatures are verified by the application relay, not independently by Solidity.
- The keeper can execute only actions allowed by an active V45 session, but a compromised keeper/relay remains a trusted risk within those limits.
- Trigger market-cap conversion currently uses a fixed local ETH/USD reference of $3,200.
- The JSON order store is durable on one filesystem but is not replicated or Byzantine fault tolerant.
- Receipt finality is local-chain oriented and does not yet include production reorg rollback.
- Keeper account failover is sequential, not a quorum or consensus system.
- Contracts and application code remain unaudited.

Never use this build with public funds.
