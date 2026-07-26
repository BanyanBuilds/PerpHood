import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");
const row = fs.readFileSync(path.join(root, "components/TerminalTokenRow.tsx"), "utf8");
const hub = fs.readFileSync(path.join(root, "components/TerminalHub.tsx"), "utf8");

const checks: Array<[string, boolean]> = [
  ["46px terminal-only header", css.includes("--header-height: 46px")],
  ["82px default market-row rhythm", css.includes("min-height: 82px !important")],
  ["44px rounded-square token art", css.includes("width: 44px !important") && css.includes("border-radius: 7px !important")],
  ["Padre-density row split", row.includes("terminal-row-utility-actions") && row.includes("terminal-row-trade-actions")],
  ["Buy/Long/Short preserved", row.includes('onTrade(token, "buy")') && row.includes('onTrade(token, "long")') && row.includes('onTrade(token, "short")')],
  ["OG lineage preserved", row.includes("<OgBadge token={token} compact />")],
  ["dual ticker search preserved", hub.includes("TerminalSearchOverlay") && hub.includes("OG lineage + market-cap leaders")],
  ["360 FPS controls preserved", hub.includes("240, 360")],
  ["single terminal route retained", hub.includes("terminal-hub-page")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
if (failed.length) process.exit(1);
console.log(`V26 density smoke passed (${checks.length}/${checks.length}).`);
