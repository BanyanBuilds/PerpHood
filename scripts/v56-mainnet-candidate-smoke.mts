import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const checks: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`V56 check failed: ${label}`);
  checks.push(label);
}

const pkg = JSON.parse(read("package.json")) as { version: string; name: string; scripts: Record<string, string> };
check(Number(pkg.version.split(".")[0]) >= 56, "package inherits the V56+ mainnet candidate baseline");
check(pkg.name.startsWith("leveragex-v"), "package remains a leverage X versioned build");
check(pkg.scripts["chain:v56:preflight"]?.includes("v56-mainnet-preflight"), "mainnet preflight command exists");
check(pkg.scripts["chain:v56:mainnet"]?.includes("v56-deploy-robinhood-mainnet"), "mainnet deploy command exists");
check(pkg.scripts["chain:v56:admin"]?.includes("v56-admin-robinhood-mainnet"), "mainnet admin command exists");

const contract = read("contracts/src/LeverageXLaunchFactoryV56.sol");
check(contract.includes("contract LeverageXLaunchFactoryV56"), "V56 factory exists");
check(contract.includes("enum LaunchMode { Closed, Allowlist, Public }"), "closed allowlist public launch modes exist");
check(contract.includes("bool public globalTradingPaused = true"), "factory deploys globally paused");
check(contract.includes("bool public newMarketsPaused = true"), "new markets deploy paused");
check(contract.includes("DEFAULT_CANARY_MAX_BUY_WEI"), "canary buy cap exists");
check(contract.includes("DEFAULT_CANARY_MAX_SELL_TOKEN_WAD"), "canary sell cap exists");
check(contract.includes("pendingOwner") && contract.includes("acceptOwnership"), "two-step ownership exists");
check(contract.includes("PERPS") === false, "contract does not falsely enable perps");

const deploy = read("scripts/v56-deploy-robinhood-mainnet.mts");
check(deploy.includes("DEPLOY_LEVERAGE_X_V56_MAINNET_PAUSED"), "explicit mainnet deploy phrase exists");
check(deploy.includes("chainId: 4_663"), "Robinhood mainnet chain ID is enforced");
check(deploy.includes("launchMode()(uint8)") && deploy.includes("globalTradingPaused()(bool)"), "post-deploy safety state is verified");
check(deploy.includes("runtimeBytecodeHash"), "runtime bytecode hash is recorded");
check(!deploy.includes("V55_ALLOW_MAINNET_DEPLOY"), "obsolete testnet prerequisite is absent from V56 deployer");

const header = read("components/Header.tsx");
check(!header.includes("BattlePool live"), "header no longer claims BattlePool is live");
check(header.includes("LEVERAGEX_RELEASE_STATUS"), "header uses truthful release state");
const brand = read("lib/brand.ts");
check(brand.includes("/leveragex-mark.svg"), "brand uses transparent SVG mark");
const svg = read("public/leveragex-mark.svg");
check(svg.includes("<svg") && !svg.includes("<rect"), "logo SVG has no boxed background");
check(existsSync(join(root, "public/favicon.ico")), "transparent mark favicon exists");
check(existsSync(join(root, "app/api/v56/readiness/route.ts")), "public V56 readiness endpoint exists");

const launchPanel = read("components/LaunchPanel.tsx");
check(launchPanel.includes('const NETWORK_KEY = "mainnet"') || launchPanel.includes('useState<RobinhoodNetworkKey>("mainnet")'), "launcher defaults to mainnet");
check(launchPanel.includes("NEXT_PUBLIC_V56_MAINNET_ENABLED"), "mainnet launcher has an explicit public gate");

console.log(`Leverage X V56 mainnet-candidate smoke passed (${checks.length}/${checks.length}).`);
