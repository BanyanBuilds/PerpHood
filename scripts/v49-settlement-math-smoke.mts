import assert from "node:assert/strict";
import {
  FP_BPS,
  FP_CURVE_ALLOCATION_WAD,
  FP_TRADE_FEE_BPS,
  FP_WAD,
  cumulativeCostWad,
  marginalPriceWad,
  maxSoldWad,
  quoteFixedBuy,
  quoteFixedBuyExactTokens,
  quoteFixedSell,
} from "../lib/fixed-point-battle-curve.ts";
import {
  V49_MATH_CONSTANTS,
  V49_NO_FEE_CURVE,
  exactIdealCumulativeCostWad,
  exactIdealMarginalPriceWad,
  guaranteedV49Obligations,
  isV49SettlementPayable,
  quoteV49LongSettlement,
  quoteV49MaximumShortPayout,
  quoteV49Settlement,
  quoteV49ShortOpenForTarget,
  quoteV49ShortSettlement,
  type V49PositionMath,
  type V49ShortPositionMath,
} from "../lib/settlement-math-v49.ts";

const TOKEN = FP_WAD;
const ETH = FP_WAD;
const abs = (value: bigint) => value < 0n ? -value : value;

// 1. Independent exact-rational curve oracle versus the contract-grade fixed-point path.
let maximumCostUnderRoundWei = 0n;
let maximumPriceUnderRoundWei = 0n;
for (let index = 0; index <= 3_000; index++) {
  const soldWad = maxSoldWad(V49_NO_FEE_CURVE) * BigInt(index) / 3_001n;
  const fixedCost = cumulativeCostWad(soldWad, V49_NO_FEE_CURVE);
  const exactCost = exactIdealCumulativeCostWad(soldWad);
  assert(fixedCost <= exactCost, "Fixed-point cumulative cost must never exceed the exact ideal integral.");
  maximumCostUnderRoundWei = maximumCostUnderRoundWei > exactCost - fixedCost ? maximumCostUnderRoundWei : exactCost - fixedCost;

  const fixedPrice = marginalPriceWad(soldWad, V49_NO_FEE_CURVE);
  const exactPrice = exactIdealMarginalPriceWad(soldWad);
  assert(fixedPrice <= exactPrice, "Fixed-point marginal price must never exceed the exact ideal price.");
  maximumPriceUnderRoundWei = maximumPriceUnderRoundWei > exactPrice - fixedPrice ? maximumPriceUnderRoundWei : exactPrice - fixedPrice;
}
assert(maximumCostUnderRoundWei <= 1_000n, `Curve integral rounding exceeded 1,000 wei: ${maximumCostUnderRoundWei}.`);
assert(maximumPriceUnderRoundWei <= 10_000_000n, `Marginal-price rounding exceeded tolerance: ${maximumPriceUnderRoundWei}.`);

// 2. Spot round trips cannot manufacture value.
for (const grossWei of [10n ** 14n, 10n ** 15n, 10n ** 16n, 10n ** 17n, ETH]) {
  const buy = quoteFixedBuy(0n, grossWei);
  const sell = quoteFixedSell(buy.soldAfterWad, buy.tokenOutWad);
  assert(sell.netWethWad < grossWei, "A buy/sell round trip must lose fees or rounding, never gain value.");
  assert.equal(sell.soldAfterWad, 0n, "A full spot round trip must restore sold inventory.");
}

