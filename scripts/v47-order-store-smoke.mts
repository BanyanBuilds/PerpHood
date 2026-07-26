import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { V46SignedOrder } from "../lib/chain/v46-order.ts";
import { cancelV46Order, createV46Order, leaseV46Order, listV46Orders, releaseV46Lease, v46OrderStoreStats } from "../lib/server/v47-order-store.ts";

const directory = await mkdtemp(join(tmpdir(), "perphood-v47-orders-"));
process.env.V47_DATABASE_PATH = join(directory, "orders.sqlite");
const owner = "0x1111111111111111111111111111111111111111" as const;
const hash = `0x${"44".repeat(32)}` as const;
function signed(id: string): V46SignedOrder {
  return { intent: { version: 46, orderId: id, clientOrderId: `client-${id}`, owner, router: owner, market: owner, sessionId: hash, kind: "limit", side: "buy", action: 1, comparator: "lte", triggerMarketCapEthWad: "100", displayTriggerCapUsd: 100, activationMarketCapEthWad: "0", amountWei: "1000", collateralWei: "0", leverage: 1, maintenanceMarginBps: 0, positionId: "0", minOutput: "0", reduceOnly: false, createdAt: 1, validAfter: 1, expiresAt: 9999999999, maxAttempts: 5 }, orderHash: id === "one" ? hash : `0x${"55".repeat(32)}` as const, signature: "signature", publicJwk: {}, publicKeyHash: hash };
}
try {
  assert.equal((await createV46Order(signed("one"))).status, "armed");
  assert.equal((await createV46Order(signed("one"))).intent.orderId, "one");
  await createV46Order(signed("two"));
  assert.equal((await leaseV46Order("one", "keeper-a", 60_000)).status, "filling");
  await assert.rejects(() => leaseV46Order("one", "keeper-b", 60_000), /leased by another keeper/);
  assert.equal((await releaseV46Lease("one", { status: "filled", filledAt: Date.now() })).status, "filled");
  assert.equal((await cancelV46Order("two", owner)).status, "cancelled");
  assert.equal((await listV46Orders()).length, 2);
  const stats = await v46OrderStoreStats();
  assert.equal(stats.mode, "sqlite-transactional");
  assert.equal(stats.counts.filled, 1);
  assert.equal(stats.counts.cancelled, 1);
  console.log("V47 SQL order-store smoke passed: transactional creation, idempotency, lease exclusion, fill finality, cancellation, and indexed stats.");
} finally { await rm(directory, { recursive: true, force: true }); }
