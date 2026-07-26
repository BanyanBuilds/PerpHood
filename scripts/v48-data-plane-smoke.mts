import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeAddress, encodeBytes32, encodeUint } from "../lib/chain/abi.ts";
import { eventTopic } from "../lib/chain/keccak.ts";
import { listV48Events } from "../lib/server/v48-database.ts";
import { materializeV48MarketData, v48MarketDataSnapshot } from "../lib/server/v48-materializer.ts";
import { ingestV47Batch, type V47RpcLog } from "../lib/server/v47-indexer.ts";

const directory = await mkdtemp(join(tmpdir(), "perphood-v48-plane-"));
const path = join(directory, "plane.sqlite");
const chainId = 31337;
const factory = "0x1111111111111111111111111111111111111111";
const market = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";
const creator = "0x4444444444444444444444444444444444444444";
const traderA = "0x5555555555555555555555555555555555555555";
const traderB = "0x6666666666666666666666666666666666666666";
const hash = (character: string) => `0x${character.repeat(64)}`;
const topicAddress = (value: string) => `0x${encodeAddress(value)}`;
const topicUint = (value: bigint | number) => `0x${encodeUint(value)}`;
const data = (...values: string[]) => `0x${values.join("")}`;
function log(input: { address: string; signature: string; topics?: string[]; words?: string[]; block: number; blockHash: string; tx: string; index: number }): V47RpcLog {
  return { address: input.address, topics: [eventTopic(input.signature), ...(input.topics ?? [])], data: data(...(input.words ?? [])), blockNumber: `0x${input.block.toString(16)}`, blockHash: input.blockHash, transactionHash: hash(input.tx), logIndex: `0x${input.index.toString(16)}` };
}
try {
  ingestV47Batch({ path, chainId, factoryAddress: factory, finalizedBlock: 3, blocks: [
    { blockNumber: 1, blockHash: hash("a"), parentHash: hash("0"), timestamp: 100 },
    { blockNumber: 2, blockHash: hash("b"), parentHash: hash("a"), timestamp: 101 },
    { blockNumber: 3, blockHash: hash("c"), parentHash: hash("b"), timestamp: 116 },
  ], logs: [
    log({ address: factory, signature: "MarketCreated(address,address,address,uint256,uint256,bytes32)", topics: [topicAddress(market), topicAddress(token), topicAddress(creator)], words: [encodeUint(1_000n), encodeUint(45_000n), encodeBytes32(hash("d"))], block: 1, blockHash: hash("a"), tx: "1", index: 0 }),
    log({ address: market, signature: "Trade(address,bool,uint256,uint256,uint256,uint256,uint256)", topics: [topicAddress(traderA), topicUint(1)], words: [encodeUint(100n), encodeUint(200n), encodeUint(1n), encodeUint(300n), encodeUint(1_000n)], block: 2, blockHash: hash("b"), tx: "2", index: 0 }),
    log({ address: market, signature: "Trade(address,bool,uint256,uint256,uint256,uint256,uint256)", topics: [topicAddress(traderB), topicUint(0)], words: [encodeUint(50n), encodeUint(80n), encodeUint(1n), encodeUint(220n), encodeUint(1_200n)], block: 3, blockHash: hash("c"), tx: "3", index: 0 }),
    log({ address: market, signature: "StateCommitted(uint64,bytes32,uint8,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)", topics: [topicUint(2), hash("e"), topicUint(1)], words: [encodeAddress(traderB), encodeUint(3n), encodeUint(1_200n), encodeUint(500n), encodeUint(450n), encodeUint(220n), encodeUint(50n), encodeUint(20n), encodeUint(1n)], block: 3, blockHash: hash("c"), tx: "4", index: 0 }),
  ] });
  const result = materializeV48MarketData({ path, chainId });
  assert.equal(result.markets, 1);
  const one = v48MarketDataSnapshot({ path, chainId, market, intervalSeconds: 1, limit: 100 });
  const fifteen = v48MarketDataSnapshot({ path, chainId, market, intervalSeconds: 15, limit: 100 });
  const thirty = v48MarketDataSnapshot({ path, chainId, market, intervalSeconds: 30, limit: 100 });
  assert.equal(one.candles.length, 2);
  assert.equal(fifteen.candles.length, 2);
  assert.equal(thirty.candles.length, 1);
  assert.equal((thirty.candles[0] as { open: string }).open, "1000");
  assert.equal((thirty.candles[0] as { close: string }).close, "1200");
  assert.equal((one.metrics as { volume60sWei: string }).volume60sWei, "150");
  assert.equal((one.metrics as { traders5m: number }).traders5m, 2);
  const events = listV48Events({ afterSequence: 0, chainId, market, limit: 10 }, path) as unknown as Array<{ eventType: string }>;
  assert.equal(events.at(-1)?.eventType, "market.updated");
  console.log("V48 data-plane smoke passed: canonical trade materialization, 1s/15s/30s OHLCV candles, rolling market metrics, unique traders, and durable SSE events.");
} finally { await rm(directory, { recursive: true, force: true }); }
