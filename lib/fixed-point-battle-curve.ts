/**
 * V24 contract-grade integer reference for the exponent-5 PERPHOOD BattleCurve.
 *
 * All token quantities use token-WAD (1 whole token = 1e18 units).
 * All WETH values and token prices use WAD. Rounding is intentionally explicit:
 * protocol fees round up, while token output and trader payouts round down.
 * This prevents fee fragmentation from making many dust trades cheaper than one trade.
 */
export const FP_WAD = 10n ** 18n;
export const FP_BPS = 10_000n;
export const FP_TOTAL_SUPPLY_WAD = 1_000_000_000n * FP_WAD;
export const FP_CURVE_ALLOCATION_WAD = 800_000_000n * FP_WAD;
export const FP_PERP_ALLOCATION_WAD = 100_000_000n * FP_WAD;
export const FP_SAFETY_ALLOCATION_WAD = 100_000_000n * FP_WAD;
export const FP_OPENING_FDV_WAD = FP_WAD / 4n;
export const FP_OPENING_PRICE_WAD = FP_OPENING_FDV_WAD * FP_WAD / FP_TOTAL_SUPPLY_WAD;
export const FP_TRADE_FEE_BPS = 30n;
export const FP_MAX_SOLD_BPS = 9_400n;
export const FP_CURVE_EXPONENT = 5n;

export type FixedCurveParams = {
  allocationWad: bigint;
  openingPriceWad: bigint;
  feeBps: bigint;
  maxSoldBps: bigint;
};

export const DEFAULT_FIXED_CURVE_PARAMS: FixedCurveParams = {
  allocationWad: FP_CURVE_ALLOCATION_WAD,
  openingPriceWad: FP_OPENING_PRICE_WAD,
  feeBps: FP_TRADE_FEE_BPS,
  maxSoldBps: FP_MAX_SOLD_BPS,
};

export type FixedBuyQuote = {
  soldBeforeWad: bigint;
  soldAfterWad: bigint;
  tokenOutWad: bigint;
  grossWethWad: bigint;
  feeWethWad: bigint;
  netCurveWethWad: bigint;
  marginalPriceBeforeWad: bigint;
  marginalPriceAfterWad: bigint;
};

export type FixedSellQuote = {
  soldBeforeWad: bigint;
  soldAfterWad: bigint;
  tokenInWad: bigint;
  grossCurveWethWad: bigint;
  feeWethWad: bigint;
  netWethWad: bigint;
  marginalPriceBeforeWad: bigint;
  marginalPriceAfterWad: bigint;
};

export function mulDivDown(a: bigint, b: bigint, denominator: bigint) {
  if (a < 0n || b < 0n || denominator <= 0n) throw new Error("mulDivDown requires unsigned values and a positive denominator.");
  return a * b / denominator;
}

export function mulDivUp(a: bigint, b: bigint, denominator: bigint) {
  if (a < 0n || b < 0n || denominator <= 0n) throw new Error("mulDivUp requires unsigned values and a positive denominator.");
  if (a === 0n || b === 0n) return 0n;
  return (a * b + denominator - 1n) / denominator;
}

export function feeWadUp(amountWad: bigint, feeBps: bigint) {
  return mulDivUp(amountWad, feeBps, FP_BPS);
}

export function wadMulDown(a: bigint, b: bigint) {
  return mulDivDown(a, b, FP_WAD);
}

export function wadDivDown(a: bigint, b: bigint) {
  return mulDivDown(a, FP_WAD, b);
}

export function sqrtBigInt(value: bigint) {
  if (value < 0n) throw new Error("Square root cannot accept a negative value.");
  if (value < 2n) return value;
  let estimate = 1n << ((BigInt(value.toString(2).length) + 1n) >> 1n);
  let next = (estimate + value / estimate) >> 1n;
  while (next < estimate) {
    estimate = next;
    next = (estimate + value / estimate) >> 1n;
  }
  return estimate;
}

export function wadSqrtDown(valueWad: bigint) {
  return sqrtBigInt(valueWad * FP_WAD);
}

export function wadFourthRootDown(valueWad: bigint) {
  return wadSqrtDown(wadSqrtDown(valueWad));
}

export function wadPowDown(baseWad: bigint, exponent: bigint) {
  if (baseWad < 0n || exponent < 0n) throw new Error("wadPowDown requires unsigned values.");
  let result = FP_WAD;
  let base = baseWad;
  let power = exponent;
  while (power > 0n) {
    if (power & 1n) result = wadMulDown(result, base);
    power >>= 1n;
    if (power > 0n) base = wadMulDown(base, base);
  }
  return result;
}

