import { readFileSync } from "node:fs";

const launch = readFileSync("components/LaunchPanel.tsx", "utf8");
const hub = readFileSync("components/TerminalHub.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const chain = readFileSync("lib/chain/robinhood-v54.ts", "utf8");
const contract = readFileSync("contracts/src/LeverageXLaunchFactoryV60.sol", "utf8");
const contractTest = readFileSync("contracts/test/LeverageXLaunchFactoryV60.t.sol", "utf8");

const checks: Array<[string, boolean]> = [
  ["wallet must be connected before launcher opens", hub.includes("requestLaunchAccess") && hub.includes("Connect your wallet to open Launch Token") && hub.includes("openLaunchAfterWallet")],
  ["launcher auto-opens after wallet connection", hub.includes('openPanelWithCapacity("launch")') && hub.includes("connected || !openLaunchAfterWallet")],
  ["minimum is wallet plus artwork", launch.includes("const minimumReady = connected") && launch.includes("Boolean(artwork)")],
  ["no required name input", !launch.includes('placeholder="Coin name"') && !launch.includes('setName(event.target.value)')],
  ["no required ticker input", !launch.includes('setTicker(event.target.value)') && !launch.includes('placeholder="SYMBOL"')],
  ["no required description input", !launch.includes('setDescription(event.target.value)') && !launch.includes("Write a short description")],
  ["protocol target shown read-only", launch.includes("LAUNCHPAD_TARGET_MARKET_CAP_USD") && launch.includes("Fixed by Leverage X")],
  ["client always encodes fixed migration target", chain.includes("LEVERAGEX_PROTOCOL_MIGRATION_TARGET_MARKET_CAP_USD") && chain.includes("const targetUsdWad = BigInt(LEVERAGEX_PROTOCOL_MIGRATION_TARGET_MARKET_CAP_USD)")],
  ["factory rejects custom migration targets", contract.includes("error InvalidMigrationTarget") && contract.includes("migrationTargetUsdWad != DEFAULT_MIGRATION_TARGET_USD_WAD")],
  ["factory always uses protocol target", contract.includes("uint256 target = DEFAULT_MIGRATION_TARGET_USD_WAD")],
  ["contract test rejects custom migration target", contractTest.includes("testRejectsCustomMigrationTarget") && contractTest.includes("InvalidMigrationTarget.selector")],
  ["contract test resolves compatibility zero to fixed target", contractTest.includes("testZeroMigrationTargetResolvesToProtocolDefault") && contractTest.includes("DEFAULT_MIGRATION_TARGET_USD_WAD")],
  ["right launch sidecar does not enter workspace grid", css.includes('.terminal-dock-stack.right[data-launch-open="true"]') && css.includes("position: absolute")],
  ["launch dock width is compact", css.includes("width: min(440px")],
  ["continue has neon ready state", css.includes(".lx-fast-continue.ready") && css.includes("background: #65f18a")],
];

let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
  if (ok) passed += 1;
}
console.log(`\nLeverage X V60 fast launcher: ${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exit(1);
