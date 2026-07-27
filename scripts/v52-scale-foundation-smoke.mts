import assert from "node:assert/strict";
import { deterministicShard, V52_SCALE_TIERS, V52_SERVICE_BOUNDARIES, v52AccountShard, v52MarketShard } from "../lib/v52-scale-foundation.ts";

assert.equal(V52_SCALE_TIERS.length, 3);
assert.equal(V52_SCALE_TIERS.at(-1)?.registeredUsers, 1_000_000);
assert.equal(V52_SCALE_TIERS.at(-1)?.peakConnectedClients, 100_000);
assert.ok(V52_SERVICE_BOUNDARIES.some((service) => service.id === "sequencer"));
assert.ok(V52_SERVICE_BOUNDARIES.some((service) => service.id === "event-bus"));
assert.ok(V52_SERVICE_BOUNDARIES.some((service) => service.id === "stream"));
assert.ok(V52_SERVICE_BOUNDARIES.some((service) => service.id === "rpc"));

const marketCounts = new Array(512).fill(0) as number[];
const accountCounts = new Array(256).fill(0) as number[];
for (let index = 0; index < 4096; index += 1) {
  const address = `0x${index.toString(16).padStart(40, "0")}`;
  const market = v52MarketShard(address);
  const account = v52AccountShard(address);
  assert.equal(market, v52MarketShard(address), "Market mapping must be stable.");
  assert.equal(account, v52AccountShard(address), "Account mapping must be stable.");
  marketCounts[market] += 1;
  accountCounts[account] += 1;
}
assert.equal(Math.min(...marketCounts), 8);
assert.equal(Math.max(...marketCounts), 8);
assert.equal(Math.min(...accountCounts), 16);
assert.equal(Math.max(...accountCounts), 16);
assert.throws(() => deterministicShard("", 4));
assert.throws(() => deterministicShard("0x01", 0));
console.log("V52 deterministic scale foundation passed across 4,096 market/account identifiers.");
