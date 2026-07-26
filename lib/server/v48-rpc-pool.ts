import { getV48ChainConfig, assertV48ChainId, type V48ChainConfig } from "./v48-chain-config.ts";
import { openV48Database } from "./v48-database.ts";
import { v47DatabasePath } from "./v47-database.ts";

type JsonRpcResponse<T> = { jsonrpc: "2.0"; id: number; result?: T; error?: { code: number; message: string } };

export type V48RpcProbe = {
  rpcUrl: string;
  status: "healthy" | "degraded" | "offline" | "wrong-chain";
  latencyMs: number;
  chainId: number;
  blockNumber: number;
  blockHash: string | null;
  error?: string;
};

export type V48QuorumBlock = {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  agreeingProviders: string[];
  disagreeingProviders: string[];
  quorum: number;
  probes: V48RpcProbe[];
};

let requestId = 1;

export async function v48RpcRequest<T>(rpcUrl: string, method: string, params: unknown[] = [], timeoutMs = Number(process.env.V48_RPC_TIMEOUT_MS ?? 4_000)): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId++, method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json() as JsonRpcResponse<T>;
    if (payload.error) throw new Error(`RPC ${payload.error.code}: ${payload.error.message}`);
    if (payload.result === undefined) throw new Error(`RPC ${method} returned no result.`);
    return payload.result;
  } finally { clearTimeout(timeout); }
}

function toNumber(hex: string) { return Number(BigInt(hex)); }

export async function probeV48RpcProvider(rpcUrl: string, config: V48ChainConfig = getV48ChainConfig()): Promise<V48RpcProbe> {
  const started = Date.now();
  try {
    const chainHex = await v48RpcRequest<string>(rpcUrl, "eth_chainId");
    const chainId = toNumber(chainHex);
    if (chainId !== config.chainId) return { rpcUrl, status: "wrong-chain", latencyMs: Date.now() - started, chainId, blockNumber: 0, blockHash: null, error: `Expected chain ${config.chainId}.` };
    const blockHex = await v48RpcRequest<string>(rpcUrl, "eth_blockNumber");
    const blockNumber = toNumber(blockHex);
    const block = await v48RpcRequest<{ hash?: string } | null>(rpcUrl, "eth_getBlockByNumber", [blockHex, false]);
    const blockHash = block?.hash?.toLowerCase() ?? null;
    return { rpcUrl, status: blockHash ? "healthy" : "degraded", latencyMs: Date.now() - started, chainId, blockNumber, blockHash, ...(!blockHash ? { error: "Latest block hash unavailable." } : {}) };
  } catch (error) {
    return { rpcUrl, status: "offline", latencyMs: Date.now() - started, chainId: 0, blockNumber: 0, blockHash: null, error: error instanceof Error ? error.message : "RPC probe failed." };
  }
}

export async function probeV48RpcPool(input: { config?: V48ChainConfig; path?: string } = {}) {
  const config = input.config ?? getV48ChainConfig();
  const probes = await Promise.all(config.publicRpcUrls.map((rpcUrl) => probeV48RpcProvider(rpcUrl, config)));
  const path = input.path ?? v47DatabasePath();
  const db = openV48Database(path);
  try {
    const previous = db.prepare("SELECT rpc_url AS rpcUrl,consecutive_failures AS consecutiveFailures FROM rpc_provider_health WHERE chain_id=?").all(config.chainId) as unknown as Array<{ rpcUrl: string; consecutiveFailures: number }>;
    const failures = new Map(previous.map((row) => [row.rpcUrl, row.consecutiveFailures]));
    for (const probe of probes) {
      const consecutive = probe.status === "healthy" ? 0 : (failures.get(probe.rpcUrl) ?? 0) + 1;
      db.prepare(`INSERT INTO rpc_provider_health(chain_id,rpc_url,status,latency_ms,block_number,block_hash,consecutive_failures,last_error,checked_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(chain_id,rpc_url) DO UPDATE SET status=excluded.status,latency_ms=excluded.latency_ms,block_number=excluded.block_number,block_hash=excluded.block_hash,consecutive_failures=excluded.consecutive_failures,last_error=excluded.last_error,checked_at=excluded.checked_at`)
        .run(config.chainId,probe.rpcUrl,probe.status,probe.latencyMs,probe.blockNumber,probe.blockHash,consecutive,probe.error ?? null,Date.now());
    }
  } finally { db.close(); }
  return probes;
}

export async function resolveV48QuorumBlock(input: { config?: V48ChainConfig; path?: string; quorum?: number } = {}): Promise<V48QuorumBlock> {
  const config = input.config ?? getV48ChainConfig();
  const probes = await probeV48RpcPool({ config, path: input.path });
  const healthy = probes.filter((probe) => probe.status === "healthy" && probe.blockHash);
  if (!healthy.length) throw new Error("No healthy V48 RPC provider is available.");
  for (const probe of healthy) assertV48ChainId(probe.chainId, config);
  const targetBlock = Math.min(...healthy.map((probe) => probe.blockNumber));
  const targetHex = `0x${targetBlock.toString(16)}`;
  const observations = await Promise.all(healthy.map(async (probe) => {
    try {
      const block = await v48RpcRequest<{ hash?: string } | null>(probe.rpcUrl, "eth_getBlockByNumber", [targetHex, false]);
      return { rpcUrl: probe.rpcUrl, hash: block?.hash?.toLowerCase() ?? null };
    } catch { return { rpcUrl: probe.rpcUrl, hash: null }; }
  }));
  const groups = new Map<string, string[]>();
  for (const observation of observations) if (observation.hash) groups.set(observation.hash, [...(groups.get(observation.hash) ?? []), observation.rpcUrl]);
  const winner = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!winner) throw new Error(`RPC providers could not resolve block ${targetBlock}.`);
  const required = Math.max(1, input.quorum ?? Number(process.env.V48_RPC_QUORUM ?? Math.floor(healthy.length / 2) + 1));
  if (winner[1].length < required) throw new Error(`RPC quorum failed at block ${targetBlock}: ${winner[1].length}/${required} providers agree.`);
  return {
    chainId: config.chainId,
    blockNumber: targetBlock,
    blockHash: winner[0],
    agreeingProviders: winner[1],
    disagreeingProviders: observations.filter((item) => item.hash !== winner[0]).map((item) => item.rpcUrl),
    quorum: required,
    probes,
  };
}

export async function v48FailoverRequest<T>(method: string, params: unknown[] = [], config = getV48ChainConfig()): Promise<{ result: T; rpcUrl: string }> {
  const probes = await Promise.all(config.publicRpcUrls.map((rpcUrl) => probeV48RpcProvider(rpcUrl, config)));
  const candidates = probes.filter((probe) => probe.status === "healthy").sort((a, b) => a.latencyMs - b.latencyMs);
  const errors: string[] = [];
  for (const candidate of candidates) {
    try { return { result: await v48RpcRequest<T>(candidate.rpcUrl, method, params), rpcUrl: candidate.rpcUrl }; }
    catch (error) { errors.push(`${candidate.rpcUrl}: ${error instanceof Error ? error.message : "failed"}`); }
  }
  throw new Error(`All V48 RPC providers failed ${method}. ${errors.join(" | ")}`);
}
