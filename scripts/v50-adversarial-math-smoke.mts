import assert from "node:assert/strict";
import {
  FP_BPS,
  FP_CURVE_ALLOCATION_WAD,
  FP_TRADE_FEE_BPS,
  FP_WAD,
  cumulativeCostWad,
  feeWadUp,
  maxSoldWad,
  quoteFixedBuy,
  quoteFixedSell,
} from "../lib/fixed-point-battle-curve.ts";
import {
  V49_NO_FEE_CURVE,
  guaranteedV49Obligations,
  isV49SettlementPayable,
  quoteV49Settlement,
  quoteV49ShortOpenForTarget,
  quoteV49ShortSettlement,
  type V49PositionMath,
} from "../lib/settlement-math-v49.ts";

const ETH = FP_WAD;

function rng(seed: number) {
  let state = BigInt(seed || 1);
  return () => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return Number(state >> 11n) / 2 ** 53;
  };
}

function permutations<T>(values: T[]): T[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((tail) => [value, ...tail]),
  );
}

function aggregates(positions: V49PositionMath[]) {
  return positions.reduce((result, position) => {
    if (position.direction === "long") {
      result.longTokensWad += position.tokenAmountWad;
      result.longDebtWei += position.debtWei;
    } else {
      result.borrowedShortTokensWad += position.borrowedTokensWad;
      result.shortCollateralWei += position.collateralWei;
      result.shortProceedsWei += position.lockedProceedsWei;
    }
    return result;
  }, {
    longTokensWad: 0n,
    longDebtWei: 0n,
    borrowedShortTokensWad: 0n,
    shortCollateralWei: 0n,
    shortProceedsWei: 0n,
  });
}

function obligationsAt(soldWad: bigint, positions: V49PositionMath[]) {
  const totals = aggregates(positions);
  return guaranteedV49Obligations({
    soldWad,
    borrowedShortTokensWad: totals.borrowedShortTokensWad,
    lockedLongTokensWad: totals.longTokensWad,
    lockedShortCollateralWei: totals.shortCollateralWei,
    lockedShortProceedsWei: totals.shortProceedsWei,
  });
}

