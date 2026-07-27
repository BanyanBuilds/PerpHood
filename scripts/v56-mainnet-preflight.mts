import { spawnSync } from "node:child_process";

const RPC = process.env.ROBINHOOD_MAINNET_RPC_URL;
const EXPECTED_CHAIN_ID = 4_663;

if (!RPC) {
  throw new Error("Set ROBINHOOD_MAINNET_RPC_URL to your private Robinhood Chain mainnet HTTPS RPC endpoint.");
}

function run(command: string, args: string[], capture = true) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`${command} ${args[0] ?? ""} failed with exit code ${result.status}.${detail ? `\n${detail}` : ""}`);
  }
  return String(result.stdout ?? "").trim();
}

function redactRpc(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}/…`;
  } catch {
    return "configured endpoint";
  }
}

console.log("Leverage X V56 Robinhood Chain mainnet preflight\n");
console.log(`RPC: ${redactRpc(RPC)}`);
console.log(`Forge: ${run("forge", ["--version"]).split("\n")[0]}`);
console.log(`Cast: ${run("cast", ["--version"]).split("\n")[0]}`);

const chainId = Number(run("cast", ["chain-id", "--rpc-url", RPC]));
if (chainId !== EXPECTED_CHAIN_ID) throw new Error(`RPC returned chain ID ${chainId}; expected ${EXPECTED_CHAIN_ID}.`);
console.log(`Chain ID: ${chainId} ✓`);
console.log(`Latest block: ${run("cast", ["block-number", "--rpc-url", RPC])}`);
console.log(`Gas price: ${run("cast", ["gas-price", "--rpc-url", RPC])} wei`);

const deployerAddress = process.env.V56_DEPLOYER_ADDRESS;
if (deployerAddress) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(deployerAddress)) throw new Error("V56_DEPLOYER_ADDRESS must be a valid public EVM address.");
  console.log(`Deployer: ${deployerAddress.toLowerCase()}`);
  console.log(`Balance: ${run("cast", ["balance", deployerAddress, "--ether", "--rpc-url", RPC])} ETH`);
} else {
  console.log("Deployer balance: skipped (set V56_DEPLOYER_ADDRESS to include it)");
}

console.log("\nCompiling V56 contracts…");
run("forge", ["build", "--contracts", "contracts/src"], false);
console.log("\nRunning V56 contract tests…");
run("forge", ["test", "--match-path", "contracts/test/LeverageXLaunchFactoryV56.t.sol", "-vvv"], false);

const bytecode = run("forge", ["inspect", "contracts/src/LeverageXLaunchFactoryV56.sol:LeverageXLaunchFactoryV56", "bytecode"]);
const byteLength = Math.max(0, (bytecode.replace(/^0x/, "").length / 2));
if (!byteLength) throw new Error("Compiled factory bytecode is empty.");
console.log(`\nFactory creation bytecode: ${byteLength.toLocaleString("en-US")} bytes`);
console.log("Preflight passed. The factory is still undeployed and no mainnet state changed.");
