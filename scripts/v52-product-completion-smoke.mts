import assert from "node:assert/strict";
import { summarizeV52Completion, V52_COMPLETION_ITEMS } from "../lib/v52-product-completion.ts";

const summary = summarizeV52Completion();
const ids = new Set(V52_COMPLETION_ITEMS.map((item) => item.id));

assert.equal(summary.total, V52_COMPLETION_ITEMS.length);
assert.equal(summary.productReadyForPublicFunds, false, "V52 must not claim public-fund readiness.");
assert.ok(summary.productionBlockers >= 8, "The completion audit must preserve real launch blockers.");
assert.ok(summary.completionPercent > 0 && summary.completionPercent < 100);
for (const required of ["markets-movers-presets", "three-left-sidecars", "battlepool-math", "session-authorization", "production-database", "scale-runtime", "security-audit"]) {
  assert.ok(ids.has(required), `Missing V52 completion item: ${required}`);
}
for (const item of V52_COMPLETION_ITEMS) {
  assert.ok(item.summary.length >= 40, `${item.id} needs an honest summary.`);
  assert.ok(item.nextAction.length >= 30, `${item.id} needs a concrete next action.`);
  assert.ok(item.evidence.length > 0, `${item.id} needs evidence.`);
}
assert.equal(V52_COMPLETION_ITEMS.find((item) => item.id === "markets-movers-presets")?.status, "complete");
assert.equal(V52_COMPLETION_ITEMS.find((item) => item.id === "scale-runtime")?.status, "missing");
console.log(`V52 completion inventory passed for ${summary.total} systems with ${summary.productionBlockers} honest blockers.`);
