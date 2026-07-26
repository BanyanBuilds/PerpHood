import type { Position, Token } from "./types";

/**
 * V43 deterministic Spot × Long × Sell × Short BattlePool reference engine with ordered realtime state frames.
 *
 * One contract balance backs every action. Spot orders move real assets in or
 * out. Leveraged orders move inventory between internal curve, debt, and
 * position buckets while user collateral/fees are the only external inflow at
 * open. Every close traverses the same curve, so liquidations create real spot
 * pressure and losing equity remains inside the pool.
 */
export const BATTLE_POOL_VERSION = "v43-unified-settlement";
export const BATTLE_TOTAL_SUPPLY = 1_000_000_000;
export const BATTLE_OPENING_FDV_ETH = 0.25;
export const BATTLE_OPENING_PRICE_ETH = BATTLE_OPENING_FDV_ETH / BATTLE_TOTAL_SUPPLY;
export const BATTLE_CURVE_ALLOCATION = 800_000_000;
export const BATTLE_PERP_ALLOCATION = 100_000_000;
export const BATTLE_SAFETY_ALLOCATION = 100_000_000;
export const BATTLE_CURVE_EXPONENT = 5;
export const BATTLE_VIRTUAL_TOKEN_RESERVE = BATTLE_CURVE_ALLOCATION;
export const BATTLE_VIRTUAL_WETH_RESERVE = BATTLE_OPENING_FDV_ETH;
export const BATTLE_TRADE_FEE_RATE = 0.003;
export const BATTLE_PROTECTED_WETH_RATE = 0.01;
export const BATTLE_MAX_POOL_UTILIZATION = 0.72;
export const BATTLE_MAX_CURVE_SOLD_FRACTION = 0.94;
export const BATTLE_ADAPTIVE_MIN_SAFETY_FRACTION = 0.04;
export const BATTLE_ADAPTIVE_MAX_PERP_FRACTION = 0.22;
export const BATTLE_ADAPTIVE_RELEASE_TRIGGER = 0.65;
export const BATTLE_ADAPTIVE_RECLAIM_TRIGGER = 0.22;
export const BATTLE_ADAPTIVE_TARGET_UTILIZATION = 0.52;
export const BATTLE_ADAPTIVE_RELEASE_STEP_FRACTION = 0.01;
export const BATTLE_ADAPTIVE_MIN_DEPTH_ETH = 0.5;

export type BattlePoolConfig = {
  totalSupply: number;
  curveAllocation: number;
  perpAllocation: number;
  safetyAllocation: number;
  openingFdvEth: number;
  curveExponent: number;
  maxCurveSoldFraction: number;
  protectedWethRate: number;
  maxPoolUtilization: number;
  adaptiveMinSafetyFraction: number;
  adaptiveMaxPerpFraction: number;
  adaptiveReleaseTrigger: number;
  adaptiveReclaimTrigger: number;
  adaptiveTargetUtilization: number;
  adaptiveReleaseStepFraction: number;
  adaptiveMinDepthEth: number;
};

export type BattlePoolState = {
  totalSupply: number;
  curveAllocation: number;
  initialPerpAllocation: number;
  initialSafetyAllocation: number;
  openingPriceEth: number;
  curveExponent: number;
  maxCurveSoldFraction: number;
  protectedWethRate: number;
  maxPoolUtilization: number;
  adaptiveMinSafetyFraction: number;
  adaptiveMaxPerpFraction: number;
  adaptiveReleaseTrigger: number;
  adaptiveReclaimTrigger: number;
  adaptiveTargetUtilization: number;
  adaptiveReleaseStepFraction: number;
  adaptiveMinDepthEth: number;
  adaptivePerpReleasedTokens: number;
  adaptiveRebalanceCount: number;
  curveTokenReserve: number;
  curveRealTokenReserve: number;
  curveWethReserve: number;
  virtualWethReserve: number;
  realWethBalance: number;
  lockedCollateralEth: number;
  lockedLongCollateralEth: number;
  lockedShortCollateralEth: number;
  lockedShortProceedsEth: number;
  syntheticLongCreditEth: number;
  perpTokenReserve: number;
  safetyTokenReserve: number;
  lockedLongTokens: number;
  circulatingSpotTokens: number;
  borrowedShortTokens: number;
  poolFeesEth: number;
  liquidationEquityEth: number;
  badDebtEth: number;
  battlePoolVersion: string;
};

export type CurveTrade = {
  next: BattlePoolState;
  tokens: number;
  grossEth: number;
  feeEth: number;
  netEth: number;
  priceBefore: number;
  priceAfter: number;
  priceImpactPercent: number;
};

export type LongOpenTrade = CurveTrade & {
  collateralEth: number;
  debtEth: number;
  notionalEth: number;
};

export type ShortOpenTrade = CurveTrade & {
  collateralEth: number;
  borrowedTokens: number;
  lockedProceedsEth: number;
  notionalEth: number;
};

export type PositionCloseTrade = CurveTrade & {
  payoutEth: number;
  pnlEth: number;
  debtRepaidEth: number;
  liquidatedEquityEth: number;
  residualEquityEth: number;
  badDebtEth: number;
};

export type PositionHealth = {
  positionId: string;
  direction: "long" | "short";
  equityEth: number;
  maintenanceMarginEth: number;
  healthRatio: number;
  liquidatable: boolean;
};

export type AdaptiveInventoryRebalance = {
  next: BattlePoolState;
  action: "release" | "reclaim" | "none";
  tokensMoved: number;
  utilizationBefore: number;
  utilizationAfter: number;
  reason: string;
};

export type LiquidationCascadeEvent = {
  positionId: string;
  direction: "long" | "short";
  leverage: number;
  equityBeforeEth: number;
  maintenanceMarginEth: number;
  residualEquityEth: number;
  badDebtEth: number;
  feeEth: number;
  priceBefore: number;
  priceAfter: number;
  priceImpactPercent: number;
};


export type SequencedSpotExecution = {
  next: BattlePoolState;
  remainingPositions: Position[];
  grossEth: number;
  netEth: number;
  feeEth: number;
  tokens: number;
  steps: number;
  liquidationEvents: LiquidationCascadeEvent[];
  totalResidualEquityEth: number;
  totalBadDebtEth: number;
  startPriceEth: number;
  endPriceEth: number;
  priceImpactPercent: number;
};

export type LiquidationCascadeResult = {
  next: BattlePoolState;
  remainingPositions: Position[];
  events: LiquidationCascadeEvent[];
  liquidatedCount: number;
  longLiquidations: number;
  shortLiquidations: number;
  totalResidualEquityEth: number;
  totalBadDebtEth: number;
  startPriceEth: number;
  endPriceEth: number;
  haltedReason?: string;
};

const EPSILON = 1e-12;

export const DEFAULT_BATTLE_POOL_CONFIG: BattlePoolConfig = {
  totalSupply: BATTLE_TOTAL_SUPPLY,
  curveAllocation: BATTLE_CURVE_ALLOCATION,
  perpAllocation: BATTLE_PERP_ALLOCATION,
  safetyAllocation: BATTLE_SAFETY_ALLOCATION,
  openingFdvEth: BATTLE_OPENING_FDV_ETH,
  curveExponent: BATTLE_CURVE_EXPONENT,
  maxCurveSoldFraction: BATTLE_MAX_CURVE_SOLD_FRACTION,
  protectedWethRate: BATTLE_PROTECTED_WETH_RATE,
  maxPoolUtilization: BATTLE_MAX_POOL_UTILIZATION,
  adaptiveMinSafetyFraction: BATTLE_ADAPTIVE_MIN_SAFETY_FRACTION,
  adaptiveMaxPerpFraction: BATTLE_ADAPTIVE_MAX_PERP_FRACTION,
  adaptiveReleaseTrigger: BATTLE_ADAPTIVE_RELEASE_TRIGGER,
  adaptiveReclaimTrigger: BATTLE_ADAPTIVE_RECLAIM_TRIGGER,
  adaptiveTargetUtilization: BATTLE_ADAPTIVE_TARGET_UTILIZATION,
  adaptiveReleaseStepFraction: BATTLE_ADAPTIVE_RELEASE_STEP_FRACTION,
  adaptiveMinDepthEth: BATTLE_ADAPTIVE_MIN_DEPTH_ETH,
};

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function netTokensSold(pool: BattlePoolState) {
  return pool.curveAllocation - pool.curveRealTokenReserve;
}

function curvePriceAt(pool: BattlePoolState, tokensSold: number) {
  const denominator = Math.max(EPSILON, 1 - tokensSold / pool.curveAllocation);
  return pool.openingPriceEth * Math.pow(denominator, -pool.curveExponent);
}

function cumulativeCurveCost(pool: BattlePoolState, tokensSold: number) {
  const denominator = Math.max(EPSILON, 1 - tokensSold / pool.curveAllocation);
  return pool.openingPriceEth * pool.curveAllocation / (pool.curveExponent - 1)
    * (Math.pow(denominator, 1 - pool.curveExponent) - 1);
}

function tokensSoldAtCumulativeCost(pool: BattlePoolState, costEth: number) {
  const minCurveCost = -pool.openingPriceEth * pool.curveAllocation / (pool.curveExponent - 1);
  const boundedCost = Math.max(minCurveCost + EPSILON, costEth);
  const base = 1 + boundedCost * (pool.curveExponent - 1)
    / (pool.openingPriceEth * pool.curveAllocation);
  if (base <= 0) throw new Error("BattleCurve cost is outside its valid domain.");
  const denominator = Math.pow(base, 1 / (1 - pool.curveExponent));
  return pool.curveAllocation * (1 - denominator);
}

