import { encodeAddress, encodeBytes32, encodeCall, encodeInt, encodeUint, type Hex } from "./abi.ts";
import type { V24CurveActionProof } from "./v24-verified-action.ts";

export const COMMIT_V24_VERIFIED_AUTHORIZED_SIGNATURE = "commitVerifiedAuthorizedFrame(uint64,bytes32,bytes32,uint64,uint256,uint64,(bytes32,uint8,uint256,uint256,uint256,uint256,uint256,bytes32,bytes32,bytes32),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),address,int256,int256,int256,int256)";

export type V24FrameInput = {
  marketId: Hex;
  action: number;
  marginalPriceWad: bigint;
  marketCapWad: bigint;
  reservedWethWad: bigint;
  openInterestLongWad: bigint;
  openInterestShortWad: bigint;
  positionsRoot: Hex;
  balancesRoot: Hex;
  intentHash: Hex;
};

export type V24VerifiedAuthorizedSettlement = {
  expectedSequence: bigint;
  expectedPreviousStateHash: Hex;
  sessionId: Hex;
  sessionNonce: bigint;
  intentNotionalWad: bigint;
  intentDeadline: bigint;
  frame: V24FrameInput;
  proof: V24CurveActionProof;
  account: Hex;
  accountWethDeltaWad: bigint;
  accountTokenDelta: bigint;
  poolWethDeltaWad: bigint;
  poolTokenDelta: bigint;
};

export function assertV24VerifiedSettlement(settlement: V24VerifiedAuthorizedSettlement) {
  if (settlement.expectedSequence <= 0n) throw new Error("V24 settlement sequence must be positive.");
  if (settlement.sessionNonce < 0n || settlement.intentDeadline <= 0n || settlement.intentNotionalWad <= 0n) throw new Error("Invalid V24 signed intent boundary.");
  if (settlement.accountWethDeltaWad + settlement.poolWethDeltaWad !== 0n) throw new Error("V24 WETH deltas do not conserve.");
  if (settlement.accountTokenDelta + settlement.poolTokenDelta !== 0n) throw new Error("V24 token deltas do not conserve.");
  if (settlement.frame.action !== settlement.proof.action) throw new Error("V24 frame/proof action mismatch.");
  if (settlement.frame.marginalPriceWad !== settlement.proof.marginalPriceAfterWad) throw new Error("V24 frame price is not proof-derived.");
  if (settlement.frame.marketCapWad !== settlement.proof.marketCapAfterWad) throw new Error("V24 frame market cap is not proof-derived.");
  return settlement;
}

export function encodeV24VerifiedAuthorizedSettlement(settlement: V24VerifiedAuthorizedSettlement) {
  assertV24VerifiedSettlement(settlement);
  const { frame, proof } = settlement;
  return encodeCall(COMMIT_V24_VERIFIED_AUTHORIZED_SIGNATURE, [
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
    encodeUint(proof.grossCurveWethWad),
    encodeUint(proof.curveTokenAmountWad),
    encodeUint(proof.curveFeeWad),
    encodeUint(proof.externalWethAmountWad),
    encodeUint(proof.nextLockedLongTokensWad),
    encodeUint(proof.nextBorrowedShortTokensWad),
    encodeUint(proof.nextPerpInventoryWad),
    encodeUint(proof.nextSafetyInventoryWad),
    encodeUint(proof.nextCirculatingSpotTokensWad),
    encodeAddress(settlement.account),
    encodeInt(settlement.accountWethDeltaWad),
    encodeInt(settlement.accountTokenDelta),
    encodeInt(settlement.poolWethDeltaWad),
    encodeInt(settlement.poolTokenDelta),
  ]);
}
