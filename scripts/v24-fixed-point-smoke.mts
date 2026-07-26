import assert from "node:assert/strict";
import {
  FP_CURVE_ALLOCATION_WAD,
  FP_OPENING_PRICE_WAD,
  FP_TOTAL_SUPPLY_WAD,
  FP_WAD,
  cumulativeCostWad,
  marginalPriceWad,
  quoteFixedBuy,
  quoteFixedBuyExactTokens,
  quoteFixedSell,
  maxSoldWad,
  soldAtCumulativeCostWad,
  soldAtCumulativeCostExactWad,
} from "../lib/fixed-point-battle-curve.ts";
import {
  applyV24CloseLong,
  applyV24CloseShort,
  applyV24OpenLong,
  applyV24OpenShort,
  applyV24SpotBuy,
  applyV24SpotSell,
  assertV24VerifiedState,
  createV24VerifiedPoolState,
  v24LogicalTokenConservation,
} from "../lib/chain/v24-verified-action.ts";
import { createBattlePoolState, quoteCurveBuy, quoteCurveSell } from "../lib/battle-pool.ts";

const toWad = (value: number) => BigInt(Math.floor(value * 1e18));
const toNumber = (value: bigint) => Number(value) / 1e18;

assert.equal(FP_OPENING_PRICE_WAD, 250_000_000n);
assert.equal(marginalPriceWad(0n), FP_OPENING_PRICE_WAD);
assert.equal(FP_TOTAL_SUPPLY_WAD, 1_000_000_000n * FP_WAD);
assert.equal(cumulativeCostWad(0n), 0n);

for (const grossEth of [0.001, 0.01, 0.1, 1]) {
  const fixed = quoteFixedBuy(0n, toWad(grossEth));
  const floating = quoteCurveBuy(createBattlePoolState(), grossEth);
  const fixedTokens = toNumber(fixed.tokenOutWad);
  const relativeError = Math.abs(fixedTokens - floating.tokens) / floating.tokens;
  assert(relativeError < 2e-8, `Fixed buy diverged by ${relativeError} for ${grossEth} ETH.`);
  const exact = quoteFixedBuyExactTokens(0n, fixed.tokenOutWad);
  assert(exact.grossWethWad <= fixed.grossWethWad);
  assert(exact.grossWethWad + 10n >= fixed.grossWethWad);
  const exactSold = soldAtCumulativeCostExactWad(fixed.netCurveWethWad);
  assert(exactSold >= fixed.soldAfterWad && exactSold - fixed.soldAfterWad <= 10_000_000_000n);
}


let differentialSeed = 123_456_789n;
let maximumInverseUnderquote = 0n;
for (let index = 0; index < 1_000; index++) {
  differentialSeed = (differentialSeed * 1_103_515_245n + 12_345n) & ((1n << 63n) - 1n);
  const sold = maxSoldWad() * (differentialSeed % 9_000n) / 10_000n;
  const currentCost = cumulativeCostWad(sold);
  differentialSeed = (differentialSeed * 1_103_515_245n + 12_345n) & ((1n << 63n) - 1n);
  const targetCost = currentCost + (cumulativeCostWad(maxSoldWad()) - currentCost) * (differentialSeed % 10_000n) / 20_000n;
  const exactSold = soldAtCumulativeCostExactWad(targetCost);
  const fastSold = soldAtCumulativeCostWad(targetCost);
  assert(fastSold <= exactSold, "Closed-form inverse over-quoted paid inventory.");
  const difference = exactSold - fastSold;
  if (difference > maximumInverseUnderquote) maximumInverseUnderquote = difference;
}
assert(maximumInverseUnderquote <= 1_000_000_000n, `Inverse underquote exceeded one billion token-wei: ${maximumInverseUnderquote}.`);

const initial = createV24VerifiedPoolState({ poolWethWad: 4n * FP_WAD });
const genesis = applyV24SpotBuy(initial, 1n * FP_WAD);
let state = genesis.next;
assert(genesis.proof.curveTokenAmountWad > 0n);

const fixedSell = quoteFixedSell(state.curveSoldTokenWad, genesis.proof.curveTokenAmountWad / 20n);
const floatingPool = createBattlePoolState();
const floatingBuy = quoteCurveBuy(floatingPool, 1);
const floatingSell = quoteCurveSell({
  ...floatingPool,
  curveRealTokenReserve: floatingPool.curveRealTokenReserve - floatingBuy.tokens,
  curveTokenReserve: floatingPool.curveRealTokenReserve - floatingBuy.tokens,
  circulatingSpotTokens: floatingBuy.tokens,
}, floatingBuy.tokens / 20);
const sellRelativeError = Math.abs(toNumber(fixedSell.netWethWad) - floatingSell.netEth) / floatingSell.netEth;
assert(sellRelativeError < 3e-8, `Fixed sell diverged by ${sellRelativeError}.`);

const spotSell = applyV24SpotSell(state, genesis.proof.curveTokenAmountWad / 20n);
state = spotSell.next;
const longOpen = applyV24OpenLong(state, 50n * FP_WAD / 100n, 6n * FP_WAD / 100n);
state = longOpen.next;
const longCloseTokens = longOpen.proof.curveTokenAmountWad / 2n;
const longClose = applyV24CloseLong(state, longCloseTokens, 0n);
state = longClose.next;

const shortBorrow = state.curveSoldTokenWad / 30n;
const shortOpen = applyV24OpenShort(state, shortBorrow, 2n * FP_WAD / 100n);
state = shortOpen.next;
const shortClose = applyV24CloseShort(state, shortBorrow, 0n);
state = shortClose.next;

assertV24VerifiedState(state);
assert.equal(v24LogicalTokenConservation(state), FP_TOTAL_SUPPLY_WAD);
assert(state.curveSoldTokenWad < FP_CURVE_ALLOCATION_WAD);
assert.equal(state.borrowedShortTokensWad, 0n);
assert.equal(state.lockedLongTokensWad, longOpen.proof.curveTokenAmountWad - longCloseTokens);
console.log(`V24 fixed-point BattleCurve matched the floating reference, stayed conservative across 1,000 inverse vectors (max ${maximumInverseUnderquote} token-wei), and conserved all one-billion tokens across six verified actions.`);
