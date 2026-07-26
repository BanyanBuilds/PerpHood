import { setTimeout as sleep } from "node:timers/promises";
import { runV48DataPlaneCycle } from "../lib/server/v48-data-plane.ts";
import { replicateV48FinalizedState } from "../lib/server/v48-replication.ts";

const mode = process.argv[2] ?? "watch";
const intervalMs = Math.max(750, Number(process.env.V48_DATA_PLANE_INTERVAL_MS ?? 1_500));
const replicate = process.env.V48_REPLICATE_AFTER_CYCLE === "true";
async function cycle() {
  const result = await runV48DataPlaneCycle();
  console.log(`[V48 data plane] chain=${result.chainId} quorum=${result.quorumBlock} indexed=${result.indexer.indexedTo}/${result.indexer.finalizedBlock} markets=${result.materializer.markets} health=${result.health.healthy ? "healthy" : "degraded"}`);
  if (replicate) {
    const replication = await replicateV48FinalizedState();
    console.log(`[V48 replica] enabled=${replication.enabled} rows=${replication.replicated}`);
  }
}
if (mode === "once") await cycle();
else if (mode === "watch") {
  console.log(`[V48 data plane] polling every ${intervalMs}ms`);
  while (true) {
    const started = Date.now();
    try { await cycle(); } catch (error) { console.error(`[V48 data plane] ${error instanceof Error ? error.message : "cycle failed"}`); }
    await sleep(Math.max(0, intervalMs - (Date.now() - started)));
  }
} else throw new Error("Usage: v48-data-plane-worker.mts [watch|once]");
