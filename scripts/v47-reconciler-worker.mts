import { setTimeout as sleep } from "node:timers/promises";
import { runV47Reconciliation } from "../lib/server/v47-reconciler.ts";

const mode = process.argv[2] ?? "watch";
const intervalMs = Math.max(2_000, Number(process.env.V47_RECONCILIATION_INTERVAL_MS ?? 15_000));
async function cycle() {
  const result = await runV47Reconciliation();
  console.log(`[V47 reconciler] block=${result.blockNumber} checked=${result.checked} matched=${result.matched} mismatched=${result.mismatched}`);
}
if (mode === "once") await cycle();
else if (mode === "watch") {
  console.log(`[V47 reconciler] polling every ${intervalMs}ms`);
  while (true) {
    try { await cycle(); }
    catch (error) { console.error(`[V47 reconciler] ${error instanceof Error ? error.message : "cycle failed"}`); }
    await sleep(intervalMs);
  }
} else throw new Error("Usage: v47-reconciler-worker.mts [watch|once]");
