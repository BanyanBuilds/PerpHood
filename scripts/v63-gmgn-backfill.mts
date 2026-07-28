import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeAddress, decodeUint, decodeWords, stripHex, type Hex } from "../lib/chain/abi.ts";
import { eventTopic } from "../lib/chain/keccak.ts";
import { hexToBigInt, normalizeAddress, redactRpc, requireRpc, rpcRequest } from "./v59-mainnet-common.mts";

const CHAIN_ID = 4_663;
const CONFIRMATIONS = Math.max(1, Number(process.env.V63_INDEXER_CONFIRMATIONS ?? 3));
const CHUNK_SIZE = Math.min(5_000, Math.max(100, Number(process.env.V63_INDEXER_CHUNK_SIZE ?? 2_000)));
const RPC = requireRpc();
const factory = normalizeAddress(
  process.env.LEVERAGEX_FACTORY_ADDRESS ?? process.env.V63_MAINNET_FACTORY_ADDRESS,
  "LEVERAGEX_FACTORY_ADDRESS",
);
const deploymentBlock = Number(process.env.LEVERAGEX_FACTORY_DEPLOYMENT_BLOCK ?? process.env.V63_FACTORY_DEPLOYMENT_BLOCK ?? 0);
if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock <= 0) throw new Error("Set LEVERAGEX_FACTORY_DEPLOYMENT_BLOCK to the verified factory deployment block.");

const signatures = {
  TokenLaunched: "TokenLaunched(address,address,address,address,uint256,uint256,bytes32)",
  MarketCreated: "MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)",
  TokenGraduated: "TokenGraduated(address,address,address,address,address,uint24)",
} as const;
const topics = Object.fromEntries(Object.entries(signatures).map(([name, signature]) => [eventTopic(signature).toLowerCase(), name])) as Record<string, keyof typeof signatures>;

type RpcLog = {
  address: string;
  blockNumber: Hex;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: Hex;
  logIndex: Hex;
  topics: Hex[];
  data: Hex;
  removed?: boolean;
};

function topicAddress(value?: string) {
  if (!value) return null;
  return `0x${stripHex(value).slice(-40)}`.toLowerCase();
}

function dataAddress(word?: string) {
  return word ? decodeAddress(word).toLowerCase() : null;
}

function parse(log: RpcLog) {
  const eventName = topics[log.topics[0]?.toLowerCase()];
  if (!eventName || log.removed) return null;
  const words = decodeWords(log.data);
  const base = {
    chain_id: CHAIN_ID,
    factory_address: factory,
    block_number: Number(hexToBigInt(log.blockNumber)),
    block_hash: log.blockHash.toLowerCase(),
    transaction_hash: log.transactionHash.toLowerCase(),
    transaction_index: Number(hexToBigInt(log.transactionIndex)),
    log_index: Number(hexToBigInt(log.logIndex)),
    event_name: eventName,
    canonical: true,
  };
  if (eventName === "TokenLaunched") {
    return {
      ...base,
      token_address: topicAddress(log.topics[1]),
      creator_address: topicAddress(log.topics[2]),
      market_address: topicAddress(log.topics[3]),
      payload: {
        pairToken: dataAddress(words[0]),
        initialBuyAmount: decodeUint(words[1] ?? "0").toString(),
        supply: decodeUint(words[2] ?? "0").toString(),
        metadataHash: words[3] ? `0x${words[3]}`.toLowerCase() : null,
      },
    };
  }
  if (eventName === "MarketCreated") {
    return {
      ...base,
      market_address: topicAddress(log.topics[1]),
      token_address: topicAddress(log.topics[2]),
      creator_address: topicAddress(log.topics[3]),
      payload: {
        creatorGenesisBuyWei: decodeUint(words[0] ?? "0").toString(),
        creatorTokensOutWad: decodeUint(words[1] ?? "0").toString(),
        marketCapEthWad: decodeUint(words[2] ?? "0").toString(),
        migrationTargetUsdWad: decodeUint(words[3] ?? "0").toString(),
        metadataHash: words[4] ? `0x${words[4]}`.toLowerCase() : null,
      },
    };
  }
  return {
    ...base,
    token_address: topicAddress(log.topics[1]),
    market_address: topicAddress(log.topics[2]),
    creator_address: null,
    payload: {
      canonicalPool: topicAddress(log.topics[3]),
      dexFactory: dataAddress(words[0]),
      pairToken: dataAddress(words[1]),
      poolFee: Number(decodeUint(words[2] ?? "0")),
    },
  };
}

