# PERPHOOD V24 validation

## Dependency-free tests

- `scripts/v24-fixed-point-smoke.mts`
  - checks opening constants;
  - compares fixed-point quotes to the V23 floating reference;
  - checks 1,000 closed-form inverse vectors against the exact binary reference without over-quoting;
  - validates exact-token short repayment quotes;
  - executes spot buy, spot sell, open long, close long, open short, and close short;
  - proves one-billion-token logical conservation.

- `scripts/v24-settlement-smoke.mts`
  - encodes a 964-byte verified settlement call;
  - checks selector correctness;
  - rejects non-conserving WETH deltas and non-proof-derived frames.

- `scripts/v24-event-stream-smoke.mts`
  - processes 90 ordered frames;
  - derives 1s, 15s, and 30s candles;
  - recomputes executable PNL from the same sold-token state;
  - rejects sequence gaps.

- `scripts/solidity-v24-static-smoke.mts`
  - confirms fixed-point math, exact-token quote, verified action path, fake-price rejection boundary, logical conservation, and liquidation continuation are present;
  - confirms the V24 contract does not expose the V23 unverified authorized settlement function.

## Latest results

```text
V24 fixed-point differential: PASS
V24 six verified actions: PASS
V24 one-billion-token conservation: PASS
V24 verified settlement encoding: PASS
V24 event stream: PASS
V24 Solidity static boundary: PASS
TypeScript/TSX syntax across 114 files: PASS
V23 full regression suite: PASS
```

## Speed

```text
Fixed-point operations, 2,000 samples
average 0.006535 ms
p95     0.009284 ms
p99     0.031046 ms

Event + executable PNL, 2,000 frames, 40 positions/frame
80,000 position close quotes
average 0.143651 ms/frame
p95     0.219838 ms/frame
p99     0.334538 ms/frame
```

## Foundry status

V24 Foundry test sources are included:

- `contracts/test/BattleCurveMathV24.t.sol`
- `contracts/test/LocalBattlePoolV24.t.sol`

Foundry was unavailable in the build environment, so these Solidity tests were not compiled or executed here. They must pass before any testnet deployment.
