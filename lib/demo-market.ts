import { createBattlePoolState, executeSpotBuy, poolToTokenPatch } from "./battle-pool";
import type { LiveCandle, LiveTrade } from "./live-market";
import type { MarketEvent, Token } from "./types";

export const DEMO_ONLY = true;
export const DEMO_MARKET_SLUG = "perphood-demo";
export const DEMO_ETH_USD = 3_200;

let demoPool = createBattlePoolState();
for (const buy of [0.42, 0.28, 0.31, 0.19, 0.36, 0.24, 0.20]) {
  demoPool = executeSpotBuy(demoPool, buy).next;
}
const demoPatch = poolToTokenPatch(demoPool, DEMO_ETH_USD);

export const DEMO_TOKEN: Token = {
  ...demoPatch,
  slug: DEMO_MARKET_SLUG,
  symbol: "HOOD",
  name: "PerpHood Demo",
  emoji: "⚔️",
  imageDataUrl: "/perphood-logo.png",
  hue: 48,
  change24h: 68.42,
  graduation: 73.4,
  longs: 61.8,
  volume24h: 126_840,
  openInterest: 41_920,
  funding: 0.0042,
  launchedMinutesAgo: 2,
  featured: true,
  description: "One demo market built to show the complete PerpHood chart workspace. Spot buys, spot sells, leveraged longs, leveraged shorts, live executable PNL, and liquidations all resolve through one BattlePool.",
  allTimeHighCap: 118_420,
  launchState: "live",
  battlePhase: "bonding",
  openingCap: 800,
  contractAddress: "0x48f6B2C0D94aBb81Ffb42F30E7B321Bf00D0BEEF",
  oracleConfidence: 96,
  maxLeverageUnlocked: 20,
  longOpenInterestEth: 8.10,
  shortOpenInterestEth: 5.00,
  fundingRateHourly: 0.0042,
  borrowRateHourly: 0.0038,
  linkedWalletConcentration: 8.6,
  uniqueTraders: 684,
  volatility1m: 5.8,
  marketAgeSeconds: 2 * 60,
  normalizedName: "perphood demo",
  normalizedSymbol: "hood",
  ogStatus: "og",
  firstSeenSlug: DEMO_MARKET_SLUG,
  tickerOriginSlug: DEMO_MARKET_SLUG,
  isTickerOrigin: true,
  creatorWallet: "0xPERP…HOOD",
  launchBlock: 10_420_069,
  metadataLockedAt: Date.now() - 2 * 60_000,
};

export type DemoWindow = "5m" | "1h" | "6h" | "24h";
export type DemoWindowStats = {
  change: number;
  txns: number;
  volume: number;
  traders: number;
  buys: number;
  sells: number;
  buyVolume: number;
  sellVolume: number;
  buyers: number;
  sellers: number;
};

export const DEMO_WINDOW_STATS: Record<DemoWindow, DemoWindowStats> = {
  "5m": { change: 8.74, txns: 94, volume: 12_480, traders: 61, buys: 63, sells: 31, buyVolume: 8_960, sellVolume: 3_520, buyers: 49, sellers: 24 },
  "1h": { change: 31.28, txns: 786, volume: 68_440, traders: 324, buys: 472, sells: 314, buyVolume: 40_930, sellVolume: 27_510, buyers: 246, sellers: 169 },
  "6h": { change: 54.62, txns: 2_914, volume: 184_620, traders: 811, buys: 1_704, sells: 1_210, buyVolume: 111_840, sellVolume: 72_780, buyers: 592, sellers: 431 },
  "24h": { change: 68.42, txns: 5_836, volume: 418_760, traders: 1_482, buys: 3_429, sells: 2_407, buyVolume: 259_610, sellVolume: 159_150, buyers: 1_069, sellers: 793 },
};

export const DEMO_HOLDER_INTEL = {
  holders: 1_286,
  top10Share: 18.4,
  creatorShare: 4.7,
  insiders: 7,
  snipers: 12,
  first70Holding: 38.6,
  bundledShare: 3.1,
  liquidityProviders: 1,
};

export const DEMO_TOP_TRADERS = [
  { wallet: "0x8A7…91F", label: "Smart money", realized: 2.842, unrealized: 0.391, volume: 18.7, winRate: 73 },
  { wallet: "0xD14…B02", label: "Early buyer", realized: 1.614, unrealized: 0.118, volume: 12.3, winRate: 69 },
  { wallet: "0x44C…E81", label: "Short hunter", realized: 1.122, unrealized: -0.034, volume: 9.8, winRate: 64 },
  { wallet: "0x90B…7AA", label: "Swing", realized: 0.884, unrealized: 0.072, volume: 7.1, winRate: 61 },
  { wallet: "0xC20…419", label: "Fresh wallet", realized: 0.473, unrealized: 0.216, volume: 5.6, winRate: 58 },
];

export const DEMO_HOLDERS = [
  { wallet: "BattlePool curve", label: "Locked inventory", share: 52.6, pnl: 0, bought: 0, sold: 0 },
  { wallet: "0xPERP…HOOD", label: "Creator", share: 4.7, pnl: 0.42, bought: 1.0, sold: 0.12 },
  { wallet: "0x8A7…91F", label: "Smart money", share: 2.9, pnl: 2.84, bought: 1.42, sold: 0.58 },
  { wallet: "0xD14…B02", label: "Early buyer", share: 2.1, pnl: 1.61, bought: 0.84, sold: 0.31 },
  { wallet: "0x44C…E81", label: "Short hunter", share: 1.4, pnl: 1.12, bought: 0.52, sold: 0.44 },
];

