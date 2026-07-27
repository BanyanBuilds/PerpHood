import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { V46StoredOrder } from "../chain/v46-order.ts";
import { openV47Database, withV47Transaction } from "./v47-database.ts";

type OrderRow = { order_id: string };

function migrationSourcePath() {
  const configured = process.env.V46_ORDER_STORE_PATH?.trim();
  if (!configured) return join(process.cwd(), ".perphood", "v46-orders.json");
  if (isAbsolute(configured)) return configured;
  return join(process.cwd(), configured);
}

function storeMigratedOrder(db: ReturnType<typeof openV47Database>, order: V46StoredOrder) {
  const now = Date.now();
  const createdAt = order.intent.createdAt * 1_000;
  db.prepare(`INSERT INTO indexed_orders(order_id,client_order_id,owner_address,market_address,session_id,status,order_hash,payload_json,created_at,updated_at,lease_owner,lease_expires_at,transaction_hash,block_number)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(order.intent.orderId, order.intent.clientOrderId, order.intent.owner.toLowerCase(), order.intent.market.toLowerCase(), order.intent.sessionId.toLowerCase(), order.status, order.orderHash.toLowerCase(), JSON.stringify(order), createdAt, now, order.leaseOwner ?? null, order.leaseExpiresAt ?? null, order.transactionHash ?? null, order.blockNumber ?? null);
}

export async function migrateV46JsonOrdersToV47(path = migrationSourcePath()) {
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
          const existing = db.prepare("SELECT order_id FROM indexed_orders WHERE order_id=?").get(order.intent.orderId) as OrderRow | undefined;
          if (existing) { skipped += 1; continue; }
          storeMigratedOrder(db, order);
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
