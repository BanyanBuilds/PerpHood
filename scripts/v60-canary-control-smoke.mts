import { existsSync, readFileSync } from "node:fs";

const checks: Array<[string, boolean]> = [];
function file(path: string) { return readFileSync(path, "utf8"); }
function check(label: string, condition: boolean) { checks.push([label, condition]); }

const pkg = JSON.parse(file("package.json")) as { name?: string; version?: string; scripts?: Record<string, string> };
const common = file("scripts/v60-canary-common.mts");
const preflight = file("scripts/v60-canary-preflight.mts");
const configure = file("scripts/v60-configure-canary.mts");
const open = file("scripts/v60-open-canary-spot.mts");
const pause = file("scripts/v60-emergency-pause.mts");
const v59Common = file("scripts/v59-mainnet-common.mts");
const readiness = file("lib/server/v60-canary-readiness.ts");
const route = file("app/api/v60/canary-readiness/route.ts");
const consoleUi = file("components/V60CanaryConsole.tsx");
const admin = file("app/admin/mainnet/page.tsx");
const launch = file("components/LaunchPanel.tsx");
const chainClient = file("lib/chain/robinhood-v54.ts");
const env = file(".env.mainnet.example");
const contract = file("contracts/src/LeverageXLaunchFactoryV60.sol");
const contractTest = file("contracts/test/LeverageXLaunchFactoryV60.t.sol");
const logo = file("public/leveragex-mark.svg");
const favicon = file("public/icon.svg");
const css = file("app/globals.css");
const profile = file("app/profile/page.tsx");

