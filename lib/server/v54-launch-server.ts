import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { decodeAddress, decodeUint, decodeWords, stripHex, type Hex } from "@/lib/chain/abi";
import { eventTopic, functionSelector } from "@/lib/chain/keccak";
import { rpcRequest } from "@/lib/chain/local-battle-client";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;
const TX_PATTERN = /^0x[0-9a-f]{64}$/i;


const MARKET_CREATED_EVENT = "MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)";
const TOTAL_SUPPLY_WAD = 1_000_000_000n * 10n ** 18n;

type ChainReceipt = {
  status?: Hex;
  blockNumber?: Hex;
  logs?: Array<{ address: string; topics: string[]; data: string }>;
};

function networkRpc(chainId: number) {
  if (chainId === 46_630) return process.env.ROBINHOOD_TESTNET_RPC_URL ?? process.env.NEXT_PUBLIC_ROBINHOOD_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";
  if (chainId === 4_663) return process.env.ROBINHOOD_MAINNET_RPC_URL ?? process.env.NEXT_PUBLIC_ROBINHOOD_MAINNET_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
  throw new Error("Unsupported Robinhood Chain ID.");
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
  const data = normalized.slice(offset + 64, offset + 64 + length * 2);
  return Buffer.from(data, "hex").toString("utf8");
}

async function readContract(rpcUrl: string, address: string, signature: string) {
  return rpcRequest<Hex>(rpcUrl, "eth_call", [{ to: address, data: functionSelector(signature) }, "latest"]);
}

async function verifyV54LaunchOnChain(input: V54LaunchRecordInput) {
  const rpcUrl = networkRpc(input.chainId);
  const receipt = await rpcRequest<ChainReceipt | null>(rpcUrl, "eth_getTransactionReceipt", [input.transactionHash]);
  if (!receipt || receipt.status !== "0x1" || !receipt.blockNumber) throw new Error("Launch transaction is not confirmed successfully on Robinhood Chain.");
  if (Number(BigInt(receipt.blockNumber)) !== input.blockNumber) throw new Error("Launch block does not match the canonical receipt.");
  const expectedTopic = eventTopic(MARKET_CREATED_EVENT).toLowerCase();
  const log = receipt.logs?.find((entry) => entry.address.toLowerCase() === input.factoryAddress.toLowerCase() && entry.topics[0]?.toLowerCase() === expectedTopic);
  if (!log) throw new Error("The factory MarketCreated event was not found in the canonical receipt.");
  const words = decodeWords(log.data);
  if (words.length < 5) throw new Error("Factory MarketCreated event is malformed.");
  const eventMarket = topicAddress(log.topics[1]);
  const eventToken = topicAddress(log.topics[2]);
  const eventCreator = topicAddress(log.topics[3]);
  const comparisons: Array<[string, string, string]> = [
    ["market", eventMarket, input.marketAddress],
    ["token", eventToken, input.tokenAddress],
    ["creator", eventCreator, input.creatorAddress],
    ["creator buy", decodeUint(words[0]).toString(), input.creatorBuyWei],
    ["creator tokens", decodeUint(words[1]).toString(), input.creatorTokensOutWad],
    ["market cap", decodeUint(words[2]).toString(), input.marketCapEthWad],
    ["migration target", decodeUint(words[3]).toString(), input.migrationTargetUsdWad],
    ["metadata hash", `0x${words[4]}`.toLowerCase(), input.metadataHash],
  ];
  for (const [label, actual, expected] of comparisons) {
    if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`Canonical ${label} does not match the submitted launch record.`);
  }
  const [nameRaw, symbolRaw, uriRaw, hashRaw, creatorRaw, factoryRaw, marketRaw, supplyRaw] = await Promise.all([
    readContract(rpcUrl, input.tokenAddress, "name()"),
    readContract(rpcUrl, input.tokenAddress, "symbol()"),
    readContract(rpcUrl, input.tokenAddress, "metadataURI()"),
    readContract(rpcUrl, input.tokenAddress, "metadataHash()"),
    readContract(rpcUrl, input.tokenAddress, "creator()"),
    readContract(rpcUrl, input.tokenAddress, "factory()"),
    readContract(rpcUrl, input.tokenAddress, "launchMarket()"),
    readContract(rpcUrl, input.tokenAddress, "totalSupply()"),
  ]);
  const staticWord = (value: string) => decodeWords(value)[0] ?? "0";
  if (decodeAbiString(nameRaw) !== input.name || decodeAbiString(symbolRaw) !== input.symbol) throw new Error("Token identity does not match the deployed ERC-20.");
  if (decodeAbiString(uriRaw) !== input.metadataUri) throw new Error("Token metadata URI does not match the deployed ERC-20.");
  if (`0x${staticWord(hashRaw)}`.toLowerCase() !== input.metadataHash.toLowerCase()) throw new Error("Token metadata hash does not match the launch record.");
  if (decodeAddress(staticWord(creatorRaw)).toLowerCase() !== input.creatorAddress.toLowerCase()) throw new Error("Token creator does not match the launch record.");
  if (decodeAddress(staticWord(factoryRaw)).toLowerCase() !== input.factoryAddress.toLowerCase()) throw new Error("Token factory does not match the launch record.");
  if (decodeAddress(staticWord(marketRaw)).toLowerCase() !== input.marketAddress.toLowerCase()) throw new Error("Token launch market does not match the launch record.");
  if (decodeUint(staticWord(supplyRaw)) !== TOTAL_SUPPLY_WAD) throw new Error("Token supply is not exactly one billion tokens.");
}