function curveAccountingWeth(pool: BattlePoolState, tokensSold: number) {
  return pool.virtualWethReserve + cumulativeCurveCost(pool, tokensSold);
}

function validateFraction(value: number, label: string) {
  if (value < 0 || value > 1) throw new Error(`${label} must be between zero and one.`);
}

export function createBattlePoolState(overrides: Partial<BattlePoolConfig> = {}): BattlePoolState {
  const config = { ...DEFAULT_BATTLE_POOL_CONFIG, ...overrides };
  if (config.curveExponent <= 1) throw new Error("BattleCurve exponent must be greater than one.");
  if (config.totalSupply <= 0 || config.curveAllocation <= 0 || config.openingFdvEth <= 0) throw new Error("Invalid BattlePool configuration.");
  if (Math.abs(config.curveAllocation + config.perpAllocation + config.safetyAllocation - config.totalSupply) > 0.5) {
    throw new Error("BattlePool allocations must exactly equal total supply.");
  }
  validateFraction(config.maxCurveSoldFraction, "Maximum curve-sold fraction");
  validateFraction(config.protectedWethRate, "Protected WETH rate");
  validateFraction(config.maxPoolUtilization, "Maximum pool utilization");
  validateFraction(config.adaptiveMinSafetyFraction, "Adaptive minimum safety fraction");
  validateFraction(config.adaptiveMaxPerpFraction, "Adaptive maximum perp fraction");
  validateFraction(config.adaptiveReleaseTrigger, "Adaptive release trigger");
  validateFraction(config.adaptiveReclaimTrigger, "Adaptive reclaim trigger");
  validateFraction(config.adaptiveTargetUtilization, "Adaptive target utilization");
  validateFraction(config.adaptiveReleaseStepFraction, "Adaptive release step");
  if (config.adaptiveReclaimTrigger >= config.adaptiveReleaseTrigger) throw new Error("Adaptive reclaim trigger must remain below the release trigger.");
  if (config.adaptiveMaxPerpFraction * config.totalSupply + 0.5 < config.perpAllocation) throw new Error("Adaptive maximum perp fraction cannot be below the initial perp allocation.");
  if (config.adaptiveMinSafetyFraction * config.totalSupply > config.safetyAllocation + 0.5) throw new Error("Initial safety allocation must cover the adaptive minimum safety floor.");
  const protectedCurveInventory = config.curveAllocation * (1 - config.maxCurveSoldFraction);
  if (protectedCurveInventory + config.safetyAllocation + 0.5 < config.perpAllocation) {
    throw new Error("Protected curve inventory plus safety inventory must cover the full short-borrow allocation.");
  }
  const openingPriceEth = config.openingFdvEth / config.totalSupply;
  return assertBattlePool({
    totalSupply: config.totalSupply,
    curveAllocation: config.curveAllocation,
    initialPerpAllocation: config.perpAllocation,
    initialSafetyAllocation: config.safetyAllocation,
    openingPriceEth,
    curveExponent: config.curveExponent,
    maxCurveSoldFraction: config.maxCurveSoldFraction,
    protectedWethRate: config.protectedWethRate,
    maxPoolUtilization: config.maxPoolUtilization,
    adaptiveMinSafetyFraction: config.adaptiveMinSafetyFraction,
    adaptiveMaxPerpFraction: config.adaptiveMaxPerpFraction,
    adaptiveReleaseTrigger: config.adaptiveReleaseTrigger,
    adaptiveReclaimTrigger: config.adaptiveReclaimTrigger,
    adaptiveTargetUtilization: config.adaptiveTargetUtilization,
    adaptiveReleaseStepFraction: config.adaptiveReleaseStepFraction,
    adaptiveMinDepthEth: config.adaptiveMinDepthEth,
    adaptivePerpReleasedTokens: 0,
    adaptiveRebalanceCount: 0,
    curveTokenReserve: config.curveAllocation,
    curveRealTokenReserve: config.curveAllocation,
    curveWethReserve: config.openingFdvEth,
    virtualWethReserve: config.openingFdvEth,
    realWethBalance: 0,
    lockedCollateralEth: 0,
    lockedLongCollateralEth: 0,
    lockedShortCollateralEth: 0,
    lockedShortProceedsEth: 0,
    syntheticLongCreditEth: 0,
    perpTokenReserve: config.perpAllocation,
    safetyTokenReserve: config.safetyAllocation,
    lockedLongTokens: 0,
    circulatingSpotTokens: 0,
    borrowedShortTokens: 0,
    poolFeesEth: 0,
    liquidationEquityEth: 0,
    badDebtEth: 0,
    battlePoolVersion: BATTLE_POOL_VERSION,
  });
}

export function poolFromToken(token: Token): BattlePoolState {
  const fallback = createBattlePoolState();
  return assertBattlePool({
    totalSupply: token.totalSupply ?? fallback.totalSupply,
    curveAllocation: token.curveAllocation ?? fallback.curveAllocation,
    initialPerpAllocation: token.initialPerpAllocation ?? fallback.initialPerpAllocation,
    initialSafetyAllocation: token.initialSafetyAllocation ?? fallback.initialSafetyAllocation,
    openingPriceEth: token.openingPriceEth ?? fallback.openingPriceEth,
    curveExponent: token.curveExponent ?? fallback.curveExponent,
    maxCurveSoldFraction: token.maxCurveSoldFraction ?? fallback.maxCurveSoldFraction,
    protectedWethRate: token.protectedWethRate ?? fallback.protectedWethRate,
    maxPoolUtilization: token.maxPoolUtilization ?? fallback.maxPoolUtilization,
    adaptiveMinSafetyFraction: token.adaptiveMinSafetyFraction ?? fallback.adaptiveMinSafetyFraction,
    adaptiveMaxPerpFraction: token.adaptiveMaxPerpFraction ?? fallback.adaptiveMaxPerpFraction,
    adaptiveReleaseTrigger: token.adaptiveReleaseTrigger ?? fallback.adaptiveReleaseTrigger,
    adaptiveReclaimTrigger: token.adaptiveReclaimTrigger ?? fallback.adaptiveReclaimTrigger,
    adaptiveTargetUtilization: token.adaptiveTargetUtilization ?? fallback.adaptiveTargetUtilization,
    adaptiveReleaseStepFraction: token.adaptiveReleaseStepFraction ?? fallback.adaptiveReleaseStepFraction,
    adaptiveMinDepthEth: token.adaptiveMinDepthEth ?? fallback.adaptiveMinDepthEth,
    adaptivePerpReleasedTokens: token.adaptivePerpReleasedTokens ?? fallback.adaptivePerpReleasedTokens,
    adaptiveRebalanceCount: token.adaptiveRebalanceCount ?? fallback.adaptiveRebalanceCount,
    curveTokenReserve: token.curveTokenReserve ?? token.curveRealTokenReserve ?? fallback.curveTokenReserve,
    curveRealTokenReserve: token.curveRealTokenReserve ?? fallback.curveRealTokenReserve,
    curveWethReserve: token.curveWethReserve ?? fallback.curveWethReserve,
    virtualWethReserve: token.virtualWethReserve ?? fallback.virtualWethReserve,
    realWethBalance: token.realWethBalance ?? token.liquidityEth ?? fallback.realWethBalance,
    lockedCollateralEth: token.lockedCollateralEth ?? fallback.lockedCollateralEth,
    lockedLongCollateralEth: token.lockedLongCollateralEth ?? fallback.lockedLongCollateralEth,
    lockedShortCollateralEth: token.lockedShortCollateralEth ?? fallback.lockedShortCollateralEth,
    lockedShortProceedsEth: token.lockedShortProceedsEth ?? fallback.lockedShortProceedsEth,
    syntheticLongCreditEth: token.syntheticLongCreditEth ?? fallback.syntheticLongCreditEth,
    perpTokenReserve: token.perpTokenReserve ?? fallback.perpTokenReserve,
    safetyTokenReserve: token.safetyTokenReserve ?? fallback.safetyTokenReserve,
    lockedLongTokens: token.lockedLongTokens ?? fallback.lockedLongTokens,
    circulatingSpotTokens: token.circulatingSpotTokens ?? fallback.circulatingSpotTokens,
    borrowedShortTokens: token.borrowedShortTokens ?? fallback.borrowedShortTokens,
    poolFeesEth: token.poolFeesEth ?? fallback.poolFeesEth,
    liquidationEquityEth: token.liquidationEquityEth ?? fallback.liquidationEquityEth,
    badDebtEth: token.badDebtEth ?? fallback.badDebtEth,
    battlePoolVersion: token.battlePoolVersion ?? fallback.battlePoolVersion,
  });
}

