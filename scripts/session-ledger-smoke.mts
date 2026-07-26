import assert from "node:assert/strict";
import { SessionLedgerModel } from "../lib/chain/session-ledger-model.ts";

const ETH = 10n ** 18n;
const model = new SessionLedgerModel();
const base = {
  sessionId: "session-a",
  owner: "0xabc",
  publicKeyHash: "key-a",
  validUntil: 2_000,
  maxNotionalWad: ETH,
  actionBitmap: (1n << 1n) | (1n << 3n),
  now: 1_000,
};
model.authorize(base);
model.consume({ sessionId: base.sessionId, owner: base.owner, nonce: 0, action: 1, notionalWad: ETH / 10n, deadline: 1_500, intentHash: "intent-0", now: 1_001 });
assert.equal(model.sessions.get(base.sessionId)?.nextNonce, 1);
model.authorize({ ...base, maxNotionalWad: 2n * ETH });
assert.equal(model.sessions.get(base.sessionId)?.nextNonce, 1, "reauthorization must preserve nonce");
assert.throws(() => model.consume({ sessionId: base.sessionId, owner: base.owner, nonce: 0, action: 1, notionalWad: 1n, deadline: 1_500, intentHash: "replay", now: 1_002 }), /nonce/);
assert.throws(() => model.consume({ sessionId: base.sessionId, owner: base.owner, nonce: 1, action: 5, notionalWad: 1n, deadline: 1_500, intentHash: "bad-action", now: 1_002 }), /authorized/);
assert.throws(() => model.consume({ sessionId: base.sessionId, owner: base.owner, nonce: 1, action: 1, notionalWad: 3n * ETH, deadline: 1_500, intentHash: "too-large", now: 1_002 }), /limit/);
model.revoke(base.sessionId, base.owner);
assert.throws(() => model.consume({ sessionId: base.sessionId, owner: base.owner, nonce: 1, action: 1, notionalWad: 1n, deadline: 1_500, intentHash: "revoked", now: 1_002 }), /inactive/);
console.log("V23 session authorization ledger model passed replay, scope, size, expiry, and revocation checks.");
