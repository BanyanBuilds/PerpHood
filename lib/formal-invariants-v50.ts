import {
  assertBattlePool,
  positionObligationsWeth,
  protectedWeth,
  totalTokenConservation,
  type BattlePoolState,
} from "./battle-pool.ts";
import type { Position } from "./types.ts";

export const V50_INVARIANT_VERSION = "v50-formal-invariants";

export type V50PositionBookTotals = {
  collateralEth: number;
  longCollateralEth: number;
  shortCollateralEth: number;
  longDebtEth: number;
  longTokens: number;
  borrowedShortTokens: number;
  shortProceedsEth: number;
};

export type V50InvariantSnapshot = {
  tokenConservation: number;
  totalSupply: number;
  positionObligationsEth: number;
  protectedWethEth: number;
  realWethBalanceEth: number;
  freeAfterGuaranteesEth: number;
  book: V50PositionBookTotals;
};

const EPSILON_ETH = 1e-8;
const EPSILON_TOKENS = 0.5;

export function sumV50PositionBook(positions: Position[]): V50PositionBookTotals {
  return positions.reduce<V50PositionBookTotals>((totals, position) => {
    totals.collateralEth += position.collateral;
    if (position.direction === "long") {
      totals.longCollateralEth += position.collateral;
      totals.longDebtEth += Math.max(0, position.debtEth ?? position.notional - position.collateral);
      totals.longTokens += Math.max(0, position.tokenAmount ?? 0);
    } else {
      totals.shortCollateralEth += position.collateral;
      totals.borrowedShortTokens += Math.max(0, position.borrowedTokens ?? 0);
      totals.shortProceedsEth += Math.max(0, position.lockedProceedsEth ?? 0);
    }
    return totals;
  }, {
    collateralEth: 0,
    longCollateralEth: 0,
    shortCollateralEth: 0,
    longDebtEth: 0,
    longTokens: 0,
    borrowedShortTokens: 0,
    shortProceedsEth: 0,
  });
}

function assertNear(actual: number, expected: number, tolerance: number, label: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: ${actual} != ${expected} (tolerance ${tolerance}).`);
  }
}

/**
 * Stronger V50 invariant check that binds the aggregate pool ledgers to the
 * actual active position book. V49 protected aggregate solvency; V50 also
 * proves that no aggregate bucket can drift away from its underlying records.
 */
export function assertV50PositionBook(pool: BattlePoolState, positions: Position[]) {
  const book = sumV50PositionBook(positions);
  assertNear(pool.lockedCollateralEth, book.collateralEth, EPSILON_ETH, "Total collateral ledger drift");
  assertNear(pool.lockedLongCollateralEth, book.longCollateralEth, EPSILON_ETH, "Long collateral ledger drift");
  assertNear(pool.lockedShortCollateralEth, book.shortCollateralEth, EPSILON_ETH, "Short collateral ledger drift");
  assertNear(pool.syntheticLongCreditEth, book.longDebtEth, EPSILON_ETH, "Long debt ledger drift");
  assertNear(pool.lockedLongTokens, book.longTokens, EPSILON_TOKENS, "Long token ledger drift");
  assertNear(pool.borrowedShortTokens, book.borrowedShortTokens, EPSILON_TOKENS, "Short borrow ledger drift");
  assertNear(pool.lockedShortProceedsEth, book.shortProceedsEth, EPSILON_ETH, "Short proceeds ledger drift");
  return book;
}

export function snapshotV50Invariants(pool: BattlePoolState, positions: Position[]): V50InvariantSnapshot {
  assertBattlePool(pool);
  const book = assertV50PositionBook(pool, positions);
  const obligations = positionObligationsWeth(pool);
  const protectedAmount = protectedWeth(pool);
  const freeAfterGuarantees = pool.realWethBalance - obligations - protectedAmount;
  if (!Number.isFinite(obligations)) throw new Error("Position obligations are not finite.");
  if (freeAfterGuarantees < -EPSILON_ETH) throw new Error("Guaranteed liabilities exceed real BattlePool WETH.");
  return {
    tokenConservation: totalTokenConservation(pool),
    totalSupply: pool.totalSupply,
    positionObligationsEth: obligations,
    protectedWethEth: protectedAmount,
    realWethBalanceEth: pool.realWethBalance,
    freeAfterGuaranteesEth: Math.max(0, freeAfterGuarantees),
    book,
  };
}

export function assertV50ExternalEthConservation(
  pool: BattlePoolState,
  actorCashEth: Iterable<number>,
  initialSystemEth: number,
) {
  let current = pool.realWethBalance;
  for (const balance of actorCashEth) {
    if (!Number.isFinite(balance) || balance < -EPSILON_ETH) throw new Error("Actor cash ledger became invalid.");
    current += balance;
  }
  assertNear(current, initialSystemEth, 2e-7, "External ETH conservation failed");
  return current;
}
