import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_DEPLOYER,
  V59_FACTORY_TARGET,
  V59_NETWORK,
  byteLength,
  hexToBigInt,
  normalizeAddress,
  parseForgeCreateOutput,
  redactRpc,
  requireRpc,
  rpcRequest,
  run,
  walletArgs,
} from "./v59-mainnet-common.mts";

const CONFIRMATION = "DEPLOY_LEVERAGE_X_MAINNET_CLOSED_AND_PAUSED";
const RPC = requireRpc();
if (process.env.V59_MAINNET_DEPLOY_CONFIRM !== CONFIRMATION) {
  throw new Error(`Mainnet deployment is locked. Set V59_MAINNET_DEPLOY_CONFIRM=${CONFIRMATION} only for the deliberate deployment run.`);
}

const expectedDeployer = normalizeAddress(process.env.V59_EXPECTED_DEPLOYER_ADDRESS, "V59_EXPECTED_DEPLOYER_ADDRESS", DEFAULT_DEPLOYER);
const owner = normalizeAddress(process.env.V59_FACTORY_OWNER, "V59_FACTORY_OWNER", expectedDeployer);
const wallet = walletArgs();

console.log("Leverage X V59 — CLOSED + PAUSED Robinhood Chain deployment\n");
console.log(`RPC: ${redactRpc(RPC)}`);
console.log(`Expected deployer: ${expectedDeployer}`);
console.log(`Factory owner: ${owner}`);
console.log(`Signer mode: ${wallet.mode}`);

const chainId = Number(hexToBigInt(await rpcRequest<string>(RPC, "eth_chainId")));
if (chainId !== V59_NETWORK.chainId) throw new Error(`Wrong network: ${chainId}; expected ${V59_NETWORK.chainId}.`);

console.log("\nRe-running mandatory preflight immediately before deployment…");
run("node", ["--experimental-strip-types", "scripts/v59-mainnet-preflight.mts"], { capture: false });

const signerAddress = run("cast", ["wallet", "address", ...wallet.args], { redact: wallet.redactions }).toLowerCase();
if (signerAddress !== expectedDeployer) {
  throw new Error(`Configured signer resolves to ${signerAddress}, not the expected deployer ${expectedDeployer}.`);
}

const preflightPath = resolve("deployments", "v59-mainnet-preflight.json");
const preflight = JSON.parse(readFileSync(preflightPath, "utf8")) as {
  deploymentEstimate?: { fundingTargetWei?: string | null };
  contract?: { artifacts?: { factory?: { runtimeHash?: string } } };
};
const fundingTargetWei = BigInt(preflight.deploymentEstimate?.fundingTargetWei ?? "0");
const balanceWei = hexToBigInt(await rpcRequest<string>(RPC, "eth_getBalance", [signerAddress, "latest"]));
if (fundingTargetWei > 0n && balanceWei < fundingTargetWei) {
  throw new Error(`Deployer is underfunded for the buffered estimate. Balance=${balanceWei} wei; target=${fundingTargetWei} wei.`);
}

const commonArgs = [
  "create",
  V59_FACTORY_TARGET,
  "--rpc-url", RPC,
  ...wallet.args,
  "--constructor-args", owner,
  "--json",
];

console.log("\nDry-running the exact factory deployment transaction…");
run("forge", commonArgs, { redact: [RPC, ...wallet.redactions] });

console.log("Dry run passed. Broadcasting one factory deployment transaction…");
const output = run("forge", [...commonArgs, "--broadcast"], { redact: [RPC, ...wallet.redactions] });
const parsed = parseForgeCreateOutput(output);
let transactionHash = parsed.transactionHash;
let factoryAddress = parsed.factoryAddress;

if (!/^0x[0-9a-f]{64}$/.test(transactionHash)) {
  throw new Error("Forge broadcast completed but the transaction hash could not be parsed. Do not retry until the deployer nonce and explorer have been checked.");
}

const receipt = await rpcRequest<{
  status?: string;
  blockNumber?: string;
  contractAddress?: string | null;
  transactionHash?: string;
  gasUsed?: string;
  effectiveGasPrice?: string;
} | null>(RPC, "eth_getTransactionReceipt", [transactionHash]);
if (!receipt) throw new Error(`Deployment transaction ${transactionHash} is not mined yet. Check the explorer before retrying.`);
if (receipt.status !== "0x1") throw new Error(`Deployment transaction reverted: ${V59_NETWORK.explorer}/tx/${transactionHash}`);
if (receipt.contractAddress) factoryAddress = receipt.contractAddress.toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(factoryAddress)) throw new Error("Mined receipt did not contain a valid factory address.");

