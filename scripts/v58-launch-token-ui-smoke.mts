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
  ["fast launch header", component.includes("LEVERAGE X LAUNCHPAD") && component.includes("launch in seconds")],
  ["two-step fast creation flow", component.includes("lx-creator-launch-form") && component.includes("lx-initial-buy-modal")],
  ["required launch identity and artwork", component.includes("nameValid") && component.includes("tickerValid") && component.includes("Boolean(artwork)")],
  ["name and ticker are user controlled while description stays optional", component.includes("setName") && component.includes("setTicker") && component.includes("Description <b>Optional</b>")],
  ["no migration selector", !component.includes("Migration target</span><select") && !component.includes("setMigrationTargetMarketCapUsd")],
  ["real drag and drop upload", component.includes("onDrop={handleDrop}") && component.includes("event.dataTransfer.files")],
  ["animated GIF support retained", component.includes('image/gif') && component.includes("Animated GIF")],
  ["launch button activates only when required fields are ready", component.includes('lx-creator-launch-button ${formReady ? "ready" : ""}') && component.includes("disabled={!formReady || busy}")],
  ["inclusive creator budget remains clear", component.includes("This amount includes network gas") && component.includes("Minimum total spend is 0.001 ETH")],
  ["mainnet factory truth remains visible", component.includes("Mainnet factory is not deployed yet") && component.includes("factoryReady")],
  ["final one-wallet signing review", component.includes("Your wallet signs the real Robinhood Chain transaction locally") && component.includes("Confirm & launch")],
  ["launch panel stays non-modal", css.includes("one-image fast launcher + non-compressing sidecar behavior")],
  ["right launch dock overlays instead of squeezing", css.includes('.terminal-dock-stack.right[data-launch-open="true"]') && css.includes("position: absolute")],
  ["market workspace keeps full-width track", css.includes("has-launch-right-dock:not(.has-left-docks)") && css.includes("grid-template-columns: minmax(0, 1fr) !important")],
  ["floating launcher remains usable", css.includes('.terminal-sidecar.floating[data-panel="launch"]') && sidecar.includes('id === "launch" ? 720 : 390')],
  ["clean transparent vector mark", svg.includes("linearGradient") && !svg.includes("<rect") && !svg.includes("filter")],
  ["favicon and app icon assets retained", ["public/favicon.ico", "public/favicon-16.png", "public/favicon-32.png", "public/apple-touch-icon.png", "public/icon-192.png", "public/icon-512.png"].every((path) => existsSync(path) && statSync(path).size > 100)],
];

let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (ok) passed += 1;
}
console.log(`\nLeverage X fast Launch Token UI: ${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exit(1);
