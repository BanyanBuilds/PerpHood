import { getV48ChainConfig } from "./v48-chain-config.ts";
import { v48DatabaseStats } from "./v48-database.ts";
import { evaluateV48Health } from "./v48-health.ts";
import { materializeV48MarketData } from "./v48-materializer.ts";
import { resolveV48QuorumBlock } from "./v48-rpc-pool.ts";
import { runV47IndexerCycle, v47IndexedSnapshot } from "./v47-indexer.ts";
import { v47DatabasePath } from "./v47-database.ts";

export type V48DataPlaneCycleResult = {
  chainId: number;
  quorumBlock: number;
  quorumHash: string;
  rpcProvider: string;
  indexer: Awaited<ReturnType<typeof runV47IndexerCycle>>;
  materializer: ReturnType<typeof materializeV48MarketData>;
  health: ReturnType<typeof evaluateV48Health>;
};

export async function runV48DataPlaneCycle(input: { path?: string; workerId?: string; skipIndexer?: boolean } = {}): Promise<V48DataPlaneCycleResult> {
  const config = getV48ChainConfig();
  const path = input.path ?? v47DatabasePath();
  const quorum = await resolveV48QuorumBlock({ config, path });
  const rpcUrl = quorum.agreeingProviders[0];
  const indexer = input.skipIndexer
    ? { chainId: config.chainId, factoryAddress: process.env.NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS ?? "", latestBlock: quorum.blockNumber, finalizedBlock: Math.max(0, quorum.blockNumber - config.applicationConfirmations), previousHead: 0, indexedTo: 0, blocks: 0, logs: 0, markets: 0, reorgDepth: 0, databasePath: path }
    : await runV47IndexerCycle({ rpcUrl, path, confirmations: config.applicationConfirmations, batchSize: config.maxIndexerBatchSize, workerId: input.workerId ?? `v48-indexer-${process.pid}` });
  const materializer = materializeV48MarketData({ path, chainId: config.chainId });
  const requiredQuorum = Math.max(1, Number(process.env.V48_RPC_QUORUM ?? Math.floor(config.publicRpcUrls.length / 2) + 1));
  const health = evaluateV48Health({ path, chainId: config.chainId, configuredProviders: config.publicRpcUrls.length, requiredQuorum });
  return { chainId: config.chainId, quorumBlock: quorum.blockNumber, quorumHash: quorum.blockHash, rpcProvider: rpcUrl, indexer, materializer, health };
}

export function v48DataPlaneStatus(path = v47DatabasePath()) {
  const config = getV48ChainConfig();
  return {
    version: 48,
    mode: "durable-sse-rpc-quorum-data-plane",
    chain: { environment: config.environment, chainId: config.chainId, name: config.name, nativeSymbol: config.nativeSymbol, explorerUrl: config.explorerUrl, canonicalWethAddress: config.canonicalWethAddress ?? null, applicationConfirmations: config.applicationConfirmations, rpcProviderCount: config.publicRpcUrls.length },
    database: v48DatabaseStats(path),
    canonical: v47IndexedSnapshot({ path }),
  };
}
