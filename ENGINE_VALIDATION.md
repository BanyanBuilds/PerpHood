# PERPHOOD V20 deterministic validation

Validation date: 2026-07-23

## Engine suite

```text
Smoke: PASS
Parameter sweep: PASS
Randomized fuzz: PASS
Mass short squeeze: PASS
Mass long cascade: PASS
Executable realtime PNL: PASS
```

## Core results

- Genesis buyer ownership after 1 ETH buy: 42.60%
- Developer full exit after short attack: 0.509039 ETH
- Profitable short payout: 0.536389 ETH
- Short-liquidation upward impact: 60.32%
- Long-liquidation downward impact: 21.87%
- Final token conservation: 1,000,000,000

## Randomized fuzz

- Deterministic seeds: 75
- Attempted actions: 18,750
- Successful actions: 18,662
- Unsafe actions rejected before mutation: 88

## Forty-short 20× squeeze

- Positions: 40
- Margin each: 0.001 ETH
- Notional each: 0.02 ETH
- External squeeze buy: 0.5 ETH
- Exact-boundary execution segments: 8
- Liquidations: 40
- Realized bad debt: 0 ETH
- Residual liquidation equity retained: 0.013684 ETH
- Final spot-price move: +257.96%

## Forty-long 20× cascade

- Positions: 40
- Margin each: 0.001 ETH
- Notional each: 0.02 ETH
- Genesis-holder sale: 10% of acquired tokens
- Exact-boundary execution segments: 52
- Liquidations: 40
- Realized bad debt: 0 ETH
- Residual liquidation equity retained: 0.016000 ETH
- Final spot-price move magnitude: 68.59%

## Realtime PNL regression

- Winning long executable PNL moved from -0.00120000 ETH to +0.06903899 ETH after a real shared-pool buy.
- Fresh short produced an executable close quote.
- Spot holding produced a full-pool executable sale value.
- Realtime sequences increased monotonically.
- Execution-volume deltas reconciled correctly.

## Local reference benchmark

- Positions quoted per frame: 40
- Frames built: 500
- Total executable close quotes: 20,000
- Average frame build: 0.4238 ms
- P95 frame build: 0.6234 ms
- P99 frame build: 2.0534 ms

These numbers measure local deterministic computation only and are not production latency claims.

## Source parse

- 64 TypeScript, TSX, and MTS source files passed syntax transpilation.
- Core BattlePool and realtime modules passed strict standalone TypeScript checking.

## Build limitation

The package environment did not contain the required project dependency tree, so a complete `next build` could not be executed. The pure financial and realtime suites ran successfully. Full application type/build validation must be repeated after `npm install` in a network-enabled environment.

## V21 local-chain validation

V21 adds a second validation boundary around the deterministic engine:

- Keccak-256 empty-input vector
- ERC-20 selector and Transfer-event topic vectors
- static ABI encoding for the single-account settlement call
- client-side rejection of unbalanced settlement deltas
- local custody-ledger deposit and withdrawal flows
- stale-sequence rejection
- previous-state-hash enforcement model
- pool/user WETH conservation
- pool/user token conservation
- reserved liquidity ceiling
- physical custody coverage
- TypeScript/TSX syntax smoke across the full source tree

The included Foundry suite additionally targets real contract execution, but it must be run in a Foundry-enabled environment.

### V21 frame decode benchmark

```text
50,000 complete runtime frames
Average: approximately 0.0008 ms
P95:     approximately 0.0013 ms
P99:     approximately 0.0019 ms
```

The benchmark covers ABI decoding only. RPC, browser scheduling, sequencer transit, and chain block production are not included.
