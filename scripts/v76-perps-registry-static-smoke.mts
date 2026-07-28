import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "contracts/perps-registry-src/LeverageXPerpsMarketRegistryV76.sol"), "utf8");
const test = fs.readFileSync(path.join(root, "contracts/test-perps-registry/LeverageXPerpsMarketRegistryV76.t.sol"), "utf8");
const required = [
  "MAX_PROTOCOL_LEVERAGE_X = 20",
  "activateMarket(address token, address pool, uint16 maxLeverageX)",
  "launchToken.launchFactory() != launchFactory",
  "getPool(token, wrappedNative, fee) != pool",
  "poolLiquidity == 0 || sqrtPriceX96 == 0 || !unlocked",
  "_permanentlyBlocked[token][creator] = true",
  "function isTradable",
  "function requireTradable",
  "permanentlyBlockProvenLinkedWallet",
];
for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`Missing V76 enforcement marker: ${marker}`);
}
for (const marker of ["testActivationCreatesTradableMarketAndBlocksCreator", "testRejectsNonLaunchFactoryToken", "testPausePreservesPermanentCreatorBlock"]) {
  if (!test.includes(marker)) throw new Error(`Missing V76 test: ${marker}`);
}
console.log("PASS V76: on-chain perps registry source and enforcement tests are present.");
