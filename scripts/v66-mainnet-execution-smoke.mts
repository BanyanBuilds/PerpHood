import { readFileSync } from "node:fs";

const common = readFileSync("scripts/v65-mainnet-common.mts", "utf8");
const preflight = readFileSync("scripts/v65-first-token-preflight.mts", "utf8");
const mainnetPreflight = readFileSync("scripts/v65-mainnet-preflight.mts", "utf8");
const launch = readFileSync("scripts/v65-create-first-token.mts", "utf8");
const configure = readFileSync("scripts/v65-configure-canary.mts", "utf8");
const contract = readFileSync("contracts/src/LeverageXLaunchFactoryV65.sol", "utf8");
const env = readFileSync(".env.mainnet.example", "utf8");
const gate = readFileSync("scripts/v66-mainnet-execution-gate.mts", "utf8");
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string>; version?: string };

const checks: Array<[string, boolean]> = [
  ["release version preserves V66+ controls", Number(pkg.version?.split(".")[0] ?? 0) >= 66],
  ["total budget constant is 0.001 ETH", common.includes("V65_MIN_TOTAL_LAUNCH_BUDGET_WEI = 1_000_000_000_000_000n")],
  ["creator buy minimum remains separate and tiny", common.includes("V65_MIN_CREATOR_GENESIS_BUY_WEI = 1_000_000_000_000n")],
  ["CLI budget estimates live gas", common.includes('rpcRequest<string>(input.rpc, "eth_estimateGas"')],
  ["CLI budget reserves a conservative gas limit", common.includes("gasEstimate * 130n / 100n + 20_000n")],
  ["mainnet preflight verifies WETH decimals", mainnetPreflight.includes('decimals()(uint8)') && mainnetPreflight.includes("wethDecimals !== 18")],
  ["mainnet preflight verifies canonical fee spacing", mainnetPreflight.includes('feeAmountTickSpacing(uint24)(int24)') && mainnetPreflight.includes("feeSpacing !== 200")],
  ["mainnet preflight verifies periphery immutable wiring", mainnetPreflight.includes('factory()(address)') && mainnetPreflight.includes('WETH9()(address)') && mainnetPreflight.includes("immutable Uniswap factory/WETH wiring")],
  ["creator buy is total budget minus max gas", common.includes("input.totalBudgetWei - maximumGasCostWei")],
  ["preflight uses total-budget naming", preflight.includes("V65_FIRST_TOKEN_TOTAL_BUDGET_WEI")],
  ["legacy initial-buy variable is deprecated", preflight.includes("is deprecated and is being treated as the total launch budget")],
  ["preflight verifies canary creator", preflight.includes('activeCanaryCreator()(address)')],
  ["preflight verifies creator-buy cap", preflight.includes('maxInitialBuyWei()(uint256)')],
  ["launch uses calculated creator buy", launch.includes('"--value",\n    preflight.creatorBuyWei')],
  ["launch pins gas limit", launch.includes('"--gas-limit",\n    preflight.gasLimit')],
  ["launch pins maximum gas price", launch.includes('"--gas-price",\n    preflight.gasPriceWei')],
  ["actual launch spend is reconciled", launch.includes("actualTotalSpendWei") && launch.includes("actualGasCostWei")],
  ["launch rejects budget overflow", launch.includes("exceeded the signed total budget")],
  ["canary cap wording says creator buy", configure.includes("creator-buy transaction value")],
  ["contract documents off-chain inclusive-gas rule", contract.includes("enforced by the launch clients and operator scripts")],
  ["minimal mainnet env template exists", env.includes("V65_FIRST_TOKEN_TOTAL_BUDGET_WEI=1000000000000000")],
  ["gate never broadcasts", gate.includes("transactionBroadcast: false")],
  ["gate command is wired", Boolean(pkg.scripts?.["gate:v66"] && pkg.scripts?.["gate:v66:strict"])],
];
for (const [label, passed] of checks) {
  if (!passed) throw new Error(`V66 mainnet execution control failed: ${label}`);
  console.log(`✓ ${label}`);
}
console.log(`\nV66 mainnet execution controls: ${checks.length}/${checks.length} checks passed.`);
