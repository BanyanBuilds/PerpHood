import type { MarketEvent, Position, Token } from "./types";

export const MOVERS_WEIGHTS = {
  transactionVelocity: 25,
  netWethInflow: 20,
  uniqueWalletGrowth: 15,
  marketCapAcceleration: 12,
  battleIntensity: 10,
  liquidityGrowth: 8,
  likeVelocity: 5,
  quality: 5,
} as const;

export type MoversMetricKey = keyof typeof MOVERS_WEIGHTS;

export type MoversReason = {
  key: MoversMetricKey | "risk";
  label: string;
  tone: "positive" | "warning" | "neutral";
};

export type MoversScore = {
  slug: string;
  score: number;
  baseScore: number;
  manipulationPenalty: number;
  dataQuality: "live" | "warming" | "estimated";
  label: "Explosive" | "Accelerating" | "Active" | "Watching";
  components: Record<MoversMetricKey, number>;
  raw: {
    tradesPerMinute: number;
    netWethPerMinute: number;
    netWethToLiquidity: number;
    activeWallets: number;
    repeatActorRatio: number;
    capAccelerationPercent: number;
    battleEventsPerMinute: number;
    nearbyLiquidations: number;
    nearbyLiquidationNotional: number;
    liquidityGrowthEthPerMinute: number;
    likesPerHour: number;
  };
  reasons: MoversReason[];
  updatedAt: number;
};

export type MoversEngineInput = {
  tokens: Token[];
  events: MarketEvent[];
  positions?: Position[];
  likesBySlug?: Record<string, number>;
  now?: number;
};

type RawMover = Omit<MoversScore, "score" | "baseScore" | "components" | "label" | "reasons"> & {
  rawComponents: Record<MoversMetricKey, number>;
};

const WINDOWS = [
  { ms: 15_000, weight: 0.45 },
  { ms: 60_000, weight: 0.35 },
  { ms: 300_000, weight: 0.20 },
] as const;

const TRADE_ACTIONS = new Set([
  "spot-buy", "spot-sell", "long", "short", "partial-liquidation", "liquidation",
  "whale-buy", "whale-sell", "short-squeeze", "long-squeeze", "order-fill",
]);

const BATTLE_ACTIONS = new Set([
  "long", "short", "partial-liquidation", "liquidation", "short-squeeze", "long-squeeze", "adl",
]);

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const finite = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback;

function actionDirection(event: MarketEvent) {
  if (["spot-buy", "long", "whale-buy", "short-squeeze"].includes(event.action)) return 1;
  if (["spot-sell", "short", "whale-sell", "long-squeeze"].includes(event.action)) return -1;
  if (event.action === "liquidation" || event.action === "partial-liquidation") {
    const note = `${event.note ?? ""} ${event.actor ?? ""}`.toLowerCase();
    if (note.includes("short")) return 1;
    if (note.includes("long")) return -1;
  }
  return 0;
}

function countableActor(actor?: string) {
  if (!actor) return false;
  const normalized = actor.trim().toLowerCase();
  return Boolean(normalized) && !["risk lab", "cluster monitor", "system", "keeper", "sequencer"].some((label) => normalized.includes(label));
}

function eventsInside(events: MarketEvent[], now: number, ms: number) {
  const cutoff = now - ms;
  return events.filter((event) => event.createdAt >= cutoff && event.createdAt <= now);
}

function weightedRate(events: MarketEvent[], now: number, predicate: (event: MarketEvent) => boolean) {
  return WINDOWS.reduce((total, window) => {
    const count = eventsInside(events, now, window.ms).filter(predicate).length;
    return total + window.weight * count / (window.ms / 60_000);
  }, 0);
}

function weightedAmount(events: MarketEvent[], now: number, mapper: (event: MarketEvent) => number) {
  return WINDOWS.reduce((total, window) => {
    const amount = eventsInside(events, now, window.ms).reduce((sum, event) => sum + mapper(event), 0);
    return total + window.weight * amount / (window.ms / 60_000);
  }, 0);
}

function weightedUniqueActors(events: MarketEvent[], now: number) {
  return WINDOWS.reduce((total, window) => {
    const actors = new Set(eventsInside(events, now, window.ms).filter((event) => countableActor(event.actor)).map((event) => event.actor!.trim().toLowerCase()));
    return total + window.weight * actors.size / (window.ms / 60_000);
  }, 0);
}

