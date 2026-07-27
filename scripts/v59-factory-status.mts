import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  V59_NETWORK,
  hexToBigInt,
  normalizeAddress,
  redactRpc,
  requireRpc,
  rpcRequest,
  run,
} from "./v59-mainnet-common.mts";

const RPC = requireRpc();
const manifestPath = resolve("deployments", "leveragex-mainnet.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, any> : null;
const factory = normalizeAddress(
  process.env.LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.V59_MAINNET_FACTORY_ADDRESS
    ?? process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.NEXT_PUBLIC_V56_MAINNET_FACTORY_ADDRESS
    ?? manifest?.deployment?.factoryAddress,
  "LEVERAGEX_FACTORY_ADDRESS",
);

const chainId = Number(hexToBigInt(await rpcRequest<string>(RPC, "eth_chainId")));
if (chainId !== V59_NETWORK.chainId) throw new Error(`Wrong chain ID ${chainId}.`);
const code = await rpcRequest<string>(RPC, "eth_getCode", [factory, "latest"]);
if (code === "0x") throw new Error(`No bytecode found at ${factory}.`);

function call(signature: string) {
  return run("cast", ["call", factory, signature, "--rpc-url", RPC], { redact: [RPC] }).toLowerCase();
}
const launchMode = Number(call("launchMode()(uint8)"));
const modes = ["closed", "allowlist", "public"];

console.log("Leverage X mainnet factory status\n");
console.log(`RPC: ${redactRpc(RPC)}`);
console.log(`Factory: ${factory}`);
console.log(`Explorer: ${V59_NETWORK.explorer}/address/${factory}`);
console.log(`Owner: ${call("owner()(address)")}`);
console.log(`Pending owner: ${call("pendingOwner()(address)")}`);
console.log(`Launch mode: ${modes[launchMode] ?? `unknown(${launchMode})`}`);
console.log(`Global trading paused: ${call("globalTradingPaused()(bool)")}`);
console.log(`New markets paused: ${call("newMarketsPaused()(bool)")}`);
console.log(`Default max buy: ${call("defaultMaxBuyWei()(uint256)")} wei`);
console.log(`Default max sell: ${call("defaultMaxSellTokenWad()(uint256)")} token-wad`);
console.log(`Market count: ${call("marketCount()(uint256)")}`);
console.log(`Runtime bytecode hash: ${run("cast", ["keccak", code])}`);
