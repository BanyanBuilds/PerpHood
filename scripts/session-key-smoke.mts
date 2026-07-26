import assert from "node:assert/strict";
import {
  ALL_TRADING_ACTION_BITMAP,
  bindSessionKey,
  canonicalTradingIntent,
  createSessionKeyMaterial,
  signTradingIntent,
  verifySignedTradingIntent,
} from "../lib/chain/session-key.ts";

const owner = "0x00000000000000000000000000000000000a11ce" as const;
const marketId = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const material = await createSessionKeyMaterial();
const bound = bindSessionKey(material, owner);
assert.match(bound.sessionId, /^0x[0-9a-f]{64}$/);
assert.match(bound.publicKeyHash, /^0x[0-9a-f]{64}$/);
assert.equal((ALL_TRADING_ACTION_BITMAP & (1n << 1n)) !== 0n, true);
assert.equal((ALL_TRADING_ACTION_BITMAP & (1n << 6n)) !== 0n, true);
assert.equal((ALL_TRADING_ACTION_BITMAP & (1n << 7n)) !== 0n, false);

const intent = {
  version: 23 as const,
  sessionId: bound.sessionId,
  owner,
  marketId,
  nonce: 0,
  action: 1,
  notionalWad: "1000000000000000",
  collateralWad: "1000000000000000", tokenAmountWad: "0", leverageBps: 10_000, positionId: "", reduceFractionBps: 10_000,
  limitPriceWad: "0",
  maxSlippageBps: 2000,
  deadline: Math.floor(Date.now() / 1000) + 30,
  clientOrderId: "session-smoke-1",
};
const signed = await signTradingIntent(material, intent);
assert.equal(await verifySignedTradingIntent(signed), true);
assert.equal(canonicalTradingIntent(intent), canonicalTradingIntent({ ...intent }));
assert.equal(await verifySignedTradingIntent({ ...signed, intent: { ...intent, nonce: 1 } }), false);
assert.equal(await verifySignedTradingIntent({ ...signed, signature: `${signed.signature.slice(0, -2)}aa` }), false);
console.log("V23 P-256 session-key signing and tamper rejection passed.");
