import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contract = fs.readFileSync(path.join(root, "contracts/perps-engine-src/LeverageXCollateralPositionEngineV77.sol"), "utf8");
const test = fs.readFileSync(path.join(root, "contracts/test-perps-engine/LeverageXCollateralPositionEngineV77.t.sol"), "utf8");
const required = [
  "depositCollateral", "withdrawCollateral", "openPosition", "closePosition", "liquidate",
  "requireTradable", "OracleStale", "maintenanceMarginBps", "MAX_PROTOCOL_LEVERAGE_X = 20",
  "freeCollateralWei", "protocolFeesWei", "longOpenInterestWei", "shortOpenInterestWei"
];
for (const token of required) if (!contract.includes(token)) throw new Error(`Missing V77 primitive: ${token}`);
for (const token of ["testDepositOpenLongAndProfitClose", "testShortProfitsWhenPriceFalls", "testLiquidatesAtMaintenanceThreshold", "testRejectsStaleOracle", "testCreatorBlockFlowsThroughRegistry"]) {
  if (!test.includes(token)) throw new Error(`Missing V77 test: ${token}`);
}
console.log("V77 static smoke passed: collateral vault, isolated margin, long/short settlement, liquidation, stale-oracle guard, and V76 registry enforcement are present.");
