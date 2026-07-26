import assert from "node:assert/strict";
import { createV45SessionKeyMaterial, bindV45SessionKey } from "../lib/chain/v45-session-key.ts";
import { signV46Cancellation, signV46Order, verifyV46SignedCancellation, verifyV46SignedOrder, type V46OrderIntent } from "../lib/chain/v46-order.ts";

const owner = "0x1111111111111111111111111111111111111111" as const;
const router = "0x2222222222222222222222222222222222222222" as const;
const market = "0x3333333333333333333333333333333333333333" as const;
const material = await createV45SessionKeyMaterial();
const bound = bindV45SessionKey(material, owner);
const now = Math.floor(Date.now() / 1_000);
const intent: V46OrderIntent = {
  version: 46,
  orderId: "sig-order",
  clientOrderId: "sig-client",
  owner,
  router,
  market,
  sessionId: bound.sessionId,
  kind: "trigger",
  side: "short",
  action: 4,
  comparator: "lte",
  triggerMarketCapEthWad: "1000000000000000000",
  displayTriggerCapUsd: 3_200,
  activationMarketCapEthWad: "0",
  amountWei: "0",
  collateralWei: "10000000000000000",
  leverage: 10,
  maintenanceMarginBps: 200,
  positionId: "0",
  minOutput: "0",
  reduceOnly: false,
  createdAt: now,
  validAfter: now,
  expiresAt: now + 600,
  maxAttempts: 5,
};
const signed = await signV46Order(material, intent);
assert.equal(await verifyV46SignedOrder(signed), true, "valid durable order signature should verify");
assert.equal(await verifyV46SignedOrder({ ...signed, intent: { ...signed.intent, leverage: 20 } }), false, "tampered durable order must fail verification");
const cancellation = await signV46Cancellation(material, { version: 46, orderId: intent.orderId, owner, sessionId: bound.sessionId, createdAt: now, deadline: now + 60 });
assert.equal(await verifyV46SignedCancellation(cancellation), true, "valid cancellation should verify");
assert.equal(await verifyV46SignedCancellation({ ...cancellation, intent: { ...cancellation.intent, orderId: "other" } }), false, "tampered cancellation must fail verification");
console.log("V46 P-256 durable-order signature smoke passed, including tamper detection and signed cancellation.");
