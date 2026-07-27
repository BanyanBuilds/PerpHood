import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const checks: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(`V59 check failed: ${label}`);
  checks.push(label);
}

const pkg = JSON.parse(read("package.json")) as { name: string; version: string; scripts: Record<string, string> };
check(/^leveragex-v(?:59|6\d)-/.test(pkg.name), "package preserves V59+ mainnet preflight lineage");
check(Number(pkg.version.split(".")[0]) >= 59, "package version is V59 or newer");
for (const name of ["chain:v59:preflight", "chain:v59:deploy", "chain:v59:verify", "chain:v59:status", "chain:v59:admin", "test:v59-fast"]) {
  check(Boolean(pkg.scripts[name]), `${name} command exists`);
}
check(pkg.scripts["chain:v59:preflight"].includes("--env-file-if-exists=.env.mainnet.local"), "local mainnet env file loads without entering Vercel secrets");

const common = read("scripts/v59-mainnet-common.mts");
check(common.includes("chainId: 4_663"), "Robinhood Chain mainnet ID is canonical");
check(common.includes("robinhoodchain.blockscout.com"), "canonical Blockscout explorer is configured");
check(common.includes("V59_KEYSTORE_ACCOUNT") && common.includes("V59_DEPLOYER_PRIVATE_KEY"), "encrypted keystore is preferred with local-key fallback");
check(common.includes("DEFAULT_DEPLOYER") && common.includes("DEFAULT_FIRST_TRADER"), "confirmed public deployer and first-trader addresses are carried forward");

const preflight = read("scripts/v59-mainnet-preflight.mts");
check(preflight.includes("eth_chainId") && preflight.includes("eth_getBlockByNumber"), "preflight verifies chain identity and RPC freshness");
check(preflight.includes("forge\", [\"clean\"") && preflight.includes("LeverageXLaunchFactoryV60.t.sol"), "preflight compiles cleanly and runs factory tests");
check(preflight.includes("EIP170_RUNTIME_LIMIT_BYTES") && preflight.includes("EIP3860_INITCODE_LIMIT_BYTES"), "runtime and initcode size limits are enforced");
check(preflight.includes("eth_estimateGas") && preflight.includes("fundingShortfallWei"), "deployment gas and exact funding shortfall are calculated");
check(preflight.includes("factoryStillUndeployedByThisCommand: true"), "preflight cannot broadcast a transaction");

const deploy = read("scripts/v59-deploy-robinhood-mainnet.mts");
check(deploy.includes("DEPLOY_LEVERAGE_X_MAINNET_CLOSED_AND_PAUSED"), "deployment requires an explicit mainnet confirmation phrase");
check(deploy.includes("Dry-running the exact factory deployment transaction"), "exact transaction is simulated before broadcast");
check(deploy.includes("Runtime bytecode mismatch") && deploy.includes("launchMode !== 0"), "post-deploy bytecode and closed-state checks are mandatory");
check(deploy.includes("globalPaused !== \"true\"") && deploy.includes("newMarketsPaused !== \"true\""), "global and new-market pauses are verified after deployment");
check(deploy.includes("NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED=false"), "deployment never enables the public UI automatically");
check(!deploy.includes("NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED=true"), "deployment cannot silently activate mainnet");

const verify = read("scripts/v59-verify-robinhood-mainnet.mts");
check(verify.includes("verify-contract") && verify.includes("--verifier",), "separate Blockscout source verification exists");
check(verify.includes("--constructor-args"), "verification includes constructor arguments");

const readiness = read("lib/server/v59-mainnet-readiness.ts");
check(readiness.includes("ROBINHOOD_MAINNET_RPC_URL") && !readiness.includes("alchemy.com/v2/alch_"), "readiness uses server env without embedding an API key");
check(readiness.includes("eth_getCode") && readiness.includes("globalTradingPaused()"), "readiness reads real factory bytecode and safety state");
check(readiness.includes("canaryActivationAllowed: false"), "canary activation remains hard locked");
check(existsSync(join(root, "app/api/v59/readiness/route.ts")), "V59 readiness API route exists");
check(existsSync(join(root, "app/admin/mainnet/page.tsx")), "V59 internal mainnet console exists");
check(read("components/LaunchPanel.tsx").includes("NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED"), "launcher accepts canonical public enable flag");
check(read("lib/chain/robinhood-v54.ts").includes("NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS"), "browser client accepts canonical factory address");

const env = read(".env.mainnet.example");
check(env.includes("0x728fa84C70f7b88Ab59C86379745FdDBbDd7AD07"), "deployer public address is prefilled");
check(env.includes("0x1728DC75f70070DC74Ae2172EF94970e04D9830C"), "first trader public address is prefilled");
check(!env.includes("alch_"), "no Alchemy API key is packaged");
check(read(".gitignore").includes(".env.mainnet.local"), "local mainnet secret file is gitignored");

console.log(`Leverage X V59 mainnet preflight smoke passed (${checks.length}/${checks.length}).`);
