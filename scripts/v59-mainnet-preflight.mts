import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_DEPLOYER,
  EIP170_RUNTIME_LIMIT_BYTES,
  V59_FACTORY_TARGET,
  V59_MARKET_TARGET,
  V59_NETWORK,
  V59_TOKEN_TARGET,
  byteLength,
  encodeAddressWord,
  formatEth,
  hexToBigInt,
  normalizeAddress,
  redactRpc,
  requireRpc,
  rpcRequest,
  run,
} from "./v59-mainnet-common.mts";

const EIP3860_INITCODE_LIMIT_BYTES = 49_152;
const RPC = requireRpc();
const deployer = normalizeAddress(process.env.V59_EXPECTED_DEPLOYER_ADDRESS, "V59_EXPECTED_DEPLOYER_ADDRESS", DEFAULT_DEPLOYER);
const owner = normalizeAddress(process.env.V59_FACTORY_OWNER, "V59_FACTORY_OWNER", deployer);

console.log("Leverage X V59 — Robinhood Chain mainnet preflight\n");
console.log(`RPC: ${redactRpc(RPC)}`);
console.log(`Expected deployer: ${deployer}`);
console.log(`Factory owner: ${owner}`);
console.log(`Forge: ${run("forge", ["--version"]).split("\n")[0]}`);
console.log(`Cast: ${run("cast", ["--version"]).split("\n")[0]}`);

const chainIdHex = await rpcRequest<string>(RPC, "eth_chainId");
const chainId = Number(hexToBigInt(chainIdHex));
if (chainId !== V59_NETWORK.chainId) throw new Error(`Wrong network: RPC returned chain ID ${chainId}; expected ${V59_NETWORK.chainId}.`);

const latestBlockHex = await rpcRequest<string>(RPC, "eth_blockNumber");
const latestBlock = Number(hexToBigInt(latestBlockHex));
const block = await rpcRequest<{ timestamp: string; hash: string }>(RPC, "eth_getBlockByNumber", [latestBlockHex, false]);
const blockTimestamp = Number(hexToBigInt(block.timestamp));
const blockAgeSeconds = Math.max(0, Math.floor(Date.now() / 1000) - blockTimestamp);
if (blockAgeSeconds > 600) throw new Error(`RPC head is stale by ${blockAgeSeconds} seconds.`);

const gasPriceWei = hexToBigInt(await rpcRequest<string>(RPC, "eth_gasPrice"));
const deployerBalanceWei = hexToBigInt(await rpcRequest<string>(RPC, "eth_getBalance", [deployer, "latest"]));
const deployerCode = await rpcRequest<string>(RPC, "eth_getCode", [deployer, "latest"]);
if (deployerCode !== "0x") throw new Error("Expected deployer is a contract address. Use the dedicated EOA deployer address.");

console.log(`Chain: ${V59_NETWORK.name} (${chainId}) ✓`);
console.log(`Latest block: ${latestBlock.toLocaleString("en-US")} · ${blockAgeSeconds}s old`);
console.log(`Gas price: ${gasPriceWei.toLocaleString("en-US")} wei`);
console.log(`Deployer balance: ${formatEth(deployerBalanceWei)} ETH`);

console.log("\nCompiling deterministic V63 factory artifacts for mainnet deployment tooling…");
run("forge", ["clean"], { capture: false });
run("forge", ["build", "--sizes"], { capture: false });
console.log("\nRunning factory contract tests…");
run("forge", ["test", "--match-path", "contracts/test/LeverageXLaunchFactoryV63.t.sol", "-vvv"], { capture: false });

const targets = [
  { name: "factory", target: V59_FACTORY_TARGET },
  { name: "market", target: V59_MARKET_TARGET },
  { name: "token", target: V59_TOKEN_TARGET },
] as const;
const artifacts: Record<string, { creationBytes: number; runtimeBytes: number; creationHash: string; runtimeHash: string }> = {};
let factoryCreationBytecode = "";