// 3. Short equity rises monotonically as the market falls, and floor payout is exact and bounded.
let shortScenarios = 0;
for (const soldFractionBps of [1_000n, 2_500n, 5_000n, 7_500n, 9_000n]) {
  const soldBeforeWad = FP_CURVE_ALLOCATION_WAD * soldFractionBps / 10_000n;
  const costBeforeWei = cumulativeCostWad(soldBeforeWad, V49_NO_FEE_CURVE);
  for (const leverage of [2n, 5n, 10n, 20n]) {
    const collateralWei = costBeforeWei / (leverage * 25n);
    if (collateralWei <= 0n) continue;
    const opened = quoteV49ShortOpenForTarget(soldBeforeWad, collateralWei, leverage);
    const position: V49ShortPositionMath = {
      direction: "short",
      borrowedTokensWad: opened.borrowedTokensWad,
      lockedProceedsWei: opened.lockedProceedsWei,
      collateralWei,
    };

    const immediate = quoteV49ShortSettlement(opened.soldAfterWad, position);
    assert(immediate.payoutWei <= collateralWei, "An unchanged short cannot return more than collateral after close fees.");

    let previousPayout = immediate.payoutWei;
    for (let step = 1; step <= 64; step++) {
      const lowerSoldWad = opened.soldAfterWad * BigInt(64 - step) / 64n;
      const settlement = quoteV49ShortSettlement(lowerSoldWad, position);
      assert(settlement.payoutWei >= previousPayout, "Short payout must not fall when the shared curve falls.");
      previousPayout = settlement.payoutWei;
    }

    const floor = quoteV49ShortSettlement(0n, position);
    assert.equal(floor.payoutWei, quoteV49MaximumShortPayout(position), "Floor payout must equal the advertised maximum short payout.");
    assert(floor.pnlWei <= opened.notionalWei, "Short profit cannot exceed original notional exposure.");
    assert(floor.payoutWei <= collateralWei + opened.lockedProceedsWei, "Short payout cannot exceed its fully reserved funds.");
    shortScenarios += 1;
  }
}
assert(shortScenarios >= 16, "Expected broad short scenario coverage.");

// 4. Long and short same-state reversals restore curve inventory and charge deterministic close fees.
const baseSoldWad = FP_CURVE_ALLOCATION_WAD * 45n / 100n;
const longNotionalWei = 2n * ETH / 100n;
const longCollateralWei = longNotionalWei / 5n;
const longBuy = quoteFixedBuy(baseSoldWad, longNotionalWei, V49_NO_FEE_CURVE);
const longPosition: V49PositionMath = {
  direction: "long",
  tokenAmountWad: longBuy.tokenOutWad,
  debtWei: longNotionalWei - longCollateralWei,
  collateralWei: longCollateralWei,
};
const longClose = quoteV49LongSettlement(longBuy.soldAfterWad, longPosition);
assert.equal(longClose.soldAfterWad, baseSoldWad, "A same-state long close must restore the pre-open curve state.");
assert(longClose.payoutWei < longCollateralWei, "A same-state long close must lose the close fee.");

const shortOpen = quoteV49ShortOpenForTarget(baseSoldWad, 4n * ETH / 1_000n, 5n);
const sameStateShort: V49ShortPositionMath = {
  direction: "short",
  borrowedTokensWad: shortOpen.borrowedTokensWad,
  lockedProceedsWei: shortOpen.lockedProceedsWei,
  collateralWei: shortOpen.collateralWei,
};
const shortClose = quoteV49ShortSettlement(shortOpen.soldAfterWad, sameStateShort);
assert.equal(shortClose.soldAfterWad, baseSoldWad, "A same-state short close must restore the pre-open curve state.");
assert(shortClose.payoutWei < shortOpen.collateralWei, "A same-state short close must lose the close fee.");

