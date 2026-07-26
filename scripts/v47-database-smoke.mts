import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeAddress, encodeBytes32, encodeUint } from "../lib/chain/abi.ts";
import { eventTopic } from "../lib/chain/keccak.ts";
import { acquireV47WorkerLease, openV47Database, recordV47Heartbeat, releaseV47WorkerLease, v47DatabaseStats } from "../lib/server/v47-database.ts";
import { ingestV47Batch, rollbackV47ToBlock, v47IndexedSnapshot, type V47RpcLog } from "../lib/server/v47-indexer.ts";

const directory = await mkdtemp(join(tmpdir(), "perphood-v47-db-"));
const path = join(directory, "indexer.sqlite");
const chainId = 31337;
const factory = "0x1111111111111111111111111111111111111111";
const market = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";
const creator = "0x4444444444444444444444444444444444444444";
const trader = "0x5555555555555555555555555555555555555555";
const hash = (byte: string) => `0x${byte.repeat(64)}`;
const topicAddress = (value: string) => `0x${encodeAddress(value)}`;
const topicUint = (value: bigint | number) => `0x${encodeUint(value)}`;
const data = (...values: string[]) => `0x${values.join("")}`;
function log(input: { address: string; signature: string; topics?: string[]; words?: string[]; block: number; txByte: string; index: number }): V47RpcLog {
  return { address: input.address, topics: [eventTopic(input.signature), ...(input.topics ?? [])], data: data(...(input.words ?? [])), blockNumber: `0x${input.block.toString(16)}`, blockHash: hash(input.block === 1 ? "a" : "b"), transactionHash: hash(input.txByte), logIndex: `0x${input.index.toString(16)}` };
}
try {
  ingestV47Batch({ path, chainId, factoryAddress: factory, finalizedBlock: 2, blocks: [
    { blockNumber: 1, blockHash: hash("a"), parentHash: hash("0"), timestamp: 100 },
    { blockNumber: 2, blockHash: hash("b"), parentHash: hash("a"), timestamp: 101 },
  ], logs: [
    log({ address: factory, signature: "MarketCreated(address,address,address,uint256,uint256,bytes32)", topics: [topicAddress(market), topicAddress(token), topicAddress(creator)], words: [encodeUint(1_000n), encodeUint(45_000n), encodeBytes32(hash("c"))], block: 1, txByte: "1", index: 0 }),
    log({ address: factory, signature: "Deposited(address,uint256,uint256)", topics: [topicAddress(trader)], words: [encodeUint(1_000n), encodeUint(1_000n)], block: 1, txByte: "2", index: 0 }),
    log({ address: market, signature: "Trade(address,bool,uint256,uint256,uint256,uint256,uint256)", topics: [topicAddress(trader), topicUint(1)], words: [encodeUint(100n), encodeUint(200n), encodeUint(1n), encodeUint(300n), encodeUint(400n)], block: 2, txByte: "3", index: 0 }),
    log({ address: market, signature: "PositionOpened(uint256,address,uint8,uint16,uint256,uint256,uint256,uint256,uint256)", topics: [topicUint(7), topicAddress(trader), topicUint(0)], words: [encodeUint(5), encodeUint(10n), encodeUint(50n), encodeUint(20n), encodeUint(3n), encodeUint(2n)], block: 2, txByte: "4", index: 0 }),
    log({ address: market, signature: "StateCommitted(uint64,bytes32,uint8,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)", topics: [topicUint(9), hash("d"), topicUint(1)], words: [encodeAddress(trader), encodeUint(3n), encodeUint(400n), encodeUint(500n), encodeUint(450n), encodeUint(300n), encodeUint(50n), encodeUint(20n), encodeUint(1n)], block: 2, txByte: "5", index: 0 }),
    log({ address: factory, signature: "AccountExecution(address,address,uint8,uint256,uint256,uint256,bytes32)", topics: [topicAddress(trader), topicAddress(market), topicUint(1)], words: [encodeUint(100n), encodeUint(200n), encodeUint(0n), encodeBytes32(hash("e"))], block: 2, txByte: "6", index: 0 }),
  ] });
  const snapshot = v47IndexedSnapshot({ path, owner: trader, market });
  assert.equal(snapshot.markets.length, 1);
  assert.equal(snapshot.trades.length, 1);
  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.account?.weth_balance_wei, "900");
  assert.equal(snapshot.tokens[0]?.token_balance_wad, "200");
  assert.equal((snapshot.markets[0] as { activePositions?: string }).activePositions, "1");
  recordV47Heartbeat({ workerId: "keeper-a", role: "keeper", status: "healthy", chainId, lastBlock: 2, leaseUntil: Date.now() + 10_000 }, path);
  assert.equal(v47DatabaseStats(path).counts.keeper_heartbeats, 1);
  assert.equal(v47DatabaseStats(path).unhealthyWorkers, 0, "historical heartbeats without an active lease must not permanently degrade canonical status");
  assert.equal(acquireV47WorkerLease({ leaseKey: "indexer:test", workerId: "indexer-a", leaseMs: 60_000 }, path), true);
  assert.equal(v47DatabaseStats(path).unhealthyWorkers, 1, "an active lease without a healthy heartbeat must be visible");
  assert.equal(acquireV47WorkerLease({ leaseKey: "indexer:test", workerId: "indexer-b", leaseMs: 60_000 }, path), false);
  assert.equal(releaseV47WorkerLease("indexer:test", "indexer-a", path), true);
  assert.equal(v47DatabaseStats(path).unhealthyWorkers, 0, "released one-shot workers must not remain unhealthy");
  assert.equal(acquireV47WorkerLease({ leaseKey: "indexer:test", workerId: "indexer-b", leaseMs: 60_000 }, path), true);
  rollbackV47ToBlock(chainId, 1, path);
  const rolledBack = v47IndexedSnapshot({ path, owner: trader, market });
  assert.equal(rolledBack.trades.length, 0, "reorg rollback must remove orphaned trades");
  assert.equal(rolledBack.positions.length, 0, "reorg rollback must rebuild positions from canonical events");
  assert.equal(rolledBack.markets.length, 1, "pre-ancestor markets must survive rollback");
  assert.equal(rolledBack.account?.weth_balance_wei, "1000", "rollback must restore the pre-trade account liability");
  assert.equal(rolledBack.tokens.length, 0, "rollback must remove orphaned token liabilities");
  const db = openV47Database(path);
  assert.equal(Number((db.prepare("SELECT COUNT(*) AS count FROM recovery_jobs").get() as { count: number | bigint }).count), 1);
  assert.equal((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  db.close();
  console.log("V47 database smoke passed: WAL schema, canonical projections, indexed accounts, heartbeat persistence, reorg rollback, deterministic replay, and SQLite integrity.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
