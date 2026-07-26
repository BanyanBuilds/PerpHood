# V23 full-action execution specification

## Action IDs

| ID | Action | User asset delta | Pool effect |
|---:|---|---|---|
| 1 | Spot buy | WETH decreases, token increases | WETH increases, token decreases |
| 2 | Spot sell | Token decreases, WETH increases | Token increases, WETH decreases |
| 3 | Open long | Collateral + entry fee decreases | WETH equity increases; internal WETH debt buys tokens |
| 4 | Close long | Executable equity increases | Locked tokens sell, WETH debt repays, payout leaves pool |
| 5 | Open short | Collateral + entry fee decreases | Token debt sells into curve; proceeds remain locked |
| 6 | Close short | Executable equity increases | Locked proceeds repurchase borrowed tokens; payout leaves pool |
| 11 | Liquidation batch | No liquidated-user payout | Forced closes mutate curve and residual equity stays in pool |

## Atomic relay lifecycle

1. Verify P-256 signature and canonical intent hash.
2. Lock the session to prevent concurrent nonce races.
3. Read contract frame, session scope, and user internal balance.
4. Restore the exact durable sequencer state for that frame.
5. Execute the action through the deterministic BattlePool.
6. Process liquidations between internal price segments.
7. Reject any route that creates new bad debt.
8. Build conserving account/pool deltas.
9. Stage the next engine state to disk.
10. Sponsor the EVM transaction.
11. Wait for receipt and reread the authoritative contract frame.
12. Promote staged state only when sequence and custody reconcile.

## Position ownership

Every V23 position stores its owner and client order ID. A close intent must identify the exact position. The relay rejects direction mismatch and any position owned by another wallet.

## Partial closes

`reduceFractionBps` supports 1–10,000 basis points of the selected position. Collateral, notional, token inventory, debt, locked proceeds, and entry fee are reduced proportionally. The remainder keeps the original entry metadata and receives the latest current market cap.

## Keeper liquidations

Liquidations are not user-signed trades. The keeper uses sequencer-only action 11. Liquidated positions receive no account credit; their residual equity is retained in the BattlePool. Because all forced buys and sells occur in the deterministic engine before the frame is committed, the contract receives a zero-sum custody frame and a new positions root.

## Production boundary

V23 still trusts the sequencer to provide correct curve math. The contract proves custody and ordered conservation, but production must independently verify fixed-point curve transitions and liquidation rules on-chain or through a challengeable proof system.
