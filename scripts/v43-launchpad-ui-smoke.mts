import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const [launchPanel, provider, sandbox, route, styles, types, health, config, client] = await Promise.all([
  read("components/LaunchPanel.tsx"),
  read("components/MarketProvider.tsx"),
  read("components/LaunchpadChainSandbox.tsx"),
  read("app/api/launchpad/sandbox/route.ts"),
  read("app/globals.css"),
  read("lib/types.ts"),
  read("app/api/launchpad/health/route.ts"),
  read("app/api/launchpad/config/route.ts"),
  read("lib/chain/launchpad-v43-client.ts"),
]);

const checks: Array<[string, boolean]> = [
  ["launcher submits V43 market transaction", launchPanel.includes("launchV43Market") && launchPanel.includes("NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS")],
  ["launcher records V43 chain mode", launchPanel.includes('chainDeploymentMode: receipt ? "anvil-v43"')],
  ["provider preserves V43 external-balance accounting", provider.includes('input.chainDeploymentMode !== "anvil-v43"')],
  ["sandbox renders live contract state", sandbox.includes("Live unified state") && sandbox.includes("demoState.badDebtEth")],
  ["sandbox API reads unified exposure", route.includes("openInterestLongWei()") && route.includes("openInterestShortWei()")],
  ["sandbox API reads safe capacities", route.includes("longNotionalCapacityWei(uint16)") && route.includes("shortNotionalCapacityWei()")],
  ["V43 chain state styles exist", styles.includes(".v43-chain-state")],
  ["V43 chain mode type exists", types.includes('"anvil-v43"')],
  ["health reports full settlement", health.includes("fullPerpsSettlement: true")],
  ["config reports full settlement", config.includes("fullPerpsSettlement: true")],
  ["V43 client encodes factory creation", client.includes("encodeV43CreateMarket") && client.includes("parseV43MarketCreated")],
];
for (const [label, passed] of checks) assert.equal(passed, true, label);
console.log(`V43 launchpad UI smoke passed (${checks.length}/${checks.length}).`);
