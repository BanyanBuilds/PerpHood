import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  V65_DEX,
  V65_EXPECTED_DEPLOYER,
  V65_NETWORK,
  V65_TARGETS,
  byteLength,
  formatEth,
  hexToBigInt,
  redactRpc,
  requireRpc,
  rpcRequest,
  run,
} from "./v65-mainnet-common.mts";

const rpc = requireRpc();
console.log("Leverage X V65 — zero-transaction mainnet preflight\n");
console.log(`RPC: ${redactRpc(rpc)}\nDeployer: ${V65_EXPECTED_DEPLOYER}`);
const chainId = Number(hexToBigInt(await rpcRequest<string>(rpc, "eth_chainId")));
if (chainId !== V65_NETWORK.chainId) throw new Error(`Wrong chain ${chainId}.`);

for (const [name, address] of Object.entries(V65_DEX).filter(([, value]) => typeof value === "string")) {
  const code = await rpcRequest<string>(rpc, "eth_getCode", [address, "latest"]);
  if (code === "0x") throw new Error(`${name} has no bytecode at ${address}.`);
}

const call = (address: string, signature: string, ...args: string[]) => run(
  "cast",
  ["call", address, signature, ...args, "--rpc-url", rpc],
  { redact: [rpc] },
).toLowerCase();
const wethDecimals = Number(call(V65_DEX.wrappedNative, "decimals()(uint8)"));
if (wethDecimals !== 18) throw new Error(`Canonical WETH decimals mismatch: ${wethDecimals}.`);
const feeSpacing = Number(call(V65_DEX.factory, "feeAmountTickSpacing(uint24)(int24)", String(V65_DEX.fee)));
if (feeSpacing !== 200) throw new Error(`Canonical 1% pool fee spacing mismatch: ${feeSpacing}.`);
for (const [name, address] of [
  ["positionManager", V65_DEX.positionManager],
  ["swapRouter02", V65_DEX.swapRouter02],
  ["quoterV2", V65_DEX.quoterV2],
] as const) {
  const configuredFactory = call(address, "factory()(address)");
  const configuredWeth = call(address, "WETH9()(address)");
  if (configuredFactory !== V65_DEX.factory || configuredWeth !== V65_DEX.wrappedNative) {
    throw new Error(`${name} immutable Uniswap factory/WETH wiring does not match the canonical Robinhood deployment.`);
  }
}

run("forge", ["build", "--sizes"], { capture: false });
run("forge", ["test", "--match-path", "contracts/test/LeverageXLaunchFactoryV65.t.sol", "-vvv"], { capture: false });
const lockerCreation = run("forge", ["inspect", V65_TARGETS.locker, "bytecode"]);
const factoryCreation = run("forge", ["inspect", V65_TARGETS.factory, "bytecode"]);
const lockerRuntime = run("forge", ["inspect", V65_TARGETS.locker, "deployedBytecode"]);
const factoryRuntime = run("forge", ["inspect", V65_TARGETS.factory, "deployedBytecode"]);
if (byteLength(lockerRuntime) > 24_576 || byteLength(factoryRuntime) > 24_576) {
  throw new Error("EIP-170 runtime size limit exceeded.");
}

const gasPriceWei = hexToBigInt(await rpcRequest<string>(rpc, "eth_gasPrice"));
const balanceWei = hexToBigInt(await rpcRequest<string>(rpc, "eth_getBalance", [V65_EXPECTED_DEPLOYER, "latest"]));
// Conservative estimate until exact constructor transactions are dry-run by Forge immediately before broadcast.
const estimatedGas = BigInt(process.env.V65_PREFLIGHT_GAS_ESTIMATE ?? "9000000");
const fundingTargetWei = estimatedGas * gasPriceWei * 2n + 20_000_000_000_000_000n;
const report = {
  version: "V66_EXECUTION_GATE_FOR_V65_CONTRACT",
  generatedAt: new Date().toISOString(),
  network: { chainId, name: V65_NETWORK.name, rpc: redactRpc(rpc) },
  deployer: V65_EXPECTED_DEPLOYER,
  dex: V65_DEX,
  dexAttestation: {
    wethDecimals,
    feeSpacing,
    positionManagerFactory: call(V65_DEX.positionManager, "factory()(address)"),
    positionManagerWeth: call(V65_DEX.positionManager, "WETH9()(address)"),
    swapRouterFactory: call(V65_DEX.swapRouter02, "factory()(address)"),
    swapRouterWeth: call(V65_DEX.swapRouter02, "WETH9()(address)"),
    quoterFactory: call(V65_DEX.quoterV2, "factory()(address)"),
    quoterWeth: call(V65_DEX.quoterV2, "WETH9()(address)"),
  },
  artifacts: {
    locker: { creationBytes: byteLength(lockerCreation), runtimeBytes: byteLength(lockerRuntime) },
    factory: { creationBytes: byteLength(factoryCreation), runtimeBytes: byteLength(factoryRuntime) },
  },
  gas: {
    gasPriceWei: gasPriceWei.toString(),
    conservativeDeploymentGas: estimatedGas.toString(),
    fundingTargetWei: fundingTargetWei.toString(),
    fundingTargetEth: formatEth(fundingTargetWei),
    currentBalanceWei: balanceWei.toString(),
    currentBalanceEth: formatEth(balanceWei),
  },
  broadcast: false,
};
mkdirSync(resolve("deployments"), { recursive: true });
writeFileSync(resolve("deployments", "v65-mainnet-preflight.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\nPreflight passed. Conservative funding target: ${formatEth(fundingTargetWei)} ETH`);
console.log("No transaction was signed or broadcast. Report: deployments/v65-mainnet-preflight.json");
