import {
  DEFAULT_FIXED_CURVE_PARAMS,
  FP_CURVE_ALLOCATION_WAD,
  FP_PERP_ALLOCATION_WAD,
  FP_SAFETY_ALLOCATION_WAD,
  FP_TOTAL_SUPPLY_WAD,
  cumulativeCostWad,
  marginalPriceWad,
  quoteFixedBuy,
  quoteFixedBuyExactTokens,
  quoteFixedSell,
  type FixedBuyQuote,
  type FixedSellQuote,
} from "../fixed-point-battle-curve.ts";

export const V24ActionKind = {
  Genesis: 0,
  SpotBuy: 1,
  SpotSell: 2,
  OpenLong: 3,
  CloseLong: 4,
  OpenShort: 5,
  CloseShort: 6,
  LiquidateLong: 7,
  LiquidateShort: 8,
  Deposit: 9,
  Withdraw: 10,
  LiquidationBatch: 11,
} as const;

export type V24ActionKind = (typeof V24ActionKind)[keyof typeof V24ActionKind];

export type V24VerifiedPoolState = {
  sequence: bigint;
  curveSoldTokenWad: bigint;
  lockedLongTokensWad: bigint;
  borrowedShortTokensWad: bigint;
  perpInventoryWad: bigint;
  safetyInventoryWad: bigint;
  circulatingSpotTokensWad: bigint;
  poolWethWad: bigint;
  reservedWethWad: bigint;
  stateHash: `0x${string}`;
};

export type V24CurveActionProof = {
  action: V24ActionKind;
  grossCurveWethWad: bigint;
  curveTokenAmountWad: bigint;
  curveFeeWad: bigint;
  externalWethAmountWad: bigint;
  nextLockedLongTokensWad: bigint;
  nextBorrowedShortTokensWad: bigint;
  nextPerpInventoryWad: bigint;
  nextSafetyInventoryWad: bigint;
  nextCirculatingSpotTokensWad: bigint;
  marginalPriceAfterWad: bigint;
  marketCapAfterWad: bigint;
};

export function createV24VerifiedPoolState(overrides: Partial<V24VerifiedPoolState> = {}): V24VerifiedPoolState {
  return assertV24VerifiedState({
    sequence: 0n,
    curveSoldTokenWad: 0n,
    lockedLongTokensWad: 0n,
    borrowedShortTokensWad: 0n,
    perpInventoryWad: FP_PERP_ALLOCATION_WAD,
    safetyInventoryWad: FP_SAFETY_ALLOCATION_WAD,
    circulatingSpotTokensWad: 0n,
    poolWethWad: 0n,
    reservedWethWad: 0n,
    stateHash: `0x${"00".repeat(32)}`,
    ...overrides,
  });
}

export function v24CurveReserveWad(state: V24VerifiedPoolState) {
  return FP_CURVE_ALLOCATION_WAD - state.curveSoldTokenWad;
}

export function v24LogicalTokenConservation(state: V24VerifiedPoolState) {
  return v24CurveReserveWad(state)
    + state.perpInventoryWad
    + state.safetyInventoryWad
    + state.lockedLongTokensWad
    + state.circulatingSpotTokensWad;
}

export function assertV24VerifiedState(state: V24VerifiedPoolState) {
  for (const [key, value] of Object.entries(state)) {
    if (typeof value === "bigint" && value < 0n) throw new Error(`V24 state ${key} cannot be negative.`);
  }
  if (state.curveSoldTokenWad > FP_CURVE_ALLOCATION_WAD) throw new Error("Curve sold inventory exceeds allocation.");
  if (state.reservedWethWad > state.poolWethWad) throw new Error("Reserved WETH exceeds physical pool WETH.");
  const conserved = v24LogicalTokenConservation(state);
  if (conserved !== FP_TOTAL_SUPPLY_WAD) throw new Error(`V24 logical token conservation failed by ${conserved - FP_TOTAL_SUPPLY_WAD} units.`);
  return state;
}

function marketCapAtPrice(priceWad: bigint) {
  return priceWad * FP_TOTAL_SUPPLY_WAD / (10n ** 18n);
}

function proofFromBuy(
  action: V24ActionKind,
  state: V24VerifiedPoolState,
  quote: FixedBuyQuote,
  externalWethAmountWad: bigint,
): { next: V24VerifiedPoolState; proof: V24CurveActionProof } {
  let nextLocked = state.lockedLongTokensWad;
  let nextBorrowed = state.borrowedShortTokensWad;
  let nextPerp = state.perpInventoryWad;
  const nextSafety = state.safetyInventoryWad;
  let nextSpot = state.circulatingSpotTokensWad;

  if (action === V24ActionKind.SpotBuy) nextSpot += quote.tokenOutWad;
  else if (action === V24ActionKind.OpenLong) nextLocked += quote.tokenOutWad;
  else if (action === V24ActionKind.CloseShort || action === V24ActionKind.LiquidateShort) {
    if (quote.tokenOutWad > nextBorrowed) throw new Error("Short repayment exceeds borrowed inventory.");
    nextBorrowed -= quote.tokenOutWad;
    nextPerp += quote.tokenOutWad;
  } else throw new Error("Unsupported V24 buy action.");

  const next = assertV24VerifiedState({
    ...state,
    sequence: state.sequence + 1n,
    curveSoldTokenWad: quote.soldAfterWad,
    lockedLongTokensWad: nextLocked,
    borrowedShortTokensWad: nextBorrowed,
    perpInventoryWad: nextPerp,
    safetyInventoryWad: nextSafety,
    circulatingSpotTokensWad: nextSpot,
  });
  return {
    next,
    proof: {
      action,
      grossCurveWethWad: quote.grossWethWad,
      curveTokenAmountWad: quote.tokenOutWad,
      curveFeeWad: quote.feeWethWad,
      externalWethAmountWad,
      nextLockedLongTokensWad: nextLocked,
      nextBorrowedShortTokensWad: nextBorrowed,
      nextPerpInventoryWad: nextPerp,
      nextSafetyInventoryWad: nextSafety,
      nextCirculatingSpotTokensWad: nextSpot,
      marginalPriceAfterWad: quote.marginalPriceAfterWad,
      marketCapAfterWad: marketCapAtPrice(quote.marginalPriceAfterWad),
    },
  };
}

