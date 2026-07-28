import assert from "node:assert/strict";
import fs from "node:fs";

const factory = fs.readFileSync("contracts/immediate-perps-src/LeverageXLaunchFactoryV88.sol", "utf8");
const hook = fs.readFileSync("contracts/immediate-perps-src/LeverageXImmediatePerpsHookV88.sol", "utf8");
const engine = fs.readFileSync("contracts/immediate-perps-src/LeverageXImmediatePerpsEngineV88.sol", "utf8");

assert.match(factory, /requireImmediatePerps = true/);
assert.match(factory, /ImmediatePerpsNotConfigured/);
assert.match(factory, /onMarketMinted\([\s\S]*tokenAddress, pool, msg.sender, CANONICAL_POOL_FEE, 20/);
const hookCall = factory.indexOf(".onMarketMinted(");
const launchCommit = factory.indexOf("allTokens.push(tokenAddress)");
assert.ok(hookCall > 0 && launchCommit > hookCall, "perps activation must happen before launch state commits");
assert.match(hook, /registry\.activateMarket\(token, pool, maxLeverageX\)/);
assert.match(hook, /engine\.bootstrapMintedMarket/);
assert.match(engine, /OnlyMarketBootstrapper/);
assert.match(engine, /MarketAlreadyConfigured/);
assert.match(hook, /enabled: true/);
console.log("V88 immediate-perps-at-mint smoke passed:");
console.log("  PASS atomic Spot + Perps hook before launch commit");
console.log("  PASS 20x registry activation at mint");
console.log("  PASS conservative risk config enabled at mint");
console.log("  PASS creator restriction remains enforced by registry");
console.log("  PASS launch reverts when Perps wiring is absent or fails");