type SupabaseConfig = { url: string; serviceRoleKey: string };

export type V54LaunchRecordInput = {
  chainId: number;
  network: "testnet" | "mainnet";
  factoryAddress: string;
  marketAddress: string;
  tokenAddress: string;
  creatorAddress: string;
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
  migrationTargetUsdWad: string;
};

function config(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

export function isV54LaunchStorageConfigured() {
  return Boolean(config());
}

function safeSegment(value: string, fallback: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return normalized || fallback;
}

function extensionForMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/svg+xml") return "svg";
  return mime.split("/")[1] || "bin";
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const settings = config();
  if (!settings) throw new Error("Supabase launch storage is not configured.");
  const headers = new Headers(init.headers);
  headers.set("apikey", settings.serviceRoleKey);
  headers.set("authorization", `Bearer ${settings.serviceRoleKey}`);
  return fetch(`${settings.url}${path}`, { ...init, headers, cache: "no-store" });
}

async function uploadObject(path: string, body: BodyInit, contentType: string) {
  const response = await supabaseFetch(`/storage/v1/object/token-media/${path}`, {
    method: "POST",
    headers: { "content-type": contentType, "x-upsert": "false" },
    body,
  });
  if (!response.ok) throw new Error(`Token-media upload failed (${response.status}): ${await response.text()}`);
  const settings = config();
  if (!settings) throw new Error("Supabase launch storage is not configured.");
  return `${settings.url}/storage/v1/object/public/token-media/${path}`;
}

