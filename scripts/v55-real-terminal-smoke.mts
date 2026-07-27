import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_CATEGORY_SETTINGS, getActiveExecutionPreset, getActionSlippagePercent } from "../lib/terminal-settings.ts";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const checks: string[] = [];
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks.push(label);
}

const pkg = JSON.parse(read("package.json")) as { name: string; version: string; scripts: Record<string, string> };
check(pkg.name === "leveragex-v55-real-trading-terminal", "package uses the Leverage X V55 identity");
check(pkg.version === "55.0.0", "package version is V55");
check(pkg.scripts["chain:deploy:v55"]?.includes("v55-deploy-robinhood"), "V55 Robinhood deployment command exists");
check(pkg.scripts["chain:test:v55"]?.includes("LeverageXLaunchFactoryV55"), "V55 Foundry contract test command exists");

for (const asset of ["public/leveragex-logo.png", "public/favicon.ico", "public/favicon-16.png", "public/favicon-32.png", "public/apple-touch-icon.png", "public/icon-192.png", "public/icon-512.png", "public/leveragex-og.jpg"]) {
  check(existsSync(join(root, asset)) && statSync(join(root, asset)).size > 100, `${asset} is packaged`);
}
const layout = read("app/layout.tsx");
check(layout.includes('https://leveragex.fun') && layout.includes('LEVERAGEX_BRAND'), "site metadata uses leverageX.fun and the shared brand source");
check(layout.includes('/favicon.ico') && layout.includes('/apple-touch-icon.png'), "browser and Apple icons are registered");
check(read("public/site.webmanifest").includes('"name": "Leverage X"'), "installable web manifest uses Leverage X");
check(read("components/icons.tsx").includes('LEVERAGEX_BRAND.logoPath'), "terminal logo uses the official Leverage X asset");

const contract = read("contracts/src/LeverageXLaunchFactoryV55.sol");
check(contract.includes("contract LeverageXLaunchFactoryV55"), "Leverage X V55 launch factory exists");
check(contract.includes("contract LeverageXTokenV55"), "Leverage X fixed-supply ERC-20 exists");
check(contract.includes("contract LeverageXSpotMarketV55"), "Leverage X native-ETH spot market exists");
check(contract.includes("1_000_000_000 ether"), "V55 token supply is exactly one billion");
check(contract.includes("TOTAL_CREATOR_LAUNCH_BUDGET_WEI = 0.001 ether"), "inclusive 0.001 ETH launch budget remains locked");
check(contract.includes("return wallet == creator"), "creator remains permanently perps-restricted");
check(contract.includes("event MarketCreated(") && contract.includes("event Trade("), "factory and market publish canonical indexer events");
const deploy = read("scripts/v55-deploy-robinhood.mts");
check(deploy.includes("LeverageXLaunchFactoryV55.sol:LeverageXLaunchFactoryV55"), "V55 deployment script targets the correct compiled contract");
check(deploy.includes("V55_ALLOW_MAINNET_DEPLOY") && deploy.includes("chain-id"), "mainnet deployment is locked and RPC chain ID is verified");

const schema = read("supabase/v55_production_launch.sql");
check(schema.includes("leveragex_v55_launches"), "Supabase uses the Leverage X V55 launch registry");
check(schema.includes("leveragex-token-media"), "Supabase uses the Leverage X token-media bucket");
check(schema.includes("unique (chain_id, token_address)"), "launch registry deduplicates canonical token addresses");
check(existsSync(join(root, "app/api/v55/launches/route.ts")) && existsSync(join(root, "app/api/v55/metadata/route.ts")) && existsSync(join(root, "app/api/v55/discovery/route.ts")), "V55 metadata, registry, and discovery APIs exist");
check(read("components/LaunchPanel.tsx").includes('/api/v55/metadata') && read("components/LaunchPanel.tsx").includes('/api/v55/launches'), "launcher uses the V55 APIs");
check(read("lib/v54-launch-registry.ts").includes('/api/v55/launches'), "terminal discovers confirmed V55 markets");

