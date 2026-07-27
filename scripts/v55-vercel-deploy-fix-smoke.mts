import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const checks: string[] = [];

function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks.push(label);
}

const orderBook = read("components/TerminalOrderBook.tsx");
check(orderBook.includes('type SpotAction = "buy" | "sell"'), "order-book quick actions use an explicit spot-only action type");
check(orderBook.includes('onQuick: (side: SpotAction) => void'), "order-book callback accepts both spot buy and spot sell");
check(orderBook.includes('onQuick("sell")'), "spot sell remains wired to the quick-action callback");
check(!orderBook.includes('onQuick: (side: Direction)'), "order book no longer misuses the buy/long/short Direction type");

const orderStore = read("lib/server/v47-order-store.ts");
check(!orderStore.includes('node:fs') && !orderStore.includes('node:path'), "production order API store has no filesystem migration imports");
check(!orderStore.includes("migrateV46JsonOrdersToV47"), "production order API store does not bundle the legacy JSON migration helper");

const migration = read("lib/server/v47-order-migration.ts");
check(migration.includes('from "node:fs/promises"'), "legacy JSON migration remains available in its worker-only module");
check(migration.includes("migrateV46JsonOrdersToV47"), "worker-only migration exports the expected migration function");

const worker = read("scripts/v47-indexer-worker.mts");
check(worker.includes('../lib/server/v47-order-migration.ts'), "indexer worker imports the isolated migration module");
check(!worker.includes('migrateV46JsonOrdersToV47 } from "../lib/server/v47-order-store.ts"'), "indexer worker no longer imports migration through the production API store");

const route = read("app/api/v46/orders/route.ts");
check(route.includes('export const runtime = "nodejs"'), "orders API remains explicitly on the Node.js runtime");
check(route.includes('lib/server/v47-order-store') || route.includes('@/lib/server/v47-order-store'), "orders API imports only the production order store");

console.log(`Leverage X V55 Vercel deploy regression smoke passed (${checks.length}/${checks.length}).`);
for (const label of checks) console.log(`  ✓ ${label}`);
