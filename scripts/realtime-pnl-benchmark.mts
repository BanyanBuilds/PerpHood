import { performance } from "node:perf_hooks";
import {
  BATTLE_TOTAL_SUPPLY,
  createBattlePoolState,
  executeOpenLong,
  executeOpenShort,
  executeSpotBuy,
  poolToTokenPatch,
} from "../lib/battle-pool.ts";
import { buildBattleRealtimeFrame } from "../lib/realtime-battle.ts";
import type { Position, Token } from "../lib/types.ts";

function tokenFromPool(pool: ReturnType<typeof createBattlePoolState>): Token {
  return {
    slug: "benchmark",
    symbol: "FAST",
    name: "Fast",
    emoji: "⚡",
    hue: 120,
    cap: 0,
    price: 0,
    change24h: 0,
    graduation: 0,
    longs: 50,
    volume24h: 0,
    openInterest: 0,
    funding: 0,
    launchedMinutesAgo: 0,
    description: "Realtime benchmark",
    ...poolToTokenPatch(pool, 3_200),
  };
}

let pool = executeSpotBuy(createBattlePoolState(), 2).next;
const positions: Position[] = [];
for (let index = 0; index < 20; index += 1) {
  const long = executeOpenLong(pool, 0.001, 5);
  pool = long.next;
  positions.push({
    id: `long-${index}`, slug: "benchmark", direction: "long", leverage: 5,
    collateral: 0.001, notional: long.notionalEth,
    entryCap: long.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
    currentCap: long.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
    liquidationCap: 0, openedAt: Date.now(), entryFee: long.feeEth,
    tokenAmount: long.tokens, debtEth: long.debtEth, maintenanceMarginRate: 0.02,
  });
  const short = executeOpenShort(pool, 0.001, 5);
  pool = short.next;
  positions.push({
    id: `short-${index}`, slug: "benchmark", direction: "short", leverage: 5,
    collateral: 0.001, notional: short.notionalEth,
    entryCap: short.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
    currentCap: short.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
    liquidationCap: 0, openedAt: Date.now(), entryFee: short.feeEth,
    borrowedTokens: short.borrowedTokens, lockedProceedsEth: short.lockedProceedsEth, maintenanceMarginRate: 0.02,
  });
}

const token = tokenFromPool(pool);
const samples: number[] = [];
for (let index = 0; index < 500; index += 1) {
  const started = performance.now();
  const frame = buildBattleRealtimeFrame(token, positions, []);
  if (Object.keys(frame.positionPnl).length !== positions.length) throw new Error("Benchmark frame omitted a position.");
  samples.push(performance.now() - started);
}
samples.sort((a, b) => a - b);
const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
const p95Ms = samples[Math.floor(samples.length * 0.95)];
const p99Ms = samples[Math.floor(samples.length * 0.99)];

console.log(JSON.stringify({
  status: "PASS",
  positionsPerFrame: positions.length,
  framesBuilt: samples.length,
  quoteOperations: positions.length * samples.length,
  averageFrameBuildMs: Number(averageMs.toFixed(4)),
  p95FrameBuildMs: Number(p95Ms.toFixed(4)),
  p99FrameBuildMs: Number(p99Ms.toFixed(4)),
  note: "Local deterministic reference benchmark; not a network or production latency claim.",
}, null, 2));