async function supabase(path: string, init: RequestInit = {}) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  headers.set("authorization", `Bearer ${key}`);
  return fetch(`${base}${path}`, { ...init, headers });
}

console.log("Leverage X V63 — GMGN/indexer backfill\n");
console.log(`RPC: ${redactRpc(RPC)}`);
console.log(`Factory: ${factory}`);
console.log(`Deployment block: ${deploymentBlock.toLocaleString("en-US")}`);

const chainId = Number(hexToBigInt(await rpcRequest<string>(RPC, "eth_chainId")));
if (chainId !== CHAIN_ID) throw new Error(`Wrong network ${chainId}; expected ${CHAIN_ID}.`);
const head = Number(hexToBigInt(await rpcRequest<string>(RPC, "eth_blockNumber")));
const finalizedHead = Math.max(deploymentBlock, head - CONFIRMATIONS);
const requestedFrom = Number(process.env.V63_INDEXER_FROM_BLOCK ?? deploymentBlock);
const fromBlock = Math.max(deploymentBlock, Number.isSafeInteger(requestedFrom) ? requestedFrom : deploymentBlock);
if (fromBlock > finalizedHead) throw new Error(`Nothing finalized to backfill yet. from=${fromBlock}; finalized=${finalizedHead}.`);

const events: Array<Record<string, unknown>> = [];
for (let start = fromBlock; start <= finalizedHead; start += CHUNK_SIZE) {
  const end = Math.min(finalizedHead, start + CHUNK_SIZE - 1);
  const logs = await rpcRequest<RpcLog[]>(RPC, "eth_getLogs", [{
    address: factory,
    fromBlock: `0x${start.toString(16)}`,
    toBlock: `0x${end.toString(16)}`,
    topics: [[...Object.keys(topics)]],
  }], 30_000);
  for (const log of logs) {
    const event = parse(log);
    if (event) events.push(event);
  }
  console.log(`${start.toLocaleString("en-US")}–${end.toLocaleString("en-US")}: ${logs.length} logs`);
}

events.sort((a, b) => Number(a.block_number) - Number(b.block_number) || Number(a.transaction_index) - Number(b.transaction_index) || Number(a.log_index) - Number(b.log_index));
mkdirSync(resolve("deployments"), { recursive: true });
const report = {
  version: "V63",
  generatedAt: new Date().toISOString(),
  chainId,
  factory,
  deploymentBlock,
  fromBlock,
  finalizedHead,
  confirmations: CONFIRMATIONS,
  eventCount: events.length,
  events,
};
writeFileSync(resolve("deployments", "v63-gmgn-backfill.json"), `${JSON.stringify(report, null, 2)}\n`);

const invalidateResponse = await supabase(`/rest/v1/leveragex_v63_chain_events?chain_id=eq.${CHAIN_ID}&factory_address=eq.${factory}&block_number=gte.${fromBlock}&block_number=lte.${finalizedHead}`, {
  method: "PATCH",
  headers: { "content-type": "application/json", prefer: "return=minimal" },
  body: JSON.stringify({ canonical: false }),
});
if (invalidateResponse && !invalidateResponse.ok) throw new Error(`Supabase reorg invalidation failed (${invalidateResponse.status}): ${await invalidateResponse.text()}`);

const writeResponse = events.length ? await supabase("/rest/v1/leveragex_v63_chain_events?on_conflict=chain_id,transaction_hash,log_index", {
  method: "POST",
  headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(events),
}) : null;
if (writeResponse && !writeResponse.ok) throw new Error(`Supabase event mirror failed (${writeResponse.status}): ${await writeResponse.text()}`);

const finalizedBlock = await rpcRequest<{ hash: string }>(RPC, "eth_getBlockByNumber", [`0x${finalizedHead.toString(16)}`, false]);
const checkpointResponse = await supabase("/rest/v1/leveragex_v63_indexer_checkpoints?on_conflict=chain_id,factory_address", {
  method: "POST",
  headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify([{ chain_id: CHAIN_ID, factory_address: factory, last_finalized_block: finalizedHead, last_finalized_hash: finalizedBlock.hash.toLowerCase(), updated_at: new Date().toISOString() }]),
});
if (checkpointResponse && !checkpointResponse.ok) throw new Error(`Supabase checkpoint write failed (${checkpointResponse.status}): ${await checkpointResponse.text()}`);

console.log(`\nBackfill complete: ${events.length} canonical launchpad events.`);
console.log("Report: deployments/v63-gmgn-backfill.json");
console.log(writeResponse ? "Supabase event mirror updated." : "Supabase credentials absent; report-only mode.");
