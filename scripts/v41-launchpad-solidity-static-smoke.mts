import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../contracts/src/LaunchpadFactoryV41.sol", import.meta.url), "utf8");
const test = await readFile(new URL("../contracts/test/LaunchpadFactoryV41.t.sol", import.meta.url), "utf8");
const checks: Array<[string, boolean]> = [
  ["one-billion fixed supply", source.includes("1_000_000_000 ether")],
  ["creator stored immutably", source.includes("address public immutable creator")],
  ["creator perps forbidden", source.includes("CreatorPerpsForbidden") && source.includes("assertPerpsAllowed")],
  ["migration state machine", source.includes("enum Phase { Bonding, Migrating, Migrated, Paused }")],
  ["zero bad debt gate", source.includes("badDebtWei != 0")],
  ["liquidation idle gate", source.includes("activeLiquidation")],
  ["trader gate", source.includes("minimumIndependentTraders")],
  ["gas-inclusive policy documented", source.includes("TOTAL spend inclusive of gas")],
  ["token address preserved test", test.includes("TOKEN_CHANGED")],
  ["creator restriction test", test.includes("testCreatorIsPermanentlyBlockedFromPerps")],
];
for (const [label, passed] of checks) assert.equal(passed, true, label);
console.log(`V41 launchpad Solidity static smoke passed (${checks.length}/${checks.length}).`);