const onchainCode = await rpcRequest<string>(RPC, "eth_getCode", [factoryAddress, "latest"]);
if (onchainCode === "0x") throw new Error("No runtime bytecode exists at the deployed factory address.");
const compiledRuntime = run("forge", ["inspect", V59_FACTORY_TARGET, "deployedBytecode"]);
const onchainRuntimeHash = run("cast", ["keccak", onchainCode]);
const compiledRuntimeHash = run("cast", ["keccak", compiledRuntime]);
if (onchainRuntimeHash.toLowerCase() !== compiledRuntimeHash.toLowerCase()) {
  throw new Error(`Runtime bytecode mismatch. Compiled=${compiledRuntimeHash}; on-chain=${onchainRuntimeHash}. Factory remains closed/paused; investigate before continuing.`);
}

function call(signature: string) {
  return run("cast", ["call", factoryAddress, signature, "--rpc-url", RPC], { redact: [RPC] }).toLowerCase();
}
const onchainOwner = call("owner()(address)");
const launchMode = Number(call("launchMode()(uint8)"));
const globalPaused = call("globalTradingPaused()(bool)");
const newMarketsPaused = call("newMarketsPaused()(bool)");
const marketCount = BigInt(call("marketCount()(uint256)"));
if (onchainOwner !== owner || launchMode !== 0 || globalPaused !== "true" || newMarketsPaused !== "true" || marketCount !== 0n) {
  throw new Error(`Post-deploy safety state failed: owner=${onchainOwner}, launchMode=${launchMode}, globalPaused=${globalPaused}, newMarketsPaused=${newMarketsPaused}, markets=${marketCount}.`);
}

const blockNumber = Number(hexToBigInt(receipt.blockNumber ?? "0x0"));
const gasUsed = hexToBigInt(receipt.gasUsed ?? "0x0");
const effectiveGasPriceWei = hexToBigInt(receipt.effectiveGasPrice ?? "0x0");
const deploymentCostWei = gasUsed * effectiveGasPriceWei;

mkdirSync(resolve("deployments"), { recursive: true });
const manifest = {
  version: "V59",
  sourceContractVersion: "V60",
  deployedAt: new Date().toISOString(),
  network: {
    name: V59_NETWORK.name,
    chainId: V59_NETWORK.chainId,
    rpc: redactRpc(RPC),
    explorer: V59_NETWORK.explorer,
  },
  deployment: {
    transactionHash,
    factoryAddress,
    blockNumber,
    deployer: signerAddress,
    owner,
    gasUsed: gasUsed.toString(),
    effectiveGasPriceWei: effectiveGasPriceWei.toString(),
    deploymentCostWei: deploymentCostWei.toString(),
  },
  bytecode: {
    runtimeBytes: byteLength(onchainCode),
    compiledRuntimeHash,
    onchainRuntimeHash,
    exactMatch: true,
  },
  safetyState: {
    launchMode: "closed",
    globalTradingPaused: true,
    newMarketsPaused: true,
    marketCount: "0",
  },
  verification: {
    status: "pending",
    command: "npm run chain:v59:verify",
  },
};
writeFileSync(resolve("deployments", "leveragex-mainnet.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(resolve("deployments", "v59-vercel-public.env"), [
  `LEVERAGEX_FACTORY_ADDRESS=${factoryAddress}`,
  `NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS=${factoryAddress}`,
  `NEXT_PUBLIC_V56_MAINNET_FACTORY_ADDRESS=${factoryAddress}`,
  "NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED=false",
  "NEXT_PUBLIC_V56_MAINNET_ENABLED=false",
  "NEXT_PUBLIC_LEVERAGEX_RELEASE_STAGE=factory-paused",
  "",
].join("\n"));

console.log("\nFactory deployment confirmed and bytecode-matched.");
console.log(`Factory: ${factoryAddress}`);
console.log(`Transaction: ${V59_NETWORK.explorer}/tx/${transactionHash}`);
console.log(`Address: ${V59_NETWORK.explorer}/address/${factoryAddress}`);
console.log("Safety state: CLOSED · GLOBAL PAUSED · NEW MARKETS PAUSED · 0 MARKETS");
console.log("Next command: npm run chain:v59:verify");
console.log("Do not enable mainnet launching or Spot trading yet.");
