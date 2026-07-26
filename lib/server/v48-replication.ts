import { openV48Database } from "./v48-database.ts";
import { v47DatabasePath } from "./v47-database.ts";

export type V48ReplicationConfig = { url: string; serviceRoleKey: string; target: string };

function configFromEnvironment(): V48ReplicationConfig | null {
  const url = process.env.V48_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.V48_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return { url: url.replace(/\/$/, ""), serviceRoleKey, target: `${url.replace(/\/$/, "")}:v48` };
}

async function upsert(config: V48ReplicationConfig, table: string, rows: unknown[], onConflict: string) {
  if (!rows.length) return 0;
  const response = await fetch(`${config.url}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: { apikey: config.serviceRoleKey, authorization: `Bearer ${config.serviceRoleKey}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Supabase replication ${table} failed: HTTP ${response.status} ${await response.text()}`);
  return rows.length;
}

export async function replicateV48FinalizedState(input: { path?: string; config?: V48ReplicationConfig; batchSize?: number } = {}) {
  const config = input.config ?? configFromEnvironment();
  if (!config) return { enabled: false, replicated: 0, target: null };
  const path = input.path ?? v47DatabasePath();
  const db = openV48Database(path);
  const batchSize = Math.min(5_000, Math.max(1, input.batchSize ?? Number(process.env.V48_REPLICATION_BATCH_SIZE ?? 1_000)));
  try {
    const checkpoint = db.prepare("SELECT last_event_sequence AS lastEventSequence FROM replication_checkpoints WHERE target=?").get(config.target) as { lastEventSequence?: number } | undefined;
    const after = checkpoint?.lastEventSequence ?? 0;
    const head = db.prepare("SELECT chain_id AS chainId,finalized_block AS finalizedBlock FROM indexed_heads ORDER BY updated_at DESC LIMIT 1").get() as { chainId?: number; finalizedBlock?: number } | undefined;
    const events = db.prepare("SELECT sequence,chain_id,event_type,market_address,owner_address,block_number,payload_json,created_at FROM data_plane_events WHERE sequence>? ORDER BY sequence ASC LIMIT ?").all(after,batchSize) as unknown as Array<Record<string, unknown>>;
    const markets = db.prepare("SELECT * FROM markets WHERE chain_id=?").all(head?.chainId ?? 0) as unknown[];
    const metrics = db.prepare("SELECT * FROM market_metrics WHERE chain_id=?").all(head?.chainId ?? 0) as unknown[];
    const candles = db.prepare("SELECT * FROM market_candles WHERE chain_id=? AND last_block<=? ORDER BY last_block DESC LIMIT ?").all(head?.chainId ?? 0,head?.finalizedBlock ?? 0,batchSize) as unknown[];
    const sessions = db.prepare("SELECT * FROM sessions WHERE chain_id=?").all(head?.chainId ?? 0) as unknown[];
    const orders = db.prepare("SELECT * FROM indexed_orders ORDER BY updated_at DESC LIMIT ?").all(batchSize) as unknown[];
    let replicated = 0;
    replicated += await upsert(config,"perphood_v48_markets",markets,"chain_id,market_address");
    replicated += await upsert(config,"perphood_v48_market_metrics",metrics,"chain_id,market_address");
    replicated += await upsert(config,"perphood_v48_market_candles",candles,"chain_id,market_address,interval_seconds,bucket_start");
    replicated += await upsert(config,"perphood_v48_sessions",sessions,"chain_id,session_id");
    replicated += await upsert(config,"perphood_v48_orders",orders,"order_id");
    replicated += await upsert(config,"perphood_v48_events",events,"sequence");
    const lastEventSequence = Number(events.at(-1)?.sequence ?? after);
    db.prepare(`INSERT INTO replication_checkpoints(target,last_event_sequence,last_finalized_block,last_success_at,last_error,updated_at) VALUES(?,?,?,?,NULL,?)
      ON CONFLICT(target) DO UPDATE SET last_event_sequence=excluded.last_event_sequence,last_finalized_block=excluded.last_finalized_block,last_success_at=excluded.last_success_at,last_error=NULL,updated_at=excluded.updated_at`)
      .run(config.target,lastEventSequence,head?.finalizedBlock ?? 0,Date.now(),Date.now());
    return { enabled: true, replicated, target: config.target, lastEventSequence, finalizedBlock: head?.finalizedBlock ?? 0 };
  } catch (error) {
    db.prepare(`INSERT INTO replication_checkpoints(target,last_event_sequence,last_finalized_block,last_success_at,last_error,updated_at) VALUES(?,0,0,NULL,?,?)
      ON CONFLICT(target) DO UPDATE SET last_error=excluded.last_error,updated_at=excluded.updated_at`)
      .run(config.target,error instanceof Error ? error.message : "Replication failed.",Date.now());
    throw error;
  } finally { db.close(); }
}
