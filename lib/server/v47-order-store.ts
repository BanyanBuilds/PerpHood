import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { V46SignedOrder, V46StoredOrder } from "../chain/v46-order.ts";
import { openV47Database, v47DatabasePath, withV47Transaction } from "./v47-database.ts";

type OrderFilter = {
  owner?: string;
  market?: string;
  statuses?: V46StoredOrder["status"][];
};

type OrderRow = {
  order_id: string;
  client_order_id: string;
  owner_address: string;
  market_address: string;
  session_id: string;
  status: string;
  order_hash: string;
  payload_json: string;
  created_at: number;
  updated_at: number;
  lease_owner?: string | null;
  lease_expires_at?: number | null;
  transaction_hash?: string | null;
  block_number?: number | null;
};

function fromRow(row?: OrderRow): V46StoredOrder | null {
  if (!row) return null;
  const order = JSON.parse(row.payload_json) as V46StoredOrder;
  return {
    ...order,
    status: row.status as V46StoredOrder["status"],
    leaseOwner: row.lease_owner ?? undefined,
    leaseExpiresAt: row.lease_expires_at ?? undefined,
    transactionHash: (row.transaction_hash ?? order.transactionHash) as V46StoredOrder["transactionHash"],
    blockNumber: row.block_number ?? order.blockNumber,
  };
}

function storeOrder(db: ReturnType<typeof openV47Database>, order: V46StoredOrder, createdAt = order.intent.createdAt * 1_000) {
  const now = Date.now();
  db.prepare(`INSERT INTO indexed_orders(order_id,client_order_id,owner_address,market_address,session_id,status,order_hash,payload_json,created_at,updated_at,lease_owner,lease_expires_at,transaction_hash,block_number)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,payload_json=excluded.payload_json,updated_at=excluded.updated_at,lease_owner=excluded.lease_owner,lease_expires_at=excluded.lease_expires_at,transaction_hash=excluded.transaction_hash,block_number=excluded.block_number`)
    .run(order.intent.orderId, order.intent.clientOrderId, order.intent.owner.toLowerCase(), order.intent.market.toLowerCase(), order.intent.sessionId.toLowerCase(), order.status, order.orderHash.toLowerCase(), JSON.stringify(order), createdAt, now, order.leaseOwner ?? null, order.leaseExpiresAt ?? null, order.transactionHash ?? null, order.blockNumber ?? null);
}

function getById(db: ReturnType<typeof openV47Database>, orderId: string) {
  return fromRow(db.prepare("SELECT * FROM indexed_orders WHERE order_id=?").get(orderId) as OrderRow | undefined);
}

export function v47OrderStorePath() { return v47DatabasePath(); }

export async function listV46Orders(filter: OrderFilter = {}) {
  const db = openV47Database();
  try {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filter.owner) { clauses.push("owner_address=?"); values.push(filter.owner.toLowerCase()); }
    if (filter.market) { clauses.push("market_address=?"); values.push(filter.market.toLowerCase()); }
    if (filter.statuses?.length) {
      clauses.push(`status IN (${filter.statuses.map(() => "?").join(",")})`);
      values.push(...filter.statuses);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return (db.prepare(`SELECT * FROM indexed_orders ${where} ORDER BY created_at DESC LIMIT 20000`).all(...values) as unknown as OrderRow[]).map((row) => fromRow(row)!).filter(Boolean);
  } finally { db.close(); }
}

export async function getV46Order(orderId: string) {
  const db = openV47Database();
  try { return getById(db, orderId); } finally { db.close(); }
}

