import assert from "node:assert/strict";
import { createBattlePoolState, executeSpotBuy, poolToTokenPatch } from "../lib/battle-pool.ts";
import {
  LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH,
  LAUNCHPAD_MIN_TOTAL_SPEND_ETH,
  LAUNCHPAD_TARGET_OPTIONS_USD,
  buildMigrationSnapshot,
  estimateMigrationTarget,
  migrationPatch,
  quoteLaunchSpend,
} from "../lib/launchpad.ts";
import type { Token } from "../lib/types.ts";

const minimum = quoteLaunchSpend(LAUNCHPAD_MIN_TOTAL_SPEND_ETH, LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH);
assert.equal(minimum.valid, true);
assert.ok(Math.abs(minimum.creatorBuyEth - 0.00082) < 1e-12, "inclusive gas reserve did not leave the expected creator buy");
assert.equal(quoteLaunchSpend(0.00099, LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH).valid, false);
assert.equal(quoteLaunchSpend(0.001, 0.00095).valid, false);

let priorWeth = 0;
for (const target of LAUNCHPAD_TARGET_OPTIONS_USD) {
  const estimate = estimateMigrationTarget(target, 3_200);
  assert.ok(estimate.estimatedGrossWethEth > priorWeth, "higher migration targets must require more real WETH");
  assert.ok(estimate.tokensSold > 0 && estimate.tokensSold < 800_000_000, "target must stay inside the public curve inventory");
  assert.ok(estimate.circulatingPercent > 0 && estimate.circulatingPercent < 80, "circulating supply estimate out of range");
  priorWeth = estimate.estimatedGrossWethEth;
}

const target = estimateMigrationTarget(45_000, 3_200);
const trade = executeSpotBuy(createBattlePoolState(), target.estimatedGrossWethEth + 0.002);
const patch = poolToTokenPatch(trade.next, 3_200);
const token: Token = {
  slug: "v41-smoke",
  symbol: "V41",
  name: "V41 Smoke",
  emoji: "⚔️",
  hue: 45,
  cap: patch.cap,
  price: patch.price,
  change24h: 0,
  graduation: 99,
  longs: 50,
  volume24h: 0,
  openInterest: 0,
  funding: 0,
  launchedMinutesAgo: 20,
  description: "Launchpad migration smoke market",
  launchState: "live",
  battlePhase: "bonding",
  uniqueTraders: 35,
  linkedWalletConcentration: 18,
  badDebtEth: 0,
  migrationTargetMarketCapUsd: 45_000,
  launchpadVersion: "v41-launchpad-test-alpha",
  activeLiquidationBatch: false,
  ...patch,
};

const snapshot = buildMigrationSnapshot(token, [], 3_200);
assert.equal(snapshot.ready, true, snapshot.gates.filter((gate) => !gate.passed).map((gate) => gate.label).join(", "));
assert.equal(snapshot.passedGateCount, snapshot.totalGateCount);
assert.equal(snapshot.phase, "cooking");
const migrated = { ...token, ...migrationPatch(token, snapshot) };
assert.equal(migrated.launchState, "graduated");
assert.equal(migrated.battlePhase, "migrated");
assert.equal(migrated.graduation, 100);
assert.ok(migrated.migrationGateDigest?.includes("market-cap:1"));

const badDebt = buildMigrationSnapshot({ ...token, badDebtEth: 0.01 }, [], 3_200);
assert.equal(badDebt.ready, false);
assert.equal(badDebt.gates.find((gate) => gate.key === "bad-debt")?.passed, false);

const concentrated = buildMigrationSnapshot({ ...token, uniqueTraders: 4 }, [], 3_200);
assert.equal(concentrated.ready, false);
assert.equal(concentrated.gates.find((gate) => gate.key === "trader-distribution")?.passed, false);

console.log("V41 launchpad engine smoke passed.");
console.log(JSON.stringify({
  minimumTotalSpendEth: minimum.totalSpendEth,
  gasReserveEth: minimum.gasReserveEth,
  creatorBuyEth: minimum.creatorBuyEth,
  targetMarketCapUsd: target.targetMarketCapUsd,
  targetGrossWethEth: Number(target.estimatedGrossWethEth.toFixed(6)),
  targetCirculatingPercent: Number(target.circulatingPercent.toFixed(3)),
  migrationGates: snapshot.totalGateCount,
}, null, 2));
