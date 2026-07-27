import { existsSync, readFileSync, statSync } from "node:fs";

const component = readFileSync("components/LaunchPanel.tsx", "utf8");
const hub = readFileSync("components/TerminalHub.tsx", "utf8");
const sidecar = readFileSync("components/TerminalSidecar.tsx", "utf8");
const hero = readFileSync("components/Hero.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const svg = readFileSync("public/leveragex-mark.svg", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const checks: Array<[string, boolean]> = [
  ["V58+ package version", Number(pkg.version.split(".")[0]) >= 58],
  ["launcher renamed Launch Token", hub.includes('"Launch Token"') && hero.includes("Launch Token")],
  ["BattlePool launch button removed", !hub.includes("Launch BattlePool") && !hero.includes("Launch BattlePool")],
  ["old oversized mint headline removed", !component.includes("Mint a real one-billion-supply memecoin")],
  ["professional compact launch header", component.includes('className="lx-launch-head"') && component.includes("Coin details and artwork become permanent")],
  ["three-step creation flow", component.includes("Coin details") && component.includes("Launch setup") && component.includes("Review")],
  ["clean coin details hierarchy", component.includes('lx-launch-details') && component.includes("Choose carefully—these cannot be changed")],
  ["optional social links are collapsible", component.includes("socialOpen") && component.includes("Add social links")],
  ["large media dropzone", component.includes('className={`lx-launch-dropzone') && component.includes("Select an image or GIF")],
  ["animated GIF support retained", component.includes('image/gif') && component.includes("GIFs remain animated")],
  ["live token preview", component.includes('className="lx-launch-preview"') && component.includes("LIVE PREVIEW")],
  ["inclusive creator budget remains clear", component.includes("0.001 ETH means 0.001 ETH total")],
  ["mainnet factory truth remains visible", component.includes("The mainnet factory must be deployed") && component.includes("factoryReady")],
  ["final immutable signing review", component.includes("Signing review") && component.includes("Only verified receipts enter the registry")],
  ["launch panel stays non-modal", css.includes("premium non-modal Launch Token workspace")],
  ["right dock expands without hiding full terminal", css.includes("has-launch-right-dock") && css.includes("minmax(570px, 640px)")],
  ["floating launcher gets professional width", css.includes('.terminal-sidecar.floating[data-panel="launch"]') && sidecar.includes('id === "launch" ? 720 : 390')],
  ["responsive single-column launcher", css.includes(".lx-launch-create-grid") && css.includes("grid-template-columns: 1fr")],
  ["clean transparent vector mark", svg.includes("linearGradient") && !svg.includes("<rect") && !svg.includes("filter")],
  ["favicon and app icon assets regenerated", ["public/favicon.ico", "public/favicon-16.png", "public/favicon-32.png", "public/apple-touch-icon.png", "public/icon-192.png", "public/icon-512.png"].every((path) => existsSync(path) && statSync(path).size > 100)],
  ["boxed logo glow removed", css.includes("V58 logo optical sizing") && css.includes("filter: none !important")],
];

let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (ok) passed += 1;
}
console.log(`\nLeverage X V58 Launch Token UI: ${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exit(1);
