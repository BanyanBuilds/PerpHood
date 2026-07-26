import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../contracts/src/LocalBattlePoolV21.sol", import.meta.url), "utf8");
const tests = await readFile(new URL("../contracts/test/LocalBattlePoolV21.t.sol", import.meta.url), "utf8");
assert.equal((source.match(/{/g) ?? []).length, (source.match(/}/g) ?? []).length, "Solidity braces must balance");
assert.match(source, /contract LocalBattlePoolV21/);
assert.match(source, /function commitFrame\(/);
assert.match(source, /function withdrawWeth\(/);
assert.match(source, /function withdrawToken\(/);
assert.match(source, /function custodySolvent\(/);
assert.match(tests, /testSpotBuyFrameMovesBothAssetsAgainstOnePool/);
assert.doesNotMatch(source, /tx\.origin/);
assert.doesNotMatch(source, /delegatecall/);
assert.doesNotMatch(source, /selfdestruct/);
console.log("V21 Solidity source static safety smoke test passed.");