check("package preserves V60 controls in the current product build", Number(pkg.version?.split(".")[0] ?? 0) >= 61 && pkg.name?.startsWith("leveragex-v") === true);
check("V60 command surface exists", ["chain:v60:canary:preflight", "chain:v60:canary:configure", "chain:v60:canary:status", "chain:v60:canary:open", "chain:v60:emergency-pause"].every((key) => Boolean(pkg.scripts?.[key])));
check("V60 production contract is packaged", existsSync("contracts/src/LeverageXLaunchFactoryV60.sol") && contract.includes("contract LeverageXLaunchFactoryV60"));
check("Deployment path targets the current safe factory bytecode", (v59Common.includes("LeverageXLaunchFactoryV60.sol:LeverageXLaunchFactoryV60") || v59Common.includes("LeverageXLaunchFactoryV63.sol:LeverageXLaunchFactoryV63")) && (v59Common.includes("LeverageXSpotMarketV60") || v59Common.includes("LeverageXSpotMarketV63")));
check("factory deploys CLOSED and globally paused", contract.includes("LaunchMode public launchMode") && contract.includes("bool public globalTradingPaused = true") && contract.includes("bool public newMarketsPaused = true"));
check("atomic canary configuration exists", contract.includes("function configureFirstCanary") && contract.includes("FirstCanaryConfigured"));
check("allowlist can create exactly one canary market", contract.includes("msg.sender != activeCanaryCreator") && contract.includes("if (markets.length != 0) revert UnsafeCanaryState()") && contractTest.includes("testAllowlistCanCreateExactlyOneCanaryMarket"));
check("atomic first-market opening exists", contract.includes("function openFirstCanaryMarket") && contract.includes("markets.length != 1") && contract.includes("market.tradeCount() != 1"));
check("atomic emergency lockdown closes launch and trading", contract.includes("function emergencyLockdown") && contract.includes("launchMode = LaunchMode.Closed") && contract.includes("globalTradingPaused = true") && contract.includes("canaryCreator[revokedCreator] = false"));
check("V60 contract test covers atomic lifecycle", contractTest.includes("testAtomicCanaryConfiguration") && contractTest.includes("testAtomicFirstMarketOpenAndCaps") && contractTest.includes("testEmergencyLockdownClosesEverything"));
check("preflight cannot sign", preflight.includes("NO SIGNING / NO BROADCAST") && !preflight.includes("sendOwner("));
check("canary constants are capped", common.includes("10_000_000_000_000_000n") && common.includes("5_000_000n * 10n ** 18n"));
check("factory address can come from canonical manifest", common.includes("deployments\", \"leveragex-mainnet.json") && common.includes("LEVERAGEX_FACTORY_ADDRESS"));
check("active canary creator is read from chain", common.includes("activeCanaryCreator()(address)") && readiness.includes("activeCanaryCreator"));
check("configuration needs exact phrase", configure.includes("CONFIGURE_LEVERAGE_X_MAINNET_CANARY_ALLOWLIST"));
check("configuration is one owner transaction", configure.includes("configureFirstCanary(address,uint256,uint256)") && (configure.match(/sendOwner\(/g)?.length ?? 0) === 1);
check("Spot opening needs exact phrase", open.includes("OPEN_FIRST_LEVERAGE_X_MAINNET_SPOT_CANARY"));
check("Spot opening requires one market", open.includes("marketCount !== 1n") && open.includes("tradeCount !== 1n"));
check("Spot opening is one owner transaction", open.includes("openFirstCanaryMarket(address)") && (open.match(/sendOwner\(/g)?.length ?? 0) === 1);
check("future launches remain paused", open.includes("newMarketsPaused") && !open.includes("setLaunchMode(uint8)"));
check("emergency lockdown exists", pause.includes("EMERGENCY_LOCKDOWN_LEVERAGE_X_MAINNET") && pause.includes("emergencyLockdown(address)"));
check("emergency verifies CLOSED + paused + revoked", pause.includes("factoryState.launchMode !== 0") && pause.includes("factoryState.activeCanaryCreator") && pause.includes("canaryCreatorAllowed"));
check("server readiness stays read-only", readiness.includes("eth_call") && !readiness.includes("eth_sendTransaction"));
check("readiness has canary gates", readiness.includes("canaryConfigurationReady") && readiness.includes("spotCanaryOpen") && readiness.includes("publicLaunchesAllowed: false"));
check("readiness route is no-store", route.includes("no-store") && route.includes("readV60CanaryReadiness"));
check("admin console is V60", consoleUi.includes("Mainnet Canary Control") && admin.includes("V60CanaryConsole"));
check("admin makes public/perps lock explicit", consoleUi.includes("Public launch mode disabled") && consoleUi.includes("Long/Short disabled"));
check("launch panel preserves canary restriction", launch.includes("MAINNET_CANARY_ONLY") && launch.includes("first launch is restricted"));
check("chain launch enforces configured creator", chainClient.includes("enforceMainnetCanary") && chainClient.includes("MAINNET_CANARY_CREATOR"));
check("V60 env controls are documented", env.includes("V60_CANARY_CREATOR_ADDRESS") && env.includes("V60_CANARY_OPEN_CONFIRM") && env.includes("NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS"));
check("no browser owner signing route", !route.includes("private") && !consoleUi.includes("eth_sendTransaction"));
check("clean LX vector uses optical safe area", logo.includes('viewBox="0 0 512 512"') && logo.includes("M82 158") && logo.includes("M92 82") && logo.includes("M340 82"));
check("favicon uses simplified tiny-size mark", favicon.includes("M82 158") && !favicon.includes("m185 326"));
check("logo has no box or glow", css.includes("Leverage X V60 — optically balanced LX identity") && css.includes("filter: none !important") && css.includes("background: transparent !important"));
check("all browser and app icon assets exist", ["public/favicon.ico","public/favicon-16.png","public/favicon-32.png","public/icon-192.png","public/icon-512.png","public/apple-touch-icon.png","app/icon.png","app/apple-icon.png"].every(existsSync));
check("creator profile now says Launch Token", profile.includes("Open Launch Token") && !profile.includes("Open BattlePool launch"));

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
if (failed.length) {
  console.error(`\n${failed.length}/${checks.length} V60 canary-control checks failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} V60 canary-control checks passed.`);
