import {
  battlePriceEth,
  executeSequencedOpenPosition,
  executeSequencedPositionClose,
  executeSequencedSpotBuy,
  executeSequencedSpotSell,
  positionObligationsWeth,
  type BattlePoolState,
} from "../battle-pool.ts";
import type { Position } from "../types.ts";
import type { Hex } from "./abi.ts";
import type { LocalBattleState } from "./local-battle-client.ts";
import { keccak256 } from "./keccak.ts";
import type { SignedTradingIntent } from "./session-key.ts";
import {
  assertAuthorizedSettlement,
  type AuthorizedSingleAccountSettlement,
  type BattleActionKind,
} from "./settlement-frame.ts";
import { TradingAction, isUserTradingAction, tradingActionLabel } from "./trading-actions.ts";

const TOTAL_SUPPLY_WHOLE = 1_000_000_000;
const WAD = 1e18;

function toWad(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid.`);
  return BigInt(Math.floor(value * WAD + 1e-6));
}

function wadToNumber(value: bigint, label: string) {
  if (value < 0n) throw new Error(`${label} cannot be negative.`);
  const result = Number(value) / WAD;
  if (!Number.isFinite(result)) throw new Error(`${label} is too large.`);
  return result;
}

function tokenAmountToWad(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Token amount is invalid.");
  return BigInt(Math.floor(value * WAD));
}

export function buildEngineStateRoot(label: string, pool: BattlePoolState, positions: Position[], intentHash: Hex) {
  return keccak256(JSON.stringify({
    label,
    version: pool.battlePoolVersion,
    curveTokenReserve: pool.curveTokenReserve,
    curveRealTokenReserve: pool.curveRealTokenReserve,
    realWethBalance: pool.realWethBalance,
    lockedCollateralEth: pool.lockedCollateralEth,
    lockedLongCollateralEth: pool.lockedLongCollateralEth,
    lockedShortCollateralEth: pool.lockedShortCollateralEth,
    lockedShortProceedsEth: pool.lockedShortProceedsEth,
    syntheticLongCreditEth: pool.syntheticLongCreditEth,
    lockedLongTokens: pool.lockedLongTokens,
    borrowedShortTokens: pool.borrowedShortTokens,
    circulatingSpotTokens: pool.circulatingSpotTokens,
    poolFeesEth: pool.poolFeesEth,
    liquidationEquityEth: pool.liquidationEquityEth,
    badDebtEth: pool.badDebtEth,
    positions: positions
      .map((position) => ({
        id: position.id,
        owner: position.owner?.toLowerCase() ?? "",
        direction: position.direction,
        notional: position.notional,
        collateral: position.collateral,
        leverage: position.leverage,
        tokenAmount: position.tokenAmount ?? 0,
        debtEth: position.debtEth ?? 0,
        borrowedTokens: position.borrowedTokens ?? 0,
        lockedProceedsEth: position.lockedProceedsEth ?? 0,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    intentHash,
  }));
}

function openInterest(positions: Position[], direction: "long" | "short") {
  return positions.reduce((sum, position) => sum + (position.direction === direction ? position.notional : 0), 0);
}

function assertPriceProtection(action: number, priceAfterWad: bigint, limitPriceWad: bigint) {
  if (limitPriceWad <= 0n) return;
  const buySide = action === TradingAction.SpotBuy
    || action === TradingAction.OpenLong
    || action === TradingAction.CloseShort;
  if (buySide && priceAfterWad > limitPriceWad) throw new Error("Signed maximum price would be exceeded.");
  if (!buySide && priceAfterWad < limitPriceWad) throw new Error("Signed minimum price would be crossed.");
}

function assertChainAlignment(input: {
  chainState: LocalBattleState;
  nextPool: BattlePoolState;
  poolWethDeltaWad: bigint;
  poolTokenDelta: bigint;
}) {
  const expectedWeth = input.chainState.poolWethWad + input.poolWethDeltaWad;
  const expectedToken = input.chainState.poolTokenAmount + input.poolTokenDelta;
  const engineWeth = toWad(input.nextPool.realWethBalance, "Engine WETH");
  const engineToken = tokenAmountToWad(input.nextPool.totalSupply - input.nextPool.circulatingSpotTokens);
  const wethTolerance = 10_000_000_000n;
  const tokenTolerance = 1_000_000_000_000n;
  if (expectedWeth < 0n || expectedToken < 0n) throw new Error("Settlement would create negative physical custody.");
  if (expectedWeth > engineWeth + wethTolerance || engineWeth > expectedWeth + wethTolerance) {
    throw new Error("Engine WETH does not reconcile with authoritative custody deltas.");
  }
  if (expectedToken > engineToken + tokenTolerance || engineToken > expectedToken + tokenTolerance) {
    throw new Error(`Engine token custody does not reconcile with spot balances: expected ${expectedToken}, engine ${engineToken}, diff ${expectedToken - engineToken}.`);
  }
}

export type SponsoredTradeQuote = {
  action: number;
  actionLabel: string;
  priceBeforeWad: bigint;
  priceAfterWad: bigint;
  marketCapAfterWad: bigint;
  priceImpactBps: bigint;
  executionSteps: number;
  liquidationCount: number;
  nextPool: BattlePoolState;
  remainingPositions: Position[];
  settlement: AuthorizedSingleAccountSettlement;
  accountWethDeltaWad: bigint;
  accountTokenDelta: bigint;
  grossWethWad: bigint;
  netWethWad: bigint;
  feeWad: bigint;
  tokenAmountWad: bigint;
  payoutWad: bigint;
  position?: Position;
  closedPositionId?: string;
};

export function buildSponsoredTradeQuote(input: {
  chainState: LocalBattleState;
  enginePool: BattlePoolState;
  positions: Position[];
  signedIntent: SignedTradingIntent;
  sessionNonce: number;
}): SponsoredTradeQuote {
  const { chainState, signedIntent } = input;
  const intent = signedIntent.intent;
  if (intent.version !== 23) throw new Error("V23 relay requires a V23 signed intent.");
  if (!isUserTradingAction(intent.action)) throw new Error("Only user trading actions 1 through 6 may use the session relay.");

  const signedNotionalWad = BigInt(intent.notionalWad);
  const signedCollateralWad = BigInt(intent.collateralWad);
  const signedTokenWad = BigInt(intent.tokenAmountWad);
  if (signedNotionalWad <= 0n) throw new Error("Signed notional must be positive.");
  if (!Number.isInteger(intent.leverageBps) || intent.leverageBps < 10_000 || intent.leverageBps > 200_000) {
    throw new Error("Leverage must remain between 1× and 20×.");
  }
  if (!Number.isInteger(intent.reduceFractionBps) || intent.reduceFractionBps < 1 || intent.reduceFractionBps > 10_000) {
    throw new Error("Close fraction must remain between 0.01% and 100%.");
  }

  let nextPool = input.enginePool;
  let remainingPositions = input.positions;
  let accountWethDeltaWad = 0n;
  let accountTokenDelta = 0n;
  let grossWethWad = 0n;
  let netWethWad = 0n;
  let feeWad = 0n;
  let tokenAmountWad = 0n;
  let payoutWad = 0n;
  let executionSteps = 0;
  let liquidationCount = 0;
  let priceImpactPercent = 0;
  let startPriceEth = battlePriceEth(input.enginePool);
  let endPriceEth = startPriceEth;
  let position: Position | undefined;
  let closedPositionId: string | undefined;

  switch (intent.action) {
    case TradingAction.SpotBuy: {
      const execution = executeSequencedSpotBuy(input.enginePool, wadToNumber(signedNotionalWad, "Spot-buy notional"), input.positions);
      nextPool = execution.next;
      remainingPositions = execution.remainingPositions;
      grossWethWad = signedNotionalWad;
      netWethWad = toWad(execution.netEth, "Spot-buy net amount");
      feeWad = toWad(execution.feeEth, "Spot-buy fee");
      tokenAmountWad = tokenAmountToWad(execution.tokens);
      accountWethDeltaWad = -grossWethWad;
      accountTokenDelta = tokenAmountWad;
      executionSteps = execution.steps;
      liquidationCount = execution.liquidationEvents.length;
      priceImpactPercent = execution.priceImpactPercent;
      startPriceEth = execution.startPriceEth;
      endPriceEth = execution.endPriceEth;
      break;
    }
    case TradingAction.SpotSell: {
      if (signedTokenWad <= 0n) throw new Error("Spot-sell token amount must be positive.");
      const execution = executeSequencedSpotSell(input.enginePool, wadToNumber(signedTokenWad, "Spot-sell token amount"), input.positions);
      nextPool = execution.next;
      remainingPositions = execution.remainingPositions;
      grossWethWad = toWad(execution.grossEth, "Spot-sell gross output");
      netWethWad = toWad(execution.netEth, "Spot-sell output");
      feeWad = toWad(execution.feeEth, "Spot-sell fee");
      tokenAmountWad = signedTokenWad;
      accountWethDeltaWad = netWethWad;
      accountTokenDelta = -signedTokenWad;
      executionSteps = execution.steps;
      liquidationCount = execution.liquidationEvents.length;
      priceImpactPercent = execution.priceImpactPercent;
      startPriceEth = execution.startPriceEth;
      endPriceEth = execution.endPriceEth;
      break;
    }
    case TradingAction.OpenLong:
    case TradingAction.OpenShort: {
      if (signedCollateralWad <= 0n) throw new Error("Position collateral must be positive.");
      const leverage = intent.leverageBps / 10_000;
      const expectedNotionalWad = signedCollateralWad * BigInt(intent.leverageBps) / 10_000n;
      const tolerance = 10_000_000_000n;
      if (signedNotionalWad + tolerance < expectedNotionalWad || signedNotionalWad > expectedNotionalWad + tolerance) {
        throw new Error("Signed notional does not match collateral × leverage.");
      }
      const execution = executeSequencedOpenPosition(input.enginePool, input.positions, {
        id: `v23-${signedIntent.intentHash.slice(2, 18)}`,
        owner: intent.owner,
        clientOrderId: intent.clientOrderId,
        direction: intent.action === TradingAction.OpenLong ? "long" : "short",
        collateralEth: wadToNumber(signedCollateralWad, "Position collateral"),
        leverage,
      });
      nextPool = execution.next;
      remainingPositions = execution.remainingPositions;
      position = execution.position;
      grossWethWad = toWad(execution.notionalEth, "Position notional");
      feeWad = toWad(execution.feeEth, "Position fee");
      accountWethDeltaWad = -(signedCollateralWad + feeWad);
      executionSteps = execution.steps;
      liquidationCount = execution.liquidationEvents.length;
      priceImpactPercent = execution.priceImpactPercent;
      startPriceEth = execution.startPriceEth;
      endPriceEth = execution.endPriceEth;
      break;
    }
    case TradingAction.CloseLong:
    case TradingAction.CloseShort: {
      if (!intent.positionId) throw new Error("A position ID is required for a close intent.");
      const existing = input.positions.find((candidate) => candidate.id === intent.positionId);
      if (!existing) throw new Error("The requested position no longer exists.");
      const expectedDirection = intent.action === TradingAction.CloseLong ? "long" : "short";
      if (existing.direction !== expectedDirection) throw new Error(`This intent cannot close a ${existing.direction} position.`);
      if (existing.owner && existing.owner.toLowerCase() !== intent.owner.toLowerCase()) throw new Error("Position belongs to another account.");
      const fraction = intent.reduceFractionBps / 10_000;
      const closeNotionalWad = toWad(existing.notional * fraction, "Close notional");
      if (closeNotionalWad > signedNotionalWad + 10_000_000_000n) throw new Error("Close exceeds the signed notional limit.");
      const execution = executeSequencedPositionClose(input.enginePool, input.positions, {
        positionId: intent.positionId,
        owner: intent.owner,
        fraction,
      });
      nextPool = execution.next;
      remainingPositions = execution.remainingPositions;
      payoutWad = toWad(execution.payoutEth, "Position payout");
      feeWad = toWad(execution.feeEth, "Position close fee");
      accountWethDeltaWad = payoutWad;
      executionSteps = execution.steps;
      liquidationCount = execution.liquidationEvents.length;
      priceImpactPercent = execution.priceImpactPercent;
      startPriceEth = execution.startPriceEth;
      endPriceEth = execution.endPriceEth;
      closedPositionId = execution.closedPositionId;
      break;
    }
  }

  if (nextPool.badDebtEth > input.enginePool.badDebtEth + 1e-12) throw new Error("Sponsored route would create bad debt.");
  const priceBeforeWad = toWad(startPriceEth, "Opening price");
  const priceAfterWad = toWad(endPriceEth, "Closing price");
  const marketCapAfterWad = toWad(endPriceEth * TOTAL_SUPPLY_WHOLE, "Market cap");
  const priceImpactBps = BigInt(Math.ceil(priceImpactPercent * 100));
  if (priceImpactBps > BigInt(intent.maxSlippageBps)) throw new Error("Signed slippage limit would be exceeded.");
  assertPriceProtection(intent.action, priceAfterWad, BigInt(intent.limitPriceWad));

  const poolWethDeltaWad = -accountWethDeltaWad;
  const poolTokenDelta = -accountTokenDelta;
  assertChainAlignment({ chainState, nextPool, poolWethDeltaWad, poolTokenDelta });

  const positionsRoot = buildEngineStateRoot("positions", nextPool, remainingPositions, signedIntent.intentHash);
  const balancesRoot = buildEngineStateRoot("balances", nextPool, remainingPositions, signedIntent.intentHash);
  const reservedWethWad = toWad(positionObligationsWeth(nextPool), "Reserved position equity");
  const settlement = assertAuthorizedSettlement({
    expectedSequence: BigInt(chainState.sequence + 1),
    expectedPreviousStateHash: chainState.stateHash,
    sessionId: intent.sessionId,
    sessionNonce: BigInt(input.sessionNonce),
    intentNotionalWad: signedNotionalWad,
    intentDeadline: BigInt(intent.deadline),
    frame: {
      marketId: intent.marketId,
      action: intent.action as BattleActionKind,
      marginalPriceWad: priceAfterWad,
      marketCapWad: marketCapAfterWad,
      reservedWethWad,
      openInterestLongWad: toWad(openInterest(remainingPositions, "long"), "Long open interest"),
      openInterestShortWad: toWad(openInterest(remainingPositions, "short"), "Short open interest"),
      positionsRoot,
      balancesRoot,
      intentHash: signedIntent.intentHash,
    },
    account: intent.owner as Hex,
    accountWethDeltaWad,
    accountTokenDelta,
    poolWethDeltaWad,
    poolTokenDelta,
  });

  const enginePriceAfter = battlePriceEth(nextPool);
  if (Math.abs(enginePriceAfter - endPriceEth) > 1e-18) throw new Error("Engine price frame diverged during quote construction.");

  return {
    action: intent.action,
    actionLabel: tradingActionLabel(intent.action),
    priceBeforeWad,
    priceAfterWad,
    marketCapAfterWad,
    priceImpactBps,
    executionSteps,
    liquidationCount,
    nextPool,
    remainingPositions,
    settlement,
    accountWethDeltaWad,
    accountTokenDelta,
    grossWethWad,
    netWethWad,
    feeWad,
    tokenAmountWad,
    payoutWad,
    position,
    closedPositionId,
  };
}

/** Backward-compatible name retained for V22 imports while the project migrates to V23. */
export function buildSponsoredSpotBuyQuote(input: Parameters<typeof buildSponsoredTradeQuote>[0]) {
  if (input.signedIntent.intent.action !== TradingAction.SpotBuy) throw new Error("Spot-buy quote requires action 1.");
  return buildSponsoredTradeQuote(input);
}
