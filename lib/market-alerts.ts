import type { MarketEvent, Position, Token } from "./types";

export type LiquidationCluster = {
  id: string;
  direction: "long" | "short";
  marketCap: number;
  notionalEth: number;
  positions: number;
  distancePercent: number;
};

export type AlertRuleKind =
  | "market-cap-above"
  | "market-cap-below"
  | "whale-trade"
  | "short-cluster"
  | "long-cluster"
  | "developer-sell"
  | "solvency";

export type MarketAlertRule = {
  id: string;
  kind: AlertRuleKind;
  label: string;
  enabled: boolean;
  threshold: number;
  unit: "usd" | "eth" | "percent" | "boolean";
};

export type MarketAlertSignal = {
  id: string;
  ruleId: string;
  kind: AlertRuleKind;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  createdAt: number;
  fingerprint: string;
};

export type MarketAlertSnapshot = {
  token: Token;
  marketCap: number;
  liquidityEth: number;
  freeWethRatio: number;
  events: MarketEvent[];
  positions: Position[];
  clusters: LiquidationCluster[];
  now?: number;
};

export function defaultMarketAlertRules(token: Token): MarketAlertRule[] {
  const cap = Math.max(1, token.cap);
  return [
    { id: "mc-above", kind: "market-cap-above", label: "Market cap above", enabled: true, threshold: Math.round(cap * 1.12), unit: "usd" },
    { id: "mc-below", kind: "market-cap-below", label: "Market cap below", enabled: true, threshold: Math.round(cap * 0.88), unit: "usd" },
    { id: "whale", kind: "whale-trade", label: "Whale trade", enabled: true, threshold: 0.15, unit: "eth" },
    { id: "short-cluster", kind: "short-cluster", label: "Short squeeze cluster", enabled: true, threshold: 0.75, unit: "eth" },
    { id: "long-cluster", kind: "long-cluster", label: "Long cascade cluster", enabled: true, threshold: 0.75, unit: "eth" },
    { id: "dev-sell", kind: "developer-sell", label: "Developer sell", enabled: true, threshold: 1, unit: "boolean" },
    { id: "solvency", kind: "solvency", label: "Free WETH below", enabled: true, threshold: 35, unit: "percent" },
  ];
}

export function buildLiquidationClusters(positions: Position[], currentCap: number): LiquidationCluster[] {
  const buckets = new Map<string, { direction: "long" | "short"; cap: number; notional: number; count: number }>();
  for (const position of positions) {
    const step = Math.max(1, currentCap * 0.025);
    const bucketCap = Math.round(position.liquidationCap / step) * step;
    const key = `${position.direction}:${bucketCap}`;
    const existing = buckets.get(key) ?? { direction: position.direction, cap: bucketCap, notional: 0, count: 0 };
    existing.notional += position.notional;
    existing.count += 1;
    buckets.set(key, existing);
  }
  return [...buckets.values()]
    .map((item, index) => ({
      id: `position-cluster-${index}-${Math.round(item.cap)}`,
      direction: item.direction,
      marketCap: item.cap,
      notionalEth: item.notional,
      positions: item.count,
      distancePercent: currentCap > 0 ? ((item.cap - currentCap) / currentCap) * 100 : 0,
    }))
    .sort((a, b) => Math.abs(a.distancePercent) - Math.abs(b.distancePercent));
}