function seededNoise(index: number) {
  const value = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function buildDemoCandles(nowMs = Date.now(), count = 1_200): LiveCandle[] {
  const end = Math.floor(nowMs / 1000);
  const startPrice = DEMO_TOKEN.price * 0.41;
  let close = startPrice;
  const candles: LiveCandle[] = [];
  for (let index = 0; index < count; index += 1) {
    const progress = index / Math.max(1, count - 1);
    const trend = startPrice + (DEMO_TOKEN.price - startPrice) * Math.pow(progress, 1.16);
    const wave = Math.sin(index / 18) * trend * 0.022 + Math.sin(index / 57) * trend * 0.038;
    const pulse = progress > 0.72 && progress < 0.78 ? trend * Math.sin((progress - 0.72) * 52) * 0.09 : 0;
    const noise = seededNoise(index) * trend * 0.012;
    const next = Math.max(DEMO_TOKEN.price * 0.18, trend + wave + pulse + noise);
    const open = close;
    close = index === count - 1 ? DEMO_TOKEN.price : next;
    const wick = Math.max(open, close) * (0.004 + Math.abs(seededNoise(index + 9)) * 0.013);
    candles.push({
      time: end - (count - 1 - index),
      open,
      high: Math.max(open, close) + wick,
      low: Math.max(1e-12, Math.min(open, close) - wick * 0.72),
      close,
      volume: 180 + Math.abs(seededNoise(index + 33)) * 2_900 + (progress > 0.7 ? 1_400 : 0),
    });
  }
  return candles;
}

export function nextDemoTrade(lastPrice: number, tick: number, nowMs = Date.now()): LiveTrade {
  const drift = Math.sin(tick / 5) * 0.0018 + Math.sin(tick / 19) * 0.0024;
  const noise = seededNoise(tick + Math.floor(nowMs / 250)) * 0.0014;
  const next = Math.max(DEMO_TOKEN.price * 0.15, lastPrice * (1 + drift + noise));
  return {
    market: DEMO_MARKET_SLUG,
    price: next,
    size: 120 + Math.abs(seededNoise(tick + 101)) * 2_800,
    timestamp: nowMs,
    side: next >= lastPrice ? "buy" : "sell",
  };
}

export function createDemoMarketEvents(now = Date.now()): MarketEvent[] {
  const rows: Array<[MarketEvent["action"], number, number, string, string]> = [
    ["spot-buy", 0.184, 82_690, "0x8A7…91F", "Smart-money wallet"],
    ["short", 0.061, 81_920, "0x44C…E81", "10× short opened"],
    ["spot-buy", 0.092, 81_770, "0xD14…B02", "Independent buyer"],
    ["long", 0.075, 80_940, "0x90B…7AA", "5× long opened"],
    ["spot-sell", 0.038, 80_210, "0x2F1…991", "Spot holder trimmed"],
    ["short-squeeze", 0.048, 79_860, "Keeper", "3 shorts liquidated"],
    ["spot-buy", 0.132, 78_420, "0xC20…419", "Fresh wallet"],
    ["spot-sell", 0.027, 77_640, "0xE18…D41", "Partial exit"],
    ["long", 0.042, 77_110, "0x710…4A8", "20× long opened"],
    ["spot-buy", 0.067, 76_320, "0x00B…882", "New holder"],
    ["short", 0.033, 75_980, "0xA40…11D", "5× short opened"],
    ["spot-buy", 0.058, 75_240, "0x731…BB0", "New holder"],
  ];
  return rows.map(([action, amountEth, marketCap, actor, note], index) => ({
    id: `demo-event-${index}`,
    slug: DEMO_MARKET_SLUG,
    action,
    amountEth,
    marketCap,
    actor,
    note,
    createdAt: now - index * 18_000,
  }));
}

export function isDemoMarket(slug: string) {
  return slug === DEMO_MARKET_SLUG;
}

export const DEMO_LIQUIDATION_CLUSTERS = [
  { id: "demo-short-1", direction: "short" as const, marketCap: DEMO_TOKEN.cap * 1.047, notionalEth: 1.84, positions: 18, distancePercent: 4.7 },
  { id: "demo-short-2", direction: "short" as const, marketCap: DEMO_TOKEN.cap * 1.093, notionalEth: 2.61, positions: 27, distancePercent: 9.3 },
  { id: "demo-short-3", direction: "short" as const, marketCap: DEMO_TOKEN.cap * 1.161, notionalEth: 3.92, positions: 34, distancePercent: 16.1 },
  { id: "demo-long-1", direction: "long" as const, marketCap: DEMO_TOKEN.cap * 0.958, notionalEth: 1.26, positions: 13, distancePercent: -4.2 },
  { id: "demo-long-2", direction: "long" as const, marketCap: DEMO_TOKEN.cap * 0.902, notionalEth: 2.18, positions: 21, distancePercent: -9.8 },
  { id: "demo-long-3", direction: "long" as const, marketCap: DEMO_TOKEN.cap * 0.827, notionalEth: 3.31, positions: 29, distancePercent: -17.3 },
];
