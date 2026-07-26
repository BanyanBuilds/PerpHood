import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { V46SignedOrder, V46StoredOrder } from "../chain/v46-order.ts";

export const V46_ORDER_STORE_VERSION = 1;

type StoreDocument = {
  version: 1;
  revision: number;
  updatedAt: number;
  orders: V46StoredOrder[];
};

type OrderFilter = {
  owner?: string;
  market?: string;
  statuses?: V46StoredOrder["status"][];
};

const runtime = globalThis as typeof globalThis & { __perphoodV46StoreQueue?: Promise<unknown> };
runtime.__perphoodV46StoreQueue ??= Promise.resolve();

export function v46OrderStorePath() {
  return resolve(process.env.V46_ORDER_STORE_PATH ?? ".perphood/v46-orders.json");
}

function emptyDocument(): StoreDocument {
  return { version: 1, revision: 0, updatedAt: Date.now(), orders: [] };
}

async function readDocument(path = v46OrderStorePath()): Promise<StoreDocument> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as StoreDocument;
    if (parsed.version !== V46_ORDER_STORE_VERSION || !Array.isArray(parsed.orders)) throw new Error("Unsupported V46 order-store format.");
    return parsed;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return emptyDocument();
    throw error;
  }
}

async function writeDocument(document: StoreDocument, path = v46OrderStorePath()) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const previous = runtime.__perphoodV46StoreQueue ?? Promise.resolve();
  let release!: () => void;
  runtime.__perphoodV46StoreQueue = new Promise<void>((resolveQueue) => { release = resolveQueue; });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function matches(order: V46StoredOrder, filter: OrderFilter) {
  if (filter.owner && order.intent.owner.toLowerCase() !== filter.owner.toLowerCase()) return false;
  if (filter.market && order.intent.market.toLowerCase() !== filter.market.toLowerCase()) return false;
  if (filter.statuses && !filter.statuses.includes(order.status)) return false;
  return true;
}

export async function listV46Orders(filter: OrderFilter = {}) {
  const document = await readDocument();
  return document.orders.filter((order) => matches(order, filter)).sort((a, b) => b.intent.createdAt - a.intent.createdAt);
}

export async function getV46Order(orderId: string) {
  const document = await readDocument();
  return document.orders.find((order) => order.intent.orderId === orderId) ?? null;
}

export async function createV46Order(signed: V46SignedOrder) {
  return exclusive(async () => {
    const document = await readDocument();
    const duplicate = document.orders.find((order) => order.intent.orderId === signed.intent.orderId || order.intent.clientOrderId === signed.intent.clientOrderId || order.orderHash.toLowerCase() === signed.orderHash.toLowerCase());
    if (duplicate) {
      if (duplicate.orderHash.toLowerCase() === signed.orderHash.toLowerCase()) return duplicate;
      throw new Error("V46 order identifier has already been used.");
    }
    const order: V46StoredOrder = {
      ...signed,
      status: "armed",
      attempts: 0,
      nextAttemptAt: 0,
    };
    document.orders.unshift(order);
    document.orders = document.orders.slice(0, 20_000);
    document.revision += 1;
    document.updatedAt = Date.now();
    await writeDocument(document);
    return order;
  });
}

export async function cancelV46Order(orderId: string, owner: string) {
  return exclusive(async () => {
    const document = await readDocument();
    const index = document.orders.findIndex((order) => order.intent.orderId === orderId);
    if (index < 0) throw new Error("V46 order was not found.");
    const current = document.orders[index];
    if (current.intent.owner.toLowerCase() !== owner.toLowerCase()) throw new Error("Only the order owner can cancel this order.");
    if (!["armed", "watching", "failed"].includes(current.status)) throw new Error(`A ${current.status} order cannot be cancelled.`);
    const updated: V46StoredOrder = { ...current, status: "cancelled", cancelledAt: Date.now(), leaseOwner: undefined, leaseExpiresAt: undefined };
    document.orders[index] = updated;
    document.revision += 1;
    document.updatedAt = Date.now();
    await writeDocument(document);
    return updated;
  });
}

export async function updateV46Order(orderId: string, updater: (current: V46StoredOrder) => V46StoredOrder) {
  return exclusive(async () => {
    const document = await readDocument();
    const index = document.orders.findIndex((order) => order.intent.orderId === orderId);
    if (index < 0) throw new Error("V46 order was not found.");
    const updated = updater(document.orders[index]);
    if (updated.intent.orderId !== orderId) throw new Error("V46 order ID cannot be changed.");
    document.orders[index] = updated;
    document.revision += 1;
    document.updatedAt = Date.now();
    await writeDocument(document);
    return updated;
  });
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
  const document = await readDocument();
  const counts = document.orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {});
  return { path: v46OrderStorePath(), revision: document.revision, updatedAt: document.updatedAt, total: document.orders.length, counts };
}