export function poolToTokenPatch(pool: BattlePoolState, ethUsd: number) {
  const priceEth = battlePriceEth(pool);
  const cap = priceEth * pool.totalSupply * ethUsd;
  const free = freeWeth(pool);
  const utilizationBase = Math.max(pool.realWethBalance, EPSILON);
  return {
    totalSupply: pool.totalSupply,
    curveAllocation: pool.curveAllocation,
    initialPerpAllocation: pool.initialPerpAllocation,
    initialSafetyAllocation: pool.initialSafetyAllocation,
    openingPriceEth: pool.openingPriceEth,
    curveExponent: pool.curveExponent,
    maxCurveSoldFraction: pool.maxCurveSoldFraction,
    protectedWethRate: pool.protectedWethRate,
    maxPoolUtilization: pool.maxPoolUtilization,
    adaptiveMinSafetyFraction: pool.adaptiveMinSafetyFraction,
    adaptiveMaxPerpFraction: pool.adaptiveMaxPerpFraction,
    adaptiveReleaseTrigger: pool.adaptiveReleaseTrigger,
    adaptiveReclaimTrigger: pool.adaptiveReclaimTrigger,
    adaptiveTargetUtilization: pool.adaptiveTargetUtilization,
    adaptiveReleaseStepFraction: pool.adaptiveReleaseStepFraction,
    adaptiveMinDepthEth: pool.adaptiveMinDepthEth,
    adaptivePerpReleasedTokens: pool.adaptivePerpReleasedTokens,
    adaptiveRebalanceCount: pool.adaptiveRebalanceCount,
    curveTokenReserve: pool.curveTokenReserve,
    curveRealTokenReserve: pool.curveRealTokenReserve,
    curveWethReserve: pool.curveWethReserve,
    virtualWethReserve: pool.virtualWethReserve,
    realWethBalance: pool.realWethBalance,
    lockedCollateralEth: pool.lockedCollateralEth,
    lockedLongCollateralEth: pool.lockedLongCollateralEth,
    lockedShortCollateralEth: pool.lockedShortCollateralEth,
    lockedShortProceedsEth: pool.lockedShortProceedsEth,
    syntheticLongCreditEth: pool.syntheticLongCreditEth,
    perpTokenReserve: pool.perpTokenReserve,
    safetyTokenReserve: pool.safetyTokenReserve,
    lockedLongTokens: pool.lockedLongTokens,
    circulatingSpotTokens: pool.circulatingSpotTokens,
    borrowedShortTokens: pool.borrowedShortTokens,
    poolFeesEth: pool.poolFeesEth,
    liquidationEquityEth: pool.liquidationEquityEth,
    badDebtEth: pool.badDebtEth,
    battlePoolVersion: pool.battlePoolVersion,
    positionObligationsEth: positionObligationsWeth(pool),
    freeWethEth: free,
    shortInventoryUtilization: shortInventoryUtilization(pool) * 100,
    price: priceEth * ethUsd,
    cap,
    indexCap: cap,
    markCap: cap,
    liquidityEth: pool.realWethBalance,
    insuranceEth: Math.max(0, free),
    hedgeUtilization: clampNumber((1 - free / utilizationBase) * 100, 0, 100),
  };
}

export function battlePriceEth(pool: BattlePoolState) {
  return curvePriceAt(pool, netTokensSold(pool));
}

export function poolOwnedWeth(pool: BattlePoolState) {
  return Math.max(0, pool.realWethBalance);
}

export function protectedWeth(pool: BattlePoolState) {
  return pool.realWethBalance * pool.protectedWethRate;
}

function poolWithSafetyForShortRepayment(pool: BattlePoolState, borrowedTokens = pool.borrowedShortTokens) {
  if (borrowedTokens <= pool.curveRealTokenReserve) return pool;
  const shortage = borrowedTokens - pool.curveRealTokenReserve;
  const safetyRelease = Math.min(shortage, pool.safetyTokenReserve);
  return {
    ...pool,
    curveTokenReserve: pool.curveRealTokenReserve + safetyRelease,
    curveRealTokenReserve: pool.curveRealTokenReserve + safetyRelease,
    safetyTokenReserve: pool.safetyTokenReserve - safetyRelease,
  };
}

function rawCurveSellQuote(pool: BattlePoolState, tokens: number, feeRate = BATTLE_TRADE_FEE_RATE) {
  if (tokens <= 0) throw new Error("Sell amount must be positive.");
  const soldBefore = netTokensSold(pool);
  const soldAfter = soldBefore - tokens;
  const costBefore = cumulativeCurveCost(pool, soldBefore);
  const costAfter = cumulativeCurveCost(pool, soldAfter);
  const grossEth = costBefore - costAfter;
  if (!Number.isFinite(grossEth) || grossEth < -EPSILON) throw new Error("BattleCurve could not quote this sell.");
  const feeEth = Math.max(0, grossEth) * feeRate;
  const netEth = Math.max(0, grossEth - feeEth);
  return { tokens, grossEth: Math.max(0, grossEth), feeEth, netEth, soldAfter };
}

function quoteBuyExactTokens(pool: BattlePoolState, tokensOut: number, feeRate = BATTLE_TRADE_FEE_RATE) {
  if (tokensOut <= 0) throw new Error("Invalid exact-token buy.");
  if (tokensOut > pool.curveRealTokenReserve + 1e-6) throw new Error("Curve cannot return enough tokens to close the short.");
  const soldBefore = netTokensSold(pool);
  const soldAfter = soldBefore + tokensOut;
  if (soldAfter > pool.curveAllocation * pool.maxCurveSoldFraction) throw new Error("Short close would cross protected curve inventory.");
  const netEth = cumulativeCurveCost(pool, soldAfter) - cumulativeCurveCost(pool, soldBefore);
  const grossEth = netEth / Math.max(EPSILON, 1 - feeRate);
  const feeEth = grossEth - netEth;
  return { grossEth, netEth, feeEth, soldAfter };
}

