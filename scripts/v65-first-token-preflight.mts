import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_DEPLOYER,
  formatEth,
  hexToBigInt,
  normalizeAddress,
  requireRpc,
  rpcRequest,
  run,
} from "./v59-mainnet-common.mts";
import {
  estimateV65CliLaunchBudget,
  readV65Manifest,
  V65_DEFAULT_FIRST_TOKEN_TOTAL_BUDGET_WEI,
  V65_NETWORK,
} from "./v65-mainnet-common.mts";

const rpc = requireRpc();
const manifest = readV65Manifest();
const factory = manifest.deployment.factoryAddress as string;
const creator = normalizeAddress(
  process.env.V65_CANARY_CREATOR_ADDRESS,
  "V65_CANARY_CREATOR_ADDRESS",
  DEFAULT_DEPLOYER,
);
const name = (process.env.V65_FIRST_TOKEN_NAME ?? "").trim();
const symbol = (process.env.V65_FIRST_TOKEN_SYMBOL ?? "").trim().toUpperCase();
const metadataUri = (process.env.V65_FIRST_TOKEN_METADATA_URI ?? "").trim();
const metadataHash = (process.env.V65_FIRST_TOKEN_METADATA_HASH ?? "").trim();
const legacyInitialBuy = process.env.V65_FIRST_TOKEN_INITIAL_BUY_WEI?.trim();
const totalBudgetWei = BigInt(
  process.env.V65_FIRST_TOKEN_TOTAL_BUDGET_WEI
    ?? legacyInitialBuy
    ?? V65_DEFAULT_FIRST_TOKEN_TOTAL_BUDGET_WEI.toString(),
);

if (legacyInitialBuy && !process.env.V65_FIRST_TOKEN_TOTAL_BUDGET_WEI) {
  console.warn("V65_FIRST_TOKEN_INITIAL_BUY_WEI is deprecated and is being treated as the total launch budget. Rename it to V65_FIRST_TOKEN_TOTAL_BUDGET_WEI.");
}
if (
  name.length < 2
  || name.length > 64
  || symbol.length < 1
  || symbol.length > 12
  || !/^https:\/\//.test(metadataUri)
  || !/^0x[0-9a-fA-F]{64}$/.test(metadataHash)
) {
  throw new Error("Set a valid V65 first-token name, symbol, HTTPS metadata URI, and 32-byte metadata hash.");
}

const chainId = Number(hexToBigInt(await rpcRequest<string>(rpc, "eth_chainId")));
if (chainId !== V65_NETWORK.chainId) throw new Error(`Wrong chain ${chainId}; expected ${V65_NETWORK.chainId}.`);
const code = await rpcRequest<string>(rpc, "eth_getCode", [factory, "latest"]);
if (code === "0x") throw new Error("Factory has no bytecode.");

const call = (signature: string, ...args: string[]) => run(
  "cast",
  ["call", factory, signature, ...args, "--rpc-url", rpc],
  { redact: [rpc] },
).toLowerCase();
if (
  Number(call("launchMode()(uint8)")) !== 1
  || call("launchCreationPaused()(bool)") !== "false"
  || call("activeCanaryCreator()(address)") !== creator
) {
  throw new Error("Factory is not in the one-creator canary state.");
}

const budget = await estimateV65CliLaunchBudget({
  rpc,
  factory,
  creator,
  name,
  symbol,
  metadataUri,
  metadataHash,
  totalBudgetWei,
});
const maxCreatorBuyWei = BigInt(call("maxInitialBuyWei()(uint256)"));
if (budget.creatorBuyWei > maxCreatorBuyWei) {
  throw new Error(`Calculated creator buy ${budget.creatorBuyWei} exceeds the canary contract cap ${maxCreatorBuyWei}.`);
}
const balanceWei = hexToBigInt(await rpcRequest<string>(rpc, "eth_getBalance", [creator, "latest"]));
if (balanceWei < totalBudgetWei) {
  throw new Error(`Creator wallet needs at least ${formatEth(totalBudgetWei)} ETH for the selected total launch budget.`);
}

const report = {
  version: "V66_EXECUTION_GATE_FOR_V65_CONTRACT",
  generatedAt: new Date().toISOString(),
  creator,
  factory,
  name,
  symbol,
  metadataUri,
  metadataHash,
  totalBudgetWei: budget.totalBudgetWei.toString(),
  totalBudgetEth: formatEth(budget.totalBudgetWei, 18),
  creatorBuyWei: budget.creatorBuyWei.toString(),
  creatorBuyEth: formatEth(budget.creatorBuyWei, 18),
  gasEstimate: budget.gasEstimate.toString(),
  gasLimit: budget.gasLimit.toString(),
  gasPriceWei: budget.gasPriceWei.toString(),
  maximumGasCostWei: budget.maximumGasCostWei.toString(),
  maximumGasCostEth: formatEth(budget.maximumGasCostWei, 18),
  creatorBalanceWei: balanceWei.toString(),
  creatorBalanceEth: formatEth(balanceWei, 18),
  metadataFingerprint: createHash("sha256")
    .update(`${name}|${symbol}|${metadataUri}|${metadataHash}`)
    .digest("hex"),
  budgetPolicy: "The selected amount is the total transaction ceiling. The creator buy is the remainder after reserving the live maximum gas cost.",
  broadcast: false,
};
mkdirSync(resolve("deployments"), { recursive: true });
writeFileSync(resolve("deployments", "v65-first-token-preflight.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`V65 first-token preflight passed. Total budget ceiling: ${report.totalBudgetEth} ETH; creator buy: ${report.creatorBuyEth} ETH.`);
console.log("No transaction was signed or sent. Report: deployments/v65-first-token-preflight.json");