export function evaluateMarketAlerts(rules: MarketAlertRule[], snapshot: MarketAlertSnapshot): MarketAlertSignal[] {
  const now = snapshot.now ?? Date.now();
  const recentEvents = snapshot.events.filter((event) => now - event.createdAt <= 5 * 60_000);
  const newestWhale = recentEvents.find((event) => event.amountEth >= Math.min(...rules.filter((rule) => rule.kind === "whale-trade").map((rule) => rule.threshold), Infinity));
  const developerSell = recentEvents.find((event) => {
    const copy = `${event.actor ?? ""} ${event.note ?? ""}`.toLowerCase();
    const sell = event.action === "spot-sell" || event.action === "whale-sell" || event.action === "short";
    return sell && (copy.includes("creator") || copy.includes("developer") || copy.includes("dev ") || copy.includes("dev-"));
  });
  const signals: MarketAlertSignal[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.kind === "market-cap-above" && snapshot.marketCap >= rule.threshold) {
      signals.push(signal(rule, "info", "Market-cap breakout", `${snapshot.token.symbol} crossed $${Math.round(rule.threshold).toLocaleString("en-US")}.`, now, `above:${Math.floor(snapshot.marketCap / Math.max(1, rule.threshold))}`));
    }
    if (rule.kind === "market-cap-below" && snapshot.marketCap <= rule.threshold) {
      signals.push(signal(rule, "warning", "Market-cap breakdown", `${snapshot.token.symbol} traded below $${Math.round(rule.threshold).toLocaleString("en-US")}.`, now, `below:${Math.floor(snapshot.marketCap / Math.max(1, rule.threshold) * 100)}`));
    }
    if (rule.kind === "whale-trade" && newestWhale && newestWhale.amountEth >= rule.threshold) {
      const side = isBuyEvent(newestWhale) ? "buy" : "sell";
      signals.push(signal(rule, side === "buy" ? "info" : "warning", `Whale ${side}`, `${newestWhale.amountEth.toFixed(3)} ETH at $${Math.round(newestWhale.marketCap).toLocaleString("en-US")} MC.`, newestWhale.createdAt, `whale:${newestWhale.id}`));
    }
    if (rule.kind === "short-cluster") {
      const cluster = snapshot.clusters.find((item) => item.direction === "short" && item.notionalEth >= rule.threshold && item.distancePercent >= 0 && item.distancePercent <= 12);
      if (cluster) signals.push(signal(rule, "warning", "Short squeeze loaded", `${cluster.positions} shorts · ${cluster.notionalEth.toFixed(2)} ETH within ${cluster.distancePercent.toFixed(1)}%.`, now, `short:${cluster.id}:${Math.round(snapshot.marketCap / 100)}`));
    }
    if (rule.kind === "long-cluster") {
      const cluster = snapshot.clusters.find((item) => item.direction === "long" && item.notionalEth >= rule.threshold && item.distancePercent <= 0 && item.distancePercent >= -12);
      if (cluster) signals.push(signal(rule, "warning", "Long cascade loaded", `${cluster.positions} longs · ${cluster.notionalEth.toFixed(2)} ETH within ${Math.abs(cluster.distancePercent).toFixed(1)}%.`, now, `long:${cluster.id}:${Math.round(snapshot.marketCap / 100)}`));
    }
    if (rule.kind === "developer-sell" && developerSell) {
      signals.push(signal(rule, "critical", "Developer sell detected", `${developerSell.amountEth.toFixed(3)} ETH sold at $${Math.round(developerSell.marketCap).toLocaleString("en-US")} MC.`, developerSell.createdAt, `dev:${developerSell.id}`));
    }
    if (rule.kind === "solvency" && snapshot.freeWethRatio * 100 <= rule.threshold) {
      signals.push(signal(rule, "critical", "BattlePool capacity tight", `Only ${(snapshot.freeWethRatio * 100).toFixed(1)}% of WETH is instantly free.`, now, `solvency:${Math.floor(snapshot.freeWethRatio * 20)}`));
    }
  }
  return signals;
}

export type MarketDefensePulse = {
  score: number;
  status: "healthy" | "watch" | "danger";
  buyPressureEth: number;
  sellPressureEth: number;
  uniqueActors: number;
  repeatingActorShare: number;
  nearestShortCluster?: LiquidationCluster;
  nearestLongCluster?: LiquidationCluster;
  warnings: string[];
};

export function buildMarketDefensePulse(token: Token, events: MarketEvent[], clusters: LiquidationCluster[], freeWethRatio: number): MarketDefensePulse {
  const recent = events.filter((event) => Date.now() - event.createdAt <= 5 * 60_000);
  const buyPressureEth = recent.filter(isBuyEvent).reduce((sum, event) => sum + event.amountEth, 0);
  const sellPressureEth = recent.filter((event) => !isBuyEvent(event)).reduce((sum, event) => sum + event.amountEth, 0);
  const actorCounts = new Map<string, number>();
  for (const event of recent) actorCounts.set(event.actor ?? "public", (actorCounts.get(event.actor ?? "public") ?? 0) + 1);
  const largestActorCount = Math.max(0, ...actorCounts.values());
  const repeatingActorShare = recent.length ? largestActorCount / recent.length : 0;
  const warnings: string[] = [];
  if ((token.linkedWalletConcentration ?? 0) > 25) warnings.push("Linked-wallet concentration elevated");
  if (repeatingActorShare > 0.35) warnings.push("Repeated actor dominates recent flow");
  if (freeWethRatio < 0.35) warnings.push("Instant payout reserve is tight");
  if ((token.badDebtEth ?? 0) > 0) warnings.push("Non-zero bad debt");
  const concentrationPenalty = Math.max(0, (token.linkedWalletConcentration ?? 0) - 8) * 1.1;
  const repeatPenalty = repeatingActorShare * 35;
  const reservePenalty = Math.max(0, 0.5 - freeWethRatio) * 70;
  const score = Math.max(0, Math.min(100, (token.oracleConfidence ?? 0) * 0.55 + freeWethRatio * 40 + 14 - concentrationPenalty - repeatPenalty - reservePenalty));
  return {
    score,
    status: score >= 72 ? "healthy" : score >= 48 ? "watch" : "danger",
    buyPressureEth,
    sellPressureEth,
    uniqueActors: actorCounts.size,
    repeatingActorShare,
    nearestShortCluster: clusters.find((item) => item.direction === "short" && item.distancePercent >= 0),
    nearestLongCluster: clusters.find((item) => item.direction === "long" && item.distancePercent <= 0),
    warnings,
  };
}

function isBuyEvent(event: MarketEvent) {
  return event.action === "market-open" || event.action === "auction-bid" || event.action === "spot-buy" || event.action === "long" || event.action === "whale-buy" || event.action === "short-squeeze";
}

function signal(rule: MarketAlertRule, severity: MarketAlertSignal["severity"], title: string, detail: string, createdAt: number, fingerprint: string): MarketAlertSignal {
  return { id: `${rule.id}-${fingerprint}`, ruleId: rule.id, kind: rule.kind, severity, title, detail, createdAt, fingerprint };
}
