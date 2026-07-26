import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const source = await readFile(new URL("../contracts/src/LaunchpadFactoryV45.sol", import.meta.url), "utf8");
for (const required of [
  "contract LaunchpadFactoryV45", "contract LaunchpadMarketV45", "contract BattleTokenV45",
  "function deposit()", "function withdraw(uint256 amountWei)", "function depositToken", "function withdrawToken",
  "function authorizeSession", "function revokeSession", "function executeAuthorizedSpotBuy", "function executeAuthorizedSpotSell",
  "function executeAuthorizedOpenLong", "function executeAuthorizedOpenShort", "function executeAuthorizedClosePosition",
  "onlySequencer", "consumedIntent", "SessionNonceMismatch", "SessionLimitExceeded", "CustodyInsolvent",
  "totalWethLiabilityWei", "totalTokenLiabilityWad", "ExecutionMode", "CloseOnly", "Paused",
  "buyForAccount", "sellForAccount", "openLongFor", "openShortFor", "closePositionFor",
]) assert.ok(source.includes(required), `V45 Solidity is missing ${required}`);
assert.ok(!source.includes("tx.origin"), "V45 must never authorize with tx.origin");
assert.ok(source.includes("creator") && source.includes("perpsRestricted"), "creator perps restriction must remain in the market");
assert.ok(source.includes("if (isMarket[msg.sender]) return;"), "market payouts must not be double-credited as deposits");
let depth = 0;
for (const character of source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")) {
  if (character === "{") depth += 1;
  if (character === "}") depth -= 1;
  assert.ok(depth >= 0, "V45 Solidity braces close early");
}
assert.equal(depth, 0, "V45 Solidity braces are unbalanced");
console.log("V45 authorized-account contract static smoke: PASS");
