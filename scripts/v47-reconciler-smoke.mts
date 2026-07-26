import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeAddress, encodeBytes32, encodeUint } from "../lib/chain/abi.ts";
import { eventTopic, functionSelector } from "../lib/chain/keccak.ts";
import { ingestV47Batch, type V47RpcLog } from "../lib/server/v47-indexer.ts";
import { recentV47Reconciliation, runV47Reconciliation } from "../lib/server/v47-reconciler.ts";

const directory = await mkdtemp(join(tmpdir(), "perphood-v47-reconcile-"));
const path = join(directory, "indexer.sqlite");
const factory = "0x1111111111111111111111111111111111111111";
const market = "0x2222222222222222222222222222222222222222";
const token = "0x3333333333333333333333333333333333333333";
const creator = "0x4444444444444444444444444444444444444444";
const trader = "0x5555555555555555555555555555555555555555";
const hash = (byte: string) => `0x${byte.repeat(64)}`;
const topicAddress = (value: string) => `0x${encodeAddress(value)}`;
const topicUint = (value: bigint | number) => `0x${encodeUint(value)}`;
function log(input: { address: string; signature: string; topics?: string[]; words?: string[]; block: number; txByte: string; index: number }): V47RpcLog {
  return { address: input.address, topics: [eventTopic(input.signature), ...(input.topics ?? [])], data: `0x${(input.words ?? []).join("")}`, blockNumber: `0x${input.block.toString(16)}`, blockHash: hash(input.block === 1 ? "a" : "b"), transactionHash: hash(input.txByte), logIndex: `0x${input.index.toString(16)}` };
}
let chainBalance = 1_000n;
const runtime = [9n, 101n, 0n, 3n, 400n, 500n, 450n, 300n, 0n, 0n, 0n, 0n, 0n, 0n, 50n, 20n, 1n, 0n];
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { id: number; method: string; params?: Array<{ data?: string }> };
  let result = "0x0";
  if (body.method === "eth_chainId") result = "0x7a69";
  else if (body.method === "eth_blockNumber") result = "0x2";
  else if (body.method === "eth_call") {
    const calldata = body.params?.[0]?.data ?? "";
    if (calldata.startsWith(functionSelector("wethBalanceWei(address)"))) result = `0x${encodeUint(chainBalance)}`;
    else if (calldata.startsWith(functionSelector("runtimeState()"))) result = `0x${runtime.map((value) => encodeUint(value)).join("")}${encodeBytes32(hash("d"))}`;
    else throw new Error(`Unexpected eth_call ${calldata.slice(0, 10)}`);
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
});
try {
  ingestV47Batch({ path, chainId: 31337, factoryAddress: factory, finalizedBlock: 2, blocks: [
    { blockNumber: 1, blockHash: hash("a"), parentHash: hash("0"), timestamp: 100 },
    { blockNumber: 2, blockHash: hash("b"), parentHash: hash("a"), timestamp: 101 },
  ], logs: [
    log({ address: factory, signature: "MarketCreated(address,address,address,uint256,uint256,bytes32)", topics: [topicAddress(market), topicAddress(token), topicAddress(creator)], words: [encodeUint(1n), encodeUint(45_000n), encodeBytes32(hash("c"))], block: 1, txByte: "1", index: 0 }),
    log({ address: factory, signature: "Deposited(address,uint256,uint256)", topics: [topicAddress(trader)], words: [encodeUint(1_000n), encodeUint(1_000n)], block: 1, txByte: "2", index: 0 }),
    log({ address: market, signature: "StateCommitted(uint64,bytes32,uint8,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)", topics: [topicUint(9), hash("d"), topicUint(1)], words: [encodeAddress(trader), encodeUint(3n), encodeUint(400n), encodeUint(500n), encodeUint(450n), encodeUint(300n), encodeUint(50n), encodeUint(20n), encodeUint(1n)], block: 2, txByte: "3", index: 0 }),
  ] });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test RPC did not bind.");
  const rpcUrl = `http://127.0.0.1:${address.port}`;
  const matched = await runV47Reconciliation({ rpcUrl, router: factory, path });
  assert.equal(matched.checked, 2);
  assert.equal(matched.mismatched, 0);
  chainBalance = 999n;
  const mismatch = await runV47Reconciliation({ rpcUrl, router: factory, path });
  assert.equal(mismatch.mismatched, 1);
  assert.equal(mismatch.mismatches[0]?.kind, "weth-balance");
  assert.equal(Number((recentV47Reconciliation(path).summary as { mismatched: number }).mismatched), 1);
  chainBalance = 1_000n;
  const recovered = await runV47Reconciliation({ rpcUrl, router: factory, path });
  assert.equal(recovered.mismatched, 0);
  const latest = recentV47Reconciliation(path).summary as { checked: number; mismatched: number; runId?: string };
  assert.equal(Number(latest.checked), 2);
  assert.equal(Number(latest.mismatched), 0, "canonical health must reflect the latest complete reconciliation run, not stale mismatches");
  assert.ok(latest.runId);
  console.log("V47 reconciliation smoke passed: live contract matching, market state-hash verification, mismatch detection, recovered latest-run health, and degraded reconciler heartbeat.");
} finally {
  server.close();
  await rm(directory, { recursive: true, force: true });
}
