import {
  BATTLE_TOTAL_SUPPLY,
  createBattlePoolState,
  executeOpenLong,
  executeOpenShort,
  executeSpotBuy,
  poolToTokenPatch,
} from "../lib/battle-pool.ts";
import {
  battleRealtimeStore,
  buildBattleRealtimeFrame,
  quoteExecutablePositionPnl,
  quoteExecutableSpotPnl,
} from "../lib/realtime-battle.ts";
import type { Position, SpotHolding, Token } from "../lib/types.ts";

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function tokenFromPool(pool: ReturnType<typeof createBattlePoolState>): Token {
  return {
    slug: "speed",
    symbol: "SPD",
    name: "Speed",
    emoji: "⚡",
    hue: 120,
    cap: 0,
    price: 0,
    change24h: 0,
    graduation: 0,
    longs: 50,
    volume24h: 0,
    openInterest: 0,
    funding: 0,
    launchedMinutesAgo: 0,
    description: "Realtime PNL test market",
    ...poolToTokenPatch(pool, 3_200),
  };
}

let pool = executeSpotBuy(createBattlePoolState(), 1).next;
const longTrade = executeOpenLong(pool, 0.02, 10);
pool = longTrade.next;
const long: Position = {
  id: "long-live",
  slug: "speed",
  direction: "long",
  leverage: 10,
  collateral: 0.02,
  initialCollateral: 0.02,
  notional: longTrade.notionalEth,
  entryCap: longTrade.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  currentCap: longTrade.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  liquidationCap: 0,
  openedAt: Date.now(),
  entryFee: longTrade.feeEth,
  tokenAmount: longTrade.tokens,
  debtEth: longTrade.debtEth,
  maintenanceMarginRate: 0.02,
};

const beforePump = quoteExecutablePositionPnl(tokenFromPool(pool), long);
expect(beforePump.executable, "Fresh long did not receive an executable PNL quote.");

pool = executeSpotBuy(pool, 0.35).next;
const afterPumpToken = tokenFromPool(pool);
const afterPump = quoteExecutablePositionPnl(afterPumpToken, long);
expect(afterPump.executable, "Winning long was not executable.");
expect(afterPump.pnlEth > beforePump.pnlEth, "Long executable PNL did not react to the shared-pool buy.");

const shortTrade = executeOpenShort(pool, 0.01, 5);
pool = shortTrade.next;
const short: Position = {
  id: "short-live",
  slug: "speed",
  direction: "short",
  leverage: 5,
  collateral: 0.01,
  notional: shortTrade.notionalEth,
  entryCap: shortTrade.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  currentCap: shortTrade.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  liquidationCap: 0,
  openedAt: Date.now(),
  entryFee: shortTrade.feeEth,
  borrowedTokens: shortTrade.borrowedTokens,
  lockedProceedsEth: shortTrade.lockedProceedsEth,
  maintenanceMarginRate: 0.02,
};
const shortQuote = quoteExecutablePositionPnl(tokenFromPool(pool), short);
expect(shortQuote.executable, "Fresh short did not receive an executable PNL quote.");

const spotBuy = executeSpotBuy(pool, 0.05);
pool = spotBuy.next;
const holding: SpotHolding = {
  id: "spot-live",
  slug: "speed",
  investedEth: 0.05,
  entryCap: spotBuy.priceAfter * BATTLE_TOTAL_SUPPLY * 3_200,
  openedAt: Date.now(),
  tokenAmount: spotBuy.tokens,
  entryPriceEth: spotBuy.priceAfter,
};
const spotQuote = quoteExecutableSpotPnl(tokenFromPool(pool), holding);
expect(spotQuote.executable, "Spot holding did not receive an executable liquidation-value quote.");
expect(Number.isFinite(spotQuote.executableValueEth), "Spot executable value was not finite.");

const frameInput = buildBattleRealtimeFrame(tokenFromPool(pool), [long, short], [holding]);
const first = battleRealtimeStore.publish(frameInput);
const second = battleRealtimeStore.publish({ ...frameInput, tokenVolume: frameInput.tokenVolume + 1_000 });
expect(second.sequence === first.sequence + 1, "Realtime sequence was not monotonic.");
expect(second.executionVolumeUsd === 1_000, "Realtime execution-volume delta was incorrect.");
expect(Boolean(second.positionPnl[long.id]), "Long PNL was missing from the realtime frame.");
expect(Boolean(second.positionPnl[short.id]), "Short PNL was missing from the realtime frame.");
expect(Boolean(second.holdingPnl[holding.id]), "Spot PNL was missing from the realtime frame.");

console.log(JSON.stringify({
  status: "PASS",
  sequence: second.sequence,
  longPnlBeforePumpEth: Number(beforePump.pnlEth.toFixed(8)),
  longPnlAfterPumpEth: Number(afterPump.pnlEth.toFixed(8)),
  shortExecutablePnlEth: Number(shortQuote.pnlEth.toFixed(8)),
  spotExecutableValueEth: Number(spotQuote.executableValueEth.toFixed(8)),
  spotCloseImpactPercent: Number(spotQuote.priceImpactPercent.toFixed(4)),
  executionVolumeDeltaUsd: second.executionVolumeUsd,
}, null, 2));
