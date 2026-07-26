import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../contracts/src/LaunchpadFactoryV43.sol", import.meta.url), "utf8");
const test = await readFile(new URL("../contracts/test/LaunchpadFactoryV43.t.sol", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string; scripts: Record<string, string> };

for (const required of [
  "contract LaunchpadMarketV43",
  "contract LaunchpadFactoryV43",
  "function buy()",
  "function sell(uint256 tokenAmountWad)",
  "function openLong(",
  "function openShort(",
  "function closePosition(",
  "function liquidate(",
  "function liquidatePositions(",
  "function positionObligationsWei()",
  "function freeWethWei()",
  "function maxCurveSoldWithShortReservationWad()",
  "function longNotionalCapacityWei(",
  "function shortNotionalCapacityWei()",
  "function maxSpotSellTokensWad()",
  "function assertInvariants()",
  "event StateCommitted(",
  "event PositionOpened(",
  "event PositionClosed(",
  "perpsRestricted[creator_] = true",
  "activePositionCount != 0 || badDebtWei != 0",
]) assert.ok(source.includes(required), `missing V43 contract requirement: ${required}`);

assert.ok(source.includes("curveSoldTokenWad = quote.soldAfterWad"), "curve state must be authoritative");
assert.ok(source.includes("_sweepLiquidations(MAX_AUTO_LIQUIDATIONS)"), "spot/perp actions must share the bounded liquidation sweep");
assert.ok(source.match(/soldAfterWad > maxCurveSoldWithShortReservationWad\(\)/g)?.length === 2, "spot and long buys must preserve short repayment headroom");
assert.ok(source.includes("curveTokenReserveWad()\n            + perpTokenReserveWad"), "logical token conservation must cover every inventory bucket");
assert.ok(!source.includes("mapping(address => uint256) public creatorRewards"), "creator reward privilege must not exist");
assert.ok(test.includes("testSpotLongAndShortMutateOneOrderedBattlePool"), "mixed-action contract test missing");
assert.ok(test.includes("testSpotBuyCanTriggerRealShortLiquidationBuyPressure"), "liquidation pressure test missing");
assert.ok(test.includes("testOpenShortReservesExactCurveHeadroomForRepayment"), "short repayment headroom test missing");
assert.ok(Number(packageJson.version.split(".")[0]) >= 43, "V43 contract regression must remain included in later builds");
assert.ok(packageJson.scripts["test:v43"], "V43 regression command missing");

let depth = 0;
for (const character of source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")) {
  if (character === "{") depth += 1;
  else if (character === "}") depth -= 1;
  assert.ok(depth >= 0, "contract braces close before they open");
}
assert.equal(depth, 0, "contract braces are unbalanced");

console.log("V43 unified BattlePool contract/static smoke: PASS");
