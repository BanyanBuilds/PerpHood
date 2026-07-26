import { setTimeout as sleep } from "node:timers/promises";
import { replicateV48FinalizedState } from "../lib/server/v48-replication.ts";
const mode = process.argv[2] ?? "watch";
const intervalMs = Math.max(5_000, Number(process.env.V48_REPLICATION_INTERVAL_MS ?? 30_000));
async function cycle() { const result = await replicateV48FinalizedState(); console.log(`[V48 replica] enabled=${result.enabled} rows=${result.replicated} finalized=${"finalizedBlock" in result ? result.finalizedBlock : 0}`); }
if (mode === "once") await cycle();
else if (mode === "watch") { while (true) { try { await cycle(); } catch (error) { console.error(error instanceof Error ? error.message : error); } await sleep(intervalMs); } }
else throw new Error("Usage: v48-replicator-worker.mts [watch|once]");
