import type { Token } from "./types";

export type MarketState = "Ignition" | "Expansion" | "Parabolic" | "Distribution" | "Collapse" | "Recovery" | "Dormant" | "Dead";
export type RiskGrade = "A+" | "A" | "B" | "C" | "D" | "F";

export type MarketIntelligence = {
  discovery: number;
  momentum: number;
  risk: number;
  perp: number;
  composite: number;
  state: MarketState;
  grade: RiskGrade;
  signals: string[];
  crowdedSide: "LONG" | "SHORT" | "BALANCED";
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const logScore = (value: number, floor: number, ceiling: number) => clamp((Math.log10(Math.max(value, 1)) - floor) / Math.max(ceiling - floor, .01) * 100);

export function analyzeMarket(token: Token): MarketIntelligence {
  const ageMinutes = Math.max(.2, token.launchedMinutesAgo);
  const traders = Math.max(1, token.uniqueTraders ?? 1);
  const volume = Math.max(0, token.volume24h);
  const liquidity = Math.max(.01, token.liquidityEth ?? 0);
  const oi = Math.max(0, token.openInterest);
  const confidence = clamp(token.oracleConfidence ?? 50);
  const cluster = clamp(token.linkedWalletConcentration ?? 25);
  const volatility = clamp((token.volatility1m ?? Math.abs(token.change24h) / 5) * 5);
  const move = token.change24h;
  const longSkew = token.longs - 50;
  const velocity = volume / Math.max(ageMinutes, 1);
  const participation = traders / Math.max(ageMinutes, 1);
  const liquidityCoverage = clamp((liquidity * 3200) / Math.max(oi, 1) * 100);

  const discovery = clamp(
    logScore(velocity, 1.3, 5.1) * .31 +
    logScore(participation, -1, 1.6) * .22 +
    clamp(token.graduation) * .12 +
    confidence * .16 +
    clamp(100 - cluster) * .11 +
    clamp(Math.abs(move) * 2.2) * .08
  );

  const momentum = clamp(
    clamp(50 + move * 1.5) * .30 +
    logScore(velocity, 1, 5) * .27 +
    logScore(traders, 1, 4) * .17 +
    clamp(100 - cluster) * .10 +
    clamp(token.graduation) * .08 +
    volatility * .08
  );

  const risk = clamp(
    confidence * .31 +
    clamp(100 - cluster) * .25 +
    clamp(100 - volatility) * .12 +
    liquidityCoverage * .17 +
    clamp(traders / 3) * .08 +
    (token.ogStatus === "og" ? 7 : 2)
  );

  const perp = clamp(
    logScore(oi, 3, 7) * .24 +
    confidence * .24 +
    liquidityCoverage * .18 +
    clamp(100 - Math.abs(longSkew) * 2) * .12 +
    clamp(100 - Math.abs(token.funding) * 900) * .10 +
    clamp(token.maxLeverageUnlocked ?? 1, 1, 20) / 20 * 100 * .12
  );

  let state: MarketState;
  if (volume < 1500 && ageMinutes > 720) state = "Dead";
  else if (volume < 7000 && Math.abs(move) < 3) state = "Dormant";
  else if (move < -18 && momentum < 45) state = "Collapse";
  else if (move < 8 && momentum > 55 && token.graduation > 55) state = "Recovery";
  else if (move > 45 || (momentum > 82 && volatility > 60)) state = "Parabolic";
  else if (move > 7 && momentum > 62) state = ageMinutes < 20 ? "Ignition" : "Expansion";
  else if (move < 6 && cluster > 32 && token.graduation > 65) state = "Distribution";
  else state = ageMinutes < 25 ? "Ignition" : "Expansion";

  const grade: RiskGrade = risk >= 90 ? "A+" : risk >= 80 ? "A" : risk >= 68 ? "B" : risk >= 55 ? "C" : risk >= 40 ? "D" : "F";
  const crowdedSide = longSkew > 13 ? "LONG" : longSkew < -13 ? "SHORT" : "BALANCED";
  const signals: string[] = [];
  if (momentum >= 78) signals.push("Momentum");
  if (discovery >= 75) signals.push("Trending");
  if (risk >= 78) signals.push("Clean flow");
  if (cluster >= 35) signals.push("Wallet cluster");
  if (move < -12) signals.push("Sell pressure");
  if (crowdedSide === "LONG") signals.push("Longs crowded");
  if (crowdedSide === "SHORT") signals.push("Shorts crowded");
  if (Math.abs(token.funding) >= .035) signals.push("Funding extreme");
  if (token.ogStatus === "og") signals.push("Original metadata");

  const composite = clamp(discovery * .31 + momentum * .27 + risk * .22 + perp * .20);
  return { discovery, momentum, risk, perp, composite, state, grade, signals: signals.slice(0, 3), crowdedSide };
}
