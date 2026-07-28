import { setTimeout as sleep } from "node:timers/promises";
import { deliverBridgeBatch } from "../lib/server/v86-chain-live-bridge.ts";
import { runV47IndexerCycle } from "../lib/server/v47-indexer.ts";

const mode = process.argv[2] ?? "watch";
const intervalMs = Math.max(1_000, Number(process.env.V86_BRIDGE_INTERVAL_MS ?? "2500"));
const destination = process.env.LIVE_EVENT_INGEST_URL?.trim();
const secret = process.env.LIVE_EVENT_INGEST_SECRET?.trim();
const chainId = Number(process.env.ROBINHOOD_CHAIN_ID ?? process.env.V47_CHAIN_ID ?? "46630");

if (!destination || !/^https?:\/\//.test(destination)) throw new Error("LIVE_EVENT_INGEST_URL must be a full http(s) URL ending in /api/live/ingest.");
if (!secret || secret.length < 24) throw new Error("LIVE_EVENT_INGEST_SECRET must be at least 24 characters.");
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("ROBINHOOD_CHAIN_ID must be a positive integer.");

async function cycle() {
  const indexed = await runV47IndexerCycle();
  let delivered = 0;
  let scanned = 0;
  while (true) {
    const result = await deliverBridgeBatch({ destination, secret, chainId, limit: 200 });
    delivered += result.delivered;
    scanned += result.scanned;
    if (result.scanned < 200) break;
  }
  console.log(`[V86 bridge] head=${indexed.indexedTo} logs=${indexed.logs} scanned=${scanned} delivered=${delivered}`);
}

if (mode === "once") await cycle();
else if (mode === "watch") {
  console.log(`[V86 bridge] chain=${chainId} destination=${destination} interval=${intervalMs}ms`);
  while (true) {
    try { await cycle(); }
    catch (error) { console.error(`[V86 bridge] ${error instanceof Error ? error.message : "cycle failed"}`); }
    await sleep(intervalMs);
  }
} else throw new Error("Usage: v86-chain-live-worker.mts [watch|once]");