// 5. The guaranteed reserve does not net profitable positions against underwater positions.
const mixedSoldWad = FP_CURVE_ALLOCATION_WAD * 55n / 100n;
const longA: V49PositionMath = { direction: "long", tokenAmountWad: 4_000_000n * TOKEN, debtWei: 0n, collateralWei: ETH / 100n };
const longB: V49PositionMath = { direction: "long", tokenAmountWad: 3_000_000n * TOKEN, debtWei: 100n * ETH, collateralWei: ETH / 100n };
const shortA: V49PositionMath = { direction: "short", borrowedTokensWad: 2_000_000n * TOKEN, lockedProceedsWei: 2n * ETH, collateralWei: ETH / 100n };
const shortB: V49PositionMath = { direction: "short", borrowedTokensWad: 1_000_000n * TOKEN, lockedProceedsWei: 0n, collateralWei: ETH / 1_000n };
const mixedPositions = [longA, longB, shortA, shortB];
const totalBorrowed = mixedPositions.reduce((sum, position) => sum + (position.direction === "short" ? position.borrowedTokensWad : 0n), 0n);
const totalLongTokens = mixedPositions.reduce((sum, position) => sum + (position.direction === "long" ? position.tokenAmountWad : 0n), 0n);
const totalShortCollateral = mixedPositions.reduce((sum, position) => sum + (position.direction === "short" ? position.collateralWei : 0n), 0n);
const totalShortProceeds = mixedPositions.reduce((sum, position) => sum + (position.direction === "short" ? position.lockedProceedsWei : 0n), 0n);
const guaranteed = guaranteedV49Obligations({
  soldWad: mixedSoldWad,
  borrowedShortTokensWad: totalBorrowed,
  lockedLongTokensWad: totalLongTokens,
  lockedShortCollateralWei: totalShortCollateral,
  lockedShortProceedsWei: totalShortProceeds,
});
assert(guaranteed !== null, "Mixed position state must remain closeable.");

function permutations<T>(values: T[]): T[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) => permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((tail) => [value, ...tail]));
}

let maximumPermutationPayoutWei = 0n;
for (const order of permutations(mixedPositions)) {
  let soldWad = mixedSoldWad;
  let payoutWei = 0n;
  for (const position of order) {
    const settlement = quoteV49Settlement(soldWad, position);
    soldWad = settlement.soldAfterWad;
    payoutWei += settlement.payoutWei;
  }
  if (payoutWei > maximumPermutationPayoutWei) maximumPermutationPayoutWei = payoutWei;
}
assert(guaranteed! >= maximumPermutationPayoutWei, "Guaranteed liabilities must cover every close ordering without cross-position netting.");

// Demonstrate why the older aggregate-net approach was unsafe for heterogeneous positions.
const aggregateLongGross = quoteFixedSell(mixedSoldWad, totalLongTokens, V49_NO_FEE_CURVE).grossCurveWethWad;
const aggregateLongDebt = mixedPositions.reduce((sum, position) => sum + (position.direction === "long" ? position.debtWei : 0n), 0n);
const aggregateLongSurplus = aggregateLongGross > aggregateLongDebt ? aggregateLongGross - aggregateLongDebt : 0n;
const oldNetLongFee = aggregateLongGross * FP_TRADE_FEE_BPS / FP_BPS;
const oldNetLongObligation = aggregateLongSurplus > oldNetLongFee ? aggregateLongSurplus - oldNetLongFee : 0n;
const individualLongPayout = quoteV49Settlement(mixedSoldWad, longA).payoutWei + quoteV49Settlement(mixedSoldWad - longA.tokenAmountWad, longB).payoutWei;
assert(individualLongPayout > oldNetLongObligation, "Fixture must expose cross-position debt netting under-reserve.");
assert(guaranteed! >= individualLongPayout, "V49 gross-liability reserve must cover the profitable long despite another long's bad debt.");

// 6. `payableNow` means payout plus all remaining guaranteed liabilities fit after protection.
assert(isV49SettlementPayable({ balanceWei: 10n * ETH, payoutWei: ETH, postCloseObligationsWei: 5n * ETH }));
assert(!isV49SettlementPayable({ balanceWei: 10n * ETH, payoutWei: 5n * ETH, postCloseObligationsWei: 5n * ETH }));
assert.equal(V49_MATH_CONSTANTS.maxSoldWad, FP_CURVE_ALLOCATION_WAD * 9_400n / 10_000n);

console.log(JSON.stringify({
  version: "v49-settlement-math-verification",
  exactCurveVectors: 3_001,
  maximumCostUnderRoundWei: maximumCostUnderRoundWei.toString(),
  maximumPriceUnderRoundWei: maximumPriceUnderRoundWei.toString(),
  shortScenarios,
  closeOrderPermutations: 24,
  maximumPermutationPayoutWei: maximumPermutationPayoutWei.toString(),
  guaranteedLiabilityWei: guaranteed!.toString(),
  result: "PASS",
}, null, 2));
