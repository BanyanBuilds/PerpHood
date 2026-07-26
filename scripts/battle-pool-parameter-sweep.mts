import {
  createBattlePoolState,
  executeCloseShort,
  executeOpenShort,
  executeSpotBuy,
  executeSpotSell,
  freeWeth,
  shortNotionalCapacity,
  totalTokenConservation,
  type BattlePoolConfig,
} from "../lib/battle-pool.ts";

const TOTAL = 1_000_000_000;

type Candidate = {
  curvePercent: number;
  perpPercent: number;
  safetyPercent: number;
  exponent: number;
  genesisSharePercent: number;
  shortCapacityEth: number;
  devExitEth: number;
  shortPayoutEth: number;
  endingFreeWeth: number;
  score: number;
};

const candidates: Candidate[] = [];

for (const curvePercent of [75, 80, 85, 90]) {
  for (const perpPercent of [5, 10, 15, 20]) {
    const safetyPercent = 100 - curvePercent - perpPercent;
    if (safetyPercent < 5 || safetyPercent > 20) continue;
    for (const exponent of [3.5, 4, 5, 6, 7]) {
      const config: Partial<BattlePoolConfig> = {
        totalSupply: TOTAL,
        curveAllocation: TOTAL * curvePercent / 100,
        perpAllocation: TOTAL * perpPercent / 100,
        safetyAllocation: TOTAL * safetyPercent / 100,
        openingFdvEth: 0.25,
        curveExponent: exponent,
      };
      try {
        let pool = createBattlePoolState(config);
        const genesis = executeSpotBuy(pool, 1);
        pool = { ...genesis.next, realWethBalance: genesis.next.realWethBalance + 0.05 };
        const capacity = shortNotionalCapacity(pool);
        if (capacity < 0.5) continue;
        const short = executeOpenShort(pool, 0.05, 10);
        pool = short.next;
        const devExit = executeSpotSell(pool, genesis.tokens);
        pool = devExit.next;
        const shortClose = executeCloseShort(pool, {
          collateral: 0.05,
          borrowedTokens: short.borrowedTokens,
          lockedProceedsEth: short.lockedProceedsEth,
        });
        pool = shortClose.next;
        if (Math.abs(totalTokenConservation(pool) - TOTAL) > 0.5) continue;

        const genesisSharePercent = genesis.tokens / TOTAL * 100;
        const endingFreeWeth = freeWeth(pool);
        // Score only broad protocol goals; this is a search aid, not an oracle.
        const concentrationScore = Math.max(0, 35 - Math.abs(genesisSharePercent - 42) * 1.8);
        const antiDevScore = Math.max(0, 25 - Math.abs(devExit.netEth - 0.5) * 45);
        const shortUtilityScore = Math.min(20, capacity * 20);
        const solvencyScore = Math.min(20, endingFreeWeth * 80);
        const score = concentrationScore + antiDevScore + shortUtilityScore + solvencyScore;

        candidates.push({
          curvePercent,
          perpPercent,
          safetyPercent,
          exponent,
          genesisSharePercent: Number(genesisSharePercent.toFixed(2)),
          shortCapacityEth: Number(capacity.toFixed(4)),
          devExitEth: Number(devExit.netEth.toFixed(6)),
          shortPayoutEth: Number(shortClose.payoutEth.toFixed(6)),
          endingFreeWeth: Number(endingFreeWeth.toFixed(6)),
          score: Number(score.toFixed(2)),
        });
      } catch {
        // Rejected candidates are useful: their sequence was not fully closeable.
      }
    }
  }
}

const ranked = candidates.sort((a, b) => b.score - a.score).slice(0, 12);
if (!ranked.length) throw new Error("No parameter configuration survived the deterministic battle sequence.");
console.log(JSON.stringify({ status: "PASS", testedSurvivors: candidates.length, topCandidates: ranked }, null, 2));