export async function createV54Metadata(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  const description = String(formData.get("description") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();
  const xHandle = String(formData.get("xHandle") ?? "").trim();
  const telegram = String(formData.get("telegram") ?? "").trim();
  const imageExactHash = String(formData.get("imageExactHash") ?? "").trim();
  const file = formData.get("image");

  if (name.length < 2 || name.length > 64) throw new Error("Token name must be 2–64 characters.");
  if (!/^[A-Z0-9]{1,12}$/.test(symbol)) throw new Error("Ticker must use 1–12 uppercase letters or numbers.");
  if (description.length < 4 || description.length > 1_000) throw new Error("Description must be 4–1,000 characters.");
  if (!(file instanceof File)) throw new Error("Token artwork is required for a real launch.");
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Artwork must be PNG, JPG, WEBP, GIF, or AVIF.");
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new Error("Artwork must be no larger than 4 MB.");

  const launchId = randomUUID();
  const root = `${new Date().toISOString().slice(0, 10)}/${launchId}-${safeSegment(symbol, "token")}`;
  const imagePath = `${root}/image.${extensionForMime(file.type)}`;
  const imageUrl = await uploadObject(imagePath, Buffer.from(await file.arrayBuffer()), file.type);
  const metadata = {
    name,
    symbol,
    description,
    image: imageUrl,
    external_url: website || undefined,
    properties: {
      category: "image",
      files: [{ uri: imageUrl, type: file.type }],
      creator: "PERPHOOD",
      chain: "Robinhood Chain",
      image_exact_hash: imageExactHash || undefined,
      x: xHandle || undefined,
      telegram: telegram || undefined,
    },
  };
  const metadataBody = JSON.stringify(metadata);
  const metadataHash = `0x${createHash("sha256").update(metadataBody).digest("hex")}`;
  const metadataPath = `${root}/metadata.json`;
  const metadataUri = await uploadObject(metadataPath, metadataBody, "application/json; charset=utf-8");
  return { launchId, imageUrl, metadataUri, metadataHash, metadata };
}


function normalizeOptionalMetadata(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function verifyV54MetadataDocument(input: V54LaunchRecordInput) {
  const settings = config();
  if (!settings) throw new Error("Supabase launch storage is not configured.");
  const expectedPrefix = `${settings.url}/storage/v1/object/public/token-media/`;
  if (!input.metadataUri.startsWith(expectedPrefix) || !input.imageUrl.startsWith(expectedPrefix)) {
    throw new Error("Launch metadata and artwork must use the configured PERPHOOD token-media bucket.");
  }
  const response = await fetch(input.metadataUri, { cache: "no-store" });
  if (!response.ok) throw new Error(`Canonical metadata could not be read (${response.status}).`);
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > 256 * 1024) throw new Error("Canonical metadata document is too large.");
  const computedHash = `0x${createHash("sha256").update(body).digest("hex")}`;
  if (computedHash.toLowerCase() !== input.metadataHash.toLowerCase()) throw new Error("Canonical metadata document hash does not match the token contract.");
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error("Canonical token metadata is not valid JSON.");
  }
  const properties = metadata.properties && typeof metadata.properties === "object" ? metadata.properties as Record<string, unknown> : {};
  const comparisons: Array<[string, string, string]> = [
    ["name", normalizeOptionalMetadata(metadata.name), input.name],
    ["symbol", normalizeOptionalMetadata(metadata.symbol), input.symbol],
    ["description", normalizeOptionalMetadata(metadata.description), input.description],
    ["image", normalizeOptionalMetadata(metadata.image), input.imageUrl],
    ["website", normalizeOptionalMetadata(metadata.external_url), input.website ?? ""],
    ["X profile", normalizeOptionalMetadata(properties.x), input.xHandle ?? ""],
    ["Telegram", normalizeOptionalMetadata(properties.telegram), input.telegram ?? ""],
  ];
  for (const [label, actual, expected] of comparisons) {
    if (actual !== expected) throw new Error(`Canonical metadata ${label} does not match the submitted launch record.`);
  }
}

function assertLaunchRecord(input: V54LaunchRecordInput) {
  if (input.chainId !== 46_630 && input.chainId !== 4_663) throw new Error("Unsupported Robinhood Chain ID.");
  for (const [label, value] of Object.entries({
    factoryAddress: input.factoryAddress,
    marketAddress: input.marketAddress,
    tokenAddress: input.tokenAddress,
    creatorAddress: input.creatorAddress,
  })) if (!ADDRESS_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  if (!TX_PATTERN.test(input.transactionHash)) throw new Error("Transaction hash is invalid.");
  if (!HASH_PATTERN.test(input.metadataHash)) throw new Error("Metadata hash is invalid.");
  if (!Number.isSafeInteger(input.blockNumber) || input.blockNumber <= 0) throw new Error("Block number is invalid.");
  if (input.name.length < 2 || input.name.length > 64) throw new Error("Token name is invalid.");
  if (!/^[A-Z0-9]{1,12}$/.test(input.symbol)) throw new Error("Token symbol is invalid.");
  for (const value of [input.creatorBuyWei, input.creatorTokensOutWad, input.marketCapEthWad, input.migrationTargetUsdWad]) {
    if (!/^\d+$/.test(value)) throw new Error("Launch numeric values must be unsigned integer strings.");
  }
}

export async function saveV54Launch(input: V54LaunchRecordInput) {
  assertLaunchRecord(input);
  await verifyV54MetadataDocument(input);
  await verifyV54LaunchOnChain(input);
  const body = {
    chain_id: input.chainId,
    network: input.network,
    factory_address: input.factoryAddress.toLowerCase(),
    market_address: input.marketAddress.toLowerCase(),
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
    migration_target_usd_wad: input.migrationTargetUsdWad,
    status: "confirmed",
  };
  const response = await supabaseFetch("/rest/v1/perphood_v54_launches?on_conflict=chain_id,token_address", {
    method: "POST",
    headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Launch registry write failed (${response.status}): ${await response.text()}`);
  const rows = await response.json() as unknown[];
  return rows[0] ?? body;
}

export async function listV54Launches(limit = 100) {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const response = await supabaseFetch(`/rest/v1/perphood_v54_launches?select=*&status=eq.confirmed&order=block_number.desc&limit=${safeLimit}`);
  if (!response.ok) throw new Error(`Launch registry read failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<Array<Record<string, unknown>>>;
}
