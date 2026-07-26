import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getV48ChainConfig } from "../lib/server/v48-chain-config.ts";
import { resolveV48QuorumBlock, v48FailoverRequest } from "../lib/server/v48-rpc-pool.ts";

async function rpcServer(hash: string, chainId = 4663) {
  const server: Server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { id: number; method: string; params?: unknown[] };
    let result: unknown = "0x0";
    if (body.method === "eth_chainId") result = `0x${chainId.toString(16)}`;
    else if (body.method === "eth_blockNumber") result = "0x64";
    else if (body.method === "eth_getBlockByNumber") result = { number: String(body.params?.[0] ?? "0x64"), hash, parentHash: `0x${"1".repeat(64)}`, timestamp: "0x1" };
    else if (body.method === "eth_gasPrice") result = "0x3b9aca00";
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Mock RPC failed to bind.");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

const directory = await mkdtemp(join(tmpdir(), "perphood-v48-rpc-"));
const path = join(directory, "rpc.sqlite");
const agreedHash = `0x${"a".repeat(64)}`;
const divergentHash = `0x${"b".repeat(64)}`;
const providers = await Promise.all([rpcServer(agreedHash), rpcServer(agreedHash), rpcServer(divergentHash)]);
try {
  const config = { ...getV48ChainConfig("mainnet"), publicRpcUrls: providers.map((provider) => provider.url), applicationConfirmations: 2 };
  const quorum = await resolveV48QuorumBlock({ config, path, quorum: 2 });
  assert.equal(quorum.chainId, 4663);
  assert.equal(quorum.blockNumber, 100);
  assert.equal(quorum.blockHash, agreedHash);
  assert.equal(quorum.agreeingProviders.length, 2);
  assert.equal(quorum.disagreeingProviders.length, 1);
  const gas = await v48FailoverRequest<string>("eth_gasPrice", [], config);
  assert.equal(gas.result, "0x3b9aca00");
  assert.match(config.canonicalWethAddress ?? "", /^0x0Bd7D308/);
  console.log("V48 RPC pool smoke passed: official chain preset, provider probing, majority block-hash quorum, divergence isolation, and failover request routing.");
} finally {
  for (const provider of providers) await new Promise<void>((resolve) => provider.server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
}
