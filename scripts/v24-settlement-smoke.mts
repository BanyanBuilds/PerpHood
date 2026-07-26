import assert from "node:assert/strict";
import { applyV24SpotBuy, createV24VerifiedPoolState } from "../lib/chain/v24-verified-action.ts";
import { encodeV24VerifiedAuthorizedSettlement } from "../lib/chain/v24-settlement.ts";
import { functionSelector } from "../lib/chain/keccak.ts";
import { COMMIT_V24_VERIFIED_AUTHORIZED_SIGNATURE } from "../lib/chain/v24-settlement.ts";
import { FP_WAD } from "../lib/fixed-point-battle-curve.ts";

const zero = `0x${"00".repeat(32)}` as const;
const account = "0x00000000000000000000000000000000000a11ce" as const;
const initial = createV24VerifiedPoolState({ poolWethWad: 2n * FP_WAD, stateHash: `0x${"11".repeat(32)}` });
const fill = applyV24SpotBuy(initial, FP_WAD / 100n);
const settlement = {
  expectedSequence: 1n,
  expectedPreviousStateHash: initial.stateHash,
  sessionId: `0x${"22".repeat(32)}` as const,
  sessionNonce: 0n,
  intentNotionalWad: FP_WAD / 100n,
  intentDeadline: 2_000_000_000n,
  frame: {
    marketId: `0x${"33".repeat(32)}` as const,
    action: fill.proof.action,
    marginalPriceWad: fill.proof.marginalPriceAfterWad,
    marketCapWad: fill.proof.marketCapAfterWad,
    reservedWethWad: 0n,
    openInterestLongWad: 0n,
    openInterestShortWad: 0n,
    positionsRoot: zero,
    balancesRoot: zero,
    intentHash: `0x${"44".repeat(32)}` as const,
  },
  proof: fill.proof,
  account,
  accountWethDeltaWad: -FP_WAD / 100n,
  accountTokenDelta: fill.proof.curveTokenAmountWad,
  poolWethDeltaWad: FP_WAD / 100n,
  poolTokenDelta: -fill.proof.curveTokenAmountWad,
};
const calldata = encodeV24VerifiedAuthorizedSettlement(settlement);
assert.equal(calldata.slice(0, 10), functionSelector(COMMIT_V24_VERIFIED_AUTHORIZED_SIGNATURE));
assert.equal((calldata.length - 2) / 2, 4 + 30 * 32);
assert.throws(() => encodeV24VerifiedAuthorizedSettlement({ ...settlement, poolWethDeltaWad: 0n }), /do not conserve/);
console.log(`V24 verified settlement encoded ${((calldata.length - 2) / 2).toLocaleString()} bytes with proof-derived price and conserved deltas.`);
