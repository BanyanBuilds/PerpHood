import {
  BATTLE_TRADE_FEE_RATE,
  executeCloseLong,
  executeCloseShort,
  executeSpotSell,
  poolFromToken,
} from "./battle-pool.ts";
import type { Position, SpotHolding, Token } from "./types";

export type ExecutablePnlSnapshot = {
  id: string;
  kind: "perp" | "spot";
  slug: string;
  executableValueEth: number;
  pnlEth: number;
  roiPercent: number;
  priceImpactPercent: number;
  feeEth: number;
  updatedAt: number;
  executable: boolean;
  reason?: string;
};

export type BattleRealtimeFrame = {
  slug: string;
  sequence: number;
  updatedAt: number;
  source: "battlepool-local" | "sequencer" | "chain" | "v43-contract" | "v45-account" | "v45-session" | "launchpad-local" | "launchpad-test-seed" | "launchpad-migrated";
  priceUsd: number;
  marketCapUsd: number;
  tokenVolume: number;
  executionVolumeUsd: number;
  positionPnl: Record<string, ExecutablePnlSnapshot>;
  holdingPnl: Record<string, ExecutablePnlSnapshot>;
};

type Listener = () => void;

class BattleRealtimeStore {
  private frames = new Map<string, BattleRealtimeFrame>();
  private listeners = new Map<string, Set<Listener>>();
  private sequence = 0;

  publish(frame: Omit<BattleRealtimeFrame, "sequence" | "executionVolumeUsd"> & { executionVolumeUsd?: number }) {
    const previous = this.frames.get(frame.slug);
    const executionVolumeUsd = frame.executionVolumeUsd ?? Math.max(0, frame.tokenVolume - (previous?.tokenVolume ?? frame.tokenVolume));
    const next = { ...frame, executionVolumeUsd, sequence: ++this.sequence };
    this.frames.set(frame.slug, next);
    this.listeners.get(frame.slug)?.forEach((listener) => listener());
    return next;
  }

  getSnapshot(slug: string) {
    return this.frames.get(slug) ?? null;
  }

  subscribe(slug: string, listener: Listener) {
    const set = this.listeners.get(slug) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(slug, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(slug);
    };
  }
}

export const battleRealtimeStore = new BattleRealtimeStore();

function dynamicAccruedCosts(token: Token, position: Position, now: number) {
  const elapsedHours = Math.max(0, now - (position.lastAccruedAt ?? now)) / 3_600_000;
  const fundingRate = (token.fundingRateHourly ?? token.funding ?? 0) / 100;
  const borrowRate = (token.borrowRateHourly ?? 0.004) / 100;
  const funding = position.notional * fundingRate * elapsedHours * (position.direction === "long" ? 1 : -1);
  const borrow = position.notional * borrowRate * elapsedHours;
  return (position.accruedFunding ?? 0) + funding + Math.max(0, (position.accruedBorrow ?? 0) + borrow);
}

export function quoteExecutablePositionPnl(token: Token, position: Position, now = Date.now()): ExecutablePnlSnapshot {
  try {
    if (!token.battlePoolVersion) throw new Error("BattlePool state is unavailable.");
    const pool = poolFromToken(token);
    const accruedCosts = dynamicAccruedCosts(token, position, now);
    const trade = position.direction === "long"
      ? executeCloseLong(pool, position, 1, false, accruedCosts, BATTLE_TRADE_FEE_RATE)
      : executeCloseShort(pool, position, 1, false, accruedCosts, BATTLE_TRADE_FEE_RATE);
    const pnlEth = trade.payoutEth - position.collateral - (position.entryFee ?? 0);
    return {
      id: position.id,
      kind: "perp",
      slug: position.slug,
      executableValueEth: trade.payoutEth,
      pnlEth,
      roiPercent: position.collateral > 0 ? pnlEth / position.collateral * 100 : 0,
      priceImpactPercent: trade.priceImpactPercent,
      feeEth: trade.feeEth,
      updatedAt: now,
      executable: true,
    };
  } catch (error) {
    return {
      id: position.id,
      kind: "perp",
      slug: position.slug,
      executableValueEth: 0,
      pnlEth: -position.collateral - (position.entryFee ?? 0),
      roiPercent: -100,
      priceImpactPercent: 0,
      feeEth: 0,
      updatedAt: now,
      executable: false,
      reason: error instanceof Error ? error.message : "Executable PNL quote unavailable.",
    };
  }
}

export function quoteExecutableSpotPnl(token: Token, holding: SpotHolding, now = Date.now()): ExecutablePnlSnapshot {
  try {
    if (!token.battlePoolVersion || !holding.tokenAmount) throw new Error("BattlePool holding state is unavailable.");
    const trade = executeSpotSell(poolFromToken(token), holding.tokenAmount);
    const pnlEth = trade.netEth - holding.investedEth;
    return {
      id: holding.id,
      kind: "spot",
      slug: holding.slug,
      executableValueEth: trade.netEth,
      pnlEth,
      roiPercent: holding.investedEth > 0 ? pnlEth / holding.investedEth * 100 : 0,
      priceImpactPercent: trade.priceImpactPercent,
      feeEth: trade.feeEth,
      updatedAt: now,
      executable: true,
    };
  } catch (error) {
    return {
      id: holding.id,
      kind: "spot",
      slug: holding.slug,
      executableValueEth: 0,
      pnlEth: -holding.investedEth,
      roiPercent: -100,
      priceImpactPercent: 0,
      feeEth: 0,
      updatedAt: now,
      executable: false,
      reason: error instanceof Error ? error.message : "Executable spot quote unavailable.",
    };
  }
}

export function buildBattleRealtimeFrame(
  token: Token,
  positions: Position[],
  holdings: SpotHolding[],
  source: BattleRealtimeFrame["source"] = "battlepool-local",
  now = Date.now(),
): Omit<BattleRealtimeFrame, "sequence" | "executionVolumeUsd"> {
  const positionPnl = Object.fromEntries(
    positions.filter((position) => position.slug === token.slug).map((position) => [position.id, quoteExecutablePositionPnl(token, position, now)]),
  );
  const holdingPnl = Object.fromEntries(
    holdings.filter((holding) => holding.slug === token.slug).map((holding) => [holding.id, quoteExecutableSpotPnl(token, holding, now)]),
  );
  return {
    slug: token.slug,
    updatedAt: now,
    source,
    priceUsd: token.price,
    marketCapUsd: token.markCap ?? token.cap,
    tokenVolume: token.volume24h,
    positionPnl,
    holdingPnl,
  };
}

export function publishBattleRealtimeFrame(
  token: Token,
  positions: Position[],
  holdings: SpotHolding[],
  source: BattleRealtimeFrame["source"] = "battlepool-local",
) {
  return battleRealtimeStore.publish(buildBattleRealtimeFrame(token, positions, holdings, source));
}