function marketCapAt(events: MarketEvent[], currentCap: number, target: number) {
  const ordered = events.filter((event) => event.marketCap > 0).sort((a, b) => a.createdAt - b.createdAt);
  if (!ordered.length) return currentCap;
  let candidate = ordered[0].marketCap;
  for (const event of ordered) {
    if (event.createdAt > target) break;
    candidate = event.marketCap;
  }
  return Math.max(candidate, 1e-9);
}

function capAcceleration(token: Token, events: MarketEvent[], now: number) {
  if (!events.length) return clamp(token.change24h / 12, -30, 30);
  const current = Math.max(token.cap, 1e-9);
  const returns = WINDOWS.map((window) => {
    const baseline = marketCapAt(events, current, now - window.ms);
    return (current / baseline - 1) * 100;
  });
  const [r15, r60, r300] = returns;
  const acceleration = (r15 * 4 - r60) * 0.55 + (r60 * 5 - r300) * 0.20;
  return clamp(r15 * 0.45 + r60 * 0.35 + r300 * 0.20 + acceleration, -100, 250);
}

function percentile(values: number[], target: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return target > 0 ? 70 : 0;
  let below = 0;
  let equal = 0;
  for (const value of sorted) {
    if (value < target) below += 1;
    else if (value === target) equal += 1;
  }
  return clamp(((below + Math.max(0, equal - 1) / 2) / (sorted.length - 1)) * 100);
}

function qualityScore(token: Token, repeatActorRatio: number) {
  const confidence = finite(token.oracleConfidence, 50);
  const concentration = finite(token.linkedWalletConcentration, 25);
  const badDebt = finite(token.badDebtEth, 0);
  const freeWeth = finite(token.freeWethEth, token.liquidityEth ?? 0);
  const obligations = finite(token.positionObligationsEth, 0);
  const solvency = obligations <= 0 ? 100 : clamp(freeWeth / obligations * 100);
  const participation = clamp(finite(token.uniqueTraders, 0) / 2.5);
  return clamp(
    confidence * 0.28 +
    clamp(100 - concentration * 1.5) * 0.25 +
    clamp(100 - repeatActorRatio * 100) * 0.19 +
    solvency * 0.16 +
    participation * 0.08 +
    (token.ogStatus === "og" ? 4 : 1) -
    Math.min(25, badDebt * 100)
  );
}

function nearbyLiquidations(token: Token, positions: Position[]) {
  const currentCap = Math.max(token.cap, 1e-9);
  const relevant = positions.filter((position) => position.slug === token.slug);
  let count = 0;
  let notional = 0;
  for (const position of relevant) {
    const distance = position.direction === "long"
      ? (currentCap - position.liquidationCap) / currentCap
      : (position.liquidationCap - currentCap) / currentCap;
    if (distance >= 0 && distance <= 0.12) {
      count += 1;
      notional += position.notional * (1 - distance / 0.12);
    }
  }
  return { count, notional };
}

