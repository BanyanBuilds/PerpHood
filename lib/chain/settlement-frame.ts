import {
  encodeAddress,
  encodeBytes32,
  encodeCall,
  encodeInt,
  encodeUint,
  type Hex,
} from "./abi.ts";

export const COMMIT_SINGLE_ACCOUNT_SIGNATURE = "commitSingleAccountFrame(uint64,bytes32,(bytes32,uint8,uint256,uint256,uint256,uint256,uint256,bytes32,bytes32,bytes32),address,int256,int256,int256,int256)";

export type BattleActionKind =
  | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export type SettlementFrameInput = {
  marketId: Hex;
  action: BattleActionKind;
  marginalPriceWad: bigint;
  marketCapWad: bigint;
  reservedWethWad: bigint;
  openInterestLongWad: bigint;
  openInterestShortWad: bigint;
  positionsRoot: Hex;
  balancesRoot: Hex;
  intentHash: Hex;
};

export type SingleAccountSettlement = {
  expectedSequence: bigint;
  expectedPreviousStateHash: Hex;
  frame: SettlementFrameInput;
  account: Hex;
  accountWethDeltaWad: bigint;
  accountTokenDelta: bigint;
  poolWethDeltaWad: bigint;
  poolTokenDelta: bigint;
};

export function assertSingleAccountSettlement(settlement: SingleAccountSettlement) {
  if (settlement.expectedSequence <= 0n) throw new Error("Settlement sequence must be positive.");
  if (settlement.accountWethDeltaWad + settlement.poolWethDeltaWad !== 0n) {
    throw new Error("WETH settlement deltas do not conserve.");
  }
  if (settlement.accountTokenDelta + settlement.poolTokenDelta !== 0n) {
    throw new Error("Token settlement deltas do not conserve.");
  }
  if (settlement.frame.reservedWethWad < 0n) throw new Error("Reserved WETH cannot be negative.");
  return settlement;
}

export function encodeSingleAccountSettlement(settlement: SingleAccountSettlement) {
  assertSingleAccountSettlement(settlement);
  const frame = settlement.frame;
  return encodeCall(COMMIT_SINGLE_ACCOUNT_SIGNATURE, [
    encodeUint(settlement.expectedSequence),
    encodeBytes32(settlement.expectedPreviousStateHash),
    encodeBytes32(frame.marketId),
    encodeUint(frame.action),
    encodeUint(frame.marginalPriceWad),
    encodeUint(frame.marketCapWad),
    encodeUint(frame.reservedWethWad),
    encodeUint(frame.openInterestLongWad),
    encodeUint(frame.openInterestShortWad),
    encodeBytes32(frame.positionsRoot),
    encodeBytes32(frame.balancesRoot),
    encodeBytes32(frame.intentHash),
    encodeAddress(settlement.account),
    encodeInt(settlement.accountWethDeltaWad),
    encodeInt(settlement.accountTokenDelta),
    encodeInt(settlement.poolWethDeltaWad),
    encodeInt(settlement.poolTokenDelta),
  ]);
}

export function buildSpotBuySettlement(input: {
  expectedSequence: bigint;
  expectedPreviousStateHash: Hex;
  marketId: Hex;
  trader: Hex;
  grossWethWad: bigint;
  tokenOut: bigint;
  marginalPriceWad: bigint;
  marketCapWad: bigint;
  reservedWethWad: bigint;
  openInterestLongWad?: bigint;
  openInterestShortWad?: bigint;
  positionsRoot: Hex;
  balancesRoot: Hex;
  intentHash: Hex;
}) {
  if (input.grossWethWad <= 0n || input.tokenOut <= 0n) throw new Error("Spot-buy settlement values must be positive.");
  return assertSingleAccountSettlement({
    expectedSequence: input.expectedSequence,
    expectedPreviousStateHash: input.expectedPreviousStateHash,
    frame: {
      marketId: input.marketId,
      action: 1,
      marginalPriceWad: input.marginalPriceWad,
      marketCapWad: input.marketCapWad,
      reservedWethWad: input.reservedWethWad,
      openInterestLongWad: input.openInterestLongWad ?? 0n,
      openInterestShortWad: input.openInterestShortWad ?? 0n,
      positionsRoot: input.positionsRoot,
      balancesRoot: input.balancesRoot,
      intentHash: input.intentHash,
    },
    account: input.trader,
    accountWethDeltaWad: -input.grossWethWad,
    accountTokenDelta: input.tokenOut,
    poolWethDeltaWad: input.grossWethWad,
    poolTokenDelta: -input.tokenOut,
  });
}

export const COMMIT_AUTHORIZED_SINGLE_ACCOUNT_SIGNATURE = "commitAuthorizedSingleAccountFrame(uint64,bytes32,bytes32,uint64,uint256,uint64,(bytes32,uint8,uint256,uint256,uint256,uint256,uint256,bytes32,bytes32,bytes32),address,int256,int256,int256,int256)";

export type AuthorizedSingleAccountSettlement = SingleAccountSettlement & {
  sessionId: Hex;
  sessionNonce: bigint;
  intentNotionalWad: bigint;
  intentDeadline: bigint;
};