export function validateFixedCurveParams(params: FixedCurveParams) {
  if (params.allocationWad <= 0n || params.openingPriceWad <= 0n) throw new Error("Invalid fixed BattleCurve parameters.");
  if (params.feeBps < 0n || params.feeBps >= FP_BPS) throw new Error("Fee must remain below 100%.");
  if (params.maxSoldBps <= 0n || params.maxSoldBps >= FP_BPS) throw new Error("Protected inventory must remain non-zero.");
  return params;
}

export function maxSoldWad(params: FixedCurveParams = DEFAULT_FIXED_CURVE_PARAMS) {
  validateFixedCurveParams(params);
  return mulDivDown(params.allocationWad, params.maxSoldBps, FP_BPS);
}

export function marginalPriceWad(soldWad: bigint, params: FixedCurveParams = DEFAULT_FIXED_CURVE_PARAMS) {
  validateFixedCurveParams(params);
  if (soldWad < 0n || soldWad >= params.allocationWad) throw new Error("Sold inventory is outside the curve domain.");
  const remainingWad = params.allocationWad - soldWad;
  const reserveRatioWad = wadDivDown(params.allocationWad, remainingWad);
  return wadMulDown(params.openingPriceWad, wadPowDown(reserveRatioWad, FP_CURVE_EXPONENT));
}

export function cumulativeCostWad(soldWad: bigint, params: FixedCurveParams = DEFAULT_FIXED_CURVE_PARAMS) {
  validateFixedCurveParams(params);
  if (soldWad < 0n || soldWad >= params.allocationWad) throw new Error("Sold inventory is outside the curve domain.");
  if (soldWad === 0n) return 0n;
  const remainingWad = params.allocationWad - soldWad;
  const reserveRatioWad = wadDivDown(params.allocationWad, remainingWad);
  const ratioFourthWad = wadPowDown(reserveRatioWad, 4n);
  const baseWethWad = mulDivDown(params.openingPriceWad, params.allocationWad, FP_WAD);
  return mulDivDown(baseWethWad, ratioFourthWad - FP_WAD, 4n * FP_WAD);
}

/** Exact binary-search reference used by differential tests. */
export function soldAtCumulativeCostExactWad(targetCostWad: bigint, params: FixedCurveParams = DEFAULT_FIXED_CURVE_PARAMS) {
  validateFixedCurveParams(params);
  if (targetCostWad < 0n) throw new Error("Target cumulative cost cannot be negative.");
  const ceilingCostWad = cumulativeCostWad(maxSoldWad(params), params);
  if (targetCostWad > ceilingCostWad) throw new Error("Buy crosses protected curve inventory.");
  let low = 0n;
  let high = maxSoldWad(params);
  while (low < high) {
    const midpoint = (low + high + 1n) >> 1n;
    if (cumulativeCostWad(midpoint, params) <= targetCostWad) low = midpoint;
    else high = midpoint - 1n;
  }
  return low;
}

/** Closed-form inverse with conservative integer roots; output never exceeds paid curve cost. */
export function soldAtCumulativeCostWad(targetCostWad: bigint, params: FixedCurveParams = DEFAULT_FIXED_CURVE_PARAMS) {
  validateFixedCurveParams(params);
  if (targetCostWad < 0n) throw new Error("Target cumulative cost cannot be negative.");
  const maximumSold = maxSoldWad(params);
  const ceilingCostWad = cumulativeCostWad(maximumSold, params);
  if (targetCostWad > ceilingCostWad) throw new Error("Buy crosses protected curve inventory.");
  if (targetCostWad === 0n) return 0n;
  const baseWethWad = mulDivDown(params.openingPriceWad, params.allocationWad, FP_WAD);
  const ratioFourthWad = FP_WAD + mulDivDown(targetCostWad, 4n * FP_WAD, baseWethWad);
  const reserveRatioWad = wadFourthRootDown(ratioFourthWad);
  const remainingWad = mulDivUp(params.allocationWad, FP_WAD, reserveRatioWad);
  const soldWad = params.allocationWad - remainingWad;
  if (soldWad > maximumSold) throw new Error("Buy crosses protected curve inventory.");
  if (cumulativeCostWad(soldWad, params) > targetCostWad) throw new Error("Conservative curve inverse exceeded paid cost.");
  return soldWad;
}