function makeRawMover(token: Token, tokenEvents: MarketEvent[], positions: Position[], likes: number, now: number): RawMover {
  const tradeEvents = tokenEvents.filter((event) => TRADE_ACTIONS.has(event.action));
  const recentFiveMinutes = eventsInside(tradeEvents, now, 300_000);
  const actorEvents = recentFiveMinutes.filter((event) => countableActor(event.actor));
  const uniqueActors = new Set(actorEvents.map((event) => event.actor!.trim().toLowerCase())).size;
  const repeatActorRatio = actorEvents.length ? clamp(1 - uniqueActors / actorEvents.length, 0, 1) : 0;
  const liquidityEth = Math.max(0.005, finite(token.realWethBalance, token.liquidityEth ?? 0.005));
  const tradesPerMinuteLive = weightedRate(tradeEvents, now, () => true);
  const fallbackTrades = tokenEvents.length ? 0 : Math.log10(Math.max(token.volume24h, 1)) / Math.max(Math.sqrt(token.launchedMinutesAgo + 1), 1);
  const tradesPerMinute = tradesPerMinuteLive + fallbackTrades;
  const netWethPerMinute = weightedAmount(tradeEvents, now, (event) => actionDirection(event) * Math.max(0, event.amountEth));
  const netWethToLiquidity = netWethPerMinute / liquidityEth;
  const activeWalletsLive = weightedUniqueActors(tradeEvents, now);
  const activeWallets = activeWalletsLive + (tokenEvents.length ? 0 : finite(token.uniqueTraders, 0) / Math.max(Math.sqrt(token.launchedMinutesAgo + 1), 1));
  const capAccelerationPercent = capAcceleration(token, tokenEvents, now);
  const battleEventsPerMinute = weightedRate(tokenEvents, now, (event) => BATTLE_ACTIONS.has(event.action));
  const liq = nearbyLiquidations(token, positions);
  const oiPressure = finite(token.openInterest, 0) / Math.max(token.cap, 1);
  const balancePressure = 1 - Math.abs(finite(token.longs, 50) - 50) / 50;
  const battleRaw = battleEventsPerMinute + liq.count * 2.5 + liq.notional / Math.max(finite(token.openInterest, 1), 1) * 12 + oiPressure * 55 + balancePressure * 1.5;
  const liquidationIncome = weightedAmount(tokenEvents, now, (event) => ["liquidation", "partial-liquidation", "short-squeeze", "long-squeeze"].includes(event.action) ? Math.max(0, event.amountEth) : 0);
  const liquidityGrowthEthPerMinute = Math.max(0, netWethPerMinute) + liquidationIncome * 0.35 + finite(token.liquidationEquityEth, 0) / Math.max(token.launchedMinutesAgo, 5);
  const likesPerHour = likes / Math.max(Math.sqrt(token.launchedMinutesAgo / 60 + 1), 1);
  const quality = qualityScore(token, repeatActorRatio);
  const manipulationPenalty = clamp(
    Math.max(0, finite(token.linkedWalletConcentration, 0) - 18) * 0.48 +
    Math.max(0, repeatActorRatio - 0.42) * 35 +
    Math.min(12, finite(token.badDebtEth, 0) * 80),
    0,
    38,
  );
  const dataQuality = recentFiveMinutes.length >= 4 ? "live" : recentFiveMinutes.length ? "warming" : "estimated";

  return {
    slug: token.slug,
    manipulationPenalty,
    dataQuality,
    raw: {
      tradesPerMinute,
      netWethPerMinute,
      netWethToLiquidity,
      activeWallets,
      repeatActorRatio,
      capAccelerationPercent,
      battleEventsPerMinute,
      nearbyLiquidations: liq.count,
      nearbyLiquidationNotional: liq.notional,
      liquidityGrowthEthPerMinute,
      likesPerHour,
    },
    rawComponents: {
      transactionVelocity: tradesPerMinute,
      netWethInflow: netWethToLiquidity,
      uniqueWalletGrowth: activeWallets,
      marketCapAcceleration: capAccelerationPercent,
      battleIntensity: battleRaw,
      liquidityGrowth: liquidityGrowthEthPerMinute / liquidityEth,
      likeVelocity: likesPerHour,
      quality,
    },
    updatedAt: now,
  };
}

function reasonCandidates(score: MoversScore): MoversReason[] {
  const candidates: Array<{ value: number; reason: MoversReason }> = [
    { value: score.components.transactionVelocity, reason: { key: "transactionVelocity", label: `${score.raw.tradesPerMinute.toFixed(score.raw.tradesPerMinute >= 10 ? 0 : 1)} trades/min`, tone: "positive" } },
    { value: score.components.netWethInflow, reason: { key: "netWethInflow", label: `${score.raw.netWethPerMinute >= 0 ? "+" : ""}${score.raw.netWethPerMinute.toFixed(3)} ETH/min`, tone: score.raw.netWethPerMinute >= 0 ? "positive" : "warning" } },
    { value: score.components.uniqueWalletGrowth, reason: { key: "uniqueWalletGrowth", label: `${score.raw.activeWallets.toFixed(score.raw.activeWallets >= 10 ? 0 : 1)} active wallets`, tone: "positive" } },
    { value: score.components.marketCapAcceleration, reason: { key: "marketCapAcceleration", label: `MC accel ${score.raw.capAccelerationPercent >= 0 ? "+" : ""}${score.raw.capAccelerationPercent.toFixed(1)}%`, tone: score.raw.capAccelerationPercent >= 0 ? "positive" : "warning" } },
    { value: score.components.battleIntensity, reason: { key: "battleIntensity", label: score.raw.nearbyLiquidations ? `${score.raw.nearbyLiquidations} liqs nearby` : `${score.raw.battleEventsPerMinute.toFixed(1)} battle events/min`, tone: "positive" } },
    { value: score.components.liquidityGrowth, reason: { key: "liquidityGrowth", label: `+${score.raw.liquidityGrowthEthPerMinute.toFixed(3)} ETH depth/min`, tone: "positive" } },
    { value: score.components.likeVelocity, reason: { key: "likeVelocity", label: `${score.raw.likesPerHour.toFixed(1)} like velocity`, tone: "neutral" } },
    { value: score.components.quality, reason: { key: "quality", label: "Clean wallet flow", tone: "neutral" } },
  ];
  const selected = candidates.sort((a, b) => b.value - a.value).slice(0, 3).map((item) => item.reason);
  if (score.manipulationPenalty >= 8) selected[2] = { key: "risk", label: `−${score.manipulationPenalty.toFixed(0)} manipulation risk`, tone: "warning" };
  return selected;
}

