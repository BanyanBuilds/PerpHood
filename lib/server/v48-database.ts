import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { openV47Database, v47DatabasePath, withV47Transaction, type V47Database } from "./v47-database.ts";

export const V48_DATABASE_VERSION = 2;
export type V48Database = V47Database;

const V48_SCHEMA = `
CREATE TABLE IF NOT EXISTS data_plane_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  chain_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  market_address TEXT,
  owner_address TEXT,
  block_number INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS data_plane_events_market_idx ON data_plane_events(chain_id,market_address,sequence DESC);
CREATE INDEX IF NOT EXISTS data_plane_events_owner_idx ON data_plane_events(chain_id,owner_address,sequence DESC);
CREATE INDEX IF NOT EXISTS data_plane_events_created_idx ON data_plane_events(created_at DESC);

CREATE TABLE IF NOT EXISTS market_candles (
  chain_id INTEGER NOT NULL,
  market_address TEXT NOT NULL,
  interval_seconds INTEGER NOT NULL,
  bucket_start INTEGER NOT NULL,
  open_market_cap_wei TEXT NOT NULL,
  high_market_cap_wei TEXT NOT NULL,
  low_market_cap_wei TEXT NOT NULL,
  close_market_cap_wei TEXT NOT NULL,
  volume_weth_wei TEXT NOT NULL,
  buy_volume_weth_wei TEXT NOT NULL,
  sell_volume_weth_wei TEXT NOT NULL,
  trade_count INTEGER NOT NULL,
  buy_count INTEGER NOT NULL,
  sell_count INTEGER NOT NULL,
  first_block INTEGER NOT NULL,
  last_block INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(chain_id,market_address,interval_seconds,bucket_start)
);
CREATE INDEX IF NOT EXISTS market_candles_recent_idx ON market_candles(chain_id,market_address,interval_seconds,bucket_start DESC);

CREATE TABLE IF NOT EXISTS market_metrics (
  chain_id INTEGER NOT NULL,
  market_address TEXT NOT NULL,
  source_block INTEGER NOT NULL,
  market_cap_wei TEXT NOT NULL,
  free_weth_wei TEXT NOT NULL,
  open_interest_long_wei TEXT NOT NULL,
  open_interest_short_wei TEXT NOT NULL,
  active_positions TEXT NOT NULL,
  volume_10s_wei TEXT NOT NULL,
  volume_60s_wei TEXT NOT NULL,
  volume_5m_wei TEXT NOT NULL,
  volume_1h_wei TEXT NOT NULL,
  buys_60s INTEGER NOT NULL,
  sells_60s INTEGER NOT NULL,
  traders_5m INTEGER NOT NULL,
  change_60s_bps INTEGER NOT NULL,
  change_5m_bps INTEGER NOT NULL,
  digest TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(chain_id,market_address)
);

CREATE TABLE IF NOT EXISTS rpc_provider_health (
  chain_id INTEGER NOT NULL,
  rpc_url TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY(chain_id,rpc_url)
);

CREATE TABLE IF NOT EXISTS system_alerts (
  alert_key TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS system_alerts_status_idx ON system_alerts(status,severity,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS replication_checkpoints (
  target TEXT PRIMARY KEY,
  last_event_sequence INTEGER NOT NULL DEFAULT 0,
  last_finalized_block INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS database_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  source_block INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL
);
`;

export function openV48Database(path = v47DatabasePath()) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = openV47Database(path);
  db.exec(V48_SCHEMA);
  db.prepare("INSERT INTO schema_meta(key,value) VALUES('v48_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(V48_DATABASE_VERSION));
  return db;
}

export type V48EventInput = {
  chainId: number;
  eventType: "market.updated" | "trade.confirmed" | "position.updated" | "account.updated" | "order.updated" | "system.health" | "reorg.recovered";
  marketAddress?: string;
  ownerAddress?: string;
  blockNumber?: number;
  payload: Record<string, unknown>;
};

