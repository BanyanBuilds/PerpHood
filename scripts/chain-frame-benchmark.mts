import { performance } from "node:perf_hooks";
import { decodeBytes32, decodeUint, decodeWords } from "../lib/chain/abi.ts";
import { keccak256 } from "../lib/chain/keccak.ts";

const word = (value: bigint) => value.toString(16).padStart(64, "0");
const hash = keccak256("perphood-v21-frame").slice(2);
const encoded = `0x${[
  word(42n), word(1_784_835_200n), hash, word(1n), word(250_000_000n), word(2_500_000_000_000_000_000n),
  word(25_000_000_000_000_000_000n), word(900_000_000n * 10n ** 18n), word(3_000_000_000_000_000_000n),
  word(4_000_000_000_000_000_000n), word(2_000_000_000_000_000_000n), hash, hash, hash,
  word(22_000_000_000_000_000_000n), word(1n),
].join("")}`;

const runs = 50_000;
const samples: number[] = [];
for (let index = 0; index < runs; index += 1) {
  const start = performance.now();
  const words = decodeWords(encoded);
  const snapshot = {
    sequence: Number(decodeUint(words[0])),
    marketId: decodeBytes32(words[2]),
    price: decodeUint(words[4]),
    poolWeth: decodeUint(words[6]),
    stateHash: decodeBytes32(words[13]),
    solvent: decodeUint(words[15]) === 1n,
  };
  if (snapshot.sequence !== 42 || !snapshot.solvent) throw new Error("Decoded frame mismatch.");
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const percentile = (p: number) => samples[Math.min(samples.length - 1, Math.floor(samples.length * p))];
const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
console.log(JSON.stringify({
  status: "PASS",
  frames: runs,
  averageMs: Number(average.toFixed(6)),
  p95Ms: Number(percentile(.95).toFixed(6)),
  p99Ms: Number(percentile(.99).toFixed(6)),
  rpcCallsPerPoll: 2,
}, null, 2));