export function rankMovers({ tokens, events, positions = [], likesBySlug = {}, now = Date.now() }: MoversEngineInput): MoversScore[] {
  const live = tokens.filter((token) => token.launchState !== "auction" && token.cap > 0);
  const bySlug = new Map<string, MarketEvent[]>();
  for (const event of events) {
    const list = bySlug.get(event.slug) ?? [];
    list.push(event);
    bySlug.set(event.slug, list);
  }
  const raw = live.map((token) => makeRawMover(token, bySlug.get(token.slug) ?? [], positions, likesBySlug[token.slug] ?? 0, now));
  const componentValues = Object.fromEntries((Object.keys(MOVERS_WEIGHTS) as MoversMetricKey[]).map((key) => [key, raw.map((item) => item.rawComponents[key])])) as Record<MoversMetricKey, number[]>;

  const scored = raw.map<MoversScore>((item) => {
    const components = Object.fromEntries((Object.keys(MOVERS_WEIGHTS) as MoversMetricKey[]).map((key) => {
      if (key === "quality") return [key, clamp(item.rawComponents[key])];
      return [key, percentile(componentValues[key], item.rawComponents[key])];
    })) as Record<MoversMetricKey, number>;
    const baseScore = (Object.keys(MOVERS_WEIGHTS) as MoversMetricKey[]).reduce((sum, key) => sum + components[key] * MOVERS_WEIGHTS[key] / 100, 0);
    const freshnessMultiplier = item.dataQuality === "live" ? 1 : item.dataQuality === "warming" ? 0.96 : 0.90;
    const score = clamp(baseScore * freshnessMultiplier - item.manipulationPenalty);
    const label = score >= 85 ? "Explosive" : score >= 70 ? "Accelerating" : score >= 55 ? "Active" : "Watching";
    const result: MoversScore = { ...item, components, baseScore, score, label, reasons: [] };
    result.reasons = reasonCandidates(result);
    return result;
  });

  return scored.sort((a, b) => b.score - a.score || b.raw.netWethPerMinute - a.raw.netWethPerMinute || b.raw.tradesPerMinute - a.raw.tradesPerMinute);
}

/**
 * Keeps the visible table readable while the score itself remains fully live.
 * A challenger must beat the market directly above it by the configured margin
 * before the two rows swap. New markets enter at their calculated position.
 */
export function stabilizeMoversRanking(previous: MoversScore[], next: MoversScore[], minimumLead = 2.5) {
  if (!previous.length) return next;
  const nextBySlug = new Map(next.map((item) => [item.slug, item]));
  const order = previous.map((item) => item.slug).filter((slug) => nextBySlug.has(slug));
  for (const item of next) if (!order.includes(item.slug)) order.push(item.slug);

  let changed = true;
  let passes = 0;
  while (changed && passes < order.length) {
    changed = false;
    passes += 1;
    for (let index = 1; index < order.length; index += 1) {
      const challenger = nextBySlug.get(order[index]);
      const incumbent = nextBySlug.get(order[index - 1]);
      if (challenger && incumbent && challenger.score > incumbent.score + minimumLead) {
        [order[index - 1], order[index]] = [order[index], order[index - 1]];
        changed = true;
      }
    }
  }
  return order.map((slug) => nextBySlug.get(slug)).filter((item): item is MoversScore => Boolean(item));
}
