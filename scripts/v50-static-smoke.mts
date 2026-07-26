import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [curveTs, curveSol, marketSol, invariantTest, client, consoleUi, packageJson, mathDoc] = await Promise.all([
  readFile(new URL("../lib/fixed-point-battle-curve.ts", import.meta.url), "utf8"),
  readFile(new URL("../contracts/src/BattleCurveMathV24.sol", import.meta.url), "utf8"),
  readFile(new URL("../contracts/src/LaunchpadFactoryV45.sol", import.meta.url), "utf8"),
  readFile(new URL("../contracts/test/LaunchpadFactoryV50Invariant.t.sol", import.meta.url), "utf8"),
  readFile(new URL("../lib/chain/v44-market-client.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/V50InvariantConsole.tsx", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../lib/formal-invariants-v50.ts", import.meta.url), "utf8"),
]);

const checks: Array<[string, boolean]> = [
  ["TypeScript curve rounds protocol fees upward", curveTs.includes("feeWadUp") && curveTs.includes("fee fragmentation")],
  ["Solidity curve rounds protocol fees upward", curveSol.includes("function feeUp") && curveSol.includes("Fee-up rounding")],
  ["V45 entry and close fees use the same upward rule", marketSol.includes("entryFeeWei = _feeUp(notionalWei)") && (marketSol.match(/_min\(_feeUp\(/g) ?? []).length >= 4],
  ["contract exposes machine-readable invariant diagnostics", marketSol.includes("struct InvariantSnapshot") && marketSol.includes("function invariantSnapshot()")],
  ["diagnostics cover all five critical safety domains", marketSol.includes("logicalTokenConservation") && marketSol.includes("tokenCustodyMatches") && marketSol.includes("collateralLedgerMatches") && marketSol.includes("shortInventoryMatches") && marketSol.includes("solvent")],
  ["Foundry handler targets stateful market actions", invariantTest.includes("targetContract(address(handler))") && invariantTest.includes("function targetContracts()") && invariantTest.includes("function spotBuy") && invariantTest.includes("function openLong") && invariantTest.includes("function openShort")],
  ["Foundry invariants bind aggregates to active position records", invariantTest.includes("invariantActivePositionBookMatchesAggregateLedgers") && invariantTest.includes("LONG_DEBT_BOOK")],
  ["browser reference binds active records to aggregate ledgers", mathDoc.includes("assertV50PositionBook") && mathDoc.includes("External ETH conservation")],
  ["chain client decodes the invariant snapshot", client.includes("readV50InvariantSnapshot") && client.includes("Unexpected V50 invariant snapshot")],
  ["operations console surfaces live contract checks", consoleUi.includes("ALL INVARIANTS GREEN") && consoleUi.includes("Guaranteed position liabilities")],
  ["V50 package chain includes adversarial, stateful, static, and syntax checks", packageJson.includes('"test:v50-adversarial"') && packageJson.includes('"test:v50-stateful"') && packageJson.includes('"test:v50"')],
];
for (const [label, passed] of checks) assert(passed, `V50 static check failed: ${label}`);
console.log(`V50 formal-invariant integration passed ${checks.length}/${checks.length} static checks.`);