export function publishV48Event(input: V48EventInput, path = v47DatabasePath()) {
  const db = openV48Database(path);
  try {
    const result = db.prepare("INSERT INTO data_plane_events(chain_id,event_type,market_address,owner_address,block_number,payload_json,created_at) VALUES(?,?,?,?,?,?,?)")
      .run(input.chainId, input.eventType, input.marketAddress?.toLowerCase() ?? null, input.ownerAddress?.toLowerCase() ?? null, input.blockNumber ?? 0, JSON.stringify(input.payload), Date.now());
    db.prepare("DELETE FROM data_plane_events WHERE sequence NOT IN (SELECT sequence FROM data_plane_events ORDER BY sequence DESC LIMIT 100000)").run();
    return Number(result.lastInsertRowid);
  } finally { db.close(); }
}

export function listV48Events(input: { afterSequence?: number; chainId?: number; market?: string; owner?: string; limit?: number } = {}, path = v47DatabasePath()) {
  const db = openV48Database(path);
  try {
    const conditions = ["sequence > ?"];
    const values: Array<string | number> = [Math.max(0, input.afterSequence ?? 0)];
    if (input.chainId !== undefined) { conditions.push("chain_id=?"); values.push(input.chainId); }
    if (input.market) { conditions.push("market_address=?"); values.push(input.market.toLowerCase()); }
    if (input.owner) { conditions.push("owner_address=?"); values.push(input.owner.toLowerCase()); }
    values.push(Math.min(500, Math.max(1, input.limit ?? 100)));
    return db.prepare(`SELECT sequence,chain_id AS chainId,event_type AS eventType,market_address AS marketAddress,owner_address AS ownerAddress,block_number AS blockNumber,payload_json AS payloadJson,created_at AS createdAt FROM data_plane_events WHERE ${conditions.join(" AND ")} ORDER BY sequence ASC LIMIT ?`).all(...values);
  } finally { db.close(); }
}

export function upsertV48Alert(input: { key: string; severity: "info" | "warning" | "critical"; active: boolean; title: string; message: string; details?: Record<string, unknown> }, path = v47DatabasePath()) {
  const db = openV48Database(path);
  try {
    const now = Date.now();
    return withV47Transaction(db, () => {
      const current = db.prepare("SELECT first_seen_at AS firstSeenAt,status FROM system_alerts WHERE alert_key=?").get(input.key) as { firstSeenAt?: number; status?: string } | undefined;
      if (input.active) {
        db.prepare(`INSERT INTO system_alerts(alert_key,severity,status,title,message,details_json,first_seen_at,last_seen_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,NULL)
          ON CONFLICT(alert_key) DO UPDATE SET severity=excluded.severity,status='active',title=excluded.title,message=excluded.message,details_json=excluded.details_json,last_seen_at=excluded.last_seen_at,resolved_at=NULL`)
          .run(input.key,input.severity,"active",input.title,input.message,JSON.stringify(input.details ?? {}),current?.firstSeenAt ?? now,now);
      } else if (current) {
        db.prepare("UPDATE system_alerts SET status='resolved',last_seen_at=?,resolved_at=? WHERE alert_key=?").run(now,now,input.key);
      }
      return input.active;
    });
  } finally { db.close(); }
}

export function v48DatabaseStats(path = v47DatabasePath()) {
  const db = openV48Database(path);
  try {
    const tables = ["data_plane_events","market_candles","market_metrics","rpc_provider_health","system_alerts","replication_checkpoints","database_snapshots"];
    const counts = Object.fromEntries(tables.map((table) => [table, Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number | bigint }).count)]));
    const latestEvent = db.prepare("SELECT sequence,event_type AS eventType,created_at AS createdAt FROM data_plane_events ORDER BY sequence DESC LIMIT 1").get() ?? null;
    const alerts = db.prepare("SELECT alert_key AS alertKey,severity,status,title,message,last_seen_at AS lastSeenAt,resolved_at AS resolvedAt FROM system_alerts ORDER BY status='active' DESC,last_seen_at DESC LIMIT 100").all();
    const providers = db.prepare("SELECT chain_id AS chainId,rpc_url AS rpcUrl,status,latency_ms AS latencyMs,block_number AS blockNumber,block_hash AS blockHash,consecutive_failures AS consecutiveFailures,last_error AS lastError,checked_at AS checkedAt FROM rpc_provider_health ORDER BY status='healthy' DESC,latency_ms ASC").all();
    return { version: V48_DATABASE_VERSION, counts, latestEvent, alerts, providers };
  } finally { db.close(); }
}
