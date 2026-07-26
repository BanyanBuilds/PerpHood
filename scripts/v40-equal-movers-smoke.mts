import fs from "node:fs";

const hub = fs.readFileSync("components/TerminalHub.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks: Array<[string, boolean]> = [
  ["all Movers-page columns receive momentum context", hub.includes('moverScore={moverScoreBySlug.get(token.slug)}')],
  ["old first-column-only score behavior removed", !hub.includes('kind === "movers" ? moverScoreBySlug.get(token.slug) : undefined')],
  ["Movers workspace explicitly uses three equal columns", css.includes('.movers-workspace {\n  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;')],
  ["ranked columns cannot force unequal widths", css.includes('.movers-workspace > .mover-rank-column') && css.includes('width: auto !important;')],
  ["all ranked rows use full column width", css.includes('.movers-workspace .mover-ranked-row > .terminal-token-row') && css.includes('width: 100% !important;')],
  ["all ranking cards share one height", css.includes('.movers-workspace .terminal-token-row.has-mover-score') && css.includes('min-height: 158px !important;')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} — ${name}`);
if (failed.length) process.exit(1);
console.log(`V40 equal Movers geometry: ${checks.length}/${checks.length}`);
