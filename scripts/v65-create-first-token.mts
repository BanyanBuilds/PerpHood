import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeAddress, decodeUint, decodeWords, stripHex } from "../lib/chain/abi.ts";
import {
  DEFAULT_DEPLOYER,
  formatEth,
  normalizeAddress,
  requireRpc,
  run,
} from "./v59-mainnet-common.mts";
import { readV65Manifest, v65WalletArgs, V65_DEX } from "./v65-mainnet-common.mts";

const CONFIRM = "LAUNCH_FIRST_V65_GMGN_CANARY";
const LAUNCH_TOPIC = "0x6a01ec9b9da2fbadef86c83182bf823e3a51fd7ac745df9bbc27bc9154171751";
if (process.env.V65_FIRST_TOKEN_LAUNCH_CONFIRM !== CONFIRM) {
  throw new Error(`Locked. Set V65_FIRST_TOKEN_LAUNCH_CONFIRM=${CONFIRM}.`);
}
run(
  "node",
  ["--env-file-if-exists=.env.mainnet.local", "--experimental-strip-types", "scripts/v65-first-token-preflight.mts"],
  { capture: false },
);

const rpc = requireRpc();
const wallet = v65WalletArgs();
const manifest = readV65Manifest();
const factory = manifest.deployment.factoryAddress as string;
const creator = normalizeAddress(
  process.env.V65_CANARY_CREATOR_ADDRESS,
  "V65_CANARY_CREATOR_ADDRESS",
  DEFAULT_DEPLOYER,
);
const signer = run("cast", ["wallet", "address", ...wallet.args], { redact: wallet.redactions }).toLowerCase();
if (signer !== creator) throw new Error(`Signer ${signer} is not canary creator ${creator}.`);

const name = process.env.V65_FIRST_TOKEN_NAME!;
const symbol = process.env.V65_FIRST_TOKEN_SYMBOL!;
const uri = process.env.V65_FIRST_TOKEN_METADATA_URI!;
const hash = process.env.V65_FIRST_TOKEN_METADATA_HASH!;
const preflight = JSON.parse(
  readFileSync(resolve("deployments", "v65-first-token-preflight.json"), "utf8"),
) as {
  totalBudgetWei: string;
  creatorBuyWei: string;
  gasLimit: string;
  gasPriceWei: string;
  maximumGasCostWei: string;
};

const raw = run(
  "cast",
  [
    "send",
    factory,
    "createToken(string,string,string,bytes32)",
    name,
    symbol,
    uri,
    hash,
    "--value",
    preflight.creatorBuyWei,
    "--gas-limit",
    preflight.gasLimit,
    "--gas-price",
    preflight.gasPriceWei,
    "--rpc-url",
    rpc,
    ...wallet.args,
    "--json",
  ],
  { redact: [rpc, ...wallet.redactions] },
);
const sent = JSON.parse(raw) as { transactionHash?: string };
if (!sent.transactionHash) throw new Error("Launch transaction hash missing.");
const receipt = JSON.parse(
  run("cast", ["receipt", sent.transactionHash, "--rpc-url", rpc, "--json"], { redact: [rpc] }),
) as {
  blockNumber?: string | number;
  status?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
  logs?: Array<{ address: string; topics: string[]; data: string }>;
};
if (String(receipt.status).toLowerCase() !== "0x1" && String(receipt.status) !== "1") {
  throw new Error("First launch receipt is not successful.");
}
const log = receipt.logs?.find(
  (entry) => entry.address.toLowerCase() === factory && entry.topics[0]?.toLowerCase() === LAUNCH_TOPIC,
);
if (!log) throw new Error("TokenLaunched event missing from successful receipt.");
const words = decodeWords(log.data);
if (words.length < 11) throw new Error("TokenLaunched event data malformed.");

const tokenAddress = `0x${stripHex(log.topics[1]).slice(-40)}`.toLowerCase();
const creatorAddress = `0x${stripHex(log.topics[2]).slice(-40)}`.toLowerCase();
const dexFactory = `0x${stripHex(log.topics[3]).slice(-40)}`.toLowerCase();
const pairToken = decodeAddress(words[0]).toLowerCase();
const poolAddress = decodeAddress(words[1]).toLowerCase();
const positionManager = decodeAddress(words[2]).toLowerCase();
const liquidityLocker = decodeAddress(words[3]).toLowerCase();
const launchPositionId = decodeUint(words[4]).toString();
const poolFee = Number(decodeUint(words[5]));
const tokenIsToken0 = decodeUint(words[6]) === 1n;
const initialBuyWei = decodeUint(words[7]).toString();
const initialTokensOutWad = decodeUint(words[8]).toString();
const supplyWad = decodeUint(words[9]).toString();
const eventMetadataHash = `0x${words[10]}`.toLowerCase();
if (
  creatorAddress !== creator
  || dexFactory !== V65_DEX.factory
  || pairToken !== V65_DEX.wrappedNative
  || positionManager !== V65_DEX.positionManager
  || liquidityLocker !== manifest.deployment.lockerAddress
  || poolFee !== V65_DEX.fee
  || eventMetadataHash !== hash.toLowerCase()
) {
  throw new Error("Confirmed launch event failed canonical V65 identity checks.");
}

