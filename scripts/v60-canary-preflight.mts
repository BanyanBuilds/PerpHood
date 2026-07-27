import { V60_CANARY_CREATOR, V60_FIRST_TRADER, V60_MAX_BUY_WEI, V60_MAX_SELL_TOKEN_WAD, V59_NETWORK, assertEoa, assertMainnet, factoryAddress, requireRpc, rpcRequest, snapshot, writeJson } from "./v60-canary-common.mts";

const rpc = requireRpc();
const factory = factoryAddress();
console.log("Leverage X V60 — mainnet canary preflight (NO SIGNING / NO BROADCAST)\n");
await assertMainnet(rpc);

const code = await rpcRequest<string>(rpc, "eth_getCode", [factory, "latest"]);
if (code === "0x") throw new Error(`No factory bytecode exists at ${factory}.`);
await assertEoa(rpc, V60_CANARY_CREATOR, "Canary creator");
await assertEoa(rpc, V60_FIRST_TRADER, "First trader");

const state = snapshot(factory);
if (state.owner !== V60_CANARY_CREATOR) {
  throw new Error(`Factory owner ${state.owner} does not match the configured first canary creator/deployer ${V60_CANARY_CREATOR}.`);
}
if (state.launchMode > 1) throw new Error("Factory is already public. V60 canary preflight refuses a public launch mode.");
if (!state.globalTradingPaused) throw new Error("Global trading must remain paused before the first canary market exists.");
if (!state.newMarketsPaused) throw new Error("New markets must remain paused during canary preparation.");
if (state.marketCount > 1n) throw new Error("More than one market exists. V60 first-canary workflow requires manual review.");

const [creatorBalance, traderBalance, gasPrice] = await Promise.all([
  rpcRequest<string>(rpc, "eth_getBalance", [V60_CANARY_CREATOR, "latest"]),
  rpcRequest<string>(rpc, "eth_getBalance", [V60_FIRST_TRADER, "latest"]),
  rpcRequest<string>(rpc, "eth_gasPrice"),
]);

const report = {
  version: "V60",
  checkedAt: new Date().toISOString(),
  network: { name: V59_NETWORK.name, chainId: V59_NETWORK.chainId },
  accounts: {
    canaryCreator: V60_CANARY_CREATOR,
    firstTrader: V60_FIRST_TRADER,
    creatorBalanceWei: BigInt(creatorBalance).toString(),
    traderBalanceWei: BigInt(traderBalance).toString(),
  },
  factory: state,
  intendedCanarySafety: {
    launchMode: "allowlist",
    globalTradingPaused: true,
    newMarketsPaused: true,
    maxBuyWei: V60_MAX_BUY_WEI.toString(),
    maxSellTokenWad: V60_MAX_SELL_TOKEN_WAD.toString(),
  },
  gasPriceWei: BigInt(gasPrice).toString(),
  signingRequired: false,
  broadcastCount: 0,
};
const path = writeJson("v60-canary-preflight.json", report);
console.log(`Factory: ${factory}`);
console.log(`Mode: ${["closed", "allowlist", "public"][state.launchMode] ?? state.launchMode}`);
console.log(`Creator allowlisted: ${state.canaryCreatorAllowed}`);
console.log(`Markets: ${state.marketCount}`);
console.log(`Report: ${path}`);
console.log("PASS — V60 preflight did not sign or broadcast anything.");
