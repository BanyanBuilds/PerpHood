import "server-only";

import { createHash } from "node:crypto";
import { decodeAddress, decodeUint, decodeWords, stripHex, type Hex } from "@/lib/chain/abi";
import { eventTopic, functionSelector } from "@/lib/chain/keccak";
import { rpcRequest } from "@/lib/chain/local-battle-client";
import { V65_TOKEN_LAUNCHED_EVENT, V65_TOTAL_SUPPLY_WAD } from "@/lib/chain/robinhood-v65";

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const TX_PATTERN = /^0x[0-9a-f]{64}$/i;

type ChainReceipt = {
  status?: Hex;
  blockNumber?: Hex;
  logs?: Array<{ address: string; topics: string[]; data: string }>;
};

type SupabaseConfig = { url: string; serviceRoleKey: string };

export type V65LaunchRecordInput = {
  chainId: 4_663;
  network: "mainnet";
  factoryAddress: string;
  poolAddress: string;
  tokenAddress: string;
  creatorAddress: string;
  dexFactory: string;
  pairToken: string;
  positionManager: string;
  liquidityLocker: string;
  launchPositionId: string;
  poolFee: number;
  tokenIsToken0: boolean;
  transactionHash: string;
  blockNumber: number;
  name: string;
  symbol: string;
  description: string;
  metadataUri: string;
  metadataHash: string;
  imageUrl: string;
  website?: string;
  xHandle?: string;
  telegram?: string;
  creatorBuyWei: string;
  creatorTokensOutWad: string;
  marketCapEthWad: string;
  targetFdvEthWad: string;
};

