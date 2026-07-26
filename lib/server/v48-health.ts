import { openV48Database, publishV48Event, upsertV48Alert } from "./v48-database.ts";
import { v47DatabasePath } from "./v47-database.ts";

export type V48HealthStatus = {
  healthy: boolean;
  chainId: number;
  indexedBlock: number;
  finalizedBlock: number;
  indexLag: number;
  healthyProviders: number;
  configuredProviders: number;
  rpcDivergence: boolean;
  reconciliationMismatches: number;
  unhealthyWorkers: number;
  activeAlerts: number;
  evaluatedAt: number;
};

export function evaluateV48Health(input: { path?: string; chainId: number; configuredProviders: number; requiredQuorum: number; maxIndexLag?: number; publish?: boolean }) {
  const path = input.path ?? v47DatabasePath();
  const db = openV48Database(path);
  let status: V48HealthStatus;
  try {
    const head = db.prepare("SELECT block_number AS blockNumber,finalized_block AS finalizedBlock FROM indexed_heads WHERE chain_id=? ORDER BY updated_at DESC LIMIT 1").get(input.chainId) as { blockNumber?: number; finalizedBlock?: number } | undefined;
    const providers = db.prepare("SELECT status,block_number AS blockNumber,block_hash AS blockHash,checked_at AS checkedAt FROM rpc_provider_health WHERE chain_id=?").all(input.chainId) as unknown as Array<{ status: string; blockNumber: number; blockHash?: string; checkedAt: number }>;
    const recentProviders = providers.filter((provider) => Date.now() - provider.checkedAt < 60_000);
    const healthyProviders = recentProviders.filter((provider) => provider.status === "healthy");
    const maxBlock = healthyProviders.length ? Math.max(...healthyProviders.map((provider) => provider.blockNumber)) : 0;
    const hashSet = new Set(healthyProviders.filter((provider) => provider.blockNumber === maxBlock).map((provider) => provider.blockHash).filter(Boolean));
    const latestRun = db.prepare("SELECT run_id AS runId FROM reconciliation_checks WHERE chain_id=? ORDER BY checked_at DESC,id DESC LIMIT 1").get(input.chainId) as { runId?: string } | undefined;
    const reconciliationMismatches = latestRun?.runId ? Number((db.prepare("SELECT COUNT(*) AS count FROM reconciliation_checks WHERE run_id=? AND ok=0").get(latestRun.runId) as { count: number | bigint }).count) : 0;
    const now = Date.now();
    const unhealthyWorkers = Number((db.prepare(`SELECT COUNT(*) AS count FROM worker_leases l LEFT JOIN keeper_heartbeats h ON h.worker_id=l.worker_id
      WHERE l.lease_until>=? AND (h.worker_id IS NULL OR h.lease_until<? OR h.status NOT IN ('healthy','starting'))`).get(now,now) as { count: number | bigint }).count);
    const indexedBlock = head?.blockNumber ?? 0;
    const finalizedBlock = Math.max(head?.finalizedBlock ?? 0, maxBlock);
    const indexLag = Math.max(0, finalizedBlock - indexedBlock);
    const rpcDivergence = hashSet.size > 1;
    const maxIndexLag = Math.max(0, input.maxIndexLag ?? Number(process.env.V48_MAX_INDEX_LAG_BLOCKS ?? 4));

    upsertV48Alert({ key: `rpc-quorum:${input.chainId}`, severity: "critical", active: healthyProviders.length < input.requiredQuorum, title: "RPC quorum unavailable", message: `${healthyProviders.length}/${input.requiredQuorum} required RPC providers are healthy.`, details: { configuredProviders: input.configuredProviders } }, path);
    upsertV48Alert({ key: `rpc-divergence:${input.chainId}`, severity: "critical", active: rpcDivergence, title: "RPC block-hash divergence", message: "Healthy providers disagree on the latest observed block hash.", details: { maxBlock, hashes: [...hashSet] } }, path);
    upsertV48Alert({ key: `index-lag:${input.chainId}`, severity: "warning", active: indexLag > maxIndexLag, title: "Canonical indexer lag", message: `Indexer is ${indexLag} block(s) behind the observed finalized target.`, details: { indexedBlock, finalizedBlock, maxIndexLag } }, path);
    upsertV48Alert({ key: `reconciliation:${input.chainId}`, severity: "critical", active: reconciliationMismatches > 0, title: "Contract reconciliation mismatch", message: `${reconciliationMismatches} indexed value(s) differ from direct contract reads.`, details: { runId: latestRun?.runId ?? null } }, path);
    upsertV48Alert({ key: `workers:${input.chainId}`, severity: "warning", active: unhealthyWorkers > 0, title: "Worker lease unhealthy", message: `${unhealthyWorkers} active worker lease(s) lack a healthy heartbeat.` }, path);

    const activeAlerts = Number((db.prepare("SELECT COUNT(*) AS count FROM system_alerts WHERE status='active'").get() as { count: number | bigint }).count);
    status = { healthy: activeAlerts === 0, chainId: input.chainId, indexedBlock, finalizedBlock, indexLag, healthyProviders: healthyProviders.length, configuredProviders: input.configuredProviders, rpcDivergence, reconciliationMismatches, unhealthyWorkers, activeAlerts, evaluatedAt: Date.now() };
  } finally { db.close(); }
  if (input.publish !== false) publishV48Event({ chainId: input.chainId, eventType: "system.health", blockNumber: status.indexedBlock, payload: status as unknown as Record<string, unknown> }, path);
  return status;
}
