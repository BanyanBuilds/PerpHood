import assert from "node:assert/strict";
import { evaluateV46Order, retryDelayMs, usdMarketCapToEthWad, type V46StoredOrder } from "../lib/chain/v46-order.ts";

const address = "0x1111111111111111111111111111111111111111" as const;
const hash = `0x${"22".repeat(32)}` as const;
const now = 2_000_000_000;

function order(patch: Partial<V46StoredOrder["intent"]> = {}, status: V46StoredOrder["status"] = "armed"): V46StoredOrder {
  return {
    intent: {
      version: 46,
      orderId: "order-1",
      clientOrderId: "client-1",
      owner: address,
      router: address,
      market: address,
      sessionId: hash,
      kind: "limit",
      side: "long",
      action: 3,
      comparator: "lte",
      triggerMarketCapEthWad: "100",
      displayTriggerCapUsd: 320_000,
      activationMarketCapEthWad: "0",
      amountWei: "0",
      collateralWei: "10000000000000000",
      leverage: 5,
      maintenanceMarginBps: 200,
      positionId: "0",
      minOutput: "0",
      reduceOnly: false,
      createdAt: now - 100,
      validAfter: now - 100,
      expiresAt: now + 100,
      maxAttempts: 5,
      ...patch,
    },
    orderHash: hash,
    signature: "sig",
    publicJwk: {},
    publicKeyHash: hash,
    status,
    attempts: 0,
    nextAttemptAt: 0,
  };
}

assert.equal(evaluateV46Order(order(), 99n, now).due, true, "long limit should fill below trigger");
assert.equal(evaluateV46Order(order(), 101n, now).due, false, "long limit should wait above trigger");
assert.equal(evaluateV46Order(order({ kind: "trigger", comparator: "gte" }), 101n, now).due, true, "long breakout trigger should fill above trigger");
assert.equal(evaluateV46Order(order({ side: "short", action: 4, comparator: "gte" }), 101n, now).due, true, "short limit should fill above trigger");
assert.equal(evaluateV46Order(order({ side: "short", action: 4, kind: "trigger", comparator: "lte" }), 99n, now).due, true, "short breakdown trigger should fill below trigger");

const breakeven = order({
  kind: "breakeven",
  side: "long",
  action: 5,
  comparator: "lte",
  triggerMarketCapEthWad: "100",
  activationMarketCapEthWad: "120",
  positionId: "7",
  reduceOnly: true,
  collateralWei: "0",
  leverage: 1,
});
assert.deepEqual(evaluateV46Order(breakeven, 119n, now), { due: false, activate: false, expire: false, reason: "Waiting for breakeven activation." });
assert.equal(evaluateV46Order(breakeven, 120n, now).activate, true, "breakeven should activate after favorable move");
assert.equal(evaluateV46Order({ ...breakeven, status: "watching", activatedAt: Date.now() }, 100n, now).due, true, "activated breakeven should close on entry retrace");
assert.equal(evaluateV46Order(order({ expiresAt: now }), 100n, now).expire, true, "expired order should not execute");
assert.equal(retryDelayMs(1), 1_000);
assert.equal(retryDelayMs(10), 60_000);
assert.equal(usdMarketCapToEthWad(3_200), 1_000_000_000_000_000_000n);

console.log("V46 order-engine smoke passed: comparator semantics, breakeven state machine, expiry, retry backoff, and USD/ETH cap conversion.");