for (const target of targets) {
  const creationBytecode = run("forge", ["inspect", target.target, "bytecode"]);
  const runtimeBytecode = run("forge", ["inspect", target.target, "deployedBytecode"]);
  const creationBytes = byteLength(creationBytecode);
  const runtimeBytes = byteLength(runtimeBytecode);
  if (!creationBytes || !runtimeBytes) throw new Error(`${target.name} bytecode is empty.`);
  if (runtimeBytes > EIP170_RUNTIME_LIMIT_BYTES) {
    throw new Error(`${target.name} runtime bytecode is ${runtimeBytes} bytes, above the EIP-170 limit of ${EIP170_RUNTIME_LIMIT_BYTES}.`);
  }
  if (creationBytes > EIP3860_INITCODE_LIMIT_BYTES) {
    throw new Error(`${target.name} creation bytecode is ${creationBytes} bytes, above the EIP-3860 initcode limit of ${EIP3860_INITCODE_LIMIT_BYTES}.`);
  }
  const creationHash = run("cast", ["keccak", creationBytecode]);
  const runtimeHash = run("cast", ["keccak", runtimeBytecode]);
  artifacts[target.name] = { creationBytes, runtimeBytes, creationHash, runtimeHash };
  if (target.name === "factory") factoryCreationBytecode = creationBytecode;
  console.log(`${target.name}: ${creationBytes.toLocaleString("en-US")} creation bytes · ${runtimeBytes.toLocaleString("en-US")} runtime bytes ✓`);
}

const deploymentData = `${factoryCreationBytecode}${encodeAddressWord(owner)}`;
let deploymentGasEstimate: bigint | null = null;
let estimateWarning: string | null = null;
try {
  const estimateHex = await rpcRequest<string>(RPC, "eth_estimateGas", [{ from: deployer, data: deploymentData }], 30_000);
  deploymentGasEstimate = hexToBigInt(estimateHex);
} catch (error) {
  try {
    const estimateHex = await rpcRequest<string>(RPC, "eth_estimateGas", [{ data: deploymentData }], 30_000);
    deploymentGasEstimate = hexToBigInt(estimateHex);
    estimateWarning = "RPC estimated deployment without a funded sender; rerun after funding for the final estimate.";
  } catch (fallbackError) {
    estimateWarning = fallbackError instanceof Error ? fallbackError.message : "Deployment gas estimate unavailable.";
  }
}

const bufferedGasLimit = deploymentGasEstimate ? deploymentGasEstimate * 140n / 100n + 50_000n : null;
const bufferedGasPriceWei = gasPriceWei * 125n / 100n + 1n;
const fundingTargetWei = bufferedGasLimit ? bufferedGasLimit * bufferedGasPriceWei : null;
const fundingShortfallWei = fundingTargetWei && deployerBalanceWei < fundingTargetWei ? fundingTargetWei - deployerBalanceWei : 0n;

if (deploymentGasEstimate) {
  console.log(`\nDeployment gas estimate: ${deploymentGasEstimate.toLocaleString("en-US")} gas`);
  console.log(`Buffered funding target: ${formatEth(fundingTargetWei!)} ETH`);
  if (fundingShortfallWei > 0n) console.log(`Funding still required: ${formatEth(fundingShortfallWei)} ETH`);
  else console.log("Deployer funding covers the buffered estimate ✓");
} else {
  console.log(`\nDeployment gas estimate unavailable: ${estimateWarning}`);
}

mkdirSync(resolve("deployments"), { recursive: true });
const report = {
  version: "V63",
  preflightToolVersion: "V59",
  generatedAt: new Date().toISOString(),
  network: {
    name: V59_NETWORK.name,
    chainId,
    explorer: V59_NETWORK.explorer,
    rpc: redactRpc(RPC),
    latestBlock,
    latestBlockHash: block.hash,
    blockAgeSeconds,
    gasPriceWei: gasPriceWei.toString(),
  },
  accounts: {
    deployer,
    factoryOwner: owner,
    deployerBalanceWei: deployerBalanceWei.toString(),
  },
  contract: {
    target: V59_FACTORY_TARGET,
    sourceVersion: "V63",
    artifacts,
  },
  deploymentEstimate: {
    gasEstimate: deploymentGasEstimate?.toString() ?? null,
    bufferedGasLimit: bufferedGasLimit?.toString() ?? null,
    bufferedGasPriceWei: bufferedGasPriceWei.toString(),
    fundingTargetWei: fundingTargetWei?.toString() ?? null,
    fundingShortfallWei: fundingShortfallWei.toString(),
    warning: estimateWarning,
  },
  gates: {
    correctChain: true,
    rpcFresh: true,
    deployerIsEoa: true,
    compilationPassed: true,
    contractTestsPassed: true,
    bytecodeWithinLimits: true,
    factoryStillUndeployedByThisCommand: true,
    fundedForBufferedEstimate: fundingTargetWei ? fundingShortfallWei === 0n : false,
  },
};
writeFileSync(resolve("deployments", "v63-mainnet-preflight.json"), `${JSON.stringify(report, null, 2)}\n`);

console.log("\nV59 preflight passed. No transaction was signed or broadcast.");
console.log("Report: deployments/v63-mainnet-preflight.json");
if (fundingShortfallWei > 0n) console.log("Next gate: fund only the shortfall plus a small operational cushion, then rerun this command.");
