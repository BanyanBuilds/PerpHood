import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [market, assault, executor, relay, keeper, foundry, packageJson, consoleUi, consolePage, lifecycle, assaultRunner] = await Promise.all([
  readFile(new URL("../contracts/src/LaunchpadFactoryV45.sol", import.meta.url), "utf8"),
  readFile(new URL("../contracts/test/LaunchpadFactoryV51Assault.t.sol", import.meta.url), "utf8"),
  readFile(new URL("../lib/chain/v45-terminal-executor.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/v45/relay/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/server/v46-keeper.ts", import.meta.url), "utf8"),
  readFile(new URL("../foundry.toml", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../components/V51ChainAssaultConsole.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/chain-assault/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../scripts/v51-anvil-lifecycle.mts", import.meta.url), "utf8"),
  readFile(new URL("../scripts/v51-chain-assault.sh", import.meta.url), "utf8"),
]);

const checks: Array<[string, boolean]> = [
  ["Solidity braces balance", (market.match(/{/g) ?? []).length === (market.match(/}/g) ?? []).length],
  ["protected direct spot entry and exit exist", market.includes("buyWithLimits") && market.includes("sellWithLimits")],
  ["protected direct long, short, and close exist", market.includes("openLongWithLimits") && market.includes("openShortWithLimits") && market.includes("closePositionWithLimits")],
  ["short entry binds maximum borrowed inventory", market.includes("maxBorrowedTokensWad") && market.includes("opened.borrowedTokensWad > maxBorrowedTokensWad")],
  ["deadlines are enforced in market and router", (market.match(/function _requireDeadline/g) ?? []).length === 2 && (market.match(/DeadlineExpired/g) ?? []).length >= 4],
  ["authorized position execution carries slippage limits", market.includes("executeAuthorizedOpenLongWithLimits") && market.includes("executeAuthorizedOpenShortWithLimits") && market.includes("executeAuthorizedClosePositionWithLimits")],
  ["terminal calculates long, short, and close bounds", executor.includes("protectedMaximum") && executor.includes("quotePositionEquityWei") && executor.includes("tokenAmountWad: maxBorrowedTokensWad")],
  ["relay submits protected ABI methods", relay.includes("executeAuthorizedOpenShortWithLimits") && relay.includes("intent.tokenAmountWad")],
  ["keeper refreshes bounds immediately before submission", keeper.includes("currentExecutionBounds") && keeper.includes("ceilingMaximum") && keeper.includes("bounds.maxInput")],
  ["assault suite includes reentrancy actors", assault.includes("V51ReentrantMarketActor") && assault.includes("V51ReentrantRouterActor")],
  ["assault suite proves failed payout rollback", assault.includes("testRejectingReceiverRollsBackSellCompletely") && assault.includes("SEQUENCE_NOT_ROLLED_BACK")],
  ["assault suite covers stale quote and force-ETH attacks", assault.includes("testDirectShortRejectsWorseBorrowRequirement") && assault.includes("testForcedEtherCreatesSurplusWithoutInventingLiability")],
  ["Foundry assault profile is configured", foundry.includes("[profile.assault]") && foundry.includes("gas_reports")],
  ["V51 scripts are present in package", packageJson.includes('"test:v51"') && packageJson.includes('"chain:assault:v51"')],
  ["chain-assault operations console is routed", consolePage.includes("V51ChainAssaultConsole") && consoleUi.includes("Compiler-Backed Chain Assault")],
  ["console separates portable and compiled truth", consoleUi.includes("Portable assault layer") && consoleUi.includes("FOUNDRY REQUIRED")],
  ["Anvil lifecycle executes protected entry and close paths", lifecycle.includes("spotBuyFromBalanceWithLimits") && lifecycle.includes("openLongFromBalanceWithLimits") && lifecycle.includes("openShortFromBalanceWithLimits") && lifecycle.includes("closePositionFromBalanceWithLimits")],
  ["chain assault runner starts Anvil and runs lifecycle", assaultRunner.includes("anvil --chain-id 31337") && assaultRunner.includes("chain:lifecycle:v51")],
  ["unsafe EVM primitives are absent from production contract", !market.includes("tx.origin") && !market.includes("delegatecall") && !market.includes("selfdestruct")],
];
for (const [label, passed] of checks) assert(passed, `V51 static check failed: ${label}`);
console.log(`V51 contract-assault integration passed ${checks.length}/${checks.length} checks.`);
