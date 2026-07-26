import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { FP_WAD, quoteFixedBuy } from "../lib/fixed-point-battle-curve.ts";
import { V24EventIndexer, type V24CommittedEvent, type V24PositionSnapshot } from "../lib/chain/v24-event-stream.ts";
import { applyV24SpotBuy, createV24VerifiedPoolState } from "../lib/chain/v24-verified-action.ts";

Object.defineProperty(globalThis, "performance", { value: performance, configurable: true });
const hash = (seed: number) => `0x${seed.toString(16).padStart(64, "0")}` as const;
let state = createV24VerifiedPoolState({ poolWethWad: 10n * FP_WAD });
const initialLong = quoteFixedBuy(0n, FP_WAD / 10n);
const positions: V24PositionSnapshot[] = [{
  id: "long-1",
  owner: "0x00000000000000000000000000000000000a11ce",
  direction: "long",
  collateralWad: FP_WAD / 50n,
  tokenAmountWad: initialLong.tokenOutWad,
  debtWad: FP_WAD * 8n / 100n,
  lockedShortProceedsWad: 0n,
}];
const indexer = new V24EventIndexer();
let maxProcessingMicros = 0;
for (let index = 0; index < 90; index++) {
  const execution = applyV24SpotBuy(state, FP_WAD / 10_000n);
  state = execution.next;
  const event: V24CommittedEvent = {
    sequence: BigInt(index),
    timestampMs: 1_800_000_000_000 + index * 500,
    blockNumber: BigInt(index + 1),
    transactionHash: hash(index + 10),
    action: 1,
    marginalPriceWad: execution.proof.marginalPriceAfterWad,
    marketCapWad: execution.proof.marketCapAfterWad,
    poolWethWad: state.poolWethWad,
    reservedWethWad: state.reservedWethWad,
    curveSoldTokenWad: state.curveSoldTokenWad,
    positionsRoot: hash(index + 100),
    balancesRoot: hash(index + 200),
    stateHash: hash(index + 300),
  };
  const snapshot = indexer.ingest(event, positions);
  maxProcessingMicros = Math.max(maxProcessingMicros, snapshot.processingMicros);
  assert.equal(snapshot.candles[1].lastSequence, BigInt(index));
  assert(snapshot.pnl["long-1"]);
}
assert.equal(indexer.lastSequence, 89n);
assert.equal(indexer.history(1).length, 45);
assert.equal(indexer.history(15).length, 3);
assert.equal(indexer.history(30).length, 2);
assert(maxProcessingMicros < 20_000, `Event indexing unexpectedly slow: ${maxProcessingMicros} µs.`);
assert.throws(() => indexer.ingest({
  sequence: 91n,
  timestampMs: 1_800_000_100_000,
  blockNumber: 91n,
  transactionHash: hash(999),
  action: 1,
  marginalPriceWad: 1n,
  marketCapWad: 1n,
  poolWethWad: 1n,
  reservedWethWad: 0n,
  curveSoldTokenWad: state.curveSoldTokenWad,
  positionsRoot: hash(998),
  balancesRoot: hash(997),
  stateHash: hash(996),
}, positions), /event gap/);
console.log(`V24 event stream synchronized 1s/15s/30s candles and executable PNL across 90 ordered frames; max local processing ${maxProcessingMicros.toFixed(2)} µs.`);
