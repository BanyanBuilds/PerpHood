import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeAddress, decodeUint, decodeWords, stripHex, type Hex } from "../lib/chain/abi.ts";
import { eventTopic, functionSelector } from "../lib/chain/keccak.ts";
import { DEFAULT_DEPLOYER, V59_NETWORK, normalizeAddress, redactRpc, requireRpc, rpcRequest } from "./v59-mainnet-common.mts";

const TX = (process.env.V62_FIRST_LAUNCH_TX_HASH ?? "").trim().toLowerCase();
if (!/^0x[0-9a-f]{64}$/.test(TX)) throw new Error("Set V62_FIRST_LAUNCH_TX_HASH to the confirmed first launch transaction hash.");
const rpc = requireRpc();
const factory = normalizeAddress(process.env.LEVERAGEX_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS, "LEVERAGEX_FACTORY_ADDRESS");
const expectedCreator = normalizeAddress(process.env.V60_CANARY_CREATOR_ADDRESS, "V60_CANARY_CREATOR_ADDRESS", DEFAULT_DEPLOYER);
const MARKET_CREATED = eventTopic("MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)").toLowerCase();

type Receipt = { status?: Hex; blockNumber?: Hex; blockHash?: Hex; logs?: Array<{ address: Hex; topics: Hex[]; data: Hex }> };
function topicAddress(value: string) { return `0x${stripHex(value).slice(-40)}`.toLowerCase(); }
function wordAddress(value: string) { return decodeAddress(decodeWords(value)[0] ?? "0").toLowerCase(); }
function wordUint(value: string) { return decodeUint(decodeWords(value)[0] ?? "0"); }
function decodeString(value: string) {
  const data = stripHex(value);
  const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
  return Buffer.from(data.slice(offset + 64, offset + 64 + length * 2), "hex").toString("utf8");
}
async function call(target: string, signature: string) {
  return rpcRequest<string>(rpc, "eth_call", [{ to: target, data: functionSelector(signature) }, "latest"]);
}

console.log("Leverage X V62 — first launch proof (NO SIGNING / NO BROADCAST)\n");
console.log(`RPC: ${redactRpc(rpc)}`);
console.log(`Transaction: ${TX}`);
const receipt = await rpcRequest<Receipt | null>(rpc, "eth_getTransactionReceipt", [TX]);
if (!receipt || receipt.status !== "0x1" || !receipt.blockNumber) throw new Error("The launch transaction is missing, pending, or reverted.");
const log = receipt.logs?.find((entry) => entry.address.toLowerCase() === factory && entry.topics[0]?.toLowerCase() === MARKET_CREATED);
if (!log) throw new Error("The configured factory MarketCreated event was not found in the receipt.");
const words = decodeWords(log.data);
if (words.length < 5) throw new Error("MarketCreated event payload is malformed.");
const market = topicAddress(log.topics[1]);
const token = topicAddress(log.topics[2]);
const creator = topicAddress(log.topics[3]);
if (creator !== expectedCreator) throw new Error(`Launch creator ${creator} does not match ${expectedCreator}.`);
const creatorBuyWei = decodeUint(words[0]);
const creatorTokensOutWad = decodeUint(words[1]);
const marketCapEthWad = decodeUint(words[2]);
const migrationTargetUsdWad = decodeUint(words[3]);
const eventMetadataHash = `0x${words[4]}`.toLowerCase();

