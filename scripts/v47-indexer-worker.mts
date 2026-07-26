import { setTimeout as sleep } from "node:timers/promises";
import { runV47IndexerCycle } from "../lib/server/v47-indexer.ts";
import { migrateV46JsonOrdersToV47 } from "../lib/server/v47-order-store.ts";

const mode = process.argv[2] ?? "watch";
const intervalMs = Math.max(500, Number(process.env.V47_INDEXER_INTERVAL_MS ?? 1_500));
const migration = await migrateV46JsonOrdersToV47();
if (migration.imported) console.log(`[V47 indexer] imported ${migration.imported} V46 JSON order(s) into SQLite.`);

async function cycle() {
  const result = await runV47IndexerCycle();
  console.log(`[V47 indexer] chain=${result.chainId} head=${result.indexedTo}/${result.finalizedBlock} blocks=${result.blocks} logs=${result.logs} markets=${result.markets} reorg=${result.reorgDepth}`);
}

if (mode === "once") {
  await cycle();
} else if (mode === "watch") {
  console.log(`[V47 indexer] polling every ${intervalMs}ms`);
  while (true) {
    try { await cycle(); }
    catch (error) { console.error(`[V47 indexer] ${error instanceof Error ? error.message : "cycle failed"}`); }
    await sleep(intervalMs);
  }
} else {
  throw new Error("Usage: v47-indexer-worker.mts [watch|once]");
}
