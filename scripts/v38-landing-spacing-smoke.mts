import { readFileSync } from "node:fs";

const page = readFileSync("app/page.tsx", "utf8");
const demo = readFileSync("lib/demo-market.ts", "utf8");
const data = readFileSync("lib/data.ts", "utf8");
const css = readFileSync("app/globals.css", "utf8");

const checks: Array<[string, boolean]> = [
  ["root restores Markets/Movers terminal", page.includes("<TerminalHub />") && page.includes("<Suspense") && !page.includes("redirect(") && !page.includes("<Header")],
  ["single demo token remains", data.includes("TOKENS: Token[] = [DEMO_TOKEN]")],
  ["demo token appears in New Pairs", demo.includes("launchedMinutesAgo: 2") && demo.includes("marketAgeSeconds: 2 * 60")],
  ["wide outer terminal gutters", css.includes("--perphood-terminal-edge-gutter") && css.includes("padding: 11px var(--perphood-terminal-edge-gutter) 10px")],
  ["clear spacing between all three categories", css.includes("--perphood-terminal-column-gap") && css.includes("gap: var(--perphood-terminal-column-gap) !important")],
  ["responsive gutters remain usable", css.includes("@media (max-width: 1500px)") && css.includes("@media (max-width: 820px)")],
  ["no-scroll terminal model preserved", css.includes("html:has(.terminal-hub-page)") && css.includes("overflow: hidden")],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`V38 landing/spacing smoke failed: ${label}`);
  console.log(`PASS  ${label}`);
}
console.log(`V38 restored landing + spacious terminal smoke passed (${checks.length}/${checks.length}).`);
