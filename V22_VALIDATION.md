# LEVERAGE X V22 validation

Validation run: 2026-07-24

## Session authorization

- P-256 key generation: pass
- Canonical intent signing: pass
- Signature verification: pass
- Tampered nonce rejection: pass
- Tampered signature rejection: pass
- Derived session ID binding: pass
- Action bitmap coverage: pass
- Session ledger replay rejection: pass
- Session expiry rejection: pass
- Session revocation rejection: pass
- Oversized notional rejection: pass
- Disallowed action rejection: pass
- Reauthorization nonce preservation: covered in Solidity test source

## Sponsored settlement

- Authoritative exponent-5 adaptive BattleCurve spot-buy quote: pass
- 0.30% fee accounting: pass
- Signed slippage bound: pass
- Signed limit-price bound: pass
- Exact WETH conservation: pass
- Exact token conservation: pass
- Authorized calldata encoding: pass
- Contract session scope static checks: pass

## Speed benchmark

500 signed intents through the exact BattleCurve quote path:

```text
P-256 sign average:        0.8685 ms
P-256 sign p95:            1.0918 ms
P-256 sign p99:            2.8879 ms
P-256 verify average:      0.9568 ms
P-256 verify p95:          1.2724 ms
P-256 verify p99:          2.4622 ms
Quote + calldata average:  1.2529 ms
Quote + calldata p95:      1.5210 ms
Quote + calldata p99:      4.2490 ms
```

50,000 contract frame decodes:

```text
Average: 0.000803 ms
P95:     0.001472 ms
P99:     0.002594 ms
RPC calls per poll: 2
```

These measurements exclude RPC transport and block finality. V22 now reports sequencer work and chain finality separately in the session-key dashboard.

## BattlePool regression

- 75 deterministic fuzz seeds
- 18,750 attempted actions
- 18,662 safe actions executed
- 88 unsafe actions rejected
- One billion tokens conserved
- 40 simultaneous 20× shorts liquidated
- Short squeeze bad debt: 0
- Short squeeze internal boundaries: 8
- Short squeeze spot move: +257.96%
- 40 simultaneous 20× longs liquidated
- Long cascade bad debt: 0
- Long cascade internal boundaries: 52
- Long cascade spot move: -68.59%

## Source validation

- TypeScript/TSX syntax smoke: 91 files passed
- Solidity V22 braces and prohibited-op checks: pass
- Foundry source tests included for session scope, replay, expiry, revocation, ownership, nonce preservation, and custody invariants

## Environment limitations

- Foundry was not installed, so `forge test` was not executed in this environment.
- npm dependencies were unavailable in the offline cache, so the full Next.js production build was not executed.
- The local Anvil relay was not end-to-end executed here because Anvil/Forge were unavailable.
