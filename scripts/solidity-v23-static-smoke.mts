import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../contracts/src/LocalBattlePoolV23.sol", import.meta.url), "utf8");
const tests = await readFile(new URL("../contracts/test/LocalBattlePoolV23.t.sol", import.meta.url), "utf8");
assert.match(source, /contract LocalBattlePoolV23/);
assert.match(source, /LiquidationBatch/);
assert.match(source, /commitAuthorizedSingleAccountFrame/);
assert.match(source, /SessionNonceMismatch/);
assert.match(source, /SessionActionNotAllowed/);
assert.match(source, /SessionLimitExceeded/);
assert.match(source, /consumedIntent/);
assert.match(source, /custodySolvent/);
assert.match(tests, /testAllUserActionsAreSessionScoped/);
assert.match(tests, /testSequencerCanCommitLiquidationBatchWithoutUserDelta/);
assert.match(tests, /testReplayNonceReverts/);
assert.match(tests, /testReauthorizationPreservesConsumedNonce/);
console.log("V23 Solidity full-action authorization and liquidation-batch static safety smoke passed.");
