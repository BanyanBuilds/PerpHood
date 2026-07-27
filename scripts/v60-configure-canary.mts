import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { V60_CANARY_CREATOR, V60_MAX_BUY_WEI, V60_MAX_SELL_TOKEN_WAD, assertOwnerSigner, factoryAddress, sendOwner, snapshot, vercelCanaryEnv, writeJson } from "./v60-canary-common.mts";

const CONFIRMATION = "CONFIGURE_LEVERAGE_X_MAINNET_CANARY_ALLOWLIST";
if (process.env.V60_CANARY_CONFIGURE_CONFIRM !== CONFIRMATION) {
  throw new Error(`Canary configuration is locked. Set V60_CANARY_CONFIGURE_CONFIRM=${CONFIRMATION} only for the deliberate owner run.`);
}

const factory = factoryAddress();
const before = snapshot(factory);
assertOwnerSigner(factory);
if (before.launchMode !== 0) throw new Error(`Factory launch mode must be closed before configuration; current=${before.launchMode}.`);
if (!before.globalTradingPaused || !before.newMarketsPaused || before.marketCount !== 0n || before.activeCanaryCreator !== "0x0000000000000000000000000000000000000000") {
  throw new Error("Factory must be globally paused, new-market paused, and have zero markets before canary configuration.");
}

console.log("Leverage X V60 — configuring one allowlisted canary creator\n");
const transactions: string[] = [];
transactions.push(sendOwner(factory, "configureFirstCanary(address,uint256,uint256)", [V60_CANARY_CREATOR, V60_MAX_BUY_WEI.toString(), V60_MAX_SELL_TOKEN_WAD.toString()]));

const after = snapshot(factory);
if (after.launchMode !== 1 || !after.canaryCreatorAllowed || after.activeCanaryCreator !== V60_CANARY_CREATOR || !after.globalTradingPaused || !after.newMarketsPaused) {
  throw new Error("Post-configuration state does not match the required allowlist/paused posture.");
}
if (after.defaultMaxBuyWei !== V60_MAX_BUY_WEI || after.defaultMaxSellTokenWad !== V60_MAX_SELL_TOKEN_WAD) {
  throw new Error("Post-configuration trade caps do not match the V60 canary limits.");
}

const manifest = { version: "V60", configuredAt: new Date().toISOString(), factory, creator: V60_CANARY_CREATOR, transactions, before, after };
writeJson("v60-canary-configured.json", manifest);
writeFileSync(resolve("deployments", "v60-vercel-canary.env"), vercelCanaryEnv(factory, "canary-launch-ready", true));
console.log("\nCANARY CONFIGURED — launch allowlist only; all Spot trading remains paused.");
console.log(`Creator: ${V60_CANARY_CREATOR}`);
console.log("Import deployments/v60-vercel-canary.env into Vercel and redeploy before using Launch Token.");
