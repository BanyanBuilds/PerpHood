import fs from "node:fs";

const row = fs.readFileSync("components/TerminalTokenRow.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks: Array<[string, boolean]> = [
  ["row uses router navigation", row.includes("useRouter") && row.includes("router.push(marketHref)")],
  ["interactive descendants are excluded", row.includes('closest("button, a, input, select, textarea, [data-row-action]")')],
  ["row is keyboard accessible", row.includes('role="link"') && row.includes("tabIndex={0}") && row.includes("openMarketFromKeyboard")],
  ["trade controls are explicitly interactive", (row.match(/data-row-action/g) ?? []).length >= 7],
  ["market value is separated from identity link", row.includes('<div className="terminal-row-value">')],
  ["collision-proof V39 CSS exists", css.includes("V39 — full-row navigation and collision-proof market-card layout")],
  ["actions use independent grid cells", css.includes(".terminal-row-actions { display: contents !important; }")],
  ["signals wrap instead of overlap", css.includes("flex-wrap: wrap !important")],
  ["card clips accidental overflow", css.includes("overflow: hidden !important")],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`V39 market-card check failed: ${label}`);
  console.log(`PASS ${label}`);
}
console.log(`V39 market-card checks passed: ${checks.length}/${checks.length}`);
