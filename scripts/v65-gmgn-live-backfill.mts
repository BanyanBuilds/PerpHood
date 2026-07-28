import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeAddress, decodeInt, decodeUint, decodeWords, stripHex, type Hex } from "../lib/chain/abi.ts";
import { hexToBigInt, normalizeAddress, redactRpc, requireRpc, rpcRequest } from "./v59-mainnet-common.mts";

const CHAIN_ID = 4_663;
const CONFIRMATIONS = Math.max(1, Number(process.env.V65_INDEXER_CONFIRMATIONS ?? 3));
const CHUNK_SIZE = Math.min(2_000, Math.max(50, Number(process.env.V65_INDEXER_CHUNK_SIZE ?? 750)));
const RPC = requireRpc();
const factory = normalizeAddress(process.env.LEVERAGEX_V65_FACTORY_ADDRESS ?? process.env.LEVERAGEX_FACTORY_ADDRESS, "LEVERAGEX_V65_FACTORY_ADDRESS");
const deploymentBlock = Number(process.env.LEVERAGEX_V65_FACTORY_DEPLOYMENT_BLOCK ?? process.env.LEVERAGEX_FACTORY_DEPLOYMENT_BLOCK ?? 0);
if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock <= 0) throw new Error("Set LEVERAGEX_V65_FACTORY_DEPLOYMENT_BLOCK.");

const FACTORY_TOPICS = {
  tokenLaunched: "0x6a01ec9b9da2fbadef86c83182bf823e3a51fd7ac745df9bbc27bc9154171751",
  canonicalPoolCreated: "0x3a6dc9b4ef8987d25c56faf6f0a32485a6a40c5b253d8243b2128d44c6500f20",
  tokenGraduated: "0xfe904242a86b7371d8a98cc9728aa782201483135c42baae94260231d413fd3c",
} as const;
const POOL_TOPICS: Record<string, string> = {
  "0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95": "Initialize",
  "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde": "Mint",
  "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c": "Burn",
  "0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0": "Collect",
  "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67": "Swap",
};

type RpcLog = { address:string; blockNumber:Hex; blockHash:Hex; transactionHash:Hex; transactionIndex:Hex; logIndex:Hex; topics:Hex[]; data:Hex; removed?:boolean };
const topicAddress = (value?:string) => value ? `0x${stripHex(value).slice(-40)}`.toLowerCase() : null;
const wordAddress = (value?:string) => value ? decodeAddress(value).toLowerCase() : null;
const order = (log:RpcLog) => ({ block_number:Number(hexToBigInt(log.blockNumber)), block_hash:log.blockHash.toLowerCase(), transaction_hash:log.transactionHash.toLowerCase(), transaction_index:Number(hexToBigInt(log.transactionIndex)), log_index:Number(hexToBigInt(log.logIndex)) });

function parseFactory(log:RpcLog) {
  const t0=log.topics[0]?.toLowerCase(); const words=decodeWords(log.data); const base=order(log);
  if (t0===FACTORY_TOPICS.canonicalPoolCreated) return { kind:"CanonicalPoolCreated", ...base, token:topicAddress(log.topics[1]), pool:topicAddress(log.topics[2]), pairToken:topicAddress(log.topics[3]), dexFactory:wordAddress(words[0]), positionManager:wordAddress(words[1]), liquidityLocker:wordAddress(words[2]), poolFee:Number(decodeUint(words[3]??"0")), launchPositionId:decodeUint(words[4]??"0").toString(), tokenIsToken0:decodeUint(words[5]??"0")===1n, startTick:Number(decodeInt(words[6]??"0")), terminalTick:Number(decodeInt(words[7]??"0")) };
  if (t0===FACTORY_TOPICS.tokenLaunched) return { kind:"TokenLaunched", ...base, token:topicAddress(log.topics[1]), creator:topicAddress(log.topics[2]), dexFactory:topicAddress(log.topics[3]), pairToken:wordAddress(words[0]), pool:wordAddress(words[1]), positionManager:wordAddress(words[2]), liquidityLocker:wordAddress(words[3]), launchPositionId:decodeUint(words[4]??"0").toString(), poolFee:Number(decodeUint(words[5]??"0")), tokenIsToken0:decodeUint(words[6]??"0")===1n, initialBuyWei:decodeUint(words[7]??"0").toString(), initialTokensOut:decodeUint(words[8]??"0").toString(), supply:decodeUint(words[9]??"0").toString(), metadataHash:words[10]?`0x${words[10]}`:null };
  if (t0===FACTORY_TOPICS.tokenGraduated) return { kind:"TokenGraduated", ...base, token:topicAddress(log.topics[1]), pool:topicAddress(log.topics[2]), finalPositionId:decodeUint(stripHex(log.topics[3]??"0x0").padStart(64,"0")).toString(), liquidityLocker:wordAddress(words[0]), poolFee:Number(decodeUint(words[1]??"0")) };
  return null;
}

