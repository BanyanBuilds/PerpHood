export type V52ScaleTier = {
  id: "foundation" | "growth" | "mass";
  registeredUsers: number;
  peakConnectedClients: number;
  targetMarkets: number;
  apiReplicasMinimum: number;
  streamGatewaysMinimum: number;
  marketExecutionShards: number;
  accountHistoryShards: number;
  queuePartitions: number;
  description: string;
};

/** Planning targets, not measured production capacity claims. */
export const V52_SCALE_TIERS: readonly V52ScaleTier[] = [
  {
    id: "foundation",
    registeredUsers: 100_000,
    peakConnectedClients: 10_000,
    targetMarkets: 10_000,
    apiReplicasMinimum: 6,
    streamGatewaysMinimum: 8,
    marketExecutionShards: 64,
    accountHistoryShards: 32,
    queuePartitions: 64,
    description: "First serious production envelope with no single application host in the critical path.",
  },
  {
    id: "growth",
    registeredUsers: 500_000,
    peakConnectedClients: 50_000,
    targetMarkets: 50_000,
    apiReplicasMinimum: 20,
    streamGatewaysMinimum: 32,
    marketExecutionShards: 256,
    accountHistoryShards: 128,
    queuePartitions: 256,
    description: "Regional API and stream fleets with market-partitioned execution and independent recovery consumers.",
  },
  {
    id: "mass",
    registeredUsers: 1_000_000,
    peakConnectedClients: 100_000,
    targetMarkets: 100_000,
    apiReplicasMinimum: 40,
    streamGatewaysMinimum: 64,
    marketExecutionShards: 512,
    accountHistoryShards: 256,
    queuePartitions: 512,
    description: "Target architecture for one million accounts; requires measured load, multi-region failover and queue-backed fan-out.",
  },
] as const;

export const V52_SERVICE_BOUNDARIES = [
  { id: "web", label: "Edge web", responsibility: "Static terminal shell, authenticated UI and cacheable public reads", scaling: "CDN + stateless replicas" },
  { id: "api", label: "API gateway", responsibility: "Profiles, presets, orders, account history and protected command admission", scaling: "Horizontal replicas behind rate limiting" },
  { id: "sequencer", label: "Market sequencers", responsibility: "Strictly ordered commands per BattlePool market", scaling: "Deterministic market shards with hot-market isolation" },
  { id: "event-bus", label: "Durable event bus", responsibility: "Canonical command, receipt, market and recovery events", scaling: "Partitioned log with replay and consumer groups" },
  { id: "stream", label: "Realtime gateways", responsibility: "WebSocket/SSE fan-out for prices, candles, tape and PNL", scaling: "Stateless connection fleets subscribed by market partition" },
  { id: "database", label: "PostgreSQL system", responsibility: "Profiles, presets, orders, projections, audit history and recovery metadata", scaling: "Pooling, partitioning, read replicas and PITR" },
  { id: "cache", label: "Distributed cache", responsibility: "Rate limits, hot market snapshots, leases and idempotency windows", scaling: "Clustered Redis-compatible service" },
  { id: "workers", label: "Worker fleets", responsibility: "Indexing, keepers, liquidations, reconciliation, candles and backups", scaling: "Independent autoscaled consumer groups" },
  { id: "rpc", label: "RPC quorum", responsibility: "Chain reads, submissions, block/hash agreement and provider failover", scaling: "Multiple independent providers and regional egress" },
] as const;

function normalizedHex(value: string) {
  const stripped = value.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "");
  if (!stripped) throw new Error("A hexadecimal address or identifier is required.");
  return stripped;
}

export function deterministicShard(identifier: string, shardCount: number) {
  if (!Number.isSafeInteger(shardCount) || shardCount <= 0) throw new Error("shardCount must be a positive safe integer.");
  const hex = normalizedHex(identifier);
  const sample = hex.slice(-16).padStart(16, "0");
  return Number(BigInt(`0x${sample}`) % BigInt(shardCount));
}

export function v52MarketShard(marketAddress: string, shardCount = V52_SCALE_TIERS[2].marketExecutionShards) {
  return deterministicShard(marketAddress, shardCount);
}

export function v52AccountShard(ownerAddress: string, shardCount = V52_SCALE_TIERS[2].accountHistoryShards) {
  return deterministicShard(ownerAddress, shardCount);
}
