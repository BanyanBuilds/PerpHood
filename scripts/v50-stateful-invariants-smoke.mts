import assert from "node:assert/strict";
import {
  assertBattlePool,
  createBattlePoolState,
  executeCloseLong,
  executeCloseShort,
  executeLiquidationCascade,
  executeOpenLong,
  executeOpenShort,
  executeSpotBuy,
  executeSpotSell,
  positionObligationsWeth,
  rebalanceAdaptiveInventory,
  type BattlePoolState,
} from "../lib/battle-pool.ts";
import {
  assertV50ExternalEthConservation,
  snapshotV50Invariants,
} from "../lib/formal-invariants-v50.ts";
import type { Position } from "../lib/types.ts";

type Actor = { id: string; cashEth: number; spotTokens: number };
type OwnedPosition = Position & { owner: string };

function rng(seed: number) {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function pick<T>(values: T[], random: () => number) {
  return values[Math.min(values.length - 1, Math.floor(random() * values.length))];
}

function totalSpot(actors: Actor[]) {
  return actors.reduce((sum, actor) => sum + actor.spotTokens, 0);
}

function assertState(pool: BattlePoolState, positions: OwnedPosition[], actors: Actor[], initialSystemEth: number) {
  const snapshot = snapshotV50Invariants(pool, positions);
  assert(Math.abs(totalSpot(actors) - pool.circulatingSpotTokens) <= 0.5, "Spot holder ledger drifted from circulating inventory.");
  assert(snapshot.positionObligationsEth + snapshot.protectedWethEth <= pool.realWethBalance + 1e-8, "Pool became under-reserved.");
  assertV50ExternalEthConservation(pool, actors.map((actor) => actor.cashEth), initialSystemEth);
}

let attempted = 0;
let executed = 0;
let rejected = 0;
let liquidations = 0;
let maximumOpenPositions = 0;
let maximumObligationsEth = 0;

for (let seed = 1; seed <= 64; seed += 1) {
  const random = rng(seed * 0x45d9f3b);
  let pool = assertBattlePool({ ...createBattlePoolState(), realWethBalance: 30 });
  const actors: Actor[] = Array.from({ length: 8 }, (_, index) => ({ id: `actor-${index}`, cashEth: 20, spotTokens: 0 }));
  let positions: OwnedPosition[] = [];
  let nextPositionId = 1;
  const initialSystemEth = pool.realWethBalance + actors.reduce((sum, actor) => sum + actor.cashEth, 0);

  for (let step = 0; step < 384; step += 1) {
    attempted += 1;
    const actor = pick(actors, random);
    const action = Math.floor(random() * 8);
    try {
      if (action === 0 || action === 1) {
        const grossEth = Math.min(actor.cashEth * 0.2, 0.0001 + random() * 0.12);
        if (grossEth <= 1e-8) throw new Error("No cash for spot buy.");
        const trade = executeSpotBuy(pool, grossEth);
        actor.cashEth -= grossEth;
        actor.spotTokens += trade.tokens;
        pool = trade.next;
      } else if (action === 2) {
        const maximum = actor.spotTokens;
        if (maximum <= 1) throw new Error("No safe spot inventory to sell.");
        const tokens = maximum * (0.05 + random() * 0.95);
        const trade = executeSpotSell(pool, tokens);
        actor.spotTokens -= tokens;
        actor.cashEth += trade.netEth;
        pool = trade.next;
      } else if (action === 3) {
        const leverage = pick([2, 3, 5, 10, 20], random);
        const collateralEth = Math.min(actor.cashEth * 0.1, 0.0001 + random() * 0.025);
        const trade = executeOpenLong(pool, collateralEth, leverage);
        const required = collateralEth + trade.feeEth;
        if (required > actor.cashEth) throw new Error("Insufficient actor cash for long.");
        actor.cashEth -= required;
        pool = trade.next;
        positions.push({
          id: `v50-${seed}-${nextPositionId++}`,
          owner: actor.id,
          slug: "v50",
          direction: "long",
          leverage,
          collateral: collateralEth,
          notional: trade.notionalEth,
          entryCap: 0,
          currentCap: 0,
          liquidationCap: 0,
          openedAt: step,
          tokenAmount: trade.tokens,
          debtEth: trade.debtEth,
          lockedProceedsEth: 0,
          maintenanceMarginRate: 0.02,
        });
      } else if (action === 4) {
        const leverage = pick([2, 3, 5, 10, 20], random);
        const collateralEth = Math.min(actor.cashEth * 0.1, 0.0001 + random() * 0.018);
        const trade = executeOpenShort(pool, collateralEth, leverage);
        const required = collateralEth + trade.feeEth;
        if (required > actor.cashEth) throw new Error("Insufficient actor cash for short.");
        actor.cashEth -= required;
        pool = trade.next;
        positions.push({
          id: `v50-${seed}-${nextPositionId++}`,
          owner: actor.id,
          slug: "v50",
          direction: "short",
          leverage,
          collateral: collateralEth,
          notional: trade.notionalEth,
          entryCap: 0,
          currentCap: 0,
          liquidationCap: 0,
          openedAt: step,
          borrowedTokens: trade.borrowedTokens,
          lockedProceedsEth: trade.lockedProceedsEth,
          tokenAmount: 0,
          debtEth: 0,
          maintenanceMarginRate: 0.02,
        });
      } else if (action === 5 && positions.length) {
        const index = Math.floor(random() * positions.length);
        const position = positions[index];
        const owner = actors.find((candidate) => candidate.id === position.owner)!;
        const trade = position.direction === "long"
          ? executeCloseLong(pool, position)
          : executeCloseShort(pool, position);
        owner.cashEth += trade.payoutEth;
        pool = trade.next;
        positions.splice(index, 1);
      } else if (action === 6 && positions.length) {
        const cascade = executeLiquidationCascade(pool, positions, { maxLiquidations: 16 });
        pool = cascade.next;
        positions = cascade.remainingPositions as OwnedPosition[];
        liquidations += cascade.liquidatedCount;
      } else {
        pool = rebalanceAdaptiveInventory(pool).next;
      }
      executed += 1;
      maximumOpenPositions = Math.max(maximumOpenPositions, positions.length);
      maximumObligationsEth = Math.max(maximumObligationsEth, positionObligationsWeth(pool));
      assertState(pool, positions, actors, initialSystemEth);
    } catch {
      rejected += 1;
      assertState(pool, positions, actors, initialSystemEth);
    }
  }
}

assert(executed > 12_000, "Stateful V50 harness executed too few transitions.");
assert(rejected > 0, "Adversarial harness should encounter and safely reject unsafe transitions.");

console.log(JSON.stringify({
  version: "v50-stateful-invariants",
  seeds: 64,
  stepsPerSeed: 384,
  attempted,
  executed,
  rejected,
  liquidations,
  maximumOpenPositions,
  maximumObligationsEth,
  result: "PASS",
}, null, 2));
