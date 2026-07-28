import assert from "node:assert/strict";
import { enforceV83Risk, validateV83Order, V83OrderError, V83OrderEventBus } from "../lib/v83-order-pipeline.ts";

const request = {
  requestId: "order-v83-1",
  wallet: "0x1111111111111111111111111111111111111111",
  market: "0x2222222222222222222222222222222222222222",
  action: "long" as const,
  collateralEth: 0.1,
  leverage: 10,
  slippageBps: 100,
  deadlineSeconds: 120,
};
validateV83Order(request);
const quote = {
  requestId: request.requestId,
  markPriceWad: 1_000_000_000_000_000_000n,
  notionalEth: 1,
  feeEth: 0.001,
  priceImpactBps: 25,
  liquidationPriceWad: 920_000_000_000_000_000n,
  expiresAt: Date.now() + 30_000,
};
enforceV83Risk(request, quote, {
  marketEnabled: true,
  oracleFresh: true,
  creatorBlocked: false,
  insuranceHealthy: true,
  availableLiquidityEth: 20,
  maxLeverage: 20,
});
assert.throws(() => enforceV83Risk(request, quote, {
  marketEnabled: true,
  oracleFresh: true,
  creatorBlocked: true,
  insuranceHealthy: true,
  availableLiquidityEth: 20,
  maxLeverage: 20,
}), (error) => error instanceof V83OrderError && error.code === "CREATOR_BLOCKED");
const bus = new V83OrderEventBus();
let phases = 0;
const unsubscribe = bus.subscribe(() => phases++);
bus.emit({ requestId: request.requestId, phase: "validating", at: Date.now(), message: "Validating" });
unsubscribe();
bus.emit({ requestId: request.requestId, phase: "quoting", at: Date.now(), message: "Quoting" });
assert.equal(phases, 1);
console.log("V83 production order pipeline static smoke passed.");
