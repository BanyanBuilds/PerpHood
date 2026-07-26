import { performance } from "node:perf_hooks";
import { FP_WAD, quoteFixedBuy } from "../lib/fixed-point-battle-curve.ts";
import { V24EventIndexer, type V24CommittedEvent, type V24PositionSnapshot } from "../lib/chain/v24-event-stream.ts";
import { applyV24SpotBuy, createV24VerifiedPoolState } from "../lib/chain/v24-verified-action.ts";

Object.defineProperty(globalThis, "performance", { value: performance, configurable: true });
const hash = (seed: number) => `0x${seed.toString(16).padStart(64, "0")}` as const;
let pool = createV24VerifiedPoolState({ poolWethWad: 20n * FP_WAD });
const positionQuote = quoteFixedBuy(0n, FP_WAD / 100n);
const positions: V24PositionSnapshot[] = Array.from({ length: 40 }, (_, index) => ({
  id: `position-${index}`,
  owner: "0x00000000000000000000000000000000000a11ce",
  direction: index % 2 ? "short" : "long",
  collateralWad: FP_WAD / 1_000n,
  tokenAmountWad: positionQuote.tokenOutWad / 100n,
  debtWad: index % 2 ? 0n : 4n * FP_WAD / 1_000n,
  lockedShortProceedsWad: index % 2 ? 5n * FP_WAD / 1_000n : 0n,
}));
const indexer = new V24EventIndexer();
const samples: number[] = [];
for (let index = 0; index < 2_000; index++) {
  const fill = applyV24SpotBuy(pool, FP_WAD / 1_000_000n);
  pool = fill.next;
  const event: V24CommittedEvent = {
    sequence: BigInt(index), timestampMs: 1_800_000_000_000 + index * 50, blockNumber: BigInt(index + 1),
    transactionHash: hash(index + 1), action: 1, marginalPriceWad: fill.proof.marginalPriceAfterWad,
    marketCapWad: fill.proof.marketCapAfterWad, poolWethWad: pool.poolWethWad, reservedWethWad: 0n,
    curveSoldTokenWad: pool.curveSoldTokenWad, positionsRoot: hash(index + 10_000), balancesRoot: hash(index + 20_000), stateHash: hash(index + 30_000),
  };
  const started = performance.now();
  indexer.ingest(event, positions);
  samples.push(performance.now() - started);
}
const sorted = [...samples].sort((a, b) => a - b);
const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
console.log(JSON.stringify({ frames: samples.length, positionsPerFrame: positions.length, executableQuotes: samples.length * positions.length, averageMs: Number(average.toFixed(6)), p95Ms: Number(percentile(0.95).toFixed(6)), p99Ms: Number(percentile(0.99).toFixed(6)) }, null, 2));
