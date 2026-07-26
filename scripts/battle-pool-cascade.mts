import {
  battlePriceEth,
  createBattlePoolState,
  executeOpenLong,
  executeOpenShort,
  executeSequencedSpotBuy,
  executeSequencedSpotSell,
  executeSpotBuy,
  freeWeth,
  maybeReleaseSafetyInventory,
  shortInventoryUtilization,
  totalTokenConservation,
} from "../lib/battle-pool.ts";
import type { Position } from "../lib/types.ts";

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeShort(index: number, trade: ReturnType<typeof executeOpenShort>): Position {
  return {
    id: `short-${index}`,
    slug: "cascade",
    direction: "short",
    leverage: 20,
    collateral: 0.001,
    notional: 0.02,
    entryCap: trade.priceAfter * 1_000_000_000,
    currentCap: trade.priceAfter * 1_000_000_000,
    liquidationCap: 0,
    openedAt: index,
    borrowedTokens: trade.borrowedTokens,
    lockedProceedsEth: trade.lockedProceedsEth,
    maintenanceMarginRate: 0.02,
  };
}

function makeLong(index: number, trade: ReturnType<typeof executeOpenLong>): Position {
  return {
    id: `long-${index}`,
    slug: "cascade",
    direction: "long",
    leverage: 20,
    collateral: 0.001,
    notional: 0.02,
    entryCap: trade.priceAfter * 1_000_000_000,
    currentCap: trade.priceAfter * 1_000_000_000,
    liquidationCap: 0,
    openedAt: index,
    tokenAmount: trade.tokens,
    debtEth: trade.debtEth,
    maintenanceMarginRate: 0.02,
  };
}

// Forty 20× shorts attack one shared pool. One external buy is internally
// sequenced, allowing each liquidation boundary to resolve before the next.
let genesis = executeSpotBuy(createBattlePoolState(), 1.5);
let shortPool = genesis.next;
const shorts: Position[] = [];
let adaptiveReleaseObserved = false;
for (let index = 0; index < 40; index += 1) {
  const trade = executeOpenShort(shortPool, 0.001, 20);
  const beforeAdaptive = trade.next.adaptivePerpReleasedTokens;
  shortPool = maybeReleaseSafetyInventory(trade.next);
  adaptiveReleaseObserved ||= shortPool.adaptivePerpReleasedTokens > beforeAdaptive;
  shorts.push(makeShort(index, trade));
}
const shortUtilizationBeforeSqueeze = shortInventoryUtilization(shortPool);
const shortSqueeze = executeSequencedSpotBuy(shortPool, 0.5, shorts);
expect(shortSqueeze.liquidationEvents.length === 40, "All forty crowded shorts should liquidate in the squeeze test.");
expect(shortSqueeze.totalBadDebtEth < 1e-10, "Sequenced short squeeze created bad debt.");
expect(shortSqueeze.remainingPositions.length === 0, "Short squeeze left positions open.");
expect(shortSqueeze.endPriceEth > shortSqueeze.startPriceEth, "Short squeeze did not raise the shared spot price.");
expect(Math.abs(totalTokenConservation(shortSqueeze.next) - 1_000_000_000) < 0.5, "Short squeeze broke token conservation.");

// Forty 20× longs attack the same model. A spot holder's sell is sequenced
// through each liquidation boundary, producing a real leveraged sell cascade.
genesis = executeSpotBuy(createBattlePoolState(), 1.5);
let longPool = genesis.next;
const longs: Position[] = [];
for (let index = 0; index < 40; index += 1) {
  const trade = executeOpenLong(longPool, 0.001, 20);
  longPool = trade.next;
  longs.push(makeLong(index, trade));
}
const longCascade = executeSequencedSpotSell(longPool, genesis.tokens * 0.1, longs);
expect(longCascade.liquidationEvents.length === 40, "All forty crowded longs should liquidate in the sell-cascade test.");
expect(longCascade.totalBadDebtEth < 1e-10, "Sequenced long cascade created bad debt.");
expect(longCascade.remainingPositions.length === 0, "Long cascade left positions open.");
expect(longCascade.endPriceEth < longCascade.startPriceEth, "Long cascade did not lower the shared spot price.");
expect(Math.abs(totalTokenConservation(longCascade.next) - 1_000_000_000) < 0.5, "Long cascade broke token conservation.");

console.log(JSON.stringify({
  status: "PASS",
  shortBattle: {
    admitted20xShorts: shorts.length,
    shortInventoryUtilizationBeforeSqueeze: Number((shortUtilizationBeforeSqueeze * 100).toFixed(2)),
    adaptiveReleaseObserved,
    internalExecutionSteps: shortSqueeze.steps,
    liquidations: shortSqueeze.liquidationEvents.length,
    badDebtEth: Number(shortSqueeze.totalBadDebtEth.toFixed(12)),
    liquidationEquityRetainedEth: Number(shortSqueeze.totalResidualEquityEth.toFixed(6)),
    spotPriceMovePercent: Number(shortSqueeze.priceImpactPercent.toFixed(2)),
    endingFreeWeth: Number(freeWeth(shortSqueeze.next).toFixed(6)),
  },
  longBattle: {
    admitted20xLongs: longs.length,
    internalExecutionSteps: longCascade.steps,
    liquidations: longCascade.liquidationEvents.length,
    badDebtEth: Number(longCascade.totalBadDebtEth.toFixed(12)),
    liquidationEquityRetainedEth: Number(longCascade.totalResidualEquityEth.toFixed(6)),
    spotPriceMovePercent: Number(longCascade.priceImpactPercent.toFixed(2)),
    endingFreeWeth: Number(freeWeth(longCascade.next).toFixed(6)),
  },
  finalShortPriceEth: shortSqueeze.endPriceEth,
  finalLongPriceEth: longCascade.endPriceEth,
  finalTokenConservation: Math.round(totalTokenConservation(longCascade.next)),
}, null, 2));
