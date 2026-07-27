import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { V60_CANARY_CREATOR, V60_MAX_BUY_WEI, V60_MAX_SELL_TOKEN_WAD, assertOwnerSigner, factoryAddress, marketSnapshot, normalizeAddress, sendOwner, snapshot, vercelCanaryEnv, writeJson } from "./v60-canary-common.mts";

const CONFIRMATION = "OPEN_FIRST_LEVERAGE_X_MAINNET_SPOT_CANARY";
if (process.env.V60_CANARY_OPEN_CONFIRM !== CONFIRMATION) {
  throw new Error(`Spot canary opening is locked. Set V60_CANARY_OPEN_CONFIRM=${CONFIRMATION} only after the first launch receipt and registry record are verified.`);
}
const factory = factoryAddress();
const market = normalizeAddress(process.env.V60_CANARY_MARKET_ADDRESS, "V60_CANARY_MARKET_ADDRESS");
assertOwnerSigner(factory);
const beforeFactory = snapshot(factory);
const beforeMarket = marketSnapshot(factory, market);
if (beforeFactory.launchMode !== 1 || !beforeFactory.canaryCreatorAllowed || beforeFactory.activeCanaryCreator !== V60_CANARY_CREATOR || beforeFactory.marketCount !== 1n || beforeFactory.firstMarket !== market) {
  throw new Error("Factory is not in the exact one-market allowlisted canary state.");
}
if (!beforeFactory.globalTradingPaused || !beforeFactory.newMarketsPaused || !beforeMarket.paused) {
  throw new Error("Factory and first market must all remain paused before the deliberate opening transaction sequence.");
}
if (beforeMarket.creator !== V60_CANARY_CREATOR || beforeMarket.tradeCount !== 1n) {
  throw new Error("First market creator/trade state is unexpected. The only trade before opening must be the constructor genesis buy.");
}

const transactions: string[] = [];
transactions.push(sendOwner(factory, "openFirstCanaryMarket(address)", [market]));

const afterFactory = snapshot(factory);
const afterMarket = marketSnapshot(factory, market);
if (afterFactory.globalTradingPaused || afterMarket.paused || !afterFactory.newMarketsPaused || afterFactory.launchMode !== 1) {
  throw new Error("Canary Spot post-state is incorrect. Emergency pause immediately.");
}
if (afterMarket.maxBuyWei !== V60_MAX_BUY_WEI || afterMarket.maxSellTokenWad !== V60_MAX_SELL_TOKEN_WAD) {
  throw new Error("Canary market caps changed unexpectedly.");
}

writeJson("v60-canary-spot-open.json", { version: "V60", openedAt: new Date().toISOString(), factory, market, token: afterMarket.token, transactions, beforeFactory, beforeMarket, afterFactory, afterMarket });
writeFileSync(resolve("deployments", "v60-vercel-spot-canary.env"), vercelCanaryEnv(factory, "canary-spot-live", true));
console.log("CANARY SPOT OPEN — exactly one registered market, capped buys/sells, public launch mode still disabled.");
console.log(`Market: ${market}`);
console.log(`Token: ${afterMarket.token}`);
