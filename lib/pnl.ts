import type { ClosedTrade, Position, SpotHolding } from "./types";
import type { ExecutablePnlSnapshot } from "./realtime-battle";

export type PnlPeriod = "session" | "today" | "7d" | "30d" | "all";

export type PnlSummary = {
  realizedEth: number;
  unrealizedEth: number;
  totalEth: number;
  wins: number;
  losses: number;
  trades: number;
  winRate: number;
  bestTradeEth: number;
  worstTradeEth: number;
};

export type PnlCalendarDay = {
  dateKey: string;
  label: string;
  pnlEth: number;
  trades: number;
  wins: number;
  losses: number;
};

export function startForPeriod(period: PnlPeriod, sessionStartedAt: number, now = Date.now()) {
  const date = new Date(now);
  if (period === "session") return sessionStartedAt;
  if (period === "today") return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (period === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (period === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

export function summarizePnl({
  closedTrades,
  positions,
  holdings,
  getPositionPnl,
  getHoldingPnl,
  period,
  sessionStartedAt,
  now = Date.now(),
}: {
  closedTrades: ClosedTrade[];
  positions: Position[];
  holdings: SpotHolding[];
  getPositionPnl: (position: Position) => ExecutablePnlSnapshot;
  getHoldingPnl: (holding: SpotHolding) => ExecutablePnlSnapshot;
  period: PnlPeriod;
  sessionStartedAt: number;
  now?: number;
}): PnlSummary {
  const start = startForPeriod(period, sessionStartedAt, now);
  const trades = closedTrades.filter((trade) => trade.closedAt >= start && trade.closedAt <= now);
  const realizedEth = trades.reduce((sum, trade) => sum + trade.pnlEth, 0);
  const includeOpen = period === "session" || period === "today" || period === "all";
  const unrealizedEth = includeOpen
    ? positions.reduce((sum, position) => sum + getPositionPnl(position).pnlEth, 0)
      + holdings.reduce((sum, holding) => sum + getHoldingPnl(holding).pnlEth, 0)
    : 0;
  const wins = trades.filter((trade) => trade.pnlEth > 0).length;
  const losses = trades.filter((trade) => trade.pnlEth < 0).length;
  const pnlValues = trades.map((trade) => trade.pnlEth);
  return {
    realizedEth,
    unrealizedEth,
    totalEth: realizedEth + unrealizedEth,
    wins,
    losses,
    trades: trades.length,
    winRate: trades.length ? wins / trades.length * 100 : 0,
    bestTradeEth: pnlValues.length ? Math.max(...pnlValues) : 0,
    worstTradeEth: pnlValues.length ? Math.min(...pnlValues) : 0,
  };
}

export function buildPnlCalendar(closedTrades: ClosedTrade[], days = 35, now = Date.now()): PnlCalendarDay[] {
  const byDate = new Map<string, PnlCalendarDay>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now - offset * 24 * 60 * 60 * 1000);
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateKey = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    byDate.set(dateKey, {
      dateKey,
      label: local.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      pnlEth: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    });
  }
  for (const trade of closedTrades) {
    const date = new Date(trade.closedAt);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const bucket = byDate.get(dateKey);
    if (!bucket) continue;
    bucket.pnlEth += trade.pnlEth;
    bucket.trades += 1;
    if (trade.pnlEth > 0) bucket.wins += 1;
    if (trade.pnlEth < 0) bucket.losses += 1;
  }
  return [...byDate.values()];
}

export function signedEth(value: number, digits = 4) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)} ETH`;
}
