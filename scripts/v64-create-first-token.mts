import { decodeUint, decodeWords, stripHex, type Hex } from "../lib/chain/abi.ts";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eventTopic } from "../lib/chain/keccak.ts";
import { requireRpc, run } from "./v59-mainnet-common.mts";
import {
  V64_CREATOR,
  assertSigner,
  creatorWallet,
  firstMarketFromFactory,
  launchEstimate,
  parseTransactionHash,
  waitForReceipt,
  writeDeploymentJson,
} from "./v64-first-launch-common.mts";

const CONFIRMATION = "LAUNCH_FIRST_LEVERAGE_X_MAINNET_TOKEN";
if (process.env.V64_FIRST_TOKEN_LAUNCH_CONFIRM !== CONFIRMATION) {
  throw new Error(`First-token launch is locked. Set V64_FIRST_TOKEN_LAUNCH_CONFIRM=${CONFIRMATION} only for the deliberate launch run.`);
}

console.log("Leverage X V64 — first real mainnet token launch\n");
const estimate = await launchEstimate();
if (!estimate.budget.funded) throw new Error("Creator wallet does not cover the buffered V64 launch estimate.");
const wallet = creatorWallet();
assertSigner(wallet, V64_CREATOR, "Creator");
const rpc = requireRpc();
const genesisBuyWei = BigInt(estimate.budget.genesisBuyWei);
const gasLimit = BigInt(estimate.budget.gasLimit);
const maxGasPriceWei = BigInt(estimate.budget.maxGasPriceWei);

console.log(`Creator: ${V64_CREATOR}`);
console.log(`Factory: ${estimate.factory}`);
console.log(`Token: ${estimate.metadata.name} ($${estimate.metadata.symbol})`);
console.log("Dry-running the exact createMarket transaction…");
run("cast", [
  "call",
  estimate.factory,
  "createMarket(string,string,string,bytes32,uint256)(address,address)",
  estimate.metadata.name,
  estimate.metadata.symbol,
  estimate.metadata.metadataUri,
  estimate.metadata.metadataHash,
  "0",
  "--value", genesisBuyWei.toString(),
  "--from", V64_CREATOR,
  "--rpc-url", rpc,
], { redact: [rpc] });

console.log("Dry run passed. Broadcasting the creator launch transaction…");
const output = run("cast", [
  "send",
  estimate.factory,
  "createMarket(string,string,string,bytes32,uint256)",
  estimate.metadata.name,
  estimate.metadata.symbol,
  estimate.metadata.metadataUri,
  estimate.metadata.metadataHash,
  "0",
  "--value", genesisBuyWei.toString(),
  "--gas-limit", gasLimit.toString(),
  "--gas-price", maxGasPriceWei.toString(),
  "--rpc-url", rpc,
  ...wallet.args,
  "--json",
], { redact: [rpc, ...wallet.redactions] });
const transactionHash = parseTransactionHash(output);
const receipt = await waitForReceipt(transactionHash);
if (receipt.status !== "0x1") throw new Error(`Launch transaction reverted: ${transactionHash}`);

const marketCreatedTopic = eventTopic("MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)").toLowerCase();
const marketCreated = (receipt.logs as Array<{ address: string; topics: Hex[]; data: Hex }> | undefined)?.find((log) =>
  log.address.toLowerCase() === estimate.factory && log.topics[0]?.toLowerCase() === marketCreatedTopic,
);
if (!marketCreated) throw new Error("The confirmed launch receipt did not contain the factory MarketCreated event.");
const market = `0x${stripHex(marketCreated.topics[1]).slice(-40)}`.toLowerCase();
const token = `0x${stripHex(marketCreated.topics[2]).slice(-40)}`.toLowerCase();
const creator = `0x${stripHex(marketCreated.topics[3]).slice(-40)}`.toLowerCase();
if (creator !== V64_CREATOR) throw new Error(`Receipt creator ${creator} does not match ${V64_CREATOR}.`);
const words = decodeWords(marketCreated.data);
const state = firstMarketFromFactory(estimate.factory);
if (state.market !== market || state.token !== token || state.creator !== V64_CREATOR || !state.paused || state.tradeCount !== 1n) {
  throw new Error("Post-launch factory/market state does not match the required one-market paused canary posture.");
}

const result = {
  version: "V64",
  launchedAt: new Date().toISOString(),
  transactionHash,
  blockNumber: Number(BigInt(receipt.blockNumber ?? "0x0")),
  blockHash: receipt.blockHash ?? null,
  factory: estimate.factory,
  creator,
  market,
  token,
  identity: {
    name: estimate.metadata.name,
    symbol: estimate.metadata.symbol,
    metadataUri: estimate.metadata.metadataUri,
    metadataHash: estimate.metadata.metadataHash,
    image: estimate.metadata.metadata.image,
  },
  economics: {
    selectedTotalBudgetWei: estimate.budget.totalBudgetWei,
    creatorGenesisBuyWei: decodeUint(words[0] ?? "0").toString(),
    creatorTokensOutWad: decodeUint(words[1] ?? "0").toString(),
    launchMarketCapEthWad: decodeUint(words[2] ?? "0").toString(),
    protocolMigrationTargetUsdWad: decodeUint(words[3] ?? "0").toString(),
  },
  safety: { marketPaused: state.paused, tradeCount: state.tradeCount.toString(), publicLaunchesEnabled: false, perpsEnabled: false },
  explorer: {
    transaction: `https://robinhoodchain.blockscout.com/tx/${transactionHash}`,
    token: `https://robinhoodchain.blockscout.com/address/${token}`,
    market: `https://robinhoodchain.blockscout.com/address/${market}`,
  },
};
writeDeploymentJson("v64-first-token-launch.json", result);
writeFileSync(resolve("deployments", "v64-vercel-launch.env"), [
  `V64_FIRST_LAUNCH_TX_HASH=${transactionHash}`,
  `V62_FIRST_LAUNCH_TX_HASH=${transactionHash}`,
  `V60_CANARY_MARKET_ADDRESS=${market}`,
  `NEXT_PUBLIC_LEVERAGEX_FIRST_TOKEN_ADDRESS=${token}`,
  `NEXT_PUBLIC_LEVERAGEX_FIRST_MARKET_ADDRESS=${market}`,
  "",
].join("\n"));
console.log(JSON.stringify(result, null, 2));
console.log("\nFIRST TOKEN CONFIRMED — market is still paused. Do not retry this command.");
console.log("Next: set V62_FIRST_LAUNCH_TX_HASH to this transaction hash and run npm run chain:v64:first-launch-proof.");
