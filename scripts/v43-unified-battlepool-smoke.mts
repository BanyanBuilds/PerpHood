import assert from "node:assert/strict";
import {
  BATTLE_POOL_VERSION,
  BATTLE_TOTAL_SUPPLY,
  battlePriceEth,
  createBattlePoolState,
  executeCloseLong,
  executeCloseShort,
  executeOpenLong,
  executeOpenShort,
  executeSpotBuy,
  executeSpotSell,
  freeWeth,
  totalTokenConservation,
} from "../lib/battle-pool.ts";
import type { Position } from "../lib/types.ts";

let pool = createBattlePoolState();
pool = executeSpotBuy(pool, 0.00082).next;
pool = executeSpotBuy(pool, 0.75).next;
const priceAfterSpot = battlePriceEth(pool);

const longTrade = executeOpenLong(pool, 0.04, 3);
pool = longTrade.next;
const longPosition: Position = {
  id: "v43-long",
  slug: "hood",
  direction: "long",
  leverage: 3,
  collateral: longTrade.collateralEth,
  notional: longTrade.notionalEth,
  entryCap: longTrade.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  currentCap: longTrade.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  liquidationCap: 0,
  openedAt: Date.now(),
  tokenAmount: longTrade.tokens,
  debtEth: longTrade.debtEth,
  entryPriceEth: longTrade.priceAfter,
};
assert.ok(battlePriceEth(pool) > priceAfterSpot, "opening a long must buy the shared curve");

const shortTrade = executeOpenShort(pool, 0.02, 2);
pool = shortTrade.next;
const shortPosition: Position = {
  id: "v43-short",
  slug: "hood",
  direction: "short",
  leverage: 2,
  collateral: shortTrade.collateralEth,
  notional: shortTrade.notionalEth,
  entryCap: shortTrade.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  currentCap: shortTrade.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  liquidationCap: 0,
  openedAt: Date.now(),
  borrowedTokens: shortTrade.borrowedTokens,
  lockedProceedsEth: shortTrade.lockedProceedsEth,
  entryPriceEth: shortTrade.priceAfter,
};
assert.ok(shortTrade.priceAfter < shortTrade.priceBefore, "opening a short must sell into the shared curve");
assert.ok(freeWeth(pool) >= 0, "shared pool must remain solvent after mixed exposure");
assert.ok(Math.abs(totalTokenConservation(pool) - BATTLE_TOTAL_SUPPLY) < 0.5, "one-billion supply must reconcile");

const longClose = executeCloseLong(pool, longPosition);
pool = longClose.next;
const shortClose = executeCloseShort(pool, shortPosition);
pool = shortClose.next;
assert.equal(pool.badDebtEth, 0, "controlled V43 close path must not create bad debt");
assert.ok(Math.abs(totalTokenConservation(pool) - BATTLE_TOTAL_SUPPLY) < 0.5, "token conservation must survive both closes");

const spotRoundTripBuy = executeSpotBuy(pool, 0.05);
pool = spotRoundTripBuy.next;
const spotRoundTripSell = executeSpotSell(pool, spotRoundTripBuy.tokens * 0.5);
pool = spotRoundTripSell.next;
assert.ok(spotRoundTripSell.netEth > 0, "spot sell must pay from the same pool");
assert.equal(BATTLE_POOL_VERSION, "v43-unified-settlement");

console.log(JSON.stringify({
  version: BATTLE_POOL_VERSION,
  spotPriceEth: battlePriceEth(pool),
  freeWethEth: freeWeth(pool),
  conservedTokens: totalTokenConservation(pool),
  badDebtEth: pool.badDebtEth,
  status: "PASS",
}, null, 2));
