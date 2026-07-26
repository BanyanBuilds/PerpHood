import assert from "node:assert/strict";
import { rankMovers, stabilizeMoversRanking } from "../lib/movers-engine.ts";
import type { MarketEvent, Token } from "../lib/types.ts";

const now = 1_800_000_000_000;

function token(slug: string, patch: Partial<Token> = {}): Token {
  return {
    slug,
    symbol: slug.toUpperCase(),
    name: slug,
    emoji: "⚔️",
    hue: 120,
    cap: 100_000,
    price: 0.0001,
    change24h: 20,
    graduation: 70,
    longs: 52,
    volume24h: 300_000,
    openInterest: 22_000,
    funding: 0.01,
    launchedMinutesAgo: 20,
    description: "test",
    launchState: "live",
    liquidityEth: 8,
    realWethBalance: 8,
    oracleConfidence: 92,
    linkedWalletConcentration: 10,
    uniqueTraders: 80,
    volatility1m: 4,
    maxLeverageUnlocked: 20,
    ...patch,
  };
}

function event(slug: string, offsetMs: number, action: MarketEvent["action"], amountEth: number, actor: string, marketCap = 100_000): MarketEvent {
  return { id: `${slug}-${offsetMs}-${action}-${actor}`, slug, action, amountEth, actor, marketCap, createdAt: now - offsetMs };
}

const organic = token("organic");
const wash = token("wash", { linkedWalletConcentration: 58, uniqueTraders: 12, change24h: 34 });
const sleepy = token("sleepy", { cap: 900_000, volume24h: 1_000_000, change24h: 2, uniqueTraders: 240 });

const events: MarketEvent[] = [];
for (let i = 0; i < 18; i += 1) {
  events.push(event("organic", 2_000 + i * 550, i % 5 === 0 ? "long" : "spot-buy", 0.045, `0xorganic${i}`, 82_000 + i * 1_000));
}
for (let i = 0; i < 28; i += 1) {
  events.push(event("wash", 1_500 + i * 320, i % 4 === 0 ? "long" : "spot-buy", 0.05, "0xsamewallet", 75_000 + i * 900));
}
for (let i = 0; i < 3; i += 1) events.push(event("sleepy", 240_000 + i * 10_000, "spot-buy", 0.2, `0xsleepy${i}`, 895_000));

const ranked = rankMovers({ tokens: [organic, wash, sleepy], events, likesBySlug: { organic: 50, wash: 80, sleepy: 400 }, now });
assert.equal(ranked[0].slug, "organic", "broad real participation should beat one-wallet wash volume");
assert.ok((ranked.find((item) => item.slug === "wash")?.manipulationPenalty ?? 0) >= 15, "wash activity must receive a meaningful manipulation penalty");
assert.equal(ranked.find((item) => item.slug === "organic")?.dataQuality, "live");
assert.equal(ranked.find((item) => item.slug === "sleepy")?.dataQuality, "warming");
assert.ok((ranked.find((item) => item.slug === "organic")?.reasons.length ?? 0) === 3);
assert.ok(ranked.every((item) => item.score >= 0 && item.score <= 100));

const closeChallenger = ranked.map((item) => item.slug === "wash" ? { ...item, score: ranked[0].score + 1.5 } : item);
const held = stabilizeMoversRanking(ranked, closeChallenger, 2.5);
assert.equal(held[0].slug, "organic", "small score noise must not flicker the visible order");
const clearChallenger = closeChallenger.map((item) => item.slug === "wash" ? { ...item, score: ranked[0].score + 3 } : item);
const promoted = stabilizeMoversRanking(ranked, clearChallenger, 2.5);
assert.equal(promoted[0].slug, "wash", "a clear lead must promote the challenger");

const decayed = rankMovers({ tokens: [organic, sleepy], events, likesBySlug: {}, now: now + 600_000 });
assert.ok((decayed.find((item) => item.slug === "organic")?.raw.tradesPerMinute ?? 1) < 1, "recent velocity must decay out of the rolling windows");

console.log("V30 movers engine smoke: PASS");
console.log(ranked.map((item, index) => `${index + 1}. ${item.slug} ${item.score.toFixed(1)} (${item.label}) penalty=${item.manipulationPenalty.toFixed(1)}`).join("\n"));
