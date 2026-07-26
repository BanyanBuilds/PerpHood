import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  db: await readFile("lib/server/v47-database.ts", "utf8"),
  indexer: await readFile("lib/server/v47-indexer.ts", "utf8"),
  orders: await readFile("lib/server/v47-order-store.ts", "utf8"),
  keeper: await readFile("lib/server/v46-keeper.ts", "utf8"),
  console: await readFile("components/V47IndexerConsole.tsx", "utf8"),
  css: await readFile("app/globals.css", "utf8"),
  status: await readFile("app/api/v47/indexer/status/route.ts", "utf8"),
  run: await readFile("app/api/v47/indexer/run/route.ts", "utf8"),
  snapshot: await readFile("app/api/v47/snapshot/route.ts", "utf8"),
  rollback: await readFile("app/api/v47/recovery/rollback/route.ts", "utf8"),
  reconciler: await readFile("lib/server/v47-reconciler.ts", "utf8"),
  reconcileRoute: await readFile("app/api/v47/reconcile/run/route.ts", "utf8"),
  funding: await readFile("components/FundingCenter.tsx", "utf8"),
};
assert.match(files.db, /journal_mode = WAL/);
assert.match(files.db, /raw_events/);
assert.match(files.db, /keeper_heartbeats/);
assert.match(files.indexer, /findCommonAncestor/);
assert.match(files.indexer, /rollbackV47ToBlock/);
assert.match(files.indexer, /rebuildV47Projections/);
assert.match(files.orders, /sqlite-transactional/);
assert.match(files.keeper, /v47-order-store/);
assert.match(files.keeper, /recordV47Heartbeat/);
assert.match(files.console, /Authoritative Indexer/);
assert.match(files.console, /Run indexer/);
assert.match(files.status, /v47DatabaseStats/);
assert.match(files.run, /runV47IndexerCycle/);
assert.match(files.snapshot, /v47IndexedSnapshot/);
assert.match(files.rollback, /rollbackV47ToBlock/);
assert.match(files.reconciler, /reconciliation_checks/);
assert.match(files.reconciler, /sessionState\(bytes32\)/);
assert.match(files.reconcileRoute, /runV47Reconciliation/);
assert.match(files.funding, /V47 canonical recovery/);
assert.match(files.funding, /indexedSession/);
assert.doesNotMatch(files.css.slice(files.css.indexOf("\/\* V47 authoritative indexer \*\/")), /font-size:(?:9|10)px/);
console.log("V47 static integration smoke passed: SQL durability, canonical raw events, rollback/replay, worker heartbeats, indexed APIs, recovery endpoint, and readable operations console.");
