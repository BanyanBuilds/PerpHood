import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export const V47_DATABASE_VERSION = 1;

export type V47Database = DatabaseSync;

export function v47DatabasePath() {
  return resolve(process.env.V47_DATABASE_PATH ?? ".perphood/v47-indexer.sqlite");
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS indexed_heads (
  chain_id INTEGER PRIMARY KEY,
  factory_address TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  finalized_block INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chain_blocks (
  chain_id INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  parent_hash TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  canonical INTEGER NOT NULL DEFAULT 1,
  indexed_at INTEGER NOT NULL,
  PRIMARY KEY (chain_id, block_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS chain_blocks_hash_idx ON chain_blocks(chain_id, block_hash);

CREATE TABLE IF NOT EXISTS raw_events (
  chain_id INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  block_hash TEXT NOT NULL,
  address TEXT NOT NULL,
  topic0 TEXT NOT NULL,
  topics_json TEXT NOT NULL,
  data TEXT NOT NULL,
  event_name TEXT NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0,
  indexed_at INTEGER NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);
CREATE INDEX IF NOT EXISTS raw_events_block_idx ON raw_events(chain_id, block_number, log_index);
CREATE INDEX IF NOT EXISTS raw_events_address_idx ON raw_events(chain_id, address, block_number);
CREATE INDEX IF NOT EXISTS raw_events_name_idx ON raw_events(chain_id, event_name, block_number);

CREATE TABLE IF NOT EXISTS markets (
  chain_id INTEGER NOT NULL,
  market_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  creator_address TEXT NOT NULL,
  metadata_hash TEXT NOT NULL,
  creator_genesis_buy_wei TEXT NOT NULL,
  migration_target_usd_wad TEXT NOT NULL,
  created_block INTEGER NOT NULL,
  created_transaction_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  phase INTEGER NOT NULL DEFAULT 0,
  migration_gate_digest TEXT,
  migrated_at INTEGER,
  migration_started_block INTEGER,
  migration_committed_block INTEGER,
  PRIMARY KEY (chain_id, market_address)
);
CREATE UNIQUE INDEX IF NOT EXISTS markets_token_idx ON markets(chain_id, token_address);

CREATE TABLE IF NOT EXISTS market_states (
  chain_id INTEGER NOT NULL,
  market_address TEXT NOT NULL,
  sequence TEXT NOT NULL,
  state_hash TEXT NOT NULL,
  action INTEGER NOT NULL,
  actor TEXT NOT NULL,
  marginal_price_wad TEXT NOT NULL,
  market_cap_eth_wad TEXT NOT NULL,
  real_weth_balance_wei TEXT NOT NULL,
  free_weth_wei TEXT NOT NULL,
  curve_sold_token_wad TEXT NOT NULL,
  open_interest_long_wei TEXT NOT NULL,
  open_interest_short_wei TEXT NOT NULL,
  active_positions TEXT NOT NULL,
  source_block INTEGER NOT NULL,
  source_transaction_hash TEXT NOT NULL,
  PRIMARY KEY (chain_id, market_address)
);

CREATE TABLE IF NOT EXISTS trades (
  chain_id INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  market_address TEXT NOT NULL,
  trader_address TEXT NOT NULL,
  is_buy INTEGER NOT NULL,
  gross_weth_wei TEXT NOT NULL,
  token_amount_wad TEXT NOT NULL,
  fee_weth_wei TEXT NOT NULL,
  sold_after_wad TEXT NOT NULL,
  market_cap_eth_wad TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);
CREATE INDEX IF NOT EXISTS trades_market_block_idx ON trades(chain_id, market_address, block_number DESC);

CREATE TABLE IF NOT EXISTS positions (
  chain_id INTEGER NOT NULL,
  market_address TEXT NOT NULL,
  position_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  direction INTEGER NOT NULL,
  leverage INTEGER NOT NULL,
  collateral_wei TEXT NOT NULL,
  notional_wei TEXT NOT NULL,
  token_amount_wad TEXT NOT NULL,
  entry_price_wad TEXT NOT NULL,
  liquidation_price_wad TEXT NOT NULL,
  status TEXT NOT NULL,
  liquidated INTEGER NOT NULL DEFAULT 0,
  payout_wei TEXT,
  pnl_wei TEXT,
  fee_wei TEXT,
  bad_debt_wei TEXT,
  opened_block INTEGER NOT NULL,
  closed_block INTEGER,
  opened_transaction_hash TEXT NOT NULL,
  closed_transaction_hash TEXT,
  PRIMARY KEY (chain_id, market_address, position_id)
);
CREATE INDEX IF NOT EXISTS positions_owner_idx ON positions(chain_id, owner_address, status);

CREATE TABLE IF NOT EXISTS account_balances (
  chain_id INTEGER NOT NULL,
  owner_address TEXT NOT NULL,
  weth_balance_wei TEXT NOT NULL,
  source_block INTEGER NOT NULL,
  source_transaction_hash TEXT NOT NULL,
  PRIMARY KEY (chain_id, owner_address)
);

CREATE TABLE IF NOT EXISTS token_balances (
  chain_id INTEGER NOT NULL,
  owner_address TEXT NOT NULL,
  market_address TEXT NOT NULL,
  token_balance_wad TEXT NOT NULL,
  source_block INTEGER NOT NULL,
  source_transaction_hash TEXT NOT NULL,
  PRIMARY KEY (chain_id, owner_address, market_address)
);

CREATE TABLE IF NOT EXISTS sessions (
  chain_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  public_key_hash TEXT NOT NULL,
  valid_until INTEGER NOT NULL,
  next_nonce TEXT NOT NULL DEFAULT '0',
  max_notional_wei TEXT NOT NULL,
  max_cumulative_notional_wei TEXT NOT NULL,
  spent_notional_wei TEXT NOT NULL DEFAULT '0',
  action_bitmap TEXT NOT NULL,
  active INTEGER NOT NULL,
  source_block INTEGER NOT NULL,
  source_transaction_hash TEXT NOT NULL,
  PRIMARY KEY (chain_id, session_id)
);
CREATE INDEX IF NOT EXISTS sessions_owner_idx ON sessions(chain_id, owner_address, active, valid_until);

CREATE TABLE IF NOT EXISTS account_executions (
  chain_id INTEGER NOT NULL,
  transaction_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  owner_address TEXT NOT NULL,
  market_address TEXT NOT NULL,
  action INTEGER NOT NULL,
  input_amount TEXT NOT NULL,
  output_amount TEXT NOT NULL,
  position_id TEXT NOT NULL,
  intent_hash TEXT NOT NULL,
  block_number INTEGER NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);

CREATE TABLE IF NOT EXISTS indexed_orders (
  order_id TEXT PRIMARY KEY,
  client_order_id TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  market_address TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  order_hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  transaction_hash TEXT,
  block_number INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS indexed_orders_client_idx ON indexed_orders(client_order_id);
CREATE INDEX IF NOT EXISTS indexed_orders_owner_idx ON indexed_orders(owner_address, status, created_at DESC);
CREATE INDEX IF NOT EXISTS indexed_orders_market_idx ON indexed_orders(market_address, status, created_at DESC);

CREATE TABLE IF NOT EXISTS worker_leases (
  lease_key TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS keeper_heartbeats (
  worker_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_block INTEGER NOT NULL,
  lease_until INTEGER NOT NULL,
  metadata_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS keeper_heartbeats_seen_idx ON keeper_heartbeats(last_seen_at DESC);

CREATE TABLE IF NOT EXISTS reconciliation_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL DEFAULT '',
  chain_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  indexed_value TEXT NOT NULL,
  chain_value TEXT NOT NULL,
  ok INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  block_number INTEGER NOT NULL,
  details_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reconciliation_checks_recent_idx ON reconciliation_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_checks_run_idx ON reconciliation_checks(run_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_checks_subject_idx ON reconciliation_checks(chain_id, subject, checked_at DESC);

CREATE TABLE IF NOT EXISTS recovery_jobs (
  job_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  from_block INTEGER,
  to_block INTEGER,
  details_json TEXT NOT NULL,
  error TEXT
);
`;

export function openV47Database(path = v47DatabasePath()) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  const reconciliationColumns = db.prepare("PRAGMA table_info(reconciliation_checks)").all() as unknown as Array<{ name: string }>;
  if (!reconciliationColumns.some((column) => column.name === "run_id")) {
    db.exec("ALTER TABLE reconciliation_checks ADD COLUMN run_id TEXT NOT NULL DEFAULT ''");
    db.exec("CREATE INDEX IF NOT EXISTS reconciliation_checks_run_idx ON reconciliation_checks(run_id, checked_at DESC)");
  }
  db.prepare("INSERT INTO schema_meta(key, value) VALUES('version', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(V47_DATABASE_VERSION));
  return db;
}

export function withV47Transaction<T>(db: V47Database, operation: () => T) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = operation();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  }
}

export function sqlValues(values: unknown[]): SQLInputValue[] {
  return values.map((value) => {
    if (typeof value === "bigint") return value.toString();
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === null || typeof value === "string" || typeof value === "number" || value instanceof Uint8Array) return value;
    return JSON.stringify(value);
  });
}

export type V47HeartbeatInput = {
  workerId: string;
  role: "indexer" | "keeper" | "reconciler";
  status: "starting" | "healthy" | "degraded" | "stopped";
  chainId: number;
  lastBlock: number;
  leaseUntil: number;
  metadata?: Record<string, unknown>;
};

export function recordV47Heartbeat(input: V47HeartbeatInput, path = v47DatabasePath()) {
  const db = openV47Database(path);
  try {
    db.prepare(`INSERT INTO keeper_heartbeats(worker_id, role, status, chain_id, last_seen_at, last_block, lease_until, metadata_json)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(worker_id) DO UPDATE SET role=excluded.role,status=excluded.status,chain_id=excluded.chain_id,last_seen_at=excluded.last_seen_at,last_block=excluded.last_block,lease_until=excluded.lease_until,metadata_json=excluded.metadata_json`)
      .run(input.workerId, input.role, input.status, input.chainId, Date.now(), input.lastBlock, input.leaseUntil, JSON.stringify(input.metadata ?? {}));
  } finally { db.close(); }
}

export function listV47Heartbeats(path = v47DatabasePath()) {
  const db = openV47Database(path);
  try {
    return db.prepare("SELECT worker_id AS workerId, role, status, chain_id AS chainId, last_seen_at AS lastSeenAt, last_block AS lastBlock, lease_until AS leaseUntil, metadata_json AS metadataJson FROM keeper_heartbeats ORDER BY last_seen_at DESC").all();
  } finally { db.close(); }
}

export function v47DatabaseStats(path = v47DatabasePath()) {
  const db = openV47Database(path);
  try {
    const tables = ["chain_blocks", "raw_events", "markets", "trades", "positions", "account_balances", "token_balances", "sessions", "account_executions", "indexed_orders", "keeper_heartbeats", "worker_leases", "reconciliation_checks"];
    const counts = Object.fromEntries(tables.map((table) => [table, Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number | bigint }).count)]));
    const head = db.prepare("SELECT chain_id AS chainId, factory_address AS factoryAddress, block_number AS blockNumber, block_hash AS blockHash, finalized_block AS finalizedBlock, updated_at AS updatedAt FROM indexed_heads ORDER BY updated_at DESC LIMIT 1").get() ?? null;
    const now = Date.now();
    const unhealthyWorkers = Number((db.prepare(`SELECT COUNT(*) AS count
      FROM worker_leases l
      LEFT JOIN keeper_heartbeats h ON h.worker_id=l.worker_id
      WHERE l.lease_until >= ? AND (h.worker_id IS NULL OR h.lease_until < ? OR h.status NOT IN ('healthy','starting'))`)
      .get(now, now) as { count: number | bigint }).count);
    return { path, version: V47_DATABASE_VERSION, counts, head, unhealthyWorkers };
  } finally { db.close(); }
}

export function acquireV47WorkerLease(input: { leaseKey: string; workerId: string; leaseMs?: number }, path = v47DatabasePath()) {
  const db = openV47Database(path);
  try {
    return withV47Transaction(db, () => {
      const now = Date.now();
      const current = db.prepare("SELECT worker_id AS workerId,lease_until AS leaseUntil FROM worker_leases WHERE lease_key=?").get(input.leaseKey) as { workerId?: string; leaseUntil?: number } | undefined;
      if (current?.leaseUntil && current.leaseUntil > now && current.workerId !== input.workerId) return false;
      db.prepare(`INSERT INTO worker_leases(lease_key,worker_id,lease_until,updated_at) VALUES(?,?,?,?)
        ON CONFLICT(lease_key) DO UPDATE SET worker_id=excluded.worker_id,lease_until=excluded.lease_until,updated_at=excluded.updated_at`)
        .run(input.leaseKey, input.workerId, now + (input.leaseMs ?? 30_000), now);
      return true;
    });
  } finally { db.close(); }
}

export function releaseV47WorkerLease(leaseKey: string, workerId: string, path = v47DatabasePath()) {
  const db = openV47Database(path);
  try { return db.prepare("DELETE FROM worker_leases WHERE lease_key=? AND worker_id=?").run(leaseKey, workerId).changes > 0; }
  finally { db.close(); }
}

export function listV47RecoveryJobs(path = v47DatabasePath(), limit = 100) {
  const db = openV47Database(path);
  try { return db.prepare("SELECT job_id AS jobId,kind,status,requested_at AS requestedAt,started_at AS startedAt,completed_at AS completedAt,from_block AS fromBlock,to_block AS toBlock,details_json AS detailsJson,error FROM recovery_jobs ORDER BY requested_at DESC LIMIT ?").all(limit); }
  finally { db.close(); }
}