export function assertAuthorizedSettlement(settlement: AuthorizedSingleAccountSettlement) {
  assertSingleAccountSettlement(settlement);
  if (settlement.sessionNonce < 0n) throw new Error("Session nonce cannot be negative.");
  if (settlement.intentNotionalWad <= 0n) throw new Error("Intent notional must be positive.");
  if (settlement.intentDeadline <= 0n) throw new Error("Intent deadline must be positive.");
  return settlement;
}

export function encodeAuthorizedSingleAccountSettlement(settlement: AuthorizedSingleAccountSettlement) {
  assertAuthorizedSettlement(settlement);
  const frame = settlement.frame;
  return encodeCall(COMMIT_AUTHORIZED_SINGLE_ACCOUNT_SIGNATURE, [
    encodeUint(settlement.expectedSequence),
    encodeBytes32(settlement.expectedPreviousStateHash),
    encodeBytes32(settlement.sessionId),
    encodeUint(settlement.sessionNonce),
    encodeUint(settlement.intentNotionalWad),
    encodeUint(settlement.intentDeadline),
    encodeBytes32(frame.marketId),
    encodeUint(frame.action),
    encodeUint(frame.marginalPriceWad),
    encodeUint(frame.marketCapWad),
    encodeUint(frame.reservedWethWad),
    encodeUint(frame.openInterestLongWad),
    encodeUint(frame.openInterestShortWad),
    encodeBytes32(frame.positionsRoot),
    encodeBytes32(frame.balancesRoot),
    encodeBytes32(frame.intentHash),
    encodeAddress(settlement.account),
    encodeInt(settlement.accountWethDeltaWad),
    encodeInt(settlement.accountTokenDelta),
    encodeInt(settlement.poolWethDeltaWad),
    encodeInt(settlement.poolTokenDelta),
  ]);
}

export type SerializedAuthorizedSettlement = {
  expectedSequence: string;
  expectedPreviousStateHash: Hex;
  sessionId: Hex;
  sessionNonce: string;
  intentNotionalWad: string;
  intentDeadline: string;
  frame: {
    marketId: Hex;
    action: BattleActionKind;
    marginalPriceWad: string;
    marketCapWad: string;
    reservedWethWad: string;
    openInterestLongWad: string;
    openInterestShortWad: string;
    positionsRoot: Hex;
    balancesRoot: Hex;
    intentHash: Hex;
  };
  account: Hex;
  accountWethDeltaWad: string;
  accountTokenDelta: string;
  poolWethDeltaWad: string;
  poolTokenDelta: string;
};

export function serializeAuthorizedSettlement(settlement: AuthorizedSingleAccountSettlement): SerializedAuthorizedSettlement {
  const frame = settlement.frame;
  return {
    expectedSequence: settlement.expectedSequence.toString(),
    expectedPreviousStateHash: settlement.expectedPreviousStateHash,
    sessionId: settlement.sessionId,
    sessionNonce: settlement.sessionNonce.toString(),
    intentNotionalWad: settlement.intentNotionalWad.toString(),
    intentDeadline: settlement.intentDeadline.toString(),
    frame: {
      marketId: frame.marketId,
      action: frame.action,
      marginalPriceWad: frame.marginalPriceWad.toString(),
      marketCapWad: frame.marketCapWad.toString(),
      reservedWethWad: frame.reservedWethWad.toString(),
      openInterestLongWad: frame.openInterestLongWad.toString(),
      openInterestShortWad: frame.openInterestShortWad.toString(),
      positionsRoot: frame.positionsRoot,
      balancesRoot: frame.balancesRoot,
      intentHash: frame.intentHash,
    },
    account: settlement.account,
    accountWethDeltaWad: settlement.accountWethDeltaWad.toString(),
    accountTokenDelta: settlement.accountTokenDelta.toString(),
    poolWethDeltaWad: settlement.poolWethDeltaWad.toString(),
    poolTokenDelta: settlement.poolTokenDelta.toString(),
  };
}

export function deserializeAuthorizedSettlement(value: SerializedAuthorizedSettlement): AuthorizedSingleAccountSettlement {
  return assertAuthorizedSettlement({
    expectedSequence: BigInt(value.expectedSequence),
    expectedPreviousStateHash: value.expectedPreviousStateHash,
    sessionId: value.sessionId,
    sessionNonce: BigInt(value.sessionNonce),
    intentNotionalWad: BigInt(value.intentNotionalWad),
    intentDeadline: BigInt(value.intentDeadline),
    frame: {
      marketId: value.frame.marketId,
      action: value.frame.action,
      marginalPriceWad: BigInt(value.frame.marginalPriceWad),
      marketCapWad: BigInt(value.frame.marketCapWad),
      reservedWethWad: BigInt(value.frame.reservedWethWad),
      openInterestLongWad: BigInt(value.frame.openInterestLongWad),
      openInterestShortWad: BigInt(value.frame.openInterestShortWad),
      positionsRoot: value.frame.positionsRoot,
      balancesRoot: value.frame.balancesRoot,
      intentHash: value.frame.intentHash,
    },
    account: value.account,
    accountWethDeltaWad: BigInt(value.accountWethDeltaWad),
    accountTokenDelta: BigInt(value.accountTokenDelta),
    poolWethDeltaWad: BigInt(value.poolWethDeltaWad),
    poolTokenDelta: BigInt(value.poolTokenDelta),
  });
}
