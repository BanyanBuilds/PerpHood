import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_DEPLOYER, DEFAULT_FIRST_TRADER, V59_NETWORK, hexToBigInt, normalizeAddress, redactRpc, requireRpc, rpcRequest } from "./v59-mainnet-common.mts";

const rpc = requireRpc();
const creator = normalizeAddress(process.env.V60_CANARY_CREATOR_ADDRESS, "V60_CANARY_CREATOR_ADDRESS", DEFAULT_DEPLOYER);
const trader = normalizeAddress(process.env.V59_FIRST_TRADER_ADDRESS, "V59_FIRST_TRADER_ADDRESS", DEFAULT_FIRST_TRADER);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

console.log("Leverage X V62 — full go-live preflight (NO SIGNING / NO BROADCAST)\n");
console.log(`RPC: ${redactRpc(rpc)}`);

const chainId = Number(hexToBigInt(await rpcRequest<string>(rpc, "eth_chainId")));
if (chainId !== V59_NETWORK.chainId) throw new Error(`Wrong chain ${chainId}; expected ${V59_NETWORK.chainId}.`);
const latestBlockHex = await rpcRequest<string>(rpc, "eth_blockNumber");
const latestBlock = Number(hexToBigInt(latestBlockHex));
const head = await rpcRequest<{ timestamp: string }>(rpc, "eth_getBlockByNumber", [latestBlockHex, false]);
const age = Math.max(0, Math.floor(Date.now() / 1000) - Number(hexToBigInt(head.timestamp)));
if (age > 600) throw new Error(`RPC head is stale by ${age}s.`);

for (const [label, address] of [["creator", creator], ["trader", trader]] as const) {
  const code = await rpcRequest<string>(rpc, "eth_getCode", [address, "latest"]);
  if (code !== "0x") throw new Error(`${label} address ${address} is not an EOA.`);
}

const storage = { configured: Boolean(supabaseUrl && serviceRole && anonKey), bucketReady: false, registryReady: false, publicReadReady: false };
if (storage.configured) {
  const serviceHeaders = { apikey: serviceRole, authorization: `Bearer ${serviceRole}` };
  const [bucket, registry, publicFeed] = await Promise.all([
    fetch(`${supabaseUrl}/storage/v1/bucket/leveragex-token-media`, { headers: serviceHeaders }),
    fetch(`${supabaseUrl}/rest/v1/leveragex_v55_launches?select=id&limit=1`, { headers: serviceHeaders }),
    fetch(`${supabaseUrl}/rest/v1/leveragex_v55_launches?select=id&limit=1`, { headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` } }),
  ]);
  storage.bucketReady = bucket.ok;
  storage.registryReady = registry.ok;
  storage.publicReadReady = publicFeed.ok;
}
if (!storage.configured) throw new Error("Supabase URL, anon key, and service-role key must be present in the local preflight environment.");
if (!storage.bucketReady || !storage.registryReady || !storage.publicReadReady) {
  throw new Error("Supabase launch storage is incomplete. Apply supabase/v55_production_launch.sql and verify the bucket, service-role registry, and public read policy.");
}

const factory = normalizeAddress(
  process.env.LEVERAGEX_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS,
  "LEVERAGEX_FACTORY_ADDRESS",
  "0x0000000000000000000000000000000000000000",
);
const factoryCode = factory === "0x0000000000000000000000000000000000000000" ? "0x" : await rpcRequest<string>(rpc, "eth_getCode", [factory, "latest"]);
const report = {
  version: "V62",
  generatedAt: new Date().toISOString(),
  network: { name: V59_NETWORK.name, chainId, latestBlock, blockAgeSeconds: age, rpc: redactRpc(rpc) },
  accounts: { creator, trader },
  storage,
  factory: { address: factory === "0x0000000000000000000000000000000000000000" ? null : factory, codePresent: factoryCode !== "0x" },
  gates: {
    correctChain: true,
    rpcFresh: true,
    creatorIsEoa: true,
    traderIsEoa: true,
    storageReady: storage.bucketReady && storage.registryReady && storage.publicReadReady,
    factoryPresent: factoryCode !== "0x",
    signedTransactions: 0,
  },
  nextCommand: factoryCode === "0x" ? "npm run chain:v59:preflight" : "npm run chain:v60:canary:preflight",
};
mkdirSync(resolve("deployments"), { recursive: true });
writeFileSync(resolve("deployments/v62-go-live-preflight.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log("\nPASS — V62 go-live preflight signed and broadcast zero transactions.");
