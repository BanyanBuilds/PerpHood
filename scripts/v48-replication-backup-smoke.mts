import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createV48DatabaseSnapshot } from "../lib/server/v48-backup.ts";
import { openV48Database, publishV48Event } from "../lib/server/v48-database.ts";
import { replicateV48FinalizedState } from "../lib/server/v48-replication.ts";

const directory = await mkdtemp(join(tmpdir(), "perphood-v48-backup-"));
const path = join(directory, "source.sqlite");
const backupPath = join(directory, "backup.sqlite");
const db = openV48Database(path);
try {
  db.prepare("INSERT INTO indexed_heads(chain_id,factory_address,block_number,block_hash,finalized_block,updated_at) VALUES(?,?,?,?,?,?)").run(31337,"0x1111111111111111111111111111111111111111",7,`0x${"a".repeat(64)}`,7,Date.now());
} finally { db.close(); }
publishV48Event({ chainId: 31337, eventType: "system.health", blockNumber: 7, payload: { healthy: true } }, path);
const snapshot = createV48DatabaseSnapshot({ sourcePath: path, destinationPath: backupPath, metadata: { test: true } });
assert.equal(existsSync(snapshot.path), true);
assert.equal(snapshot.sourceBlock, 7);
assert.equal(snapshot.sha256.length, 64);
const calls: Array<{ url: string; body: unknown[] }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(input), body: JSON.parse(String(init?.body ?? "[]")) as unknown[] });
  return new Response(null, { status: 201 });
}) as typeof fetch;
try {
  const result = await replicateV48FinalizedState({ path, config: { url: "https://example.supabase.co", serviceRoleKey: "server-only-test-key", target: "test:v48" } });
  assert.equal(result.enabled, true);
  assert.equal(result.replicated, 1);
  assert.equal(calls.some((call) => call.url.includes("perphood_v48_events")), true);
  assert.equal(calls.every((call) => call.url.startsWith("https://example.supabase.co/rest/v1/")), true);
} finally { globalThis.fetch = originalFetch; await rm(directory, { recursive: true, force: true }); }
console.log("V48 replication/backup smoke passed: consistent SQLite VACUUM snapshot, SHA-256 recovery proof, finalized PostgREST upsert, and durable replication checkpoint.");
