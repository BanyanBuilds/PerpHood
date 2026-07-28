import { readFileSync } from "node:fs";

const launch = readFileSync("components/LaunchPanel.tsx", "utf8");
const how = readFileSync("components/HowItWorksModal.tsx", "utf8");
const hub = readFileSync("components/TerminalHub.tsx", "utf8");
const header = readFileSync("components/Header.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const chain = readFileSync("lib/chain/robinhood-v54.ts", "utf8");
const server = readFileSync("lib/server/v54-launch-server.ts", "utf8");
const contract = readFileSync("contracts/src/LeverageXLaunchFactoryV60.sol", "utf8");
const contractTest = readFileSync("contracts/test/LeverageXLaunchFactoryV60.t.sol", "utf8");

const checks: Array<[string, boolean]> = [
  ["wallet is required before launcher opens", hub.includes("requestLaunchAccess") && hub.includes("Connect your wallet to open Launch Token")],
  ["token name is user controlled and required", launch.includes('placeholder="Name your coin"') && launch.includes("nameValid") && launch.includes("Token name")],
  ["ticker is user controlled and required", launch.includes('placeholder="TICKER"') && launch.includes("tickerValid") && launch.includes("normalizeTicker")],
  ["artwork has a normal empty drop state", launch.includes("Drop photo or GIF here") && launch.includes("or click to choose · required")],
  ["no fake emoji picker exists in launcher", !launch.includes("emoji-picker") && !launch.includes("lx-launch-emoji-row") && !launch.includes("AUTO-GENERATED IDENTITY")],
  ["description is optional", launch.includes("Description") && launch.includes("Optional") && server.includes("Description must be 1,000 characters or fewer")],
  ["social links are optional", launch.includes("Add social links") && launch.includes("Website") && launch.includes("X / Twitter") && launch.includes("Telegram")],
  ["migration target is not user selectable", !launch.includes("setMigration") && !launch.includes("Migration market cap") && !launch.includes("migration target input") && launch.includes("Protocol fixed")],
  ["launch click opens a small initial-buy popup", launch.includes("buyPopupOpen") && launch.includes("Choose your initial buy") && launch.includes("Confirm & launch")],
  ["initial buy presets exist", launch.includes('const BUY_PRESETS = ["0.001", "0.005", "0.01"]')],
  ["minimum launch spend remains 0.001 inclusive of gas", launch.includes("Minimum total spend is 0.001 ETH") && chain.includes("V54_MIN_TOTAL_LAUNCH_BUDGET_WEI")],
  ["client quote accepts creator-selected total spend", chain.includes("requestedTotalBudgetEth") && chain.includes("requestedTotalBudgetWei")],
  ["factory accepts creator-selected buy inside configured cap", contract.includes("msg.value > defaultMaxBuyWei") && contractTest.includes("testCreatorChoosesInitialBuyWithinCanaryCap")],
  ["factory rejects creator buy above cap", contractTest.includes("testRejectsCreatorBuyAboveConfiguredCap")],
  ["protocol migration target remains fixed on chain", contract.includes("InvalidMigrationTarget") && contract.includes("DEFAULT_MIGRATION_TARGET_USD_WAD")],
  ["launch sidecar floats without compressing markets", css.includes('.terminal-dock-stack.right[data-launch-open="true"]') && css.includes("position: absolute")],
  ["launch button has neon ready state", css.includes(".lx-creator-launch-button.ready") && css.includes("background: #65f18a")],
  ["How It Works is reachable from terminal and site header", hub.includes("HowItWorksModal") && header.includes("HowItWorksModal") && hub.includes("How it works")],
  ["How It Works explains liquidation truth", how.includes("20× can absolutely be liquidated") && how.includes("Closing a losing position still realizes the loss")],
  ["How It Works includes an interactive leverage example", how.includes("LEVERAGE_OPTIONS") && how.includes('type="range"') && how.includes("Return on margin")],
];

let passed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
  if (ok) passed += 1;
}
console.log(`\nLeverage X V61 launchpad + How It Works: ${passed}/${checks.length} checks passed.`);
if (passed !== checks.length) process.exit(1);
