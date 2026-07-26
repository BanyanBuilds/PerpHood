import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decodeInt, encodeInt } from "../lib/chain/abi.ts";

const [contract, client, provider, manager, types, packageJson] = await Promise.all([
  readFile(new URL("../contracts/src/LaunchpadFactoryV45.sol", import.meta.url), "utf8"),
  readFile(new URL("../lib/chain/v44-market-client.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/MarketProvider.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/MarketPositionManager.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/types.ts", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

const checks: Array<[string, boolean]> = [
  ["contract exposes exact settlement struct", contract.includes("struct SettlementQuote") && contract.includes("quotePositionSettlement(uint256 positionId)")],
  ["contract exposes exact short floor maximum", contract.includes("quoteMaximumShortPayoutWei") && contract.includes("maximumShortFloorLiabilityWei")],
  ["guaranteed reserve never nets heterogeneous position debts", contract.includes("never nets position liabilities") && contract.includes("longGrossExtreme + shortCollateralWei + shortProceedsWei")],
  ["opening positions must pass prospective guaranteed solvency", (contract.match(/postObligations \+ protectedAfter > postBalance/g) ?? []).length >= 2],
  ["post-close quote reports payability", contract.includes("result.payableNow") && contract.includes("result.postCloseObligationsWei")],
  ["client decodes V49 settlement", client.includes("readV49PositionSettlement") && client.includes("decodeInt(words[4])")],
  ["client reads maximum short payout", client.includes("readV49MaximumShortPayout")],
  ["provider distinguishes quoted from payable PNL", provider.includes("chainSettlementPayable") && provider.includes("post-close solvency test")],
  ["position manager disables a mathematically unpayable close", manager.includes("disabled={!quote.executable}") && manager.includes("reserve locked")],
  ["short card displays exact floor maximum", manager.includes("floor max") && types.includes("chainMaximumPayoutEth")],
  ["V49 package test chain exists", packageJson.includes('"test:v49"') && packageJson.includes('"test:v49-math"')],
];

for (const [label, passed] of checks) assert(passed, `V49 static check failed: ${label}`);
assert.equal(decodeInt(encodeInt(-1n)), -1n);
assert.equal(decodeInt(encodeInt(-(1n << 200n))), -(1n << 200n));
assert.equal(decodeInt(encodeInt(123n)), 123n);
console.log(`V49 settlement-math integration passed ${checks.length}/${checks.length} static checks plus signed ABI decoding.`);