function config(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

export function isV65LaunchStorageConfigured() {
  return Boolean(config());
}

function networkRpc() {
  return process.env.ROBINHOOD_MAINNET_RPC_URL
    ?? process.env.ROBINHOOD_CHAIN_RPC_URL
    ?? "https://rpc.mainnet.chain.robinhood.com";
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const settings = config();
  if (!settings) throw new Error("Supabase launch storage is not configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", settings.serviceRoleKey);
  headers.set("authorization", `Bearer ${settings.serviceRoleKey}`);
  return fetch(`${settings.url}${path}`, { ...init, headers, cache: "no-store" });
}

function topicAddress(value?: string) {
  if (!value) throw new Error("Receipt is missing an indexed address.");
  return `0x${stripHex(value).slice(-40)}`.toLowerCase();
}

function decodeAbiString(value: string) {
  const normalized = stripHex(value);
  if (normalized.length < 128) throw new Error("Malformed ABI string response.");
  const offset = Number(BigInt(`0x${normalized.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${normalized.slice(offset, offset + 64)}`));
  return Buffer.from(normalized.slice(offset + 64, offset + 64 + length * 2), "hex").toString("utf8");
}

async function readContract(address: string, signature: string) {
  return rpcRequest<Hex>(networkRpc(), "eth_call", [{ to: address, data: functionSelector(signature) }, "latest"]);
}

function assertInput(input: V65LaunchRecordInput) {
  if (input.chainId !== 4_663 || input.network !== "mainnet") throw new Error("V65 accepts Robinhood Chain mainnet only.");
  for (const [label, value] of Object.entries({
    factoryAddress: input.factoryAddress,
    poolAddress: input.poolAddress,
    tokenAddress: input.tokenAddress,
    creatorAddress: input.creatorAddress,
    dexFactory: input.dexFactory,
    pairToken: input.pairToken,
    positionManager: input.positionManager,
    liquidityLocker: input.liquidityLocker,
  })) if (!ADDRESS_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  if (!TX_PATTERN.test(input.transactionHash)) throw new Error("Transaction hash is invalid.");
  if (!HASH_PATTERN.test(input.metadataHash)) throw new Error("Metadata hash is invalid.");
  if (!Number.isSafeInteger(input.blockNumber) || input.blockNumber <= 0) throw new Error("Block number is invalid.");
  if (!Number.isSafeInteger(input.poolFee) || input.poolFee !== 10_000) throw new Error("Canonical V65 pool fee must be 10000.");
  if (input.name.length < 2 || input.name.length > 64) throw new Error("Token name is invalid.");
  if (!/^[A-Z0-9]{1,12}$/.test(input.symbol)) throw new Error("Token symbol is invalid.");
  for (const value of [input.launchPositionId, input.creatorBuyWei, input.creatorTokensOutWad, input.marketCapEthWad, input.targetFdvEthWad]) {
    if (!/^\d+$/.test(value)) throw new Error("Launch numeric values must be unsigned integer strings.");
  }
}

async function verifyMetadata(input: V65LaunchRecordInput) {
  const settings = config();
  if (!settings) throw new Error("Supabase launch storage is not configured.");
  const expectedPrefix = `${settings.url}/storage/v1/object/public/leveragex-token-media/`;
  if (!input.metadataUri.startsWith(expectedPrefix) || !input.imageUrl.startsWith(expectedPrefix)) throw new Error("Metadata and artwork must use the canonical Leverage X token-media bucket.");
  const response = await fetch(input.metadataUri, { cache: "no-store" });
  if (!response.ok) throw new Error(`Canonical metadata could not be read (${response.status}).`);
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("Canonical metadata document is too large.");
  const computedHash = `0x${createHash("sha256").update(body).digest("hex")}`;
  if (computedHash.toLowerCase() !== input.metadataHash.toLowerCase()) throw new Error("Metadata document hash does not match the token contract.");
  const metadata = JSON.parse(body) as Record<string, unknown>;
  const props = metadata.properties && typeof metadata.properties === "object" ? metadata.properties as Record<string, unknown> : {};
  const normalized = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const comparisons: Array<[string, string, string]> = [
    ["name", normalized(metadata.name), input.name],
    ["symbol", normalized(metadata.symbol), input.symbol],
    ["description", normalized(metadata.description), input.description],
    ["image", normalized(metadata.image), input.imageUrl],
    ["website", normalized(metadata.external_url), input.website ?? ""],
    ["X profile", normalized(props.x), input.xHandle ?? ""],
    ["Telegram", normalized(props.telegram), input.telegram ?? ""],
  ];
  for (const [label, actual, expected] of comparisons) if (actual !== expected) throw new Error(`Canonical metadata ${label} does not match the launch record.`);
}

async function verifyOnChain(input: V65LaunchRecordInput) {
  const receipt = await rpcRequest<ChainReceipt | null>(networkRpc(), "eth_getTransactionReceipt", [input.transactionHash]);
  if (!receipt || receipt.status !== "0x1" || !receipt.blockNumber) throw new Error("Launch transaction is not confirmed successfully on Robinhood Chain.");
  if (Number(BigInt(receipt.blockNumber)) !== input.blockNumber) throw new Error("Launch block does not match the canonical receipt.");
  const topic = eventTopic(V65_TOKEN_LAUNCHED_EVENT).toLowerCase();
  const log = receipt.logs?.find((entry) => entry.address.toLowerCase() === input.factoryAddress.toLowerCase() && entry.topics[0]?.toLowerCase() === topic);
  if (!log) throw new Error("The canonical V65 TokenLaunched event was not found.");
  const words = decodeWords(log.data);
  if (words.length < 11) throw new Error("The V65 TokenLaunched event is malformed.");
  const comparisons: Array<[string, string, string]> = [
    ["token", topicAddress(log.topics[1]), input.tokenAddress],
    ["creator", topicAddress(log.topics[2]), input.creatorAddress],
    ["DEX factory", topicAddress(log.topics[3]), input.dexFactory],
    ["pair token", decodeAddress(words[0]), input.pairToken],
    ["pool", decodeAddress(words[1]), input.poolAddress],
    ["position manager", decodeAddress(words[2]), input.positionManager],
    ["liquidity locker", decodeAddress(words[3]), input.liquidityLocker],
    ["position ID", decodeUint(words[4]).toString(), input.launchPositionId],
    ["pool fee", decodeUint(words[5]).toString(), String(input.poolFee)],
    ["token ordering", (decodeUint(words[6]) !== 0n).toString(), input.tokenIsToken0.toString()],
    ["creator buy", decodeUint(words[7]).toString(), input.creatorBuyWei],
    ["creator tokens", decodeUint(words[8]).toString(), input.creatorTokensOutWad],
    ["metadata hash", `0x${words[10]}`, input.metadataHash],
  ];
  for (const [label, actual, expected] of comparisons) if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`Canonical ${label} does not match the submitted launch record.`);
  if (decodeUint(words[9]) !== V65_TOTAL_SUPPLY_WAD) throw new Error("Canonical token supply is not exactly one billion tokens.");

  const [nameRaw, symbolRaw, uriRaw, hashRaw, creatorRaw, factoryRaw, supplyRaw, canonicalPoolRaw] = await Promise.all([
    readContract(input.tokenAddress, "name()"),
    readContract(input.tokenAddress, "symbol()"),
    readContract(input.tokenAddress, "metadataURI()"),
    readContract(input.tokenAddress, "metadataHash()"),
    readContract(input.tokenAddress, "creator()"),
    readContract(input.tokenAddress, "launchFactory()"),
    readContract(input.tokenAddress, "totalSupply()"),
    rpcRequest<Hex>(networkRpc(), "eth_call", [{ to: input.factoryAddress, data: `${functionSelector("canonicalPoolForToken(address)")}${stripHex(input.tokenAddress).padStart(64, "0")}` }, "latest"]),
  ]);
  const word = (value: string) => decodeWords(value)[0] ?? "0";
  if (decodeAbiString(nameRaw) !== input.name || decodeAbiString(symbolRaw) !== input.symbol) throw new Error("Token identity does not match the deployed ERC-20.");
  if (decodeAbiString(uriRaw) !== input.metadataUri) throw new Error("Token metadata URI does not match the deployed ERC-20.");
  if (`0x${word(hashRaw)}`.toLowerCase() !== input.metadataHash.toLowerCase()) throw new Error("Token metadata hash mismatch.");
  if (decodeAddress(word(creatorRaw)).toLowerCase() !== input.creatorAddress.toLowerCase()) throw new Error("Token creator mismatch.");
  if (decodeAddress(word(factoryRaw)).toLowerCase() !== input.factoryAddress.toLowerCase()) throw new Error("Token factory mismatch.");
  if (decodeUint(word(supplyRaw)) !== V65_TOTAL_SUPPLY_WAD) throw new Error("Token supply mismatch.");
  if (decodeAddress(word(canonicalPoolRaw)).toLowerCase() !== input.poolAddress.toLowerCase()) throw new Error("Factory canonical-pool mapping mismatch.");
}

export async function saveV65Launch(input: V65LaunchRecordInput) {
  assertInput(input);
  await verifyMetadata(input);
  await verifyOnChain(input);
  const body = {
    chain_id: input.chainId,
    network: input.network,
    factory_address: input.factoryAddress.toLowerCase(),
    market_address: input.poolAddress.toLowerCase(),
    token_address: input.tokenAddress.toLowerCase(),
    creator_address: input.creatorAddress.toLowerCase(),
    transaction_hash: input.transactionHash.toLowerCase(),
    block_number: input.blockNumber,
    name: input.name,
    symbol: input.symbol,
    description: input.description,
    metadata_uri: input.metadataUri,
    metadata_hash: input.metadataHash.toLowerCase(),
    image_url: input.imageUrl,
    website: input.website || null,
    x_handle: input.xHandle || null,
    telegram: input.telegram || null,
    creator_buy_wei: input.creatorBuyWei,
    creator_tokens_out_wad: input.creatorTokensOutWad,
    market_cap_eth_wad: input.marketCapEthWad,
    migration_target_usd_wad: "0",
    status: "confirmed",
    launchpad_version: "V65",
    pool_type: "uniswap-v3",
    dex_factory: input.dexFactory.toLowerCase(),
    pair_token: input.pairToken.toLowerCase(),
    position_manager: input.positionManager.toLowerCase(),
    liquidity_locker: input.liquidityLocker.toLowerCase(),
    launch_position_id: input.launchPositionId,
    final_position_id: null,
    pool_fee: input.poolFee,
    token_is_token0: input.tokenIsToken0,
    opening_fdv_eth_wad: "250000000000000000",
    target_fdv_eth_wad: input.targetFdvEthWad,
  };
  const response = await supabaseFetch("/rest/v1/leveragex_v55_launches?on_conflict=chain_id,token_address", {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`V65 launch registry write failed (${response.status}): ${await response.text()}`);
  const rows = await response.json() as unknown[];
  return rows[0] ?? body;
}

export async function listV65Launches(limit = 250) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const response = await supabaseFetch(`/rest/v1/leveragex_v55_launches?select=*&launchpad_version=eq.V65&status=in.(confirmed,paused,migrated)&order=block_number.desc&limit=${safeLimit}`);
  if (!response.ok) throw new Error(`V65 launch registry read failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<Array<Record<string, unknown>>>;
}
