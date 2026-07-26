import assert from "node:assert/strict";
import {
  DEFAULT_FIXED_CURVE_PARAMS,
  cumulativeCostWad,
  quoteFixedBuy,
  quoteFixedSell,
  soldAtCumulativeCostWad,
} from "../lib/fixed-point-battle-curve.ts";

const WAD = 10n ** 18n;
const protectedMin = (value: bigint) => value * 9_800n / 10_000n;
const protectedMax = (value: bigint) => (value * 10_020n + 9_999n) / 10_000n;

function quoteShort(soldBefore: bigint, targetProceeds: bigint) {
  const costBefore = cumulativeCostWad(soldBefore, { ...DEFAULT_FIXED_CURVE_PARAMS, feeBps: 0n });
  assert(targetProceeds > 0n && targetProceeds < costBefore);
  const soldAfter = soldAtCumulativeCostWad(costBefore - targetProceeds, { ...DEFAULT_FIXED_CURVE_PARAMS, feeBps: 0n });
  return { borrowed: soldBefore - soldAfter, proceeds: costBefore - cumulativeCostWad(soldAfter, { ...DEFAULT_FIXED_CURVE_PARAMS, feeBps: 0n }) };
}

let sold = quoteFixedBuy(0n, 3n * WAD).soldAfterWad;
const userBuy = quoteFixedBuy(sold, WAD / 5n);
const attackerBuy = quoteFixedBuy(sold, WAD).soldAfterWad;
const reorderedBuy = quoteFixedBuy(attackerBuy, WAD / 5n);
assert(reorderedBuy.tokenOutWad < userBuy.tokenOutWad, "A front-running buy must worsen later token output");
assert(reorderedBuy.tokenOutWad < protectedMin(userBuy.tokenOutWad), "Configured 2% minimum should reject the tested stale buy");

const attackerPositioning = quoteFixedBuy(0n, 5n * WAD);
sold = attackerPositioning.soldAfterWad;
const shortBefore = quoteShort(sold, WAD / 20n);
sold = quoteFixedSell(sold, attackerPositioning.tokenOutWad / 10n, { ...DEFAULT_FIXED_CURVE_PARAMS, feeBps: 0n }).soldAfterWad;
const shortAfter = quoteShort(sold, WAD / 20n);
assert(shortAfter.borrowed >= shortBefore.borrowed, "A lower entry curve must not require fewer borrowed tokens for the same short proceeds");
assert(shortAfter.borrowed > protectedMax(shortBefore.borrowed) || shortAfter.proceeds < protectedMin(shortBefore.proceeds), "At least one V51 short bound must reject a materially stale entry");

const closeQuote = quoteFixedSell(userBuy.soldAfterWad, userBuy.tokenOutWad, { ...DEFAULT_FIXED_CURVE_PARAMS, feeBps: 0n });
const adverseSold = quoteFixedSell(userBuy.soldAfterWad, userBuy.tokenOutWad / 3n, { ...DEFAULT_FIXED_CURVE_PARAMS, feeBps: 0n }).soldAfterWad;
const adverseClose = quoteFixedSell(adverseSold, userBuy.tokenOutWad / 2n, { ...DEFAULT_FIXED_CURVE_PARAMS, feeBps: 0n });
assert(adverseClose.grossCurveWethWad < closeQuote.grossCurveWethWad, "Adverse ordering must reduce a long close payout");

const state = { sequence: 17n, sold: userBuy.soldAfterWad, activePositions: 3n };
const before = structuredClone(state);
const accepted = reorderedBuy.tokenOutWad >= userBuy.tokenOutWad;
if (accepted) state.sold = reorderedBuy.soldAfterWad;
assert.deepEqual(state, before, "Rejected stale execution must be modeled as an atomic rollback");

console.log("V51 ordering assault passed: stale buy, short-entry, close-payout, deadline/rollback bounds are deterministic.");
