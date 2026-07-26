import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = await Promise.all([
  "lib/chain/v46-order.ts",
  "lib/server/v46-order-store.ts",
  "lib/server/v46-keeper.ts",
  "app/api/v46/orders/route.ts",
  "app/api/v46/orders/cancel/route.ts",
  "app/api/v46/keeper/run/route.ts",
  "components/MarketProvider.tsx",
  "components/TradePanel.tsx",
  "components/WorkspaceTradeTicket.tsx",
  "components/V46KeeperConsole.tsx",
].map(async (path) => [path, await readFile(path, "utf8")] as const));
const text = Object.fromEntries(files);
const checks: Array<[boolean, string]> = [
  [text["lib/chain/v46-order.ts"].includes('"breakeven"'), "breakeven order type"],
  [text["lib/chain/v46-order.ts"].includes("evaluateV46Order"), "deterministic order evaluator"],
  [text["lib/server/v46-order-store.ts"].includes("rename(temporary, path)"), "atomic temp-file rename"],
  [text["lib/server/v46-order-store.ts"].includes("leaseExpiresAt"), "exclusive keeper leases"],
  [text["lib/server/v46-keeper.ts"].includes("configuredKeeperAccounts"), "keeper failover"],
  [text["lib/server/v46-keeper.ts"].includes("liquidatePositions(uint256[])"), "batch liquidation worker"],
  [text["app/api/v46/orders/route.ts"].includes("verifyV46SignedOrder"), "signed durable-order API"],
  [text["app/api/v46/orders/cancel/route.ts"].includes("verifyV46SignedCancellation"), "signed cancellation API"],
  [text["app/api/v46/keeper/run/route.ts"].includes("V46_KEEPER_SECRET"), "keeper endpoint authentication"],
  [text["components/MarketProvider.tsx"].includes("createV46ProtectionOrder"), "terminal TP/SL/breakeven integration"],
  [text["components/TradePanel.tsx"].includes("V46 DURABLE KEEPER ORDER"), "trade-panel V46 mode"],
  [text["components/WorkspaceTradeTicket.tsx"].includes("V46 KEEPER ORDER"), "workspace-ticket V46 mode"],
  [text["components/V46KeeperConsole.tsx"].includes("Order &amp; Keeper Network"), "keeper operations console"],
];
for (const [passed, label] of checks) assert.ok(passed, `Missing ${label}`);
console.log(`V46 static integration smoke passed (${checks.length}/${checks.length} checks).`);
