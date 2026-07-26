import assert from "node:assert/strict";
import { buildMarketDefensePulse, defaultMarketAlertRules, evaluateMarketAlerts, type LiquidationCluster } from "../lib/market-alerts.ts";
import type { MarketEvent, Token } from "../lib/types.ts";

const now = 1_800_000_000_000;
const token = {
  slug: "hood",
  symbol: "HOOD",
  name: "PerpHood Demo",
  emoji: "⚔️",
  hue: 48,
  cap: 80_000,
  price: 0.00008,
  change24h: 60,
  graduation: 73,
  longs: 62,
  volume24h: 120_000,
  openInterest: 40_000,
  funding: 0.004,
  launchedMinutesAgo: 47,
  liquidityEth: 8,
  oracleConfidence: 96,
  linkedWalletConcentration: 8,
  badDebtEth: 0,
  launchState: "live",
} as Token;

const events: MarketEvent[] = [
  { id: "whale", slug: "hood", action: "spot-buy", amountEth: 0.42, marketCap: 90_000, createdAt: now - 2_000, actor: "0xA" },
  { id: "dev", slug: "hood", action: "spot-sell", amountEth: 0.18, marketCap: 89_000, createdAt: now - 4_000, actor: "Creator", note: "Developer trimmed" },
  ...Array.from({ length: 12 }, (_, index): MarketEvent => ({ id: `diverse-${index}`, slug: "hood", action: index % 3 ? "spot-buy" : "spot-sell", amountEth: 0.02, marketCap: 88_000, createdAt: now - index * 500, actor: `0x${index}` })),
];

const clusters: LiquidationCluster[] = [
  { id: "shorts", direction: "short", marketCap: 94_000, notionalEth: 1.8, positions: 18, distancePercent: 4.4 },
  { id: "longs", direction: "long", marketCap: 84_000, notionalEth: 1.2, positions: 11, distancePercent: -6.7 },
];

const rules = defaultMarketAlertRules(token).map((rule) => rule.kind === "market-cap-above" ? { ...rule, threshold: 85_000 } : rule);
const signals = evaluateMarketAlerts(rules, { token, marketCap: 90_000, liquidityEth: 8, freeWethRatio: 0.7, events, positions: [], clusters, now });
const kinds = new Set(signals.map((signal) => signal.kind));
assert(kinds.has("market-cap-above"), "Market-cap breakout alert missing");
assert(kinds.has("whale-trade"), "Whale alert missing");
assert(kinds.has("short-cluster"), "Short-cluster alert missing");
assert(kinds.has("long-cluster"), "Long-cluster alert missing");
assert(kinds.has("developer-sell"), "Developer-sell alert missing");
assert.equal(new Set(signals.map((signal) => signal.fingerprint)).size, signals.length, "Alert fingerprints must be unique");

const diversePulse = buildMarketDefensePulse(token, events, clusters, 0.7);
const washEvents = Array.from({ length: 20 }, (_, index): MarketEvent => ({ id: `wash-${index}`, slug: "hood", action: index % 2 ? "spot-buy" : "spot-sell", amountEth: 0.05, marketCap: 90_000, createdAt: Date.now() - index * 100, actor: "0xWASH" }));
const washPulse = buildMarketDefensePulse(token, washEvents, clusters, 0.7);
assert(diversePulse.score > washPulse.score, "Independent flow should score above repeating-wallet wash flow");
assert(washPulse.warnings.some((warning) => warning.includes("Repeated actor")), "Wash-flow warning missing");

console.log(JSON.stringify({
  status: "PASS",
  alerts: signals.map((signal) => signal.kind),
  diverseDefenseScore: Number(diversePulse.score.toFixed(2)),
  washDefenseScore: Number(washPulse.score.toFixed(2)),
  shortClusterEth: clusters[0].notionalEth,
  longClusterEth: clusters[1].notionalEth,
}, null, 2));
