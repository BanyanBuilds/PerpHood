import { assertOwnerSigner, factoryAddress, marketSnapshot, normalizeAddress, sendOwner, snapshot, writeJson } from "./v60-canary-common.mts";

const CONFIRMATION = "EMERGENCY_LOCKDOWN_LEVERAGE_X_MAINNET";
if (process.env.V60_EMERGENCY_PAUSE_CONFIRM !== CONFIRMATION) {
  throw new Error(`Emergency lockdown is locked. Set V60_EMERGENCY_PAUSE_CONFIRM=${CONFIRMATION} for the deliberate owner run.`);
}
const factory = factoryAddress();
assertOwnerSigner(factory);
const marketInput = process.env.V60_CANARY_MARKET_ADDRESS?.trim();
const marketAddress = marketInput ? normalizeAddress(marketInput, "V60_CANARY_MARKET_ADDRESS") : "0x0000000000000000000000000000000000000000";
const transactions = [sendOwner(factory, "emergencyLockdown(address)", [marketAddress])];
const market = marketInput ? marketSnapshot(factory, marketAddress) : null;
const factoryState = snapshot(factory);
if (!factoryState.globalTradingPaused || !factoryState.newMarketsPaused || factoryState.launchMode !== 0) {
  throw new Error("Emergency lockdown verification failed: factory is not CLOSED + globally paused + new-markets paused.");
}
if (factoryState.activeCanaryCreator !== "0x0000000000000000000000000000000000000000" || factoryState.canaryCreatorAllowed) {
  throw new Error("Emergency lockdown verification failed: canary creator remains active or allowlisted.");
}
if (market && !market.paused) throw new Error("Emergency lockdown verification failed: canary market is still open.");
writeJson("v60-emergency-lockdown.json", { version: "V60", lockedAt: new Date().toISOString(), transactions, factory: factoryState, market });
console.log("EMERGENCY LOCKDOWN CONFIRMED ON-CHAIN: launches CLOSED, trading globally PAUSED, creator REVOKED.");
