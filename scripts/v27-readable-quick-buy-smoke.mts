import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const hub = readFileSync(resolve(root, "components/TerminalHub.tsx"), "utf8");
const row = readFileSync(resolve(root, "components/TerminalTokenRow.tsx"), "utf8");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");

const required = [
  [hub, "function QuickAmountEditor", "editable quick-buy component"],
  [hub, "aria-label={`${label} quick-buy ETH amount`}", "accessible per-column input"],
  [hub, "quickBuyEth={categorySettings[kind].quickBuyEth}", "column amount passed to each row"],
  [hub, "openTrade(market, side, kind)", "source column bound to quick buy"],
  [row, "Quick buy ${quickBuyEth} ETH", "row quick-buy amount label"],
  [css, ".column-quick-editor", "quick-buy input styling"],
  [css, "--v27-text-xs: 11px", "readable minimum type token"],
  [css, ".terminal-row-identity strong { font-size: 16px", "readable token ticker"],
];

for (const [source, needle, label] of required) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

const explicitSizes = [...css.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)].map((match) => Number(match[1]));
const shorthandSizes = [...css.matchAll(/font:[^;{}]*?([0-9]+(?:\.[0-9]+)?)px\//g)].map((match) => Number(match[1]));
const undersized = [...explicitSizes, ...shorthandSizes].filter((size) => size < 11);
if (undersized.length) throw new Error(`Found ${undersized.length} font declarations below 11px: ${undersized.slice(0, 12).join(", ")}`);

console.log("V27 readable typography + independent category quick-buy smoke passed.");
