import { readFileSync } from "node:fs";

const terminal = readFileSync("components/TerminalHub.tsx", "utf8");
const presets = readFileSync("components/TerminalCategorySettings.tsx", "utf8");
const broadcast = readFileSync("components/BroadcastMode.tsx", "utf8");
const styles = readFileSync("app/globals.css", "utf8");

const checks: Array<[string, boolean]> = [
  ["Broadcast top-nav trigger", terminal.includes("lx-broadcast-trigger") && terminal.includes("BroadcastMode")],
  ["Named trading presets", presets.includes('name: "Standard"') && presets.includes('name: "Fast"') && presets.includes('name: "Assault"')],
  ["Viewer-first live PNL", broadcast.includes("LIVE PNL") && broadcast.includes("lx-broadcast-positions")],
  ["Broadcast privacy control", broadcast.includes("Privacy") && broadcast.includes("Hidden")],
  ["Unified profile styling", styles.includes("Profile drawer now shares the same quiet GMGN/Padre surface language")],
];

for (const [name, passed] of checks) {
  if (!passed) throw new Error(`V82 smoke failed: ${name}`);
  console.log(`PASS: ${name}`);
}
console.log("V82 terminal design static smoke passed.");
