import {
  BATTLE_TOTAL_SUPPLY,
  battlePriceEth,
  createBattlePoolState,
  estimatePositionEquity,
  executeCloseLong,
  executeCloseShort,
  executeOpenLong,
  executeOpenShort,
  executeSpotBuy,
  executeSpotSell,
  totalTokenConservation,
} from "../lib/battle-pool.ts";

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function conserved(pool: ReturnType<typeof createBattlePoolState>) {
  expect(Math.abs(totalTokenConservation(pool) - BATTLE_TOTAL_SUPPLY) < 0.5, "Token supply was not conserved.");
  expect(pool.realWethBalance >= 0, "Real WETH balance became negative.");
}

// 1. A 1 ETH genesis buy must be huge, but it must not own the whole launch.
let pool = createBattlePoolState();
const genesis = executeSpotBuy(pool, 1);
pool = genesis.next;
const genesisShare = genesis.tokens / BATTLE_TOTAL_SUPPLY;
expect(genesisShare > 0.35 && genesisShare < 0.55, `1 ETH genesis share was ${(genesisShare * 100).toFixed(2)}%.`);
conserved(pool);

// 2. A genesis whale can be attacked by shorts and cannot assume a full refund.
// V49 reserves the short's full maximum liability, so the sandbox seeds the
// small explicit risk reserve needed to let every spot holder exit as well.
pool = { ...pool, realWethBalance: pool.realWethBalance + 0.05 };
const short = executeOpenShort(pool, 0.05, 10);
pool = short.next;
const devExit = executeSpotSell(pool, genesis.tokens);
pool = devExit.next;
expect(devExit.netEth < 1, "Genesis whale incorrectly recovered the full 1 ETH after a short attack.");
const shortClose = executeCloseShort(pool, {
  collateral: 0.05,
  borrowedTokens: short.borrowedTokens,
  lockedProceedsEth: short.lockedProceedsEth,
});
pool = shortClose.next;
expect(shortClose.payoutEth > 0.05, "Correct short did not earn a profit after the whale exit.");
conserved(pool);

// 3. A liquidated short must create a real forced buy and increase the shared price.
pool = executeSpotBuy(createBattlePoolState(), 1).next;
const squeezeShort = executeOpenShort(pool, 0.03, 10);
pool = squeezeShort.next;
pool = executeSpotBuy(pool, 0.40).next;
const shortEquity = estimatePositionEquity(pool, {
  id: "short-smoke",
  slug: "smoke",
  direction: "short",
  leverage: 10,
  collateral: 0.03,
  notional: 0.30,
  entryCap: 0,
  currentCap: 0,
  liquidationCap: 0,
  openedAt: Date.now(),
  borrowedTokens: squeezeShort.borrowedTokens,
  lockedProceedsEth: squeezeShort.lockedProceedsEth,
});
expect(shortEquity < 0, "Squeeze scenario did not make the short insolvent.");
const beforeShortLiquidation = battlePriceEth(pool);
const shortLiquidation = executeCloseShort(pool, {
  collateral: 0.03,
  borrowedTokens: squeezeShort.borrowedTokens,
  lockedProceedsEth: squeezeShort.lockedProceedsEth,
}, 1, true);
pool = shortLiquidation.next;
expect(battlePriceEth(pool) > beforeShortLiquidation, "Short liquidation did not force the spot price upward.");
conserved(pool);

// 4. A liquidated long must force a real sell and decrease the shared price.
pool = executeSpotBuy(createBattlePoolState(), 1).next;
const leveragedLong = executeOpenLong(pool, 0.03, 10);
pool = leveragedLong.next;
pool = executeSpotSell(pool, 100_000_000).next;
const longEquity = estimatePositionEquity(pool, {
  id: "long-smoke",
  slug: "smoke",
  direction: "long",
  leverage: 10,
  collateral: 0.03,
  notional: 0.30,
  entryCap: 0,
  currentCap: 0,
  liquidationCap: 0,
  openedAt: Date.now(),
  tokenAmount: leveragedLong.tokens,
  debtEth: leveragedLong.debtEth,
});
expect(longEquity < 0, "Dump scenario did not make the long insolvent.");
const beforeLongLiquidation = battlePriceEth(pool);
const longLiquidation = executeCloseLong(pool, {
  collateral: 0.03,
  notional: 0.30,
  tokenAmount: leveragedLong.tokens,
  debtEth: leveragedLong.debtEth,
}, 1, true);
pool = longLiquidation.next;
expect(battlePriceEth(pool) < beforeLongLiquidation, "Long liquidation did not force the spot price downward.");
conserved(pool);

console.log(JSON.stringify({
  status: "PASS",
  genesisSharePercent: Number((genesisShare * 100).toFixed(2)),
  devExitEthAfterShortAttack: Number(devExit.netEth.toFixed(6)),
  profitableShortPayoutEth: Number(shortClose.payoutEth.toFixed(6)),
  shortLiquidationPriceImpactPercent: Number(shortLiquidation.priceImpactPercent.toFixed(2)),
  longLiquidationPriceImpactPercent: Number(longLiquidation.priceImpactPercent.toFixed(2)),
  finalTokenConservation: Math.round(totalTokenConservation(pool)),
}, null, 2));
