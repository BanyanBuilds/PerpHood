import {
  assertBattlePool,
  createBattlePoolState,
  executeCloseLong,
  executeCloseShort,
  executeOpenLong,
  executeOpenShort,
  executeSpotBuy,
  executeSpotSell,
  freeWeth,
  totalTokenConservation,
  type BattlePoolState,
} from "../lib/battle-pool.ts";
import type { Position } from "../lib/types.ts";

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function positionFromLong(id: string, trade: ReturnType<typeof executeOpenLong>, leverage: number): Position {
  return {
    id,
    slug: "fuzz",
    direction: "long",
    leverage,
    collateral: trade.collateralEth,
    notional: trade.notionalEth,
    entryCap: 1,
    currentCap: 1,
    liquidationCap: 0,
    openedAt: Date.now(),
    tokenAmount: trade.tokens,
    debtEth: trade.debtEth,
  };
}

function positionFromShort(id: string, trade: ReturnType<typeof executeOpenShort>, leverage: number): Position {
  return {
    id,
    slug: "fuzz",
    direction: "short",
    leverage,
    collateral: trade.collateralEth,
    notional: trade.notionalEth,
    entryCap: 1,
    currentCap: 1,
    liquidationCap: 0,
    openedAt: Date.now(),
    borrowedTokens: trade.borrowedTokens,
    lockedProceedsEth: trade.lockedProceedsEth,
  };
}

function check(pool: BattlePoolState) {
  assertBattlePool(pool);
  if (Math.abs(totalTokenConservation(pool) - pool.totalSupply) > 0.5) throw new Error("Supply drifted.");
  if (freeWeth(pool) < -1e-10) throw new Error("Free WETH became negative.");
}

let successfulActions = 0;
let rejectedActions = 0;

for (let seed = 1; seed <= 75; seed += 1) {
  const random = rng(seed);
  let pool = executeSpotBuy(createBattlePoolState(), 0.25 + random() * 1.25).next;
  const spotLots: number[] = [];
  const positions: Position[] = [];

  for (let step = 0; step < 250; step += 1) {
    const action = Math.floor(random() * 7);
    try {
      if (action === 0) {
        const trade = executeSpotBuy(pool, 0.001 + random() * 0.08);
        pool = trade.next;
        spotLots.push(trade.tokens);
      } else if (action === 1 && spotLots.length) {
        const index = Math.floor(random() * spotLots.length);
        const owned = spotLots[index];
        const sold = owned * (0.15 + random() * 0.85);
        const trade = executeSpotSell(pool, sold);
        pool = trade.next;
        spotLots[index] -= sold;
        if (spotLots[index] < 0.5) spotLots.splice(index, 1);
      } else if (action === 2) {
        const leverage = [2, 5, 10, 20][Math.floor(random() * 4)];
        const collateral = 0.001 + random() * 0.02;
        const trade = executeOpenLong(pool, collateral, leverage);
        pool = trade.next;
        positions.push(positionFromLong(`${seed}-L-${step}`, trade, leverage));
      } else if (action === 3) {
        const leverage = [2, 5, 10, 20][Math.floor(random() * 4)];
        const collateral = 0.001 + random() * 0.02;
        const trade = executeOpenShort(pool, collateral, leverage);
        pool = trade.next;
        positions.push(positionFromShort(`${seed}-S-${step}`, trade, leverage));
      } else if (action === 4 && positions.length) {
        const index = Math.floor(random() * positions.length);
        const position = positions[index];
        const trade = position.direction === "long"
          ? executeCloseLong(pool, position)
          : executeCloseShort(pool, position);
        pool = trade.next;
        positions.splice(index, 1);
      } else if (action === 5 && positions.length) {
        const index = Math.floor(random() * positions.length);
        const position = positions[index];
        const trade = position.direction === "long"
          ? executeCloseLong(pool, position, 1, true)
          : executeCloseShort(pool, position, 1, true);
        pool = trade.next;
        positions.splice(index, 1);
      } else {
        const trade = executeSpotBuy(pool, 0.001 + random() * 0.015);
        pool = trade.next;
        spotLots.push(trade.tokens);
      }
      successfulActions += 1;
      check(pool);
    } catch {
      // Capacity and solvency rejections are expected protocol behavior.
      rejectedActions += 1;
      check(pool);
    }
  }

  // Every surviving leveraged position must have a deterministic liquidation path.
  while (positions.length) {
    const position = positions.pop()!;
    const trade = position.direction === "long"
      ? executeCloseLong(pool, position, 1, true)
      : executeCloseShort(pool, position, 1, true);
    pool = trade.next;
    check(pool);
  }
}

console.log(JSON.stringify({
  status: "PASS",
  seeds: 75,
  attemptedActions: successfulActions + rejectedActions,
  successfulActions,
  safelyRejectedActions: rejectedActions,
}, null, 2));
