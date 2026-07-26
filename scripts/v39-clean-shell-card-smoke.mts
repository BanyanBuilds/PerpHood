import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const hub = readFileSync(resolve(root, "components/TerminalHub.tsx"), "utf8");
const row = readFileSync(resolve(root, "components/TerminalTokenRow.tsx"), "utf8");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");

const checks: Array<[string, boolean]> = [
  ["three-zone command shell", hub.includes("perphood-command-left") && hub.includes("perphood-command-center") && hub.includes("perphood-command-right")],
  ["passive chain pill removed from command bar", !hub.includes('<div className="terminal-chain-pill"')],
  ["passive portfolio header stats removed", !hub.includes('<div className="terminal-toolbar-stats"')],
  ["compact account balance", hub.includes("perphood-account-balance")],
  ["entire market row is keyboard navigable", row.includes('role="link"') && row.includes("openMarketFromKeyboard")],
  ["interactive row controls are excluded", row.includes("[data-row-action]") && row.includes("data-row-action")],
  ["collision-proof two-column card", css.includes("V39 — full-row navigation") && css.includes("grid-template-columns: minmax(0, 1fr) auto")],
  ["quiet V39 shell", css.includes("PERPHOOD V39 — quiet Padre-style shell")],
  ["market deck lowered", css.includes("padding: 18px var(--perphood-terminal-edge-gutter) 12px")],
  ["wider category separation", css.includes("--perphood-terminal-column-gap: clamp(16px, .95vw, 24px)")],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`V39 UI check failed: ${label}`);
  console.log(`PASS ${label}`);
}
console.log(`V39 clean-shell/card checks passed: ${checks.length}/${checks.length}`);