const call = (address: string, signature: string, ...args: string[]) => run(
  "cast",
  ["call", address, signature, ...args, "--rpc-url", rpc],
  { redact: [rpc] },
).toLowerCase();
if (call(factory, "canonicalPoolForToken(address)(address)", tokenAddress) !== poolAddress) {
  throw new Error("Factory token-to-pool mapping mismatch.");
}
if (
  call(tokenAddress, "launchFactory()(address)") !== factory
  || call(tokenAddress, "creator()(address)") !== creator
  || BigInt(call(tokenAddress, "totalSupply()(uint256)")) !== 1_000_000_000n * 10n ** 18n
) {
  throw new Error("Token immutable identity/supply verification failed.");
}
const token0 = call(poolAddress, "token0()(address)");
const token1 = call(poolAddress, "token1()(address)");
if (!(
  (token0 === tokenAddress && token1 === V65_DEX.wrappedNative)
  || (token1 === tokenAddress && token0 === V65_DEX.wrappedNative)
)) {
  throw new Error("Canonical pool token order is invalid.");
}

const gasUsed = receipt.gasUsed ? BigInt(receipt.gasUsed) : 0n;
const effectiveGasPriceWei = receipt.effectiveGasPrice ? BigInt(receipt.effectiveGasPrice) : BigInt(preflight.gasPriceWei);
const actualGasCostWei = gasUsed * effectiveGasPriceWei;
const actualTotalSpendWei = BigInt(initialBuyWei) + actualGasCostWei;
const totalBudgetWei = BigInt(preflight.totalBudgetWei);
if (actualTotalSpendWei > totalBudgetWei) {
  throw new Error(`Actual launch spend ${actualTotalSpendWei} exceeded the signed total budget ${totalBudgetWei}.`);
}

const report = {
  version: "V66_EXECUTION_GATE_FOR_V65_CONTRACT",
  createdAt: new Date().toISOString(),
  factory,
  creator,
  name,
  symbol,
  metadataUri: uri,
  metadataHash: hash,
  totalBudgetWei: preflight.totalBudgetWei,
  totalBudgetEth: formatEth(totalBudgetWei, 18),
  maximumGasCostWei: preflight.maximumGasCostWei,
  creatorBuyWei: initialBuyWei,
  creatorBuyEth: formatEth(BigInt(initialBuyWei), 18),
  gasUsed: gasUsed.toString(),
  effectiveGasPriceWei: effectiveGasPriceWei.toString(),
  actualGasCostWei: actualGasCostWei.toString(),
  actualGasCostEth: formatEth(actualGasCostWei, 18),
  actualTotalSpendWei: actualTotalSpendWei.toString(),
  actualTotalSpendEth: formatEth(actualTotalSpendWei, 18),
  unusedBudgetWei: (totalBudgetWei - actualTotalSpendWei).toString(),
  initialTokensOutWad,
  supplyWad,
  transactionHash: sent.transactionHash,
  blockNumber: receipt.blockNumber ?? null,
  tokenAddress,
  poolAddress,
  dexFactory,
  pairToken,
  positionManager,
  liquidityLocker,
  launchPositionId,
  poolFee,
  tokenIsToken0,
  explorer: {
    transaction: `https://robinhoodchain.blockscout.com/tx/${sent.transactionHash}`,
    token: `https://robinhoodchain.blockscout.com/address/${tokenAddress}`,
    pool: `https://robinhoodchain.blockscout.com/address/${poolAddress}`,
  },
  gmgnSearch: `https://gmgn.ai/robinhood/token/${tokenAddress}`,
};
mkdirSync(resolve("deployments"), { recursive: true });
writeFileSync(resolve("deployments", "v65-first-token-launch.json"), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  resolve("deployments", "v65-vercel-launch.env"),
  [
    `V65_FIRST_LAUNCH_TX_HASH=${sent.transactionHash}`,
    `V65_FIRST_TOKEN_ADDRESS=${tokenAddress}`,
    `V65_FIRST_POOL_ADDRESS=${poolAddress}`,
    `NEXT_PUBLIC_LEVERAGEX_FIRST_TOKEN_ADDRESS=${tokenAddress}`,
    `NEXT_PUBLIC_LEVERAGEX_FIRST_MARKET_ADDRESS=${poolAddress}`,
    "",
  ].join("\n"),
);
console.log(`First V65 token confirmed.\nToken: ${tokenAddress}\nPool: ${poolAddress}`);
console.log(`Total budget ceiling: ${report.totalBudgetEth} ETH; actual spend: ${report.actualTotalSpendEth} ETH.`);
console.log(`GMGN test: ${report.gmgnSearch}`);
console.log("Public values: deployments/v65-vercel-launch.env");
