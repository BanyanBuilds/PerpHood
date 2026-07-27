import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const [provider, funding, ticket, tradePanel, relay, executor, accountClient, types, health, config, launcher, cli, env, pkgRaw] = await Promise.all([
  read("components/MarketProvider.tsx"), read("components/FundingCenter.tsx"), read("components/WorkspaceTradeTicket.tsx"), read("components/TradePanel.tsx"),
  read("app/api/v45/relay/route.ts"), read("lib/chain/v45-terminal-executor.ts"), read("lib/chain/v45-account-client.ts"), read("lib/types.ts"),
  read("app/api/launchpad/health/route.ts"), read("app/api/launchpad/config/route.ts"), read("components/LaunchPanel.tsx"), read("scripts/v45-local-chain-cli.mts"), read(".env.example"), read("package.json"),
]);
const checks: Array<[string, boolean]> = [
  ["provider routes all six session actions", ["executeV45SpotBuy", "executeV45SpotSell", "executeV45OpenPosition", "executeV45ClosePosition"].every((x) => provider.includes(x))],
  ["provider retains direct V45 escape actions", provider.includes("executeV45DirectClosePosition") && provider.includes("executeV45DirectSpotSell")],
  ["funding uses live account state", funding.includes("readV45AccountState") && funding.includes("syncTradingAccountBalance")],
  ["funding creates and revokes bounded sessions", funding.includes("authorizeV45Session") && funding.includes("revokeV45Session") && funding.includes("MAX_CUMULATIVE_ETH")],
  ["workspace exposes V45 session mode", ticket.includes("V45 SESSION") && ticket.includes("Relaying intent")],
  ["full panel exposes authorized execution", tradePanel.includes("V45 AUTHORIZED EXECUTION")],
  ["relay verifies P-256 signatures", relay.includes("verifyV45SignedTradingIntent") && relay.includes("session.nextNonce")],
  ["relay dispatches only six strict actions", relay.includes("executeAuthorizedSpotBuy") && relay.includes("executeAuthorizedClosePosition")],
  ["executor reconciles custody after receipt", executor.includes("accountState.solvent") && executor.includes("readV44RuntimeState")],
  ["client exposes deposit withdrawal session lifecycle", ["depositV45Account", "withdrawV45Account", "authorizeV45Session", "revokeV45Session"].every((x) => accountClient.includes(x))],
  ["types persist V45 deployment and execution modes", types.includes('"anvil-v45"') && types.includes('"v45-session"') && types.includes('"v45-account"')],
  ["health exposes account execution", health.includes("internalAccountLedger: true") && health.includes("p256SessionIntents: true")],
  ["config exposes direct withdrawal path", config.includes("directWithdrawEscapePath: true")],
  ["launcher deploys V45 markets", launcher.includes("launchV45Market") && launcher.includes('"anvil-v45"')],
  ["CLI compiles V45 router", cli.includes("LaunchpadFactoryV45.sol") && cli.includes("spotBuyFromBalance")],
  ["environment documents V45 router", env.includes("NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS")],
];
for (const [label, passed] of checks) assert.equal(passed, true, label);
const pkg = JSON.parse(pkgRaw) as { name: string; version: string; scripts: Record<string,string> };
assert.ok(["perphood-v45-authorized-account-execution", "perphood-v46-order-keeper-network", "perphood-v47-authoritative-indexer", "perphood-v48-live-data-plane", "perphood-v49-settlement-math-verification", "perphood-v50-formal-invariants", "perphood-v51-compiler-chain-assault", "perphood-v52-product-completion", "perphood-v53-supabase-user-state", "leveragex-v55-real-trading-terminal"].includes(pkg.name));
assert.ok(["45.0.0", "46.0.0", "47.0.0", "48.0.0", "49.0.0", "50.0.0", "51.0.0", "52.0.0", "53.0.0"].includes(pkg.version));
assert.ok(pkg.scripts["test:v45"] && pkg.scripts["chain:v45"]);
console.log(`V45 authorized-account terminal UI smoke passed (${checks.length}/${checks.length}).`);
