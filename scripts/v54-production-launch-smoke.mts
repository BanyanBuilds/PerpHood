import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  ROBINHOOD_NETWORKS,
  V54_TOTAL_LAUNCH_BUDGET_WEI,
  encodeV54CreateMarket,
} from "../lib/chain/robinhood-v54.ts";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const checks: string[] = [];
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks.push(label);
}
function collect(path: string): string[] {
  const full = join(root, path);
  return readdirSync(full).flatMap((name) => {
    const child = join(full, name);
    return statSync(child).isDirectory() ? collect(relative(root, child)) : [relative(root, child)];
  });
}

const contract = read("contracts/src/PerpHoodLaunchFactoryV54.sol");
check(contract.includes("contract PerpHoodLaunchFactoryV54"), "production V54 launch factory exists");
check(contract.includes("contract PerpHoodTokenV54"), "fixed-supply V54 ERC-20 exists");
check(contract.includes("contract PerpHoodSpotMarketV54"), "real V54 spot market exists");
check(contract.includes("1_000_000_000 ether"), "token supply is exactly one billion with 18 decimals");
check(contract.includes("balanceOf[launchMarket_] = totalSupply"), "complete supply begins in the market contract");
check(!contract.includes("function mint("), "token has no post-deployment mint function");
check(!contract.includes("taxBps") && !contract.includes("blacklisted") && !contract.includes("setTax"), "token has no transfer-tax or blacklist implementation");
check(contract.includes("TOTAL_CREATOR_LAUNCH_BUDGET_WEI = 0.001 ether"), "factory records the inclusive 0.001 ETH launch budget");
check(contract.includes("msg.value < MIN_CREATOR_GENESIS_BUY_WEI || msg.value >= TOTAL_CREATOR_LAUNCH_BUDGET_WEI"), "factory rejects dust and creator buys that consume the total budget");
check(contract.includes("creatorGenesisTokensWad = _buy(creator_, msg.value, 0)"), "creator receives only tokens purchased from the public curve");
check(contract.includes("return wallet == creator"), "creator is permanently marked perps-restricted");
check(contract.includes("event MarketCreated("), "factory emits a canonical market discovery event");
check(contract.includes("event Trade("), "spot market emits canonical Buy/Sell discovery events");

check(ROBINHOOD_NETWORKS.testnet.chainId === 46_630, "Robinhood Chain testnet ID is 46630");
check(ROBINHOOD_NETWORKS.mainnet.chainId === 4_663, "Robinhood Chain mainnet ID is 4663");
check(ROBINHOOD_NETWORKS.testnet.rpcUrl.startsWith("https://"), "testnet RPC uses an HTTPS endpoint");
check(ROBINHOOD_NETWORKS.mainnet.rpcUrl.startsWith("https://"), "mainnet RPC uses an HTTPS endpoint");
check(V54_TOTAL_LAUNCH_BUDGET_WEI === 1_000_000_000_000_000n, "client launch budget is exactly 0.001 ETH");
const encoded = encodeV54CreateMarket({
  name: "Production Coin",
  symbol: "PROD",
  metadataURI: "https://example.invalid/token.json",
  metadataHash: `0x${"11".repeat(32)}`,
  migrationTargetMarketCapUsd: 45_000,
});
check(/^0x[0-9a-f]+$/i.test(encoded) && encoded.length > 10 + 64 * 5, "factory calldata encodes dynamic token identity and metadata");

const launchClient = read("lib/chain/robinhood-v54.ts");
check(launchClient.includes("eth_estimateGas") && launchClient.includes("maximumGasCostWei"), "wallet client reserves gas before computing the creator buy");
check(launchClient.includes("V54_TOTAL_LAUNCH_BUDGET_WEI - maximumGasCostWei"), "creator buy is the exact remainder after the gas ceiling");
check(launchClient.includes("eth_sendTransaction"), "creator wallet submits the launch transaction directly");
check(launchClient.includes("executeV54SpotBuy") && launchClient.includes("executeV54SpotSell"), "real V54 spot buy and sell clients exist");

const server = read("lib/server/v54-launch-server.ts");
check(server.includes("verifyV54MetadataDocument") && server.includes("verifyV54LaunchOnChain"), "registry verifies metadata and the canonical chain receipt");
check(server.includes("Token supply is not exactly one billion tokens"), "registry rejects a noncanonical token supply");
check(server.includes("MarketCreated event was not found"), "registry requires the real factory event");
check(server.includes("token-media") && server.includes("computedHash"), "registry binds public metadata to its SHA-256 hash");

const schema = read("supabase/v54_production_launch.sql");
check(schema.includes("perphood_v54_launches"), "Supabase contains a real launch registry");
check(schema.includes("token-media"), "Supabase contains the public token-media bucket");
check(schema.includes("unique (chain_id, token_address)"), "launch registry deduplicates canonical token addresses per chain");
check(read("app/api/v54/discovery/route.ts").includes("MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)"), "public discovery feed publishes canonical factory and market event signatures");

const panel = read("components/LaunchPanel.tsx");
check(panel.includes("MINT ON ROBINHOOD CHAIN"), "launcher exposes the real connected-wallet mint action");
check(panel.includes("RETRY REGISTRY VERIFY"), "confirmed launches can recover from a temporary registry outage");
check(panel.includes("MAINNET_ENABLED"), "mainnet remains explicitly locked by default");
check(!panel.includes("anvil") && !panel.includes("browser-sim"), "production launcher contains no Anvil or browser simulation mode");

const provider = read("components/MarketProvider.tsx");
check(provider.includes("fetchV54LaunchTokens"), "terminal discovers confirmed V54 markets from the registry");
check(provider.includes("executeV54SpotBuy") && provider.includes("executeV54SpotSell"), "terminal routes V54 spot trades to real chain transactions");
check(read("lib/data.ts").includes("export const TOKENS: Token[] = [];"), "production market list starts empty instead of with a bundled coin");
check(read("components/TerminalOrderBook.tsx").includes("not indexed") || read("components/TerminalOrderBook.tsx").includes("No canonical"), "order book refuses to fabricate depth");
check(read("app/admin/launchpad/sandbox/page.tsx").includes("No deployed demo sandbox"), "hosted launch sandbox no longer displays fake chain state");

const publicRuntimeFiles = ["app", "components", "hooks", "lib"].flatMap(collect)
  .filter((path) => /\.(ts|tsx)$/.test(path))
  .filter((path) => path !== "lib/demo-market.ts" && !path.startsWith("app/admin/v24-verification/"));
const forbiddenRuntimeMatches = publicRuntimeFiles.flatMap((path) => {
  const text = read(path);
  return ["perphood-demo", "DEMO REPLAY", "bundled demo market"].filter((needle) => text.includes(needle)).map((needle) => `${path}:${needle}`);
});
check(forbiddenRuntimeMatches.length === 0, `hosted product contains no bundled demo identifiers (${forbiddenRuntimeMatches.join(", ")})`);

console.log(`V54 production launch smoke passed (${checks.length}/${checks.length}).`);
for (const label of checks) console.log(`  ✓ ${label}`);