const [nameRaw, symbolRaw, metadataUriRaw, metadataHashRaw, totalSupplyRaw, tokenCreatorRaw, tokenFactoryRaw, launchMarketRaw, marketCreatorRaw, marketTokenRaw, pausedRaw, tradeCountRaw, factoryMarketRaw, marketRegisteredRaw, marketCountRaw] = await Promise.all([
  call(token, "name()"), call(token, "symbol()"), call(token, "metadataURI()"), call(token, "metadataHash()"), call(token, "totalSupply()"), call(token, "creator()"), call(token, "factory()"), call(token, "launchMarket()"),
  call(market, "creator()"), call(market, "token()"), call(market, "paused()"), call(market, "tradeCount()"),
  rpcRequest<string>(rpc, "eth_call", [{ to: factory, data: `${functionSelector("marketForToken(address)")}${token.slice(2).padStart(64, "0")}` }, "latest"]),
  rpcRequest<string>(rpc, "eth_call", [{ to: factory, data: `${functionSelector("isMarket(address)")}${market.slice(2).padStart(64, "0")}` }, "latest"]),
  call(factory, "marketCount()"),
]);
const name = decodeString(nameRaw);
const symbol = decodeString(symbolRaw);
const metadataUri = decodeString(metadataUriRaw);
const contractMetadataHash = `0x${decodeWords(metadataHashRaw)[0] ?? ""}`.toLowerCase();
const totalSupply = wordUint(totalSupplyRaw);
const checks = {
  creatorMatches: creator === expectedCreator && wordAddress(tokenCreatorRaw) === creator && wordAddress(marketCreatorRaw) === creator,
  factoryMatches: wordAddress(tokenFactoryRaw) === factory,
  marketLinksMatch: wordAddress(launchMarketRaw) === market && wordAddress(marketTokenRaw) === token && wordAddress(factoryMarketRaw) === market,
  marketRegistered: wordUint(marketRegisteredRaw) === 1n,
  metadataHashMatches: eventMetadataHash === contractMetadataHash,
  oneBillionSupply: totalSupply === 1_000_000_000n * 10n ** 18n,
  genesisTradeOnly: wordUint(tradeCountRaw) === 1n,
  firstMarketOnly: wordUint(marketCountRaw) === 1n,
};
for (const [label, passed] of Object.entries(checks)) if (!passed) throw new Error(`First-launch proof failed: ${label}.`);

const metadataResponse = await fetch(metadataUri, { cache: "no-store" });
if (!metadataResponse.ok) throw new Error(`Metadata document returned HTTP ${metadataResponse.status}.`);
const metadataBody = await metadataResponse.text();
const computedMetadataHash = `0x${createHash("sha256").update(metadataBody).digest("hex")}`;
if (computedMetadataHash.toLowerCase() !== contractMetadataHash) throw new Error("Public metadata SHA-256 does not match the token contract.");
const metadata = JSON.parse(metadataBody) as { name?: string; symbol?: string; image?: string; description?: string };
if (metadata.name !== name || metadata.symbol !== symbol || !metadata.image) throw new Error("Public metadata identity or image does not match the deployed token.");

let registryVerified = false;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!supabaseUrl || !serviceRole) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY locally so the first launch can be proven against the production registry.");
}
if (supabaseUrl && serviceRole) {
  const response = await fetch(`${supabaseUrl}/rest/v1/leveragex_v55_launches?chain_id=eq.${V59_NETWORK.chainId}&token_address=eq.${token}&select=transaction_hash,market_address,creator_address,metadata_hash,status`, {
    headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}` },
  });
  if (response.ok) {
    const rows = await response.json() as Array<Record<string, unknown>>;
    registryVerified = rows.some((row) => String(row.transaction_hash).toLowerCase() === TX && String(row.market_address).toLowerCase() === market && String(row.metadata_hash).toLowerCase() === contractMetadataHash);
  }
}
if (!registryVerified) throw new Error("The first launch is not present in the canonical Supabase launch registry.");

const proof = {
  version: "V62",
  provedAt: new Date().toISOString(),
  network: { name: V59_NETWORK.name, chainId: V59_NETWORK.chainId, explorer: V59_NETWORK.explorer },
  transaction: { hash: TX, blockNumber: Number(BigInt(receipt.blockNumber)), blockHash: receipt.blockHash ?? null },
  factory,
  market: { address: market, paused: wordUint(pausedRaw) === 1n, tradeCount: wordUint(tradeCountRaw).toString() },
  token: { address: token, name, symbol, totalSupplyWad: totalSupply.toString(), metadataUri, metadataHash: contractMetadataHash, image: metadata.image },
  creator: { address: creator, genesisBuyWei: creatorBuyWei.toString(), tokensOutWad: creatorTokensOutWad.toString() },
  launch: { marketCapEthWad: marketCapEthWad.toString(), migrationTargetUsdWad: migrationTargetUsdWad.toString() },
  checks,
  registryVerified,
  gmgn: { contractAddressReadyForManualSearch: token, indexingGuaranteed: false },
  signedTransactions: 0,
};
mkdirSync(resolve("deployments"), { recursive: true });
writeFileSync(resolve("deployments/v62-first-launch-proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
console.log("\nPASS — on-chain identity, supply, links, metadata, and first-market state were proven.");
console.log("No GMGN indexing claim is made until GMGN actually resolves the contract address.");