export async function createV46Order(signed: V46SignedOrder) {
  const db = openV47Database();
  try {
    return withV47Transaction(db, () => {
      const duplicate = db.prepare("SELECT * FROM indexed_orders WHERE order_id=? OR client_order_id=? OR order_hash=? LIMIT 1").get(signed.intent.orderId, signed.intent.clientOrderId, signed.orderHash.toLowerCase()) as OrderRow | undefined;
      if (duplicate) {
        const existing = fromRow(duplicate)!;
        if (existing.orderHash.toLowerCase() === signed.orderHash.toLowerCase()) return existing;
        throw new Error("V46 order identifier has already been used.");
      }
      const order: V46StoredOrder = { ...signed, status: "armed", attempts: 0, nextAttemptAt: 0 };
      storeOrder(db, order);
      return order;
    });
  } finally { db.close(); }
}

export async function cancelV46Order(orderId: string, owner: string) {
  return updateV46Order(orderId, (current) => {
    if (current.intent.owner.toLowerCase() !== owner.toLowerCase()) throw new Error("Only the order owner can cancel this order.");
    if (!["armed", "watching", "failed"].includes(current.status)) throw new Error(`A ${current.status} order cannot be cancelled.`);
    return { ...current, status: "cancelled", cancelledAt: Date.now(), leaseOwner: undefined, leaseExpiresAt: undefined };
  });
}

export async function updateV46Order(orderId: string, updater: (current: V46StoredOrder) => V46StoredOrder) {
  const db = openV47Database();
  try {
    return withV47Transaction(db, () => {
      const current = getById(db, orderId);
      if (!current) throw new Error("V46 order was not found.");
      const updated = updater(current);
      if (updated.intent.orderId !== orderId) throw new Error("V46 order ID cannot be changed.");
      storeOrder(db, updated, current.intent.createdAt * 1_000);
      return updated;
    });
  } finally { db.close(); }
}

export async function leaseV46Order(orderId: string, leaseOwner: string, leaseMs = 30_000) {
  return updateV46Order(orderId, (current) => {
    const now = Date.now();
    if (current.leaseExpiresAt && current.leaseExpiresAt > now && current.leaseOwner !== leaseOwner) throw new Error("V46 order is leased by another keeper.");
    if (!["armed", "watching", "failed"].includes(current.status)) throw new Error(`V46 order is ${current.status}.`);
    return { ...current, status: "filling", leaseOwner, leaseExpiresAt: now + leaseMs, lastCheckedAt: now };
  });
}

export async function releaseV46Lease(orderId: string, patch: Partial<V46StoredOrder>) {
  return updateV46Order(orderId, (current) => ({ ...current, ...patch, leaseOwner: undefined, leaseExpiresAt: undefined }));
}

export async function v46OrderStoreStats() {
  const db = openV47Database();
  try {
    const rows = db.prepare("SELECT status,COUNT(*) AS count FROM indexed_orders GROUP BY status").all() as unknown as Array<{ status: string; count: number | bigint }>;
    const counts = Object.fromEntries(rows.map((row) => [row.status, Number(row.count)]));
    const total = Number((db.prepare("SELECT COUNT(*) AS count FROM indexed_orders").get() as { count: number | bigint }).count);
    const updatedAt = Number((db.prepare("SELECT COALESCE(MAX(updated_at),0) AS updatedAt FROM indexed_orders").get() as { updatedAt: number | bigint }).updatedAt);
    return { path: v47DatabasePath(), revision: total, updatedAt, total, counts, mode: "sqlite-transactional" };
  } finally { db.close(); }
}

export async function migrateV46JsonOrdersToV47(path = resolve(process.env.V46_ORDER_STORE_PATH ?? ".perphood/v46-orders.json")) {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { orders?: V46StoredOrder[] };
    if (!Array.isArray(parsed.orders)) return { imported: 0, skipped: 0, source: path };
    let imported = 0;
    let skipped = 0;
    const db = openV47Database();
    try {
      withV47Transaction(db, () => {
        for (const order of parsed.orders ?? []) {
          const existing = getById(db, order.intent.orderId);
          if (existing) { skipped += 1; continue; }
          storeOrder(db, order);
          imported += 1;
        }
      });
    } finally { db.close(); }
    return { imported, skipped, source: path };
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return { imported: 0, skipped: 0, source: path };
    throw error;
  }
}
