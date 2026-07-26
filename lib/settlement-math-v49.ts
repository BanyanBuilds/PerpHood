import {
  DEFAULT_FIXED_CURVE_PARAMS,
  FP_BPS,
  FP_CURVE_ALLOCATION_WAD,
  FP_OPENING_PRICE_WAD,
  FP_TRADE_FEE_BPS,
  FP_WAD,
  cumulativeCostWad,
  maxSoldWad,
  mulDivUp,
  quoteFixedBuyExactTokens,
  quoteFixedSell,
  soldAtCumulativeCostWad,
  type FixedCurveParams,
} from "./fixed-point-battle-curve.ts";

/**
 * V49 independent settlement oracle.
 *
 * The production curve uses conservative fixed-point roots. This module also
 * evaluates the exponent-5 curve as an exact BigInt rational, then separately
 * models position settlement. Keeping the reference path independent makes a
 * copied implementation bug much less likely to pass both sides of a test.
 */

export const V49_NO_FEE_CURVE: FixedCurveParams = {
  ...DEFAULT_FIXED_CURVE_PARAMS,
  feeBps: 0n,
};

export type V49LongPositionMath = {
  direction: "long";
  tokenAmountWad: bigint;
  debtWei: bigint;
  collateralWei: bigint;
};

export type V49ShortPositionMath = {
  direction: "short";
  borrowedTokensWad: bigint;
  lockedProceedsWei: bigint;
  collateralWei: bigint;
};

export type V49PositionMath = V49LongPositionMath | V49ShortPositionMath;

export type V49SettlementMath = {
  soldAfterWad: bigint;
  grossCurveWei: bigint;
  closeFeeWei: bigint;
  payoutWei: bigint;
  pnlWei: bigint;
  badDebtWei: bigint;
};

function pow(value: bigint, exponent: number) {
  let result = 1n;
  for (let index = 0; index < exponent; index++) result *= value;
  return result;
}

export function exactIdealMarginalPriceWad(
  soldWad: bigint,
  params: FixedCurveParams = V49_NO_FEE_CURVE,
) {
  if (soldWad < 0n || soldWad >= params.allocationWad) throw new Error("Sold inventory is outside the ideal curve domain.");
  const remainingWad = params.allocationWad - soldWad;
  return params.openingPriceWad * pow(params.allocationWad, 5) / pow(remainingWad, 5);
}

/** Exact floor of the mathematical integral, with no intermediate WAD rounding. */
export function exactIdealCumulativeCostWad(
  soldWad: bigint,
  params: FixedCurveParams = V49_NO_FEE_CURVE,
) {
  if (soldWad < 0n || soldWad >= params.allocationWad) throw new Error("Sold inventory is outside the ideal curve domain.");
  if (soldWad === 0n) return 0n;
  const remainingWad = params.allocationWad - soldWad;
  const remainingFourth = pow(remainingWad, 4);
  const allocationFourth = pow(params.allocationWad, 4);
  const baseWethWad = params.openingPriceWad * params.allocationWad / FP_WAD;
  return baseWethWad * (allocationFourth - remainingFourth) / (4n * remainingFourth);
}

export function quoteV49LongSettlement(soldWad: bigint, position: V49LongPositionMath): V49SettlementMath {
  const quote = quoteFixedSell(soldWad, position.tokenAmountWad, V49_NO_FEE_CURVE);
  const badDebtWei = position.debtWei > quote.grossCurveWethWad ? position.debtWei - quote.grossCurveWethWad : 0n;
  const surplusWei = quote.grossCurveWethWad > position.debtWei ? quote.grossCurveWethWad - position.debtWei : 0n;
  const rawFee = mulDivUp(quote.grossCurveWethWad, FP_TRADE_FEE_BPS, FP_BPS);
  const closeFeeWei = rawFee < surplusWei ? rawFee : surplusWei;
  const payoutWei = surplusWei - closeFeeWei;
  return {
    soldAfterWad: quote.soldAfterWad,
    grossCurveWei: quote.grossCurveWethWad,
    closeFeeWei,
    payoutWei,
    pnlWei: payoutWei - position.collateralWei,
    badDebtWei,
  };
}

