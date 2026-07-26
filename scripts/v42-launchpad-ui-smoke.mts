import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");
const [launchPanel, provider, sandbox, route, styles, types, health, config, admin] = await Promise.all([
  read("components/LaunchPanel.tsx"),
  read("components/MarketProvider.tsx"),
  read("components/LaunchpadChainSandbox.tsx"),
  read("app/api/launchpad/sandbox/route.ts"),
  read("app/globals.css"),
  read("lib/types.ts"),
  read("app/api/launchpad/health/route.ts"),
  read("app/api/launchpad/config/route.ts"),
  read("app/admin/launchpad/sandbox/page.tsx"),
]);

const checks: Array<[string, boolean]> = [
  ["launcher offers browser and Anvil modes", launchPanel.includes('"browser" | "anvil"') && launchPanel.includes("Anvil contract")],
  ["launcher submits active local-chain transaction", launchPanel.includes("launchV42Market") || launchPanel.includes("launchV43Market")],
  ["launcher records receipt addresses", launchPanel.includes("chainMarketAddress") && launchPanel.includes("chainTokenAddress")],
  ["provider keeps chain metadata", provider.includes("chainDeploymentMode") && provider.includes("launchTransactionHash")],
  ["Anvil launches do not double-charge simulator balance", provider.includes('input.chainDeploymentMode !== "anvil-v42"') && provider.includes('input.chainDeploymentMode !== "anvil-v43"')],
  ["sandbox dashboard exists", sandbox.includes("Launch. Trade. Break it. Reset it.")],
  ["sandbox status API probes chain", route.includes("eth_chainId") && route.includes("eth_accounts")],
  ["sandbox admin route exists", admin.includes("LaunchpadChainSandbox")],
  ["chain receipt types exist", types.includes("chainFactoryAddress") && types.includes("launchTransactionHash")],
  ["health route reports executable curve", health.includes("executableSpotCurve")],
  ["config route reports factory", config.includes("factoryAddress")],
  ["V42 responsive styles exist", styles.includes(".v42-sandbox-page") && styles.includes(".v42-launch-mode")],
];
for (const [label, passed] of checks) assert.equal(passed, true, label);
console.log(`V42 launchpad UI smoke passed (${checks.length}/${checks.length}).`);
