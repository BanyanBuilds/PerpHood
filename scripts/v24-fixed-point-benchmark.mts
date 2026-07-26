import { performance } from "node:perf_hooks";
import { FP_WAD, quoteFixedBuy, quoteFixedSell } from "../lib/fixed-point-battle-curve.ts";

const samples: number[] = [];
let sold = 0n;
for (let index = 0; index < 2_000; index++) {
  const started = performance.now();
  if (index % 2 === 0) {
    const buy = quoteFixedBuy(sold, FP_WAD / 100_000n + BigInt(index % 17));
    sold = buy.soldAfterWad;
  } else {
    const tokenIn = sold / 10_000n;
    if (tokenIn > 0n) sold = quoteFixedSell(sold, tokenIn).soldAfterWad;
  }
  samples.push(performance.now() - started);
}
const sorted = [...samples].sort((a, b) => a - b);
const percentile = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
console.log(JSON.stringify({
  samples: samples.length,
  averageMs: Number(average.toFixed(6)),
  p95Ms: Number(percentile(0.95).toFixed(6)),
  p99Ms: Number(percentile(0.99).toFixed(6)),
  finalSoldTokens: Number(sold) / 1e18,
}, null, 2));