function parsePool(log:RpcLog, token:string) {
  const event_name=POOL_TOPICS[log.topics[0]?.toLowerCase()]; if (!event_name || log.removed) return null;
  const words=decodeWords(log.data); const payload:Record<string,string|number|null>={ rawData:log.data, topic1:log.topics[1]??null, topic2:log.topics[2]??null, topic3:log.topics[3]??null };
  if (event_name==="Swap") Object.assign(payload,{ sender:topicAddress(log.topics[1]), recipient:topicAddress(log.topics[2]), amount0:decodeInt(words[0]??"0").toString(), amount1:decodeInt(words[1]??"0").toString(), sqrtPriceX96:decodeUint(words[2]??"0").toString(), liquidity:decodeUint(words[3]??"0").toString(), tick:Number(decodeInt(words[4]??"0")) });
  if (event_name==="Initialize") Object.assign(payload,{ sqrtPriceX96:decodeUint(words[0]??"0").toString(), tick:Number(decodeInt(words[1]??"0")) });
  return { chain_id:CHAIN_ID, pool_address:log.address.toLowerCase(), token_address:token, factory_address:factory, ...order(log), event_name, payload, canonical:true };
}

async function getLogs(address:string|string[], topics:string[], from:number, to:number) {
  const all:RpcLog[]=[];
  for(let start=from; start<=to; start+=CHUNK_SIZE){ const end=Math.min(to,start+CHUNK_SIZE-1); const logs=await rpcRequest<RpcLog[]>(RPC,"eth_getLogs",[{address,fromBlock:`0x${start.toString(16)}`,toBlock:`0x${end.toString(16)}`,topics:[topics]}],30000); all.push(...logs); console.log(`${start.toLocaleString("en-US")}–${end.toLocaleString("en-US")}: ${logs.length} logs`); }
  return all;
}
async function supabase(path:string, init:RequestInit={}){ const base=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""); const key=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!base||!key)return null; const headers=new Headers(init.headers); headers.set("apikey",key);headers.set("authorization",`Bearer ${key}`); return fetch(`${base}${path}`,{...init,headers}); }

console.log("Leverage X V65 — factory + canonical Uniswap pool backfill\n");
console.log(`RPC: ${redactRpc(RPC)}\nFactory: ${factory}\nDeployment block: ${deploymentBlock}`);
const chainId=Number(hexToBigInt(await rpcRequest<string>(RPC,"eth_chainId"))); if(chainId!==CHAIN_ID)throw new Error(`Wrong network ${chainId}.`);
const head=Number(hexToBigInt(await rpcRequest<string>(RPC,"eth_blockNumber"))); const finalizedHead=head-CONFIRMATIONS; const from=Math.max(deploymentBlock,Number(process.env.V65_INDEXER_FROM_BLOCK??deploymentBlock));
const factoryLogs=await getLogs(factory,Object.values(FACTORY_TOPICS),from,finalizedHead); const factoryEvents=factoryLogs.map(parseFactory).filter(Boolean) as Array<Record<string,any>>;
const tokenByPool=new Map<string,string>(); for(const e of factoryEvents){ if(e.pool&&e.token)tokenByPool.set(e.pool,e.token); }
const pools=[...tokenByPool.keys()]; const poolLogs=pools.length?await getLogs(pools,Object.keys(POOL_TOPICS),from,finalizedHead):[]; const poolEvents=poolLogs.map(l=>parsePool(l,tokenByPool.get(l.address.toLowerCase())??"")).filter(Boolean) as Array<Record<string,unknown>>;
mkdirSync(resolve("deployments"),{recursive:true}); const report={version:"V65",generatedAt:new Date().toISOString(),chainId,factory,deploymentBlock,fromBlock:from,finalizedHead,confirmations:CONFIRMATIONS,pools:[...tokenByPool].map(([pool,token])=>({pool,token})),factoryEvents,poolEventCount:poolEvents.length}; writeFileSync(resolve("deployments","v65-gmgn-live-backfill.json"),`${JSON.stringify(report,null,2)}\n`);
const invalidate=await supabase(`/rest/v1/leveragex_v65_pool_events?chain_id=eq.${CHAIN_ID}&factory_address=eq.${factory}&block_number=gte.${from}&block_number=lte.${finalizedHead}`,{method:"PATCH",headers:{"content-type":"application/json",prefer:"return=minimal"},body:JSON.stringify({canonical:false})}); if(invalidate&&!invalidate.ok)throw new Error(`Pool invalidation failed: ${await invalidate.text()}`);
if(poolEvents.length){ const write=await supabase("/rest/v1/leveragex_v65_pool_events?on_conflict=chain_id,transaction_hash,log_index",{method:"POST",headers:{"content-type":"application/json",prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(poolEvents)}); if(write&&!write.ok)throw new Error(`Pool write failed: ${await write.text()}`); }
const finalizedBlock=await rpcRequest<{hash:string}>(RPC,"eth_getBlockByNumber",[`0x${finalizedHead.toString(16)}`,false]); const checkpoint=await supabase("/rest/v1/leveragex_v65_indexer_checkpoints?on_conflict=chain_id,factory_address",{method:"POST",headers:{"content-type":"application/json",prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify([{chain_id:CHAIN_ID,factory_address:factory,last_finalized_block:finalizedHead,last_finalized_hash:finalizedBlock.hash.toLowerCase(),updated_at:new Date().toISOString()}])}); if(checkpoint&&!checkpoint.ok)throw new Error(`Checkpoint failed: ${await checkpoint.text()}`);
console.log(`\nV65 backfill complete: ${factoryEvents.length} factory events, ${poolEvents.length} standard pool events, ${pools.length} pools.`); console.log("Report: deployments/v65-gmgn-live-backfill.json");