// 1. Fee fragmentation cannot reduce fees or increase trader proceeds.
let fragmentationVectors = 0;
for (const soldBps of [0n, 1_000n, 4_000n, 7_500n, 9_000n]) {
  const soldStart = FP_CURVE_ALLOCATION_WAD * soldBps / FP_BPS;
  for (const grossWei of [10n ** 12n, 10n ** 14n, 10n ** 16n, 10n ** 18n]) {
    let single;
    try { single = quoteFixedBuy(soldStart, grossWei); } catch { continue; }
    for (const parts of [2, 3, 10, 100]) {
      let sold = soldStart;
      let tokens = 0n;
      let fees = 0n;
      let remainingGross = grossWei;
      let valid = true;
      for (let index = 0; index < parts; index += 1) {
        const part = index === parts - 1 ? remainingGross : grossWei / BigInt(parts);
        remainingGross -= part;
        try {
          const quote = quoteFixedBuy(sold, part);
          sold = quote.soldAfterWad;
          tokens += quote.tokenOutWad;
          fees += quote.feeWethWad;
        } catch {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      assert(fees >= single.feeWethWad, "Split buys must not pay less protocol fee than one buy.");
      assert(tokens <= single.tokenOutWad, "Split buys must not receive more inventory than one buy.");
      fragmentationVectors += 1;
    }
  }
}

for (const soldBps of [1_000n, 4_000n, 7_500n, 9_000n]) {
  const soldStart = FP_CURVE_ALLOCATION_WAD * soldBps / FP_BPS;
  const tokenIn = soldStart / 7n;
  const single = quoteFixedSell(soldStart, tokenIn);
  for (const parts of [2, 3, 10, 100]) {
    let sold = soldStart;
    let fees = 0n;
    let net = 0n;
    let remaining = tokenIn;
    for (let index = 0; index < parts; index += 1) {
      const part = index === parts - 1 ? remaining : tokenIn / BigInt(parts);
      remaining -= part;
      const quote = quoteFixedSell(sold, part);
      sold = quote.soldAfterWad;
      fees += quote.feeWethWad;
      net += quote.netWethWad;
    }
    assert(fees >= single.feeWethWad, "Split sells must not pay less protocol fee than one sell.");
    assert(net <= single.netWethWad, "Split sells must not receive more WETH than one sell.");
    fragmentationVectors += 1;
  }
}
assert(fragmentationVectors >= 70, "Expected broad fee-fragmentation coverage.");

// 2. Repeated oscillation cannot manufacture WETH.
let attackerWei = 5n * ETH;
let soldWad = 0n;
for (let cycle = 0; cycle < 500; cycle += 1) {
  const grossWei = 10n ** 13n + BigInt(cycle % 97) * 10n ** 11n;
  const buy = quoteFixedBuy(soldWad, grossWei);
  attackerWei -= grossWei;
  soldWad = buy.soldAfterWad;
  const sell = quoteFixedSell(soldWad, buy.tokenOutWad);
  attackerWei += sell.netWethWad;
  soldWad = sell.soldAfterWad;
  assert.equal(soldWad, 0n, "Oscillation must return to the original curve state.");
}
assert(attackerWei < 5n * ETH, "Repeated buy/sell oscillation must lose value, never create it.");

// 3. Last-short-standing / curve-floor scenario.
const shortEntrySoldWad = FP_CURVE_ALLOCATION_WAD / 2n;
const lastShortOpen = quoteV49ShortOpenForTarget(shortEntrySoldWad, ETH / 20n, 10n);
const lastShort: V49PositionMath = {
  direction: "short",
  borrowedTokensWad: lastShortOpen.borrowedTokensWad,
  lockedProceedsWei: lastShortOpen.lockedProceedsWei,
  collateralWei: lastShortOpen.collateralWei,
};
const floorSettlement = quoteV49ShortSettlement(0n, lastShort);
assert(floorSettlement.pnlWei > 0n, "A valid short must profit when the curve falls to its floor.");
assert(floorSettlement.pnlWei <= lastShortOpen.notionalWei, "Short profit cannot exceed original notional.");
assert(floorSettlement.payoutWei <= lastShortOpen.collateralWei + lastShortOpen.lockedProceedsWei, "Floor payout must fit reserved position funds.");
const floorBalanceWei = 10n * ETH + lastShortOpen.collateralWei + lastShortOpen.entryFeeWei;
assert(isV49SettlementPayable({ balanceWei: floorBalanceWei, payoutWei: floorSettlement.payoutWei, postCloseObligationsWei: 0n }), "The last short's maximum floor payout must be payable from reserved liquidity.");

// 4. Random mixed portfolios: every close ordering remains payable and conserved.
let portfolios = 0;
let closePermutations = 0;
let maximumPortfolioPayoutWei = 0n;
for (let seed = 1; seed <= 48; seed += 1) {
  const random = rng(seed * 7919);
  const baseSoldWad = FP_CURVE_ALLOCATION_WAD * BigInt(3_000 + Math.floor(random() * 3_500)) / FP_BPS;
  let stateSoldWad = baseSoldWad;
  let balanceWei = cumulativeCostWad(baseSoldWad, V49_NO_FEE_CURVE) + 15n * ETH;
  const positions: V49PositionMath[] = [];

  for (let attempt = 0; attempt < 80 && positions.length < 5; attempt += 1) {
    const leverage = [2n, 5n, 10n, 20n][Math.floor(random() * 4)];
    const collateralWei = BigInt(1_000_000_000_000_000 + Math.floor(random() * 15_000_000_000_000_000));
    const notionalWei = collateralWei * leverage;
    const entryFeeWei = feeWadUp(notionalWei, FP_TRADE_FEE_BPS);
    let candidate: V49PositionMath;
    let nextSoldWad: bigint;
    try {
      if (random() < 0.5) {
        const open = quoteFixedBuy(stateSoldWad, notionalWei, V49_NO_FEE_CURVE);
        candidate = {
          direction: "long",
          tokenAmountWad: open.tokenOutWad,
          debtWei: notionalWei - collateralWei,
          collateralWei,
        };
        nextSoldWad = open.soldAfterWad;
      } else {
        const open = quoteV49ShortOpenForTarget(stateSoldWad, collateralWei, leverage);
        const existingLongTokens = aggregates(positions).longTokensWad;
        if (open.soldAfterWad < existingLongTokens) continue;
        candidate = {
          direction: "short",
          borrowedTokensWad: open.borrowedTokensWad,
          lockedProceedsWei: open.lockedProceedsWei,
          collateralWei,
        };
        nextSoldWad = open.soldAfterWad;
      }
      const nextPositions = [...positions, candidate];
      const nextBalance = balanceWei + collateralWei + entryFeeWei;
      const obligations = obligationsAt(nextSoldWad, nextPositions);
      if (obligations === null) continue;
      const protectedWei = nextBalance / 100n;
      if (obligations + protectedWei > nextBalance) continue;
      positions.push(candidate);
      stateSoldWad = nextSoldWad;
      balanceWei = nextBalance;
    } catch {
      continue;
    }
  }

  if (positions.length !== 5) continue;
  const guaranteed = obligationsAt(stateSoldWad, positions);
  assert(guaranteed !== null, "Accepted portfolio must have finite guaranteed obligations.");
  let maximumOrderPayoutWei = 0n;

  for (const order of permutations(positions)) {
    let sold = stateSoldWad;
    let balance = balanceWei;
    const remaining = [...positions];
    let totalPayout = 0n;
    for (const position of order) {
      const settlement = quoteV49Settlement(sold, position);
      const index = remaining.indexOf(position);
      remaining.splice(index, 1);
      const postObligations = obligationsAt(settlement.soldAfterWad, remaining);
      assert(postObligations !== null, "Remaining close path must stay inside the curve domain.");
      assert(isV49SettlementPayable({
        balanceWei: balance,
        payoutWei: settlement.payoutWei,
        postCloseObligationsWei: postObligations,
      }), "Every accepted position close must preserve all remaining guarantees.");
      balance -= settlement.payoutWei;
      sold = settlement.soldAfterWad;
      totalPayout += settlement.payoutWei;
    }
    assert.equal(sold, baseSoldWad, "Closing all positions must restore the pre-position curve state.");
    assert(totalPayout <= guaranteed!, "Initial guaranteed obligations must cover every close ordering.");
    maximumOrderPayoutWei = maximumOrderPayoutWei > totalPayout ? maximumOrderPayoutWei : totalPayout;
    closePermutations += 1;
  }
  maximumPortfolioPayoutWei = maximumPortfolioPayoutWei > maximumOrderPayoutWei ? maximumPortfolioPayoutWei : maximumOrderPayoutWei;
  portfolios += 1;
}
assert(portfolios >= 40, "Expected at least forty valid mixed portfolios.");
assert(closePermutations >= 4_800, "Expected exhaustive five-position closing permutations.");

console.log(JSON.stringify({
  version: "v50-adversarial-math",
  fragmentationVectors,
  oscillationCycles: 500,
  lastShortFloorPayoutWei: floorSettlement.payoutWei.toString(),
  lastShortFloorPnlWei: floorSettlement.pnlWei.toString(),
  portfolios,
  closePermutations,
  maximumPortfolioPayoutWei: maximumPortfolioPayoutWei.toString(),
  result: "PASS",
}, null, 2));
