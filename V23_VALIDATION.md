# LEVERAGE X V23 validation report

Validation date: 2026-07-24

## Full signed-action lifecycle

The deterministic lifecycle executed seven ordered settlements through one signed-intent and custody-delta path:

1. Spot buy
2. Spot sell
3. Open leveraged long
4. Partially close long
5. Close remaining long
6. Open leveraged short
7. Close short

Result:

- Every WETH delta reconciled.
- Every token delta reconciled.
- No position remained open unexpectedly.
- No bad debt was created.

## Session authorization

Passed:

- P-256 intent signing and verification
- Signature tamper rejection
- Nonce replay rejection
- Duplicate intent rejection
- Expired intent rejection
- Revoked session rejection
- Disallowed-action rejection
- Maximum-notional enforcement
- Cross-wallet session takeover rejection
- Nonce continuity after reauthorization

## BattlePool engine

Randomized suite:

- Seeds: 75
- Attempted actions: 18,750
- Successful safe actions: 18,662
- Unsafe actions rejected: 88
- Final conserved token supply: 1,000,000,000

Mass short squeeze:

- 40 admitted 20× shorts
- 40 liquidations
- 8 exact internal execution boundaries
- 0 ETH bad debt
- 0.013684 ETH liquidation equity retained
- +257.96% spot-price movement

Mass long cascade:

- 40 admitted 20× longs
- 40 liquidations
- 52 exact internal execution boundaries
- 0 ETH bad debt
- 0.016 ETH liquidation equity retained
- -68.59% spot-price movement

## Latest local cryptography and execution benchmark

500 signed intents:

- P-256 signing average: 0.997 ms
- P-256 signing p95: 1.148 ms
- P-256 signing p99: 1.967 ms
- P-256 verification average: 1.027 ms
- P-256 verification p95: 1.224 ms
- P-256 verification p99: 2.657 ms
- Exact BattleCurve quote + calldata average: 1.190 ms
- Exact BattleCurve quote + calldata p95: 1.396 ms
- Exact BattleCurve quote + calldata p99: 2.511 ms

These measurements cover local signing, verification, curve execution, liquidation processing, and calldata construction. They exclude RPC transport and block finality.

## Source validation

- TypeScript/TSX syntax smoke: passed across 98 files
- Solidity V23 static authorization/liquidation smoke: passed
- Keccak and selector vectors: passed
- Ordered frame builder: passed
- Local custody ledger smoke: passed
- Executable realtime PNL: passed

## Environment limitations

Foundry and Anvil were unavailable, so the included Solidity contracts and Foundry tests were not compiled or executed on a live local chain in this environment.

npm dependencies were unavailable, so a complete Next.js production build was not performed. The dependency-free financial-engine, session-security, settlement, syntax, and benchmark suites passed.

V23 remains an unaudited local prototype. It must not receive real funds.
