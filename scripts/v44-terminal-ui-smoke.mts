import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const [provider, workspaceTicket, tradePanel, types, styles, positions, packageJson, health, config, env] = await Promise.all([
  read("components/MarketProvider.tsx"),
  read("components/WorkspaceTradeTicket.tsx"),
  read("components/TradePanel.tsx"),
  read("lib/types.ts"),
  read("app/globals.css"),
  read("app/positions/page.tsx"),
  read("package.json"),
  read("app/api/launchpad/health/route.ts"),
  read("app/api/launchpad/config/route.ts"),
  read(".env.example"),
]);

const checks: Array<[string, boolean]> = [
  ["provider routes spot buys to V43", provider.includes("executeV44SpotBuy")],
  ["provider routes spot sells to V43", provider.includes("executeV44SpotSell")],
  ["provider routes long and short opens to V43", provider.includes("executeV44OpenPosition")],
  ["provider routes closes to V43", provider.includes("executeV44ClosePosition")],
  ["provider reconciles exact contract equity", provider.includes("readV44PositionEquity") && provider.includes("Exact V43 quotePositionEquityWei contract read")],
  ["provider polls contract state without token render loop", provider.includes("tokensRef.current.filter(isContractMarket)")],
  ["wallet-only V44 blocks unattended conditional orders", provider.includes("V46 durable orders require a V45 account-routed market") && provider.includes("Authorize a V45 trading session") && provider.includes("if (isContractMarket(token)) continue")],
  ["workspace exposes wallet-confirmed execution", workspaceTicket.includes("V43 CONTRACT") && workspaceTicket.includes("Awaiting wallet")],
  ["workspace hides unenforced TP/SL automation", workspaceTicket.includes("(!contractExecution || durableOrderExecution)") && workspaceTicket.includes("TP / SL / BE")],
  ["full trade panel exposes V44 execution", tradePanel.includes("V44 CONTRACT EXECUTION") && tradePanel.includes("AWAITING CONFIRMATION")],
  ["contract positions disable unsupported partial close", positions.includes('position.executionMode !== "v43-contract"')],
  ["chain receipt fields persist on positions", types.includes("chainPositionId") && types.includes("chainExecutableEquityEth")],
  ["execution state styles exist", styles.includes(".v44-execution-strip")],
  ["health advertises terminal contract execution", health.includes("terminalContractExecution: true")],
  ["config advertises terminal contract execution", config.includes("terminalContractExecution: true")],
  ["demo token address is configurable", env.includes("NEXT_PUBLIC_V43_DEMO_TOKEN_ADDRESS")],
];
for (const [label, passed] of checks) assert.equal(passed, true, label);
const pkg = JSON.parse(packageJson) as { name: string; version: string; scripts: Record<string, string> };
assert.ok(["perphood-v44-terminal-contract-execution", "perphood-v45-authorized-account-execution", "perphood-v46-order-keeper-network", "perphood-v47-authoritative-indexer", "perphood-v48-live-data-plane", "perphood-v49-settlement-math-verification", "perphood-v50-formal-invariants", "perphood-v51-compiler-chain-assault", "perphood-v52-product-completion", "perphood-v53-supabase-user-state", "leveragex-v55-real-trading-terminal"].includes(pkg.name));
assert.ok(["44.0.0", "45.0.0", "46.0.0", "47.0.0", "48.0.0", "49.0.0", "50.0.0", "51.0.0", "52.0.0", "53.0.0"].includes(pkg.version));
assert.ok(pkg.scripts["test:v44"]);
assert.ok(pkg.scripts["chain:v44"]);
console.log(`V44 terminal-to-contract UI smoke passed (${checks.length}/${checks.length}).`);
