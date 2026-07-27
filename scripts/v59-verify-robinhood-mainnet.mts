import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_DEPLOYER,
  V59_FACTORY_TARGET,
  V59_NETWORK,
  encodeAddressWord,
  hexToBigInt,
  normalizeAddress,
  redactRpc,
  requireRpc,
  rpcRequest,
  run,
} from "./v59-mainnet-common.mts";

const RPC = requireRpc();
const manifestPath = resolve("deployments", "leveragex-mainnet.json");
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, any>
  : null;
const factoryAddress = normalizeAddress(
  process.env.LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.V59_MAINNET_FACTORY_ADDRESS
    ?? manifest?.deployment?.factoryAddress,
  "LEVERAGEX_FACTORY_ADDRESS",
);
const owner = normalizeAddress(
  process.env.V59_FACTORY_OWNER
    ?? manifest?.deployment?.owner,
  "V59_FACTORY_OWNER",
  DEFAULT_DEPLOYER,
);

const chainId = Number(hexToBigInt(await rpcRequest<string>(RPC, "eth_chainId")));
if (chainId !== V59_NETWORK.chainId) throw new Error(`Wrong network: ${chainId}; expected ${V59_NETWORK.chainId}.`);
const code = await rpcRequest<string>(RPC, "eth_getCode", [factoryAddress, "latest"]);
if (code === "0x") throw new Error(`No deployed contract exists at ${factoryAddress}.`);

console.log("Leverage X V59 — Blockscout source verification\n");
console.log(`RPC: ${redactRpc(RPC)}`);
console.log(`Factory: ${factoryAddress}`);
console.log(`Owner constructor argument: ${owner}`);

const constructorArgs = `0x${encodeAddressWord(owner)}`;
run("forge", [
  "verify-contract",
  factoryAddress,
  V59_FACTORY_TARGET,
  "--chain-id", String(V59_NETWORK.chainId),
  "--rpc-url", RPC,
  "--constructor-args", constructorArgs,
  "--verifier", "blockscout",
  "--verifier-url", V59_NETWORK.blockscoutApi,
  "--watch",
], { capture: false, redact: [RPC] });

if (manifest) {
  manifest.verification = {
    status: "submitted-and-confirmed-by-forge",
    verifier: "blockscout",
    verifierUrl: V59_NETWORK.blockscoutApi,
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log("\nVerification command completed.");
console.log(`Review the verified source and constructor arguments: ${V59_NETWORK.explorer}/address/${factoryAddress}?tab=contract`);
