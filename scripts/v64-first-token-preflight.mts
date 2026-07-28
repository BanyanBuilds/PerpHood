import { formatEth, hexToBigInt, requireRpc, rpcRequest } from "./v59-mainnet-common.mts";
import { launchEstimate, writeDeploymentJson } from "./v64-first-launch-common.mts";

console.log("Leverage X V64 — first real token preflight (NO SIGNING / NO BROADCAST)\n");
const report = await launchEstimate();
const chainId = Number(hexToBigInt(await rpcRequest<string>(requireRpc(), "eth_chainId")));
if (chainId !== 4_663) throw new Error(`Wrong network ${chainId}; expected Robinhood Chain mainnet 4663.`);

console.log(`Factory: ${report.factory}`);
console.log(`Creator: ${report.creator}`);
console.log(`Token: ${report.metadata.name} ($${report.metadata.symbol})`);
console.log(`Metadata: ${report.metadata.metadataUri}`);
console.log(`Metadata SHA-256: ${report.metadata.metadataHash}`);
console.log(`Selected total spend: ${formatEth(BigInt(report.budget.totalBudgetWei))} ETH`);
console.log(`Planned creator buy: ${formatEth(BigInt(report.budget.genesisBuyWei))} ETH`);
console.log(`Estimated network fee: ${formatEth(BigInt(report.budget.estimatedNetworkFeeWei))} ETH`);
console.log(`Buffered required balance: ${formatEth(BigInt(report.budget.requiredBalanceWei))} ETH`);
console.log(`Creator balance: ${formatEth(BigInt(report.budget.creatorBalanceWei))} ETH`);

if (!report.budget.funded) {
  const shortfall = BigInt(report.budget.requiredBalanceWei) - BigInt(report.budget.creatorBalanceWei);
  console.log(`\nNOT FUNDED — add approximately ${formatEth(shortfall)} ETH plus a small wallet cushion, then rerun.`);
} else {
  console.log("\nFUNDED — creator balance covers the buffered launch transaction estimate.");
}

writeDeploymentJson("v64-first-token-preflight.json", report);
console.log("Report: deployments/v64-first-token-preflight.json");
console.log("No transaction was signed or broadcast.");
