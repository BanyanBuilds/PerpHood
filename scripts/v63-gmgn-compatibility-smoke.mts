import { existsSync, readFileSync } from "node:fs";

let passed = 0;
function file(path: string) { return readFileSync(path, "utf8"); }
function check(label: string, value: boolean) {
  if (!value) throw new Error(`V63 GMGN compatibility check failed: ${label}`);
  passed += 1;
  console.log(`✓ ${label}`);
}

const contract = file("contracts/src/LeverageXLaunchFactoryV63.sol");
const contractTest = file("contracts/test/LeverageXLaunchFactoryV63.t.sol");
const manifest = file("lib/server/v63-gmgn-feed.ts");
const backfill = file("scripts/v63-gmgn-backfill.mts");
const packageBuilder = file("scripts/v63-build-gmgn-package.mts");
const schema = file("supabase/v63_gmgn_compatibility.sql");
const packageJson = file("package.json");

check("V63 factory contract is packaged", contract.includes("contract LeverageXLaunchFactoryV63"));
check("fixed-supply standard ERC-20 remains taxless", contract.includes("uint256 public constant totalSupply = 1_000_000_000 ether") && !contract.includes("transferTax"));
check("stable TokenLaunched attribution event exists", contract.includes("event TokenLaunched(") && contract.includes("address indexed token") && contract.includes("address indexed deployer") && contract.includes("address indexed pool"));
check("factory exposes launch lookup", contract.includes("function getLaunchedToken(address tokenAddress)"));
check("factory exposes human-readable token info", contract.includes("function getTokenInfo(address tokenAddress)"));
check("factory exposes token enumeration", contract.includes("address[] public allTokens") && contract.includes("function tokenCount()"));
check("factory exposes launchpad attribution", contract.includes("function isLeverageXToken(address tokenAddress)"));
check("factory exposes graduation state", contract.includes("function graduationStatus(address tokenAddress)"));
check("factory records canonical external pool after graduation", contract.includes("function recordGraduation(") && contract.includes("event TokenGraduated("));
check("official Robinhood WETH is the default pair token", contract.includes("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"));
check("contract test covers indexer surface", contractTest.includes("testIndexerStableLaunchSurface") && contractTest.includes("testHumanReadableTokenInfo"));
check("public GMGN manifest route exists", existsSync("app/api/v63/gmgn/manifest/route.ts") && manifest.includes("launchpadId: \"leverage-x-robinhood\""));
check("public launch feed route exists", existsSync("app/api/v63/gmgn/launches/route.ts"));
check("per-token discovery route exists", existsSync("app/api/v63/gmgn/token/[address]/route.ts"));
check("well-known launchpad manifest exists", existsSync("app/.well-known/leveragex-launchpad/route.ts"));
check("public versioned ABIs are directly downloadable", existsSync("public/integrations/gmgn/abi/LeverageXLaunchFactoryV63.json") && existsSync("public/integrations/gmgn/abi/LeverageXTokenV63.json") && existsSync("public/integrations/gmgn/abi/LeverageXSpotMarketV63.json"));
check("manifest publishes event topics, ABI URLs, and common pool aliases", manifest.includes("V63_EVENT_TOPICS") && manifest.includes("factoryAbi") && manifest.includes("poolAddress"));
check("GMGN onboarding submission template is packaged", existsSync("integrations/gmgn/SUBMISSION_TEMPLATE.md"));
check("backfill replays ordered factory logs", backfill.includes("eth_getLogs") && backfill.includes("transaction_index") && backfill.includes("log_index"));
check("integration package includes topics and selectors", packageBuilder.includes("eventTopic(signature)") && packageBuilder.includes("functionSelector(signature)"));
check("Supabase raw event mirror is reorg-aware", schema.includes("block_hash") && schema.includes("canonical boolean") && schema.includes("transaction_index"));
check("public launch feed switches to canonical graduated pools", manifest.includes("listV63GraduationMappings") && manifest.includes("poolType: \"external-dex\""));
check("public launch feed rejects invalid pagination numbers", manifest.includes("Number.isFinite(requestedLimit)"));
check("V63 scripts are wired into package.json", packageJson.includes("test:v63-fast") && packageJson.includes("chain:v63:gmgn:backfill") && packageJson.includes("gmgn:package:v63"));
check("V59 deployment target now compiles V63", file("scripts/v59-mainnet-common.mts").includes("LeverageXLaunchFactoryV63.sol:LeverageXLaunchFactoryV63"));

console.log(`\nV63 GMGN compatibility: ${passed}/${passed} checks passed.`);