function proofFromSell(
  action: V24ActionKind,
  state: V24VerifiedPoolState,
  quote: FixedSellQuote,
  externalWethAmountWad: bigint,
): { next: V24VerifiedPoolState; proof: V24CurveActionProof } {
  let nextLocked = state.lockedLongTokensWad;
  let nextBorrowed = state.borrowedShortTokensWad;
  let nextPerp = state.perpInventoryWad;
  let nextSafety = state.safetyInventoryWad;
  let nextSpot = state.circulatingSpotTokensWad;

  if (action === V24ActionKind.SpotSell) {
    if (quote.tokenInWad > nextSpot) throw new Error("Spot sell exceeds circulating inventory.");
    nextSpot -= quote.tokenInWad;
  } else if (action === V24ActionKind.OpenShort) {
    if (quote.tokenInWad > nextPerp + nextSafety) throw new Error("Short borrow exceeds adaptive inventory.");
    const fromPerp = quote.tokenInWad > nextPerp ? nextPerp : quote.tokenInWad;
    nextPerp -= fromPerp;
    nextSafety -= quote.tokenInWad - fromPerp;
    nextBorrowed += quote.tokenInWad;
  } else if (action === V24ActionKind.CloseLong || action === V24ActionKind.LiquidateLong) {
    if (quote.tokenInWad > nextLocked) throw new Error("Long close exceeds locked token inventory.");
    nextLocked -= quote.tokenInWad;
  } else throw new Error("Unsupported V24 sell action.");

  const next = assertV24VerifiedState({
    ...state,
    sequence: state.sequence + 1n,
    curveSoldTokenWad: quote.soldAfterWad,
    lockedLongTokensWad: nextLocked,
    borrowedShortTokensWad: nextBorrowed,
    perpInventoryWad: nextPerp,
    safetyInventoryWad: nextSafety,
    circulatingSpotTokensWad: nextSpot,
  });
  return {
    next,
    proof: {
      action,
      grossCurveWethWad: quote.grossCurveWethWad,
      curveTokenAmountWad: quote.tokenInWad,
      curveFeeWad: quote.feeWethWad,
      externalWethAmountWad,
      nextLockedLongTokensWad: nextLocked,
      nextBorrowedShortTokensWad: nextBorrowed,
      nextPerpInventoryWad: nextPerp,
      nextSafetyInventoryWad: nextSafety,
      nextCirculatingSpotTokensWad: nextSpot,
      marginalPriceAfterWad: quote.marginalPriceAfterWad,
      marketCapAfterWad: marketCapAtPrice(quote.marginalPriceAfterWad),
    },
  };
}

export function applyV24SpotBuy(state: V24VerifiedPoolState, grossWethWad: bigint) {
  return proofFromBuy(V24ActionKind.SpotBuy, state, quoteFixedBuy(state.curveSoldTokenWad, grossWethWad), grossWethWad);
}

export function applyV24SpotSell(state: V24VerifiedPoolState, tokenInWad: bigint) {
  const quote = quoteFixedSell(state.curveSoldTokenWad, tokenInWad);
  return proofFromSell(V24ActionKind.SpotSell, state, quote, quote.netWethWad);
}

export function applyV24OpenLong(state: V24VerifiedPoolState, notionalWethWad: bigint, collateralAndFeeWad: bigint) {
  return proofFromBuy(V24ActionKind.OpenLong, state, quoteFixedBuy(state.curveSoldTokenWad, notionalWethWad), collateralAndFeeWad);
}

export function applyV24CloseLong(state: V24VerifiedPoolState, tokenInWad: bigint, payoutWethWad: bigint, liquidated = false) {
  return proofFromSell(liquidated ? V24ActionKind.LiquidateLong : V24ActionKind.CloseLong, state, quoteFixedSell(state.curveSoldTokenWad, tokenInWad), payoutWethWad);
}

export function applyV24OpenShort(state: V24VerifiedPoolState, borrowedTokenWad: bigint, collateralAndFeeWad: bigint) {
  return proofFromSell(V24ActionKind.OpenShort, state, quoteFixedSell(state.curveSoldTokenWad, borrowedTokenWad), collateralAndFeeWad);
}

export function applyV24CloseShort(state: V24VerifiedPoolState, borrowedTokenWad: bigint, payoutWethWad: bigint, liquidated = false) {
  return proofFromBuy(
    liquidated ? V24ActionKind.LiquidateShort : V24ActionKind.CloseShort,
    state,
    quoteFixedBuyExactTokens(state.curveSoldTokenWad, borrowedTokenWad),
    payoutWethWad,
  );
}

export function v24CurveAccounting(state: V24VerifiedPoolState) {
  return {
    cumulativeWethWad: cumulativeCostWad(state.curveSoldTokenWad, DEFAULT_FIXED_CURVE_PARAMS),
    marginalPriceWad: marginalPriceWad(state.curveSoldTokenWad, DEFAULT_FIXED_CURVE_PARAMS),
  };
}