export function quoteV49ShortSettlement(soldWad: bigint, position: V49ShortPositionMath): V49SettlementMath {
  const quote = quoteFixedBuyExactTokens(soldWad, position.borrowedTokensWad, V49_NO_FEE_CURVE);
  const fundsWei = position.collateralWei + position.lockedProceedsWei;
  const badDebtWei = quote.grossWethWad > fundsWei ? quote.grossWethWad - fundsWei : 0n;
  const surplusWei = fundsWei > quote.grossWethWad ? fundsWei - quote.grossWethWad : 0n;
  const rawFee = mulDivUp(quote.grossWethWad, FP_TRADE_FEE_BPS, FP_BPS);
  const closeFeeWei = rawFee < surplusWei ? rawFee : surplusWei;
  const payoutWei = surplusWei - closeFeeWei;
  return {
    soldAfterWad: quote.soldAfterWad,
    grossCurveWei: quote.grossWethWad,
    closeFeeWei,
    payoutWei,
    pnlWei: payoutWei - position.collateralWei,
    badDebtWei,
  };
}

export function quoteV49Settlement(soldWad: bigint, position: V49PositionMath) {
  return position.direction === "long"
    ? quoteV49LongSettlement(soldWad, position)
    : quoteV49ShortSettlement(soldWad, position);
}

export function quoteV49MaximumShortPayout(position: V49ShortPositionMath) {
  return quoteV49ShortSettlement(0n, position).payoutWei;
}

export function quoteV49ShortOpenForTarget(
  soldBeforeWad: bigint,
  collateralWei: bigint,
  leverage: bigint,
) {
  if (collateralWei <= 0n || leverage < 2n || leverage > 20n) throw new Error("Invalid short collateral or leverage.");
  const notionalWei = collateralWei * leverage;
  const costBeforeWei = cumulativeCostWad(soldBeforeWad, V49_NO_FEE_CURVE);
  if (notionalWei > costBeforeWei) throw new Error("The curve cannot supply the requested short proceeds.");
  const soldAfterWad = soldAtCumulativeCostWad(costBeforeWei - notionalWei, V49_NO_FEE_CURVE);
  if (soldAfterWad >= soldBeforeWad) throw new Error("Short target produced no borrowed inventory.");
  const borrowedTokensWad = soldBeforeWad - soldAfterWad;
  const lockedProceedsWei = costBeforeWei - cumulativeCostWad(soldAfterWad, V49_NO_FEE_CURVE);
  return {
    soldBeforeWad,
    soldAfterWad,
    borrowedTokensWad,
    lockedProceedsWei,
    collateralWei,
    notionalWei,
    entryFeeWei: mulDivUp(notionalWei, FP_TRADE_FEE_BPS, FP_BPS),
  };
}

export function guaranteedV49Obligations(input: {
  soldWad: bigint;
  borrowedShortTokensWad: bigint;
  lockedLongTokensWad: bigint;
  lockedShortCollateralWei: bigint;
  lockedShortProceedsWei: bigint;
}) {
  const highestSoldFromExistingShorts = input.soldWad + input.borrowedShortTokensWad;
  if (highestSoldFromExistingShorts > maxSoldWad(V49_NO_FEE_CURVE)) return null;
  let longGrossExtremeWei = 0n;
  if (input.lockedLongTokensWad > 0n) {
    if (input.lockedLongTokensWad > highestSoldFromExistingShorts) return null;
    longGrossExtremeWei = quoteFixedSell(
      highestSoldFromExistingShorts,
      input.lockedLongTokensWad,
      V49_NO_FEE_CURVE,
    ).grossCurveWethWad;
  }
  return longGrossExtremeWei + input.lockedShortCollateralWei + input.lockedShortProceedsWei;
}

export function isV49SettlementPayable(input: {
  balanceWei: bigint;
  payoutWei: bigint;
  postCloseObligationsWei: bigint;
  protectedWethBps?: bigint;
}) {
  const protectedBps = input.protectedWethBps ?? 100n;
  if (input.payoutWei > input.balanceWei) return false;
  const projectedBalanceWei = input.balanceWei - input.payoutWei;
  const protectedAfterWei = projectedBalanceWei * protectedBps / FP_BPS;
  return input.postCloseObligationsWei + protectedAfterWei <= projectedBalanceWei;
}

export const V49_MATH_CONSTANTS = {
  allocationWad: FP_CURVE_ALLOCATION_WAD,
  openingPriceWad: FP_OPENING_PRICE_WAD,
  maxSoldWad: maxSoldWad(V49_NO_FEE_CURVE),
};