export function currentPositionObligationsWeth(pool: BattlePoolState) {
  let longEquity = 0;
  if (pool.lockedLongTokens > EPSILON) {
    const longExitGross = rawCurveSellQuote(pool, pool.lockedLongTokens, 0).grossEth;
    const closeFee = longExitGross * BATTLE_TRADE_FEE_RATE;
    longEquity = Math.max(0, longExitGross - pool.syntheticLongCreditEth - closeFee);
  }

  let shortEquity = 0;
  if (pool.borrowedShortTokens > EPSILON) {
    try {
      const buybackCost = quoteBuyExactTokens(pool, pool.borrowedShortTokens, 0).grossEth;
      const closeFee = buybackCost * BATTLE_TRADE_FEE_RATE;
      shortEquity = Math.max(0, pool.lockedShortCollateralEth + pool.lockedShortProceedsEth - buybackCost - closeFee);
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }
  return longEquity + shortEquity;
}

/**
 * V49 guaranteed liabilities.
 *
 * Do not net one position's bad debt against another position's profit. Every
 * short keeps all of its collateral and locked sale proceeds reserved. Longs
 * reserve the full gross exit of all locked long inventory at the highest
 * curve state reachable if every existing short repays first. Debt and fees
 * can only reduce the eventual payout, so this is deliberately conservative.
 */
export function positionObligationsWeth(pool: BattlePoolState) {
  const soldNow = netTokensSold(pool);
  const extremeSold = soldNow + pool.borrowedShortTokens;
  const maximumSold = pool.curveAllocation * pool.maxCurveSoldFraction;
  if (extremeSold > maximumSold + 1e-6) return Number.POSITIVE_INFINITY;

  let longGrossExtreme = 0;
  if (pool.lockedLongTokens > EPSILON) {
    if (pool.lockedLongTokens > extremeSold + 1e-6) return Number.POSITIVE_INFINITY;
    const extremePool: BattlePoolState = {
      ...pool,
      curveRealTokenReserve: pool.curveAllocation - extremeSold,
      curveTokenReserve: pool.curveAllocation - extremeSold,
    };
    longGrossExtreme = rawCurveSellQuote(extremePool, pool.lockedLongTokens, 0).grossEth;
  }

  return longGrossExtreme + pool.lockedShortCollateralEth + pool.lockedShortProceedsEth;
}

export function freeWeth(pool: BattlePoolState) {
  return Math.max(0, poolOwnedWeth(pool) - positionObligationsWeth(pool) - protectedWeth(pool));
}

export function totalTokenConservation(pool: BattlePoolState) {
  return pool.curveRealTokenReserve + pool.perpTokenReserve + pool.safetyTokenReserve + pool.lockedLongTokens + pool.circulatingSpotTokens;
}

export function shortInventoryUtilization(pool: BattlePoolState) {
  const totalInventory = pool.perpTokenReserve + pool.borrowedShortTokens;
  return totalInventory > EPSILON ? pool.borrowedShortTokens / totalInventory : 0;
}

export function assertBattlePool(pool: BattlePoolState) {
  const numeric = Object.entries(pool).filter(([, value]) => typeof value === "number") as Array<[string, number]>;
  for (const [key, value] of numeric) {
    if (!Number.isFinite(value)) throw new Error(`BattlePool invariant failed: ${key} is not finite.`);
    if (value < -1e-8) throw new Error(`BattlePool invariant failed: ${key} is negative.`);
  }
  const conserved = totalTokenConservation(pool);
  if (Math.abs(conserved - pool.totalSupply) > 0.5) {
    throw new Error(`BattlePool token conservation failed: ${conserved} of ${pool.totalSupply}.`);
  }
  const allocations = pool.curveAllocation + pool.initialPerpAllocation + pool.initialSafetyAllocation;
  if (Math.abs(allocations - pool.totalSupply) > 0.5) {
    throw new Error(`BattlePool allocation invariant failed: ${allocations} of ${pool.totalSupply}.`);
  }
  if (Math.abs(pool.lockedCollateralEth - pool.lockedLongCollateralEth - pool.lockedShortCollateralEth) > 1e-8) {
    throw new Error("BattlePool collateral sub-ledgers do not reconcile.");
  }
  const shortInventory = pool.perpTokenReserve + pool.borrowedShortTokens;
  const expectedShortInventory = pool.initialPerpAllocation + pool.adaptivePerpReleasedTokens;
  if (Math.abs(shortInventory - expectedShortInventory) > 0.5) {
    throw new Error(`BattlePool short inventory failed: ${shortInventory} versus ${expectedShortInventory}.`);
  }
  const requiredWeth = positionObligationsWeth(pool) + protectedWeth(pool);
  if (requiredWeth > pool.realWethBalance + 1e-8) {
    throw new Error(`BattlePool WETH solvency failed: ${requiredWeth.toFixed(8)} required, ${pool.realWethBalance.toFixed(8)} available.`);
  }
  return pool;
}

function impact(before: number, after: number) {
  return before > 0 ? Math.abs(after - before) / before * 100 : 0;
}

function makeCurveTrade(pool: BattlePoolState, next: BattlePoolState, tokens: number, grossEth: number, feeEth: number, netEth: number): CurveTrade {
  const priceBefore = battlePriceEth(pool);
  const priceAfter = battlePriceEth(next);
  return { next, tokens, grossEth, feeEth, netEth, priceBefore, priceAfter, priceImpactPercent: impact(priceBefore, priceAfter) };
}

export function quoteCurveBuy(pool: BattlePoolState, grossEth: number, feeRate = BATTLE_TRADE_FEE_RATE) {
  if (grossEth <= 0) throw new Error("Buy amount must be positive.");
  const feeEth = grossEth * feeRate;
  const netEth = grossEth - feeEth;
  const soldBefore = netTokensSold(pool);
  const costBefore = cumulativeCurveCost(pool, soldBefore);
  const soldAfter = tokensSoldAtCumulativeCost(pool, costBefore + netEth);
  const tokens = soldAfter - soldBefore;
  if (soldAfter > pool.curveAllocation * pool.maxCurveSoldFraction) throw new Error("This buy would exhaust protected genesis inventory.");
  if (tokens <= 0 || tokens > pool.curveRealTokenReserve + 1e-6) throw new Error("Not enough curve token inventory for this buy.");
  return { tokens, grossEth, feeEth, netEth, soldAfter };
}

function applySpotBuy(pool: BattlePoolState, grossEth: number, feeRate = BATTLE_TRADE_FEE_RATE, enforceSolvency = true): CurveTrade {
  const quote = quoteCurveBuy(pool, grossEth, feeRate);
  const next: BattlePoolState = {
    ...pool,
    curveTokenReserve: pool.curveRealTokenReserve - quote.tokens,
    curveRealTokenReserve: pool.curveRealTokenReserve - quote.tokens,
    curveWethReserve: curveAccountingWeth(pool, quote.soldAfter),
    realWethBalance: pool.realWethBalance + grossEth,
    circulatingSpotTokens: pool.circulatingSpotTokens + quote.tokens,
    poolFeesEth: pool.poolFeesEth + quote.feeEth,
  };
  if (enforceSolvency) assertBattlePool(next);
  return makeCurveTrade(pool, next, quote.tokens, quote.grossEth, quote.feeEth, quote.netEth);
}

export function executeSpotBuy(pool: BattlePoolState, grossEth: number, feeRate = BATTLE_TRADE_FEE_RATE): CurveTrade {
  return applySpotBuy(pool, grossEth, feeRate, true);
}

export function quoteCurveSell(pool: BattlePoolState, tokens: number, feeRate = BATTLE_TRADE_FEE_RATE) {
  return rawCurveSellQuote(pool, tokens, feeRate);
}

function applySpotSell(pool: BattlePoolState, tokens: number, feeRate = BATTLE_TRADE_FEE_RATE, enforceSolvency = true): CurveTrade {
  if (tokens > pool.circulatingSpotTokens + 1e-6) throw new Error("Spot sell exceeds circulating spot inventory.");
  const quote = quoteCurveSell(pool, tokens, feeRate);
  const next: BattlePoolState = {
    ...pool,
    curveTokenReserve: pool.curveRealTokenReserve + tokens,
    curveRealTokenReserve: pool.curveRealTokenReserve + tokens,
    curveWethReserve: curveAccountingWeth(pool, quote.soldAfter),
    realWethBalance: pool.realWethBalance - quote.netEth,
    circulatingSpotTokens: pool.circulatingSpotTokens - tokens,
    poolFeesEth: pool.poolFeesEth + quote.feeEth,
  };
  if (enforceSolvency) assertBattlePool(next);
  return makeCurveTrade(pool, next, quote.tokens, quote.grossEth, quote.feeEth, quote.netEth);
}

export function executeSpotSell(pool: BattlePoolState, tokens: number, feeRate = BATTLE_TRADE_FEE_RATE): CurveTrade {
  return applySpotSell(pool, tokens, feeRate, true);
}

function maxBuyCostBeforeProtection(pool: BattlePoolState) {
  const current = cumulativeCurveCost(pool, netTokensSold(pool));
  const ceiling = cumulativeCurveCost(pool, pool.curveAllocation * pool.maxCurveSoldFraction);
  return Math.max(0, ceiling - current);
}

function uncommittedRiskWeth(pool: BattlePoolState) {
  return Math.max(0, freeWeth(pool) * pool.maxPoolUtilization);
}

export function longNotionalCapacity(pool: BattlePoolState, leverage: number) {
  if (leverage <= 1) return Math.min(freeWeth(pool), maxBuyCostBeforeProtection(pool));
  const debtRatio = (leverage - 1) / leverage;
  const byDebt = uncommittedRiskWeth(pool) / Math.max(debtRatio, EPSILON);
  return Math.max(0, Math.min(byDebt, maxBuyCostBeforeProtection(pool)));
}

function maxCurveProceedsForTokens(pool: BattlePoolState, tokens: number) {
  return Math.max(0, rawCurveSellQuote(pool, tokens, 0).grossEth);
}

export function shortNotionalCapacity(pool: BattlePoolState) {
  const inventoryCapacity = maxCurveProceedsForTokens(pool, pool.perpTokenReserve);
  return Math.max(0, Math.min(inventoryCapacity, uncommittedRiskWeth(pool)));
}

export function executeOpenLong(pool: BattlePoolState, collateralEth: number, leverage: number, feeRate = BATTLE_TRADE_FEE_RATE): LongOpenTrade {
  if (collateralEth <= 0 || leverage < 1) throw new Error("Invalid long parameters.");
  const notionalEth = collateralEth * leverage;
  const debtEth = Math.max(0, notionalEth - collateralEth);
  const entryFeeEth = notionalEth * feeRate;
  if (notionalEth > longNotionalCapacity(pool, leverage) + 1e-12) throw new Error("Long size exceeds available BattlePool WETH capacity.");
  const quote = quoteCurveBuy(pool, notionalEth, 0);
  const next: BattlePoolState = {
    ...pool,
    curveTokenReserve: pool.curveRealTokenReserve - quote.tokens,
    curveRealTokenReserve: pool.curveRealTokenReserve - quote.tokens,
    curveWethReserve: curveAccountingWeth(pool, quote.soldAfter),
    realWethBalance: pool.realWethBalance + collateralEth + entryFeeEth,
    lockedCollateralEth: pool.lockedCollateralEth + collateralEth,
    lockedLongCollateralEth: pool.lockedLongCollateralEth + collateralEth,
    syntheticLongCreditEth: pool.syntheticLongCreditEth + debtEth,
    lockedLongTokens: pool.lockedLongTokens + quote.tokens,
    poolFeesEth: pool.poolFeesEth + entryFeeEth,
  };
  assertBattlePool(next);
  return { ...makeCurveTrade(pool, next, quote.tokens, notionalEth, entryFeeEth, notionalEth), collateralEth, debtEth, notionalEth };
}

function tokenInputForTargetProceeds(pool: BattlePoolState, targetEth: number) {
  if (targetEth <= 0) throw new Error("Invalid short notional.");
  const soldBefore = netTokensSold(pool);
  const costBefore = cumulativeCurveCost(pool, soldBefore);
  const soldAfter = tokensSoldAtCumulativeCost(pool, costBefore - targetEth);
  return { tokens: soldBefore - soldAfter, soldAfter };
}

export function executeOpenShort(pool: BattlePoolState, collateralEth: number, leverage: number, feeRate = BATTLE_TRADE_FEE_RATE): ShortOpenTrade {
  if (collateralEth <= 0 || leverage < 1) throw new Error("Invalid short parameters.");
  const notionalEth = collateralEth * leverage;
  const entryFeeEth = notionalEth * feeRate;
  if (notionalEth > shortNotionalCapacity(pool) + 1e-12) throw new Error("Short size exceeds available BattlePool token/WETH capacity.");
  const quote = tokenInputForTargetProceeds(pool, notionalEth);
  if (quote.tokens > pool.perpTokenReserve + 1e-6) throw new Error("Not enough dedicated short-borrow token inventory.");
  if (notionalEth > freeWeth(pool) + 1e-12) throw new Error("Not enough free WETH to lock the short-sale proceeds.");
  const next: BattlePoolState = {
    ...pool,
    curveTokenReserve: pool.curveRealTokenReserve + quote.tokens,
    curveRealTokenReserve: pool.curveRealTokenReserve + quote.tokens,
    curveWethReserve: curveAccountingWeth(pool, quote.soldAfter),
    realWethBalance: pool.realWethBalance + collateralEth + entryFeeEth,
    lockedCollateralEth: pool.lockedCollateralEth + collateralEth,
    lockedShortCollateralEth: pool.lockedShortCollateralEth + collateralEth,
    lockedShortProceedsEth: pool.lockedShortProceedsEth + notionalEth,
    perpTokenReserve: pool.perpTokenReserve - quote.tokens,
    borrowedShortTokens: pool.borrowedShortTokens + quote.tokens,
    poolFeesEth: pool.poolFeesEth + entryFeeEth,
  };
  assertBattlePool(next);
  return {
    ...makeCurveTrade(pool, next, quote.tokens, notionalEth, entryFeeEth, notionalEth),
    collateralEth,
    borrowedTokens: quote.tokens,
    lockedProceedsEth: notionalEth,
    notionalEth,
  };
}

function settleResidual(availableEth: number, requiredEth: number, targetFeeEth: number) {
  const badDebtEth = Math.max(0, requiredEth - availableEth);
  const surplusAfterRequired = Math.max(0, availableEth - requiredEth);
  const feeEth = Math.min(targetFeeEth, surplusAfterRequired);
  const residualEquityEth = Math.max(0, surplusAfterRequired - feeEth);
  return { badDebtEth, feeEth, residualEquityEth };
}

export function executeCloseLong(
  pool: BattlePoolState,
  position: Pick<Position, "collateral" | "notional" | "tokenAmount" | "debtEth">,
  fraction = 1,
  liquidated = false,
  accruedCostsEth = 0,
  feeRate = BATTLE_TRADE_FEE_RATE,
): PositionCloseTrade {
  const safeFraction = clampNumber(fraction, 0.000001, 1);
  const tokens = Math.max(0, position.tokenAmount ?? 0) * safeFraction;
  const collateral = position.collateral * safeFraction;
  const debtEth = Math.max(0, position.debtEth ?? (position.notional - position.collateral)) * safeFraction;
  const quote = rawCurveSellQuote(pool, tokens, 0);
  const settlement = settleResidual(quote.grossEth, debtEth + accruedCostsEth, quote.grossEth * feeRate);
  const payoutEth = liquidated ? 0 : settlement.residualEquityEth;
  const releasedPool: BattlePoolState = {
    ...pool,
    curveTokenReserve: pool.curveRealTokenReserve + tokens,
    curveRealTokenReserve: pool.curveRealTokenReserve + tokens,
    curveWethReserve: curveAccountingWeth(pool, quote.soldAfter),
    lockedCollateralEth: Math.max(0, pool.lockedCollateralEth - collateral),
    lockedLongCollateralEth: Math.max(0, pool.lockedLongCollateralEth - collateral),
    syntheticLongCreditEth: Math.max(0, pool.syntheticLongCreditEth - debtEth),
    lockedLongTokens: Math.max(0, pool.lockedLongTokens - tokens),
    poolFeesEth: pool.poolFeesEth + settlement.feeEth,
    liquidationEquityEth: pool.liquidationEquityEth + (liquidated ? settlement.residualEquityEth : 0),
    badDebtEth: pool.badDebtEth + settlement.badDebtEth,
  };
  if (!liquidated && payoutEth > freeWeth(releasedPool) + 1e-12) throw new Error("BattlePool cannot release this entire long payout without touching other open positions.");
  const next: BattlePoolState = {
    ...releasedPool,
    realWethBalance: releasedPool.realWethBalance - payoutEth,
  };
  assertBattlePool(next);
  return {
    ...makeCurveTrade(pool, next, tokens, quote.grossEth, settlement.feeEth, Math.max(0, quote.grossEth - settlement.feeEth)),
    payoutEth,
    pnlEth: payoutEth - collateral,
    debtRepaidEth: Math.min(debtEth, quote.grossEth),
    liquidatedEquityEth: liquidated ? settlement.residualEquityEth : 0,
    residualEquityEth: settlement.residualEquityEth,
    badDebtEth: settlement.badDebtEth,
  };
}

export function executeCloseShort(
  pool: BattlePoolState,
  position: Pick<Position, "collateral" | "borrowedTokens" | "lockedProceedsEth">,
  fraction = 1,
  liquidated = false,
  accruedCostsEth = 0,
  feeRate = BATTLE_TRADE_FEE_RATE,
): PositionCloseTrade {
  const safeFraction = clampNumber(fraction, 0.000001, 1);
  const borrowedTokens = Math.max(0, position.borrowedTokens ?? 0) * safeFraction;
  const collateral = position.collateral * safeFraction;
  const proceeds = Math.max(0, position.lockedProceedsEth ?? 0) * safeFraction;
  let workingPool = pool;
  if (borrowedTokens > workingPool.curveRealTokenReserve) {
    const shortage = borrowedTokens - workingPool.curveRealTokenReserve;
    const safetyRelease = Math.min(shortage, workingPool.safetyTokenReserve);
    workingPool = {
      ...workingPool,
      curveTokenReserve: workingPool.curveRealTokenReserve + safetyRelease,
      curveRealTokenReserve: workingPool.curveRealTokenReserve + safetyRelease,
      safetyTokenReserve: workingPool.safetyTokenReserve - safetyRelease,
    };
  }
  const quote = quoteBuyExactTokens(workingPool, borrowedTokens, 0);
  const funds = collateral + proceeds;
  const settlement = settleResidual(funds, quote.grossEth + accruedCostsEth, quote.grossEth * feeRate);
  const payoutEth = liquidated ? 0 : settlement.residualEquityEth;
  const releasedPool: BattlePoolState = {
    ...workingPool,
    curveTokenReserve: workingPool.curveRealTokenReserve - borrowedTokens,
    curveRealTokenReserve: workingPool.curveRealTokenReserve - borrowedTokens,
    curveWethReserve: curveAccountingWeth(workingPool, quote.soldAfter),
    lockedCollateralEth: Math.max(0, workingPool.lockedCollateralEth - collateral),
    lockedShortCollateralEth: Math.max(0, workingPool.lockedShortCollateralEth - collateral),
    lockedShortProceedsEth: Math.max(0, workingPool.lockedShortProceedsEth - proceeds),
    perpTokenReserve: workingPool.perpTokenReserve + borrowedTokens,
    borrowedShortTokens: Math.max(0, workingPool.borrowedShortTokens - borrowedTokens),
    poolFeesEth: workingPool.poolFeesEth + settlement.feeEth,
    liquidationEquityEth: workingPool.liquidationEquityEth + (liquidated ? settlement.residualEquityEth : 0),
    badDebtEth: workingPool.badDebtEth + settlement.badDebtEth,
  };
  if (!liquidated && payoutEth > freeWeth(releasedPool) + 1e-12) throw new Error("BattlePool cannot release this entire short payout without touching other open positions.");
  const next: BattlePoolState = {
    ...releasedPool,
    realWethBalance: releasedPool.realWethBalance - payoutEth,
  };
  assertBattlePool(next);
  return {
    ...makeCurveTrade(workingPool, next, borrowedTokens, quote.grossEth, settlement.feeEth, quote.grossEth),
    payoutEth,
    pnlEth: payoutEth - collateral,
    debtRepaidEth: borrowedTokens,
    liquidatedEquityEth: liquidated ? settlement.residualEquityEth : 0,
    residualEquityEth: settlement.residualEquityEth,
    badDebtEth: settlement.badDebtEth,
  };
}

export function estimatePositionEquity(pool: BattlePoolState, position: Position) {
  try {
    const accruedCosts = (position.accruedFunding ?? 0) + (position.accruedBorrow ?? 0);
    if (position.direction === "long") {
      const quote = rawCurveSellQuote(pool, Math.max(0, position.tokenAmount ?? 0), 0);
      const debt = Math.max(0, position.debtEth ?? position.notional - position.collateral);
      return quote.grossEth - debt - accruedCosts - quote.grossEth * BATTLE_TRADE_FEE_RATE;
    }
    let workingPool = pool;
    const borrowedTokens = Math.max(0, position.borrowedTokens ?? 0);
    if (borrowedTokens > workingPool.curveRealTokenReserve) {
      const shortage = borrowedTokens - workingPool.curveRealTokenReserve;
      const safetyRelease = Math.min(shortage, workingPool.safetyTokenReserve);
      workingPool = {
        ...workingPool,
        curveTokenReserve: workingPool.curveRealTokenReserve + safetyRelease,
        curveRealTokenReserve: workingPool.curveRealTokenReserve + safetyRelease,
        safetyTokenReserve: workingPool.safetyTokenReserve - safetyRelease,
      };
    }
    const cost = quoteBuyExactTokens(workingPool, borrowedTokens, 0).grossEth;
    return position.collateral + (position.lockedProceedsEth ?? 0) - cost - accruedCosts - cost * BATTLE_TRADE_FEE_RATE;
  } catch {
    return -Infinity;
  }
}

export function getPositionHealth(pool: BattlePoolState, position: Position, fallbackMaintenanceMarginRate = 0.02): PositionHealth {
  const equityEth = estimatePositionEquity(pool, position);
  const maintenanceMarginEth = Math.max(0, position.notional * (position.maintenanceMarginRate ?? fallbackMaintenanceMarginRate));
  const healthRatio = maintenanceMarginEth > EPSILON ? equityEth / maintenanceMarginEth : Number.POSITIVE_INFINITY;
  return {
    positionId: position.id,
    direction: position.direction,
    equityEth,
    maintenanceMarginEth,
    healthRatio,
    liquidatable: !Number.isFinite(equityEth) || equityEth <= maintenanceMarginEth,
  };
}

export function rebalanceAdaptiveInventory(pool: BattlePoolState): AdaptiveInventoryRebalance {
  const utilizationBefore = shortInventoryUtilization(pool);
  const totalShortInventory = pool.perpTokenReserve + pool.borrowedShortTokens;
  const protectedCurveInventory = pool.curveAllocation * (1 - pool.maxCurveSoldFraction);
  const step = pool.totalSupply * pool.adaptiveReleaseStepFraction;
  const minSafetyTokens = pool.totalSupply * pool.adaptiveMinSafetyFraction;
  const maxPerpTokens = pool.totalSupply * pool.adaptiveMaxPerpFraction;

  if (utilizationBefore >= pool.adaptiveReleaseTrigger && pool.realWethBalance >= pool.adaptiveMinDepthEth && pool.safetyTokenReserve > minSafetyTokens) {
    const desiredTotalInventory = pool.borrowedShortTokens / Math.max(pool.adaptiveTargetUtilization, EPSILON);
    const desiredRelease = Math.max(0, desiredTotalInventory - totalShortInventory);
    const bySafetyFloor = Math.max(0, pool.safetyTokenReserve - minSafetyTokens);
    const byPerpCeiling = Math.max(0, maxPerpTokens - totalShortInventory);
    const byCloseability = Math.max(0, (protectedCurveInventory + pool.safetyTokenReserve - totalShortInventory) / 2);
    const release = Math.min(step, desiredRelease, bySafetyFloor, byPerpCeiling, byCloseability);
    if (release > 0.5) {
      const next = assertBattlePool({
        ...pool,
        perpTokenReserve: pool.perpTokenReserve + release,
        safetyTokenReserve: pool.safetyTokenReserve - release,
        adaptivePerpReleasedTokens: pool.adaptivePerpReleasedTokens + release,
        adaptiveRebalanceCount: pool.adaptiveRebalanceCount + 1,
      });
      return {
        next,
        action: "release",
        tokensMoved: release,
        utilizationBefore,
        utilizationAfter: shortInventoryUtilization(next),
        reason: "Short demand crossed the release trigger while WETH depth and closeability remained covered.",
      };
    }
  }

  if (utilizationBefore <= pool.adaptiveReclaimTrigger && pool.adaptivePerpReleasedTokens > 0.5) {
    const desiredTotalInventory = Math.max(pool.initialPerpAllocation, pool.borrowedShortTokens / Math.max(pool.adaptiveTargetUtilization, EPSILON));
    const excessInventory = Math.max(0, totalShortInventory - desiredTotalInventory);
    const reclaim = Math.min(step, excessInventory, pool.adaptivePerpReleasedTokens, pool.perpTokenReserve);
    if (reclaim > 0.5) {
      const next = assertBattlePool({
        ...pool,
        perpTokenReserve: pool.perpTokenReserve - reclaim,
        safetyTokenReserve: pool.safetyTokenReserve + reclaim,
        adaptivePerpReleasedTokens: pool.adaptivePerpReleasedTokens - reclaim,
        adaptiveRebalanceCount: pool.adaptiveRebalanceCount + 1,
      });
      return {
        next,
        action: "reclaim",
        tokensMoved: reclaim,
        utilizationBefore,
        utilizationAfter: shortInventoryUtilization(next),
        reason: "Short demand cooled, so unused dynamic inventory returned to the safety reserve.",
      };
    }
  }

  return {
    next: pool,
    action: "none",
    tokensMoved: 0,
    utilizationBefore,
    utilizationAfter: utilizationBefore,
    reason: "Current inventory remains inside adaptive safety bounds.",
  };
}

export function maybeReleaseSafetyInventory(pool: BattlePoolState) {
  return rebalanceAdaptiveInventory(pool).next;
}

export function executeLiquidationCascade(
  pool: BattlePoolState,
  positions: Position[],
  options: { maxLiquidations?: number; fallbackMaintenanceMarginRate?: number } = {},
): LiquidationCascadeResult {
  const startPriceEth = battlePriceEth(pool);
  const events: LiquidationCascadeEvent[] = [];
  const remainingPositions = [...positions];
  let next = pool;
  let haltedReason: string | undefined;
  const maxLiquidations = Math.max(1, options.maxLiquidations ?? positions.length);
  const fallbackMaintenanceMarginRate = options.fallbackMaintenanceMarginRate ?? 0.02;

  while (events.length < maxLiquidations && remainingPositions.length) {
    const candidate = remainingPositions
      .map((position) => ({ position, health: getPositionHealth(next, position, fallbackMaintenanceMarginRate) }))
      .filter(({ health }) => health.liquidatable)
      .sort((a, b) => {
        if (a.health.healthRatio !== b.health.healthRatio) return a.health.healthRatio - b.health.healthRatio;
        if (a.position.openedAt !== b.position.openedAt) return a.position.openedAt - b.position.openedAt;
        return a.position.id.localeCompare(b.position.id);
      })[0];

    if (!candidate) break;
    const accruedCosts = (candidate.position.accruedFunding ?? 0) + (candidate.position.accruedBorrow ?? 0);
    try {
      const trade = candidate.position.direction === "long"
        ? executeCloseLong(next, candidate.position, 1, true, accruedCosts)
        : executeCloseShort(next, candidate.position, 1, true, accruedCosts);
      events.push({
        positionId: candidate.position.id,
        direction: candidate.position.direction,
        leverage: candidate.position.leverage,
        equityBeforeEth: candidate.health.equityEth,
        maintenanceMarginEth: candidate.health.maintenanceMarginEth,
        residualEquityEth: trade.liquidatedEquityEth,
        badDebtEth: trade.badDebtEth,
        feeEth: trade.feeEth,
        priceBefore: trade.priceBefore,
        priceAfter: trade.priceAfter,
        priceImpactPercent: trade.priceImpactPercent,
      });
      next = rebalanceAdaptiveInventory(trade.next).next;
      const index = remainingPositions.findIndex((position) => position.id === candidate.position.id);
      if (index >= 0) remainingPositions.splice(index, 1);
    } catch (error) {
      haltedReason = error instanceof Error ? error.message : "Liquidation cascade halted.";
      break;
    }
  }

  return {
    next,
    remainingPositions,
    events,
    liquidatedCount: events.length,
    longLiquidations: events.filter((event) => event.direction === "long").length,
    shortLiquidations: events.filter((event) => event.direction === "short").length,
    totalResidualEquityEth: events.reduce((sum, event) => sum + event.residualEquityEth, 0),
    totalBadDebtEth: events.reduce((sum, event) => sum + event.badDebtEth, 0),
    startPriceEth,
    endPriceEth: battlePriceEth(next),
    haltedReason,
  };
}


function maxBuyChunkForImpact(pool: BattlePoolState, remainingEth: number, maxPriceStepPercent: number, feeRate: number) {
  if (remainingEth <= 0) return 0;
  try {
    const full = applySpotBuy(pool, remainingEth, feeRate, false);
    if (full.priceImpactPercent <= maxPriceStepPercent) return remainingEth;
  } catch {
    // Binary search below a curve-protection or solvency boundary.
  }
  let low = 0;
  let high = remainingEth;
  for (let index = 0; index < 36; index += 1) {
    const middle = (low + high) / 2;
    try {
      const quote = applySpotBuy(pool, middle, feeRate, false);
      if (quote.priceImpactPercent <= maxPriceStepPercent) low = middle;
      else high = middle;
    } catch {
      high = middle;
    }
  }
  return Math.max(low, Math.min(remainingEth, 1e-9));
}

function maxSellChunkForImpact(pool: BattlePoolState, remainingTokens: number, maxPriceStepPercent: number, feeRate: number) {
  if (remainingTokens <= 0) return 0;
  try {
    const full = applySpotSell(pool, remainingTokens, feeRate, false);
    if (full.priceImpactPercent <= maxPriceStepPercent) return remainingTokens;
  } catch {
    // Binary search below a reserve or solvency boundary.
  }
  let low = 0;
  let high = remainingTokens;
  for (let index = 0; index < 36; index += 1) {
    const middle = (low + high) / 2;
    try {
      const quote = applySpotSell(pool, middle, feeRate, false);
      if (quote.priceImpactPercent <= maxPriceStepPercent) low = middle;
      else high = middle;
    } catch {
      high = middle;
    }
  }
  return Math.max(low, Math.min(remainingTokens, 0.001));
}

function causesFreshLiquidation(
  before: BattlePoolState,
  after: BattlePoolState,
  positions: Position[],
  direction: "long" | "short",
) {
  return positions.some((position) => {
    if (position.direction !== direction) return false;
    const healthBefore = getPositionHealth(before, position);
    if (healthBefore.liquidatable) return false;
    return getPositionHealth(after, position).liquidatable;
  });
}

/**
 * Returns the smallest safe user-order chunk that reaches the next liquidation
 * boundary. The caller executes a hair beyond this point, liquidates, then
 * continues the same atomic order. This replaces blind micro-stepping with a
 * deterministic boundary solver.
 */
function nextBuyLiquidationBoundary(
  pool: BattlePoolState,
  maxGrossEth: number,
  positions: Position[],
  feeRate: number,
) {
  const shorts = positions.filter((position) => position.direction === "short" && !getPositionHealth(pool, position).liquidatable);
  if (!shorts.length || maxGrossEth <= 1e-12) return undefined;
  let full: CurveTrade;
  try {
    full = applySpotBuy(pool, maxGrossEth, feeRate, false);
  } catch {
    return undefined;
  }
  if (!causesFreshLiquidation(pool, full.next, shorts, "short")) return undefined;
  let low = 0;
  let high = maxGrossEth;
  for (let index = 0; index < 44; index += 1) {
    const middle = (low + high) / 2;
    const quote = applySpotBuy(pool, middle, feeRate, false);
    if (causesFreshLiquidation(pool, quote.next, shorts, "short")) high = middle;
    else low = middle;
  }
  return Math.min(maxGrossEth, Math.max(high * (1 + 1e-8), 1e-12));
}

function nextSellLiquidationBoundary(
  pool: BattlePoolState,
  maxTokens: number,
  positions: Position[],
  feeRate: number,
) {
  const longs = positions.filter((position) => position.direction === "long" && !getPositionHealth(pool, position).liquidatable);
  if (!longs.length || maxTokens <= 0.000001) return undefined;
  let full: CurveTrade;
  try {
    full = applySpotSell(pool, maxTokens, feeRate, false);
  } catch {
    return undefined;
  }
  if (!causesFreshLiquidation(pool, full.next, longs, "long")) return undefined;
  let low = 0;
  let high = maxTokens;
  for (let index = 0; index < 44; index += 1) {
    const middle = (low + high) / 2;
    const quote = applySpotSell(pool, middle, feeRate, false);
    if (causesFreshLiquidation(pool, quote.next, longs, "long")) high = middle;
    else low = middle;
  }
  return Math.min(maxTokens, Math.max(high * (1 + 1e-8), 0.000001));
}

export function executeSequencedSpotBuy(
  pool: BattlePoolState,
  grossEth: number,
  positions: Position[],
  options: { maxPriceStepPercent?: number; feeRate?: number; maxSteps?: number } = {},
): SequencedSpotExecution {
  if (grossEth <= 0) throw new Error("Buy amount must be positive.");
  const startPriceEth = battlePriceEth(pool);
  const maxPriceStepPercent = clampNumber(options.maxPriceStepPercent ?? 5, 0.05, 12);
  const feeRate = options.feeRate ?? BATTLE_TRADE_FEE_RATE;
  const maxSteps = Math.max(1, options.maxSteps ?? 2048);
  let remainingEth = grossEth;
  let next = pool;
  let activePositions = [...positions];
  let tokens = 0;
  let feeEth = 0;
  let netEth = 0;
  let steps = 0;
  const liquidationEvents: LiquidationCascadeEvent[] = [];

  while (remainingEth > 1e-10) {
    if (steps >= maxSteps) throw new Error("Sequenced buy exceeded the maximum internal execution steps.");
    const preCascade = executeLiquidationCascade(next, activePositions);
    if (preCascade.totalBadDebtEth > 1e-10) throw new Error("Existing liquidations contain bad debt before the buy can continue.");
    if (preCascade.events.length) {
      next = rebalanceAdaptiveInventory(preCascade.next).next;
      activePositions = preCascade.remainingPositions;
      liquidationEvents.push(...preCascade.events);
    }
    const impactChunk = maxBuyChunkForImpact(next, remainingEth, maxPriceStepPercent, feeRate);
    const boundaryChunk = nextBuyLiquidationBoundary(next, impactChunk, activePositions, feeRate);
    let chunk = Math.min(impactChunk, boundaryChunk ?? impactChunk);
    let accepted: { trade: CurveTrade; cascade: LiquidationCascadeResult } | undefined;
    for (let attempt = 0; attempt < 28 && chunk > 1e-12; attempt += 1) {
      try {
        const trade = applySpotBuy(next, chunk, feeRate, false);
        const cascade = executeLiquidationCascade(trade.next, activePositions);
        assertBattlePool(cascade.next);
        if (cascade.totalBadDebtEth > 1e-10) {
          chunk /= 2;
          continue;
        }
        accepted = { trade, cascade };
        break;
      } catch {
        chunk /= 2;
      }
    }
    if (!accepted) throw new Error("BattlePool could not sequence this buy without creating bad debt.");
    tokens += accepted.trade.tokens;
    feeEth += accepted.trade.feeEth;
    netEth += accepted.trade.netEth;
    remainingEth = Math.max(0, remainingEth - chunk);
    next = rebalanceAdaptiveInventory(accepted.cascade.next).next;
    activePositions = accepted.cascade.remainingPositions;
    liquidationEvents.push(...accepted.cascade.events);
    steps += 1;
  }

  return {
    next,
    remainingPositions: activePositions,
    grossEth,
    netEth,
    feeEth,
    tokens,
    steps,
    liquidationEvents,
    totalResidualEquityEth: liquidationEvents.reduce((sum, event) => sum + event.residualEquityEth, 0),
    totalBadDebtEth: liquidationEvents.reduce((sum, event) => sum + event.badDebtEth, 0),
    startPriceEth,
    endPriceEth: battlePriceEth(next),
    priceImpactPercent: impact(startPriceEth, battlePriceEth(next)),
  };
}

export function executeSequencedSpotSell(
  pool: BattlePoolState,
  tokenAmount: number,
  positions: Position[],
  options: { maxPriceStepPercent?: number; feeRate?: number; maxSteps?: number } = {},
): SequencedSpotExecution {
  if (tokenAmount <= 0) throw new Error("Sell amount must be positive.");
  if (tokenAmount > pool.circulatingSpotTokens + 1e-6) throw new Error("Spot sell exceeds circulating spot inventory.");
  const startPriceEth = battlePriceEth(pool);
  const maxPriceStepPercent = clampNumber(options.maxPriceStepPercent ?? 5, 0.05, 12);
  const feeRate = options.feeRate ?? BATTLE_TRADE_FEE_RATE;
  const maxSteps = Math.max(1, options.maxSteps ?? 2048);
  let remainingTokens = tokenAmount;
  let next = pool;
  let activePositions = [...positions];
  let grossEth = 0;
  let feeEth = 0;
  let netEth = 0;
  let steps = 0;
  const liquidationEvents: LiquidationCascadeEvent[] = [];

  while (remainingTokens > 0.001) {
    if (steps >= maxSteps) throw new Error("Sequenced sell exceeded the maximum internal execution steps.");
    const preCascade = executeLiquidationCascade(next, activePositions);
    if (preCascade.totalBadDebtEth > 1e-10) throw new Error("Existing liquidations contain bad debt before the sell can continue.");
    if (preCascade.events.length) {
      next = rebalanceAdaptiveInventory(preCascade.next).next;
      activePositions = preCascade.remainingPositions;
      liquidationEvents.push(...preCascade.events);
    }
    const impactChunk = maxSellChunkForImpact(next, remainingTokens, maxPriceStepPercent, feeRate);
    const boundaryChunk = nextSellLiquidationBoundary(next, impactChunk, activePositions, feeRate);
    let chunk = Math.min(impactChunk, boundaryChunk ?? impactChunk);
    let accepted: { trade: CurveTrade; cascade: LiquidationCascadeResult } | undefined;
    for (let attempt = 0; attempt < 28 && chunk > 0.000001; attempt += 1) {
      try {
        const trade = applySpotSell(next, chunk, feeRate, false);
        const cascade = executeLiquidationCascade(trade.next, activePositions);
        assertBattlePool(cascade.next);
        if (cascade.totalBadDebtEth > 1e-10) {
          chunk /= 2;
          continue;
        }
        accepted = { trade, cascade };
        break;
      } catch {
        chunk /= 2;
      }
    }
    if (!accepted) throw new Error("BattlePool could not sequence this sell without creating bad debt.");
    grossEth += accepted.trade.grossEth;
    feeEth += accepted.trade.feeEth;
    netEth += accepted.trade.netEth;
    remainingTokens = Math.max(0, remainingTokens - chunk);
    next = rebalanceAdaptiveInventory(accepted.cascade.next).next;
    activePositions = accepted.cascade.remainingPositions;
    liquidationEvents.push(...accepted.cascade.events);
    steps += 1;
  }

  if (remainingTokens > 0) {
    const trade = applySpotSell(next, remainingTokens, feeRate, false);
    const cascade = executeLiquidationCascade(trade.next, activePositions);
    if (cascade.totalBadDebtEth > 1e-10) throw new Error("Final sequenced sell dust would create bad debt.");
    assertBattlePool(cascade.next);
    grossEth += trade.grossEth;
    feeEth += trade.feeEth;
    netEth += trade.netEth;
    next = rebalanceAdaptiveInventory(cascade.next).next;
    activePositions = cascade.remainingPositions;
    liquidationEvents.push(...cascade.events);
    steps += 1;
  }

  return {
    next,
    remainingPositions: activePositions,
    grossEth,
    netEth,
    feeEth,
    tokens: tokenAmount,
    steps,
    liquidationEvents,
    totalResidualEquityEth: liquidationEvents.reduce((sum, event) => sum + event.residualEquityEth, 0),
    totalBadDebtEth: liquidationEvents.reduce((sum, event) => sum + event.badDebtEth, 0),
    startPriceEth,
    endPriceEth: battlePriceEth(next),
    priceImpactPercent: impact(startPriceEth, battlePriceEth(next)),
  };
}

export type SequencedPositionOpenExecution = {
  next: BattlePoolState;
  remainingPositions: Position[];
  position: Position;
  collateralEth: number;
  notionalEth: number;
  feeEth: number;
  tokens: number;
  debtEth: number;
  lockedProceedsEth: number;
  steps: number;
  liquidationEvents: LiquidationCascadeEvent[];
  totalBadDebtEth: number;
  startPriceEth: number;
  endPriceEth: number;
  priceImpactPercent: number;
};

export type SequencedPositionCloseExecution = {
  next: BattlePoolState;
  remainingPositions: Position[];
  closedPositionId: string;
  fractionClosed: number;
  payoutEth: number;
  pnlEth: number;
  feeEth: number;
  steps: number;
  liquidationEvents: LiquidationCascadeEvent[];
  totalBadDebtEth: number;
  startPriceEth: number;
  endPriceEth: number;
  priceImpactPercent: number;
};

function v23LiquidationCap(entryCap: number, direction: "long" | "short", leverage: number, maintenanceMarginRate: number) {
  const move = clampNumber(1 / Math.max(1, leverage) - maintenanceMarginRate - BATTLE_TRADE_FEE_RATE, 0.015, 0.92);
  return direction === "long" ? entryCap * (1 - move) : entryCap * (1 + move);
}

function shrinkPosition(position: Position, fractionClosed: number): Position | null {
  const remaining = Math.max(0, 1 - fractionClosed);
  if (remaining <= 1e-9) return null;
  return {
    ...position,
    collateral: position.collateral * remaining,
    initialCollateral: (position.initialCollateral ?? position.collateral) * remaining,
    notional: position.notional * remaining,
    tokenAmount: position.tokenAmount === undefined ? undefined : position.tokenAmount * remaining,
    debtEth: position.debtEth === undefined ? undefined : position.debtEth * remaining,
    borrowedTokens: position.borrowedTokens === undefined ? undefined : position.borrowedTokens * remaining,
    lockedProceedsEth: position.lockedProceedsEth === undefined ? undefined : position.lockedProceedsEth * remaining,
    entryFee: position.entryFee === undefined ? undefined : position.entryFee * remaining,
    currentCap: position.currentCap,
  };
}

export function executeSequencedOpenPosition(
  pool: BattlePoolState,
  positions: Position[],
  input: {
    id: string;
    owner: string;
    clientOrderId: string;
    slug?: string;
    direction: "long" | "short";
    collateralEth: number;
    leverage: number;
    openedAt?: number;
    maintenanceMarginRate?: number;
  },
  options: { maxPriceStepPercent?: number; maxSteps?: number } = {},
): SequencedPositionOpenExecution {
  if (input.collateralEth <= 0 || input.leverage < 1 || input.leverage > 20) throw new Error("Invalid leveraged-open parameters.");
  const startPriceEth = battlePriceEth(pool);
  const maxPriceStepPercent = clampNumber(options.maxPriceStepPercent ?? 5, 0.05, 12);
  const maxSteps = Math.max(1, options.maxSteps ?? 2048);
  let remainingCollateral = input.collateralEth;
  let next = pool;
  let activePositions = [...positions];
  let notionalEth = 0;
  let feeEth = 0;
  let tokens = 0;
  let debtEth = 0;
  let lockedProceedsEth = 0;
  let steps = 0;
  const liquidationEvents: LiquidationCascadeEvent[] = [];

  while (remainingCollateral > 1e-12) {
    if (steps >= maxSteps) throw new Error("Sequenced leveraged open exceeded maximum internal steps.");
    const preCascade = executeLiquidationCascade(next, activePositions);
    if (preCascade.totalBadDebtEth > 1e-10) throw new Error("Existing positions contain bad debt before this order can open.");
    next = rebalanceAdaptiveInventory(preCascade.next).next;
    activePositions = preCascade.remainingPositions;
    liquidationEvents.push(...preCascade.events);

    let chunk = remainingCollateral;
    let accepted: { trade: LongOpenTrade | ShortOpenTrade; cascade: LiquidationCascadeResult } | undefined;
    let lastAttemptError = "unknown route rejection";
    for (let attempt = 0; attempt < 48 && chunk > 1e-14; attempt += 1) {
      try {
        const trade = input.direction === "long"
          ? executeOpenLong(next, chunk, input.leverage)
          : executeOpenShort(next, chunk, input.leverage);
        if (trade.priceImpactPercent > maxPriceStepPercent + 1e-9) {
          chunk /= 2;
          continue;
        }
        const cascade = executeLiquidationCascade(trade.next, activePositions);
        if (cascade.totalBadDebtEth > 1e-10) {
          chunk /= 2;
          continue;
        }
        assertBattlePool(cascade.next);
        accepted = { trade, cascade };
        break;
      } catch (error) {
        lastAttemptError = error instanceof Error ? error.message : "unknown route rejection";
        chunk /= 2;
      }
    }
    if (!accepted) throw new Error(`BattlePool could not open this leveraged order without unsafe price impact or bad debt. Remaining collateral ${remainingCollateral.toExponential(4)} ETH; last rejection: ${lastAttemptError}`);

    const trade = accepted.trade;
    notionalEth += trade.notionalEth;
    feeEth += trade.feeEth;
    tokens += trade.tokens;
    if (input.direction === "long") debtEth += (trade as LongOpenTrade).debtEth;
    else lockedProceedsEth += (trade as ShortOpenTrade).lockedProceedsEth;
    remainingCollateral = Math.max(0, remainingCollateral - chunk);
    next = rebalanceAdaptiveInventory(accepted.cascade.next).next;
    activePositions = accepted.cascade.remainingPositions;
    liquidationEvents.push(...accepted.cascade.events);
    steps += 1;
  }

  const endPriceEth = battlePriceEth(next);
  const entryCap = endPriceEth * next.totalSupply;
  const maintenanceMarginRate = input.maintenanceMarginRate ?? clampNumber(0.0075 + input.leverage * 0.00055 + 0.005, 0.015, 0.045);
  const position: Position = {
    id: input.id,
    slug: input.slug ?? "local-battle",
    direction: input.direction,
    leverage: input.leverage,
    collateral: input.collateralEth,
    initialCollateral: input.collateralEth,
    notional: notionalEth,
    entryCap,
    currentCap: entryCap,
    liquidationCap: v23LiquidationCap(entryCap, input.direction, input.leverage, maintenanceMarginRate),
    openedAt: input.openedAt ?? Date.now(),
    entryFee: feeEth,
    accruedFunding: 0,
    accruedBorrow: 0,
    maintenanceMarginRate,
    partialLiquidations: 0,
    lastAccruedAt: input.openedAt ?? Date.now(),
    tokenAmount: input.direction === "long" ? tokens : undefined,
    debtEth: input.direction === "long" ? debtEth : undefined,
    borrowedTokens: input.direction === "short" ? tokens : undefined,
    lockedProceedsEth: input.direction === "short" ? lockedProceedsEth : undefined,
    entryPriceEth: notionalEth / Math.max(tokens, EPSILON),
    owner: input.owner.toLowerCase(),
    clientOrderId: input.clientOrderId,
  };

  return {
    next,
    remainingPositions: [...activePositions, position],
    position,
    collateralEth: input.collateralEth,
    notionalEth,
    feeEth,
    tokens,
    debtEth,
    lockedProceedsEth,
    steps,
    liquidationEvents,
    totalBadDebtEth: liquidationEvents.reduce((sum, event) => sum + event.badDebtEth, 0),
    startPriceEth,
    endPriceEth,
    priceImpactPercent: impact(startPriceEth, endPriceEth),
  };
}

export function executeSequencedPositionClose(
  pool: BattlePoolState,
  positions: Position[],
  input: { positionId: string; owner: string; fraction: number },
  options: { maxPriceStepPercent?: number; maxSteps?: number } = {},
): SequencedPositionCloseExecution {
  const index = positions.findIndex((position) => position.id === input.positionId);
  if (index < 0) throw new Error("Position was not found.");
  const original = positions[index];
  if (original.owner && original.owner.toLowerCase() !== input.owner.toLowerCase()) throw new Error("Position belongs to another trading account.");
  const requestedFraction = clampNumber(input.fraction, 0.0001, 1);
  const startPriceEth = battlePriceEth(pool);
  const maxPriceStepPercent = clampNumber(options.maxPriceStepPercent ?? 5, 0.05, 12);
  const maxSteps = Math.max(1, options.maxSteps ?? 2048);
  let next = pool;
  let working = { ...original };
  let activePositions = positions.filter((_, candidate) => candidate !== index);
  let targetCollateral = original.collateral * requestedFraction;
  let payoutEth = 0;
  let pnlEth = 0;
  let feeEth = 0;
  let steps = 0;
  const liquidationEvents: LiquidationCascadeEvent[] = [];

  while (targetCollateral > 1e-12 && working.collateral > 1e-12) {
    if (steps >= maxSteps) throw new Error("Sequenced close exceeded maximum internal steps.");
    const preCascade = executeLiquidationCascade(next, activePositions);
    if (preCascade.totalBadDebtEth > 1e-10) throw new Error("Existing positions contain bad debt before this close can continue.");
    next = rebalanceAdaptiveInventory(preCascade.next).next;
    activePositions = preCascade.remainingPositions;
    liquidationEvents.push(...preCascade.events);

    let fractionOfWorking = Math.min(1, targetCollateral / working.collateral);
    let accepted: { trade: PositionCloseTrade; cascade: LiquidationCascadeResult; fraction: number } | undefined;
    for (let attempt = 0; attempt < 32 && fractionOfWorking > 1e-8; attempt += 1) {
      try {
        const trade = working.direction === "long"
          ? executeCloseLong(next, working, fractionOfWorking)
          : executeCloseShort(next, working, fractionOfWorking);
        if (trade.priceImpactPercent > maxPriceStepPercent + 1e-9) {
          fractionOfWorking /= 2;
          continue;
        }
        const cascade = executeLiquidationCascade(trade.next, activePositions);
        if (cascade.totalBadDebtEth > 1e-10) {
          fractionOfWorking /= 2;
          continue;
        }
        assertBattlePool(cascade.next);
        accepted = { trade, cascade, fraction: fractionOfWorking };
        break;
      } catch {
        fractionOfWorking /= 2;
      }
    }
    if (!accepted) throw new Error("BattlePool could not close this position without unsafe price impact or bad debt.");

    const closedCollateral = working.collateral * accepted.fraction;
    payoutEth += accepted.trade.payoutEth;
    pnlEth += accepted.trade.pnlEth;
    feeEth += accepted.trade.feeEth;
    targetCollateral = Math.max(0, targetCollateral - closedCollateral);
    const remaining = shrinkPosition(working, accepted.fraction);
    working = remaining ?? { ...working, collateral: 0, notional: 0 };
    next = rebalanceAdaptiveInventory(accepted.cascade.next).next;
    activePositions = accepted.cascade.remainingPositions;
    liquidationEvents.push(...accepted.cascade.events);
    steps += 1;
  }

  if (working.collateral > 1e-9) {
    working.currentCap = battlePriceEth(next) * next.totalSupply;
    activePositions.push(working);
  }
  const endPriceEth = battlePriceEth(next);
  return {
    next,
    remainingPositions: activePositions,
    closedPositionId: original.id,
    fractionClosed: requestedFraction,
    payoutEth,
    pnlEth,
    feeEth,
    steps,
    liquidationEvents,
    totalBadDebtEth: liquidationEvents.reduce((sum, event) => sum + event.badDebtEth, 0),
    startPriceEth,
    endPriceEth,
    priceImpactPercent: impact(startPriceEth, endPriceEth),
  };
}
