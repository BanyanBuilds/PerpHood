import assert from "node:assert/strict";
import {
  bindV45SessionKey,
  canonicalV45TradingIntent,
  createV45SessionKeyMaterial,
  signV45TradingIntent,
  verifyV45SignedTradingIntent,
  v45ActionBitmap,
  V45_ALL_TRADING_ACTION_BITMAP,
} from "../lib/chain/v45-session-key.ts";

const owner = "0x1111111111111111111111111111111111111111";
const router = "0x2222222222222222222222222222222222222222";
const market = "0x3333333333333333333333333333333333333333";
const material = await createV45SessionKeyMaterial();
const bound = bindV45SessionKey(material, owner);
const intent = {
  version: 45 as const, sessionId: bound.sessionId, owner: owner as `0x${string}`, router: router as `0x${string}`, market: market as `0x${string}`,
  nonce: 0, action: 3, amountWei: "0", collateralWei: "100000000000000000", tokenAmountWad: "0",
  leverage: 5, maintenanceMarginBps: 200, positionId: "0", minOutput: "0", deadline: Math.floor(Date.now() / 1000) + 30,
  clientOrderId: crypto.randomUUID(),
};
const signed = await signV45TradingIntent(material, intent);
assert.equal(await verifyV45SignedTradingIntent(signed), true);
assert.ok(canonicalV45TradingIntent(intent).includes('"action":3'));
const tampered = { ...signed, intent: { ...signed.intent, leverage: 20 } };
assert.equal(await verifyV45SignedTradingIntent(tampered), false);
assert.equal(v45ActionBitmap([1, 6]), (1n << 1n) | (1n << 6n));
assert.equal(V45_ALL_TRADING_ACTION_BITMAP, 126n);
assert.throws(() => v45ActionBitmap([0]), /Invalid/);
console.log("V45 P-256 canonical intent/signature smoke: PASS");
