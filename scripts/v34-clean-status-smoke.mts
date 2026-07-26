import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hub = fs.readFileSync(path.join(root, "components/TerminalHub.tsx"), "utf8");
const header = fs.readFileSync(path.join(root, "components/Header.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

const checks: Array<[string, boolean]> = [
  ["command bar renders one concise Hz readout", hub.includes("<b>{effectiveFps} Hz</b>")],
  ["command bar no longer renders FPS/display sublabels", !hub.includes("<span>FPS</span><small>")],
  ["shared header uses the same concise Hz wording", header.includes("{effectiveFps} Hz") && !header.includes("Hz display")],
  ["refresh readout has no border", /\.terminal-fps-chip,[\s\S]*?border:\s*0\s*!important/.test(css)],
  ["refresh readout has no button background", /\.terminal-fps-chip,[\s\S]*?background:\s*transparent\s*!important/.test(css)],
  ["noninteractive chain status is borderless", /\.perphood-command-bar \.terminal-chain-pill[\s\S]*?border:\s*0\s*!important/.test(css)],
  ["bottom status spans are visually plain", /\.terminal-tool-dock span[\s\S]*?border:\s*0\s*!important/.test(css)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
if (failed.length) process.exit(1);
console.log(`V34 clean-status UI smoke passed (${checks.length}/${checks.length}).`);