export function quoteFixedBuy(
  soldBeforeWad: bigint,
  grossWethWad: bigint,
  params: FixedCurveParams = DEFAULT_FIXED_CURVE_PARAMS,
): FixedBuyQuote {
  validateFixedCurveParams(params);
  if (grossWethWad <= 0n) throw new Error("Buy amount must be positive.");
  if (soldBeforeWad < 0n || soldBeforeWad > maxSoldWad(params)) throw new Error("Invalid pre-buy sold inventory.");
  const feeWethWad = feeWadUp(grossWethWad, params.feeBps);
  const netCurveWethWad = grossWethWad - feeWethWad;
  const costBeforeWad = cumulativeCostWad(soldBeforeWad, params);
  const soldAfterWad = soldAtCumulativeCostWad(costBeforeWad + netCurveWethWad, params);
  const tokenOutWad = soldAfterWad - soldBeforeWad;
  if (tokenOutWad <= 0n) throw new Error("Buy is too small to produce token output at contract precision.");
  return {
    soldBeforeWad,
    soldAfterWad,
    tokenOutWad,
    grossWethWad,
    feeWethWad,
    netCurveWethWad,
    marginalPriceBeforeWad: marginalPriceWad(soldBeforeWad, params),
    marginalPriceAfterWad: marginalPriceWad(soldAfterWad, params),
  };
}


export function quoteFixedBuyExactTokens(
  soldBeforeWad: bigint,
  tokenOutWad: bigint,
  params: FixedCurveParams = DEFAULT_FIXED_CURVE_PARAMS,
): FixedBuyQuote {
  validateFixedCurveParams(params);
  if (tokenOutWad <= 0n) throw new Error("Exact-token buy amount must be positive.");
  const soldAfterWad = soldBeforeWad + tokenOutWad;
  if (soldAfterWad > maxSoldWad(params)) throw new Error("Exact-token buy crosses protected inventory.");
  const netCurveWethWad = cumulativeCostWad(soldAfterWad, params) - cumulativeCostWad(soldBeforeWad, params);
  let grossWethWad = mulDivUp(netCurveWethWad, FP_BPS, FP_BPS - params.feeBps);
  while (grossWethWad > 0n) {
    const candidate = grossWethWad - 1n;
    const candidateFee = feeWadUp(candidate, params.feeBps);
    if (candidate - candidateFee < netCurveWethWad) break;
    grossWethWad = candidate;
  }
  let feeWethWad = feeWadUp(grossWethWad, params.feeBps);
  while (grossWethWad - feeWethWad < netCurveWethWad) {
    grossWethWad += 1n;
    feeWethWad = feeWadUp(grossWethWad, params.feeBps);
  }
  return {
    soldBeforeWad,
    soldAfterWad,
    tokenOutWad,
    grossWethWad,
    feeWethWad,
    netCurveWethWad,
    marginalPriceBeforeWad: marginalPriceWad(soldBeforeWad, params),
    marginalPriceAfterWad: marginalPriceWad(soldAfterWad, params),
  };
}

export function quoteFixedSell(
  soldBeforeWad: bigint,
  tokenInWad: bigint,
  params: FixedCurveParams = DEFAULT_FIXED_CURVE_PARAMS,
): FixedSellQuote {
  validateFixedCurveParams(params);
  if (tokenInWad <= 0n || tokenInWad > soldBeforeWad) throw new Error("Sell amount exceeds sold curve inventory.");
  const soldAfterWad = soldBeforeWad - tokenInWad;
  const grossCurveWethWad = cumulativeCostWad(soldBeforeWad, params) - cumulativeCostWad(soldAfterWad, params);
  const feeWethWad = feeWadUp(grossCurveWethWad, params.feeBps);
  const netWethWad = grossCurveWethWad - feeWethWad;
  return {
    soldBeforeWad,
    soldAfterWad,
    tokenInWad,
    grossCurveWethWad,
    feeWethWad,
    netWethWad,
    marginalPriceBeforeWad: marginalPriceWad(soldBeforeWad, params),
    marginalPriceAfterWad: marginalPriceWad(soldAfterWad, params),
  };
}

export function fixedPointStateDigest(input: {
  soldWad: bigint;
  poolWethWad: bigint;
  reservedWethWad: bigint;
  lockedLongTokensWad: bigint;
  borrowedShortTokensWad: bigint;
}) {
  return [
    input.soldWad,
    input.poolWethWad,
    input.reservedWethWad,
    input.lockedLongTokensWad,
    input.borrowedShortTokensWad,
  ].map((value) => value.toString(16).padStart(64, "0")).join("");
}
