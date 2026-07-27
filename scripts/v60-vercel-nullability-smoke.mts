import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("components/V59MainnetConsole.tsx", "utf8");
const checks: Array<[string, boolean]> = [
  ["global pause is normalized before JSX", source.includes("const globalTradingPaused = data?.factory.globalTradingPaused ?? null")],
  ["new-market pause is normalized before JSX", source.includes("const newMarketsPaused = data?.factory.newMarketsPaused ?? null")],
  ["global pause JSX no longer dereferences nullable data", !source.includes("data.factory.globalTradingPaused ?")],
  ["new-market pause JSX no longer dereferences nullable data", !source.includes("data.factory.newMarketsPaused ?")],
  ["global pause renders from narrowed local state", source.includes('globalTradingPaused === null ? "—" : globalTradingPaused ? "ON" : "OFF"')],
  ["new-market pause renders from narrowed local state", source.includes('newMarketsPaused === null ? "—" : newMarketsPaused ? "ON" : "OFF"')],
];

for (const [label, passed] of checks) {
  assert.ok(passed, label);
  console.log(`PASS — ${label}`);
}

console.log(`\n${checks.length}/${checks.length} V60 Vercel nullability checks passed.`);