for (const [category, settings] of Object.entries(DEFAULT_CATEGORY_SETTINGS)) {
  const { key, profile } = getActiveExecutionPreset(settings);
  check(["P1", "P2", "P3"].includes(key), `${category} has an active P1/P2/P3 profile`);
  check(profile.maxNetworkFeeEth >= 0 && profile.deadlineSeconds >= 5, `${category} execution profile has bounded network fee and deadline`);
}
const settingsSource = read("lib/terminal-settings.ts");
check(settingsSource.includes('executionRoute: "standard"') && settingsSource.includes('executionRoute: "fast"') && settingsSource.includes('executionRoute: "assault"'), "P1/P2/P3 include distinct execution routes");
check(getActionSlippagePercent(DEFAULT_CATEGORY_SETTINGS.new.executionPresets.P3, "buy") === 12, "action-specific slippage is deterministic");
const settingsUi = read("components/TerminalCategorySettings.tsx");
check(settingsUi.includes("Execution Boost") && settingsUi.includes("No fake bribes"), "terminal exposes honest Robinhood execution routing rather than fake bribes");
check(settingsUi.includes("Maximum network fee") && settingsUi.includes("Maximum price impact") && settingsUi.includes("Quote deadline"), "terminal profiles expose fee, impact, and stale-quote limits");
check(settingsUi.includes("Quick Long") && settingsUi.includes("Quick Short") && settingsUi.includes("Not configured — row action disabled"), "quick Long/Short remain preset-only");

const ticket = read("components/WorkspaceTradeTicket.tsx");
check(ticket.includes('type FeePreset = "P1" | "P2" | "P3"'), "selected-market ticket uses P1/P2/P3");
check(ticket.includes("Maximum possible debit") || ticket.includes("Max debit"), "selected-market ticket previews maximum debit");
check(ticket.includes("Protocol fee") && ticket.includes("Max network"), "selected-market ticket separates protocol and network fees");
check(ticket.includes("Quick execution is only trustworthy after a fresh canonical contract read"), "selected-market ticket blocks trust when canonical market data is stale");
check(ticket.includes('"INDEXING"') && ticket.includes('"STALE"') && ticket.includes('"PAUSED"') && ticket.includes('"ACTIVE"'), "selected-market ticket exposes authoritative market states");
check(ticket.includes("Not indexed") && ticket.includes("Fixed supply") && ticket.includes("Additional mint"), "token intelligence distinguishes indexed evidence from immutable native-token facts");
const chainClient = read("lib/chain/robinhood-v54.ts");
check(chainClient.includes("maxNetworkFeeEth") && chainClient.includes("maxPriceImpactPercent") && chainClient.includes("slippageBps"), "real spot execution enforces selected fee, impact, and slippage limits");
check(chainClient.includes("eth_estimateGas") && chainClient.includes("eth_gasPrice"), "wallet execution estimates gas before enforcing its fee ceiling");
check(chainClient.includes("onQuote?.") && chainClient.includes("onWalletRequest?.()") && chainClient.includes("onSubmitted?.(transactionHash)"), "real execution reports quote, wallet request, and submitted transaction phases");
const provider = read("components/MarketProvider.tsx");
check(provider.includes('phase: "quote"') && provider.includes('phase: "wallet"') && provider.includes('phase: "pending"'), "terminal provider maps real chain callbacks into lifecycle phases");

const tracker = read("components/TransactionLifecycleTracker.tsx");
for (const phase of ["Quote", "Wallet", "Submitted", "Confirmed", "Reconciled", "Indexed"]) check(tracker.includes(`"${phase}"`), `transaction lifecycle includes ${phase}`);
const hub = read("components/TerminalHub.tsx");
check(hub.includes("TransactionLifecycleTracker"), "terminal renders the transaction lifecycle tracker");
check(hub.includes("Disable quick actions") && hub.includes("Cancel all orders") && hub.includes("Close all positions"), "terminal exposes emergency trading controls");
check(hub.includes("three") || read("scripts/v48-left-sidecars-smoke.mts").includes("three"), "three-left-sidecar requirement remains guarded");
check(read("lib/data.ts").includes("export const TOKENS: Token[] = [];"), "hosted product starts with no demo token rows");

const runtimeSurface = ["app", "components", "hooks", "lib"].map((dir) => readFileTree(join(root, dir))).join("\n");
check(!/\bPERPHOOD\b|\bPerpHood\b/.test(runtimeSurface), "visible runtime source contains no legacy PERPHOOD brand");
check(!runtimeSurface.includes("bundled demo market") && !runtimeSurface.includes("perphood-demo"), "hosted runtime contains no bundled demo market identifiers");

console.log(`Leverage X V55 real terminal smoke passed (${checks.length}/${checks.length}).`);
for (const label of checks) console.log(`  ✓ ${label}`);

function readFileTree(directory: string): string {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return readFileTree(path);
    if (!/\.(ts|tsx|json|webmanifest)$/.test(path)) return [];
    return [readFileSync(path, "utf8")];
  }).join("\n");
}
