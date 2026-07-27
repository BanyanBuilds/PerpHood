import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const NETWORK = {
  name: "Robinhood Chain Mainnet",
  chainId: 4_663,
  explorer: "https://robinhoodchain.blockscout.com",
} as const;
const CONFIRMATION = "DEPLOY_LEVERAGE_X_V56_MAINNET_PAUSED";
const RPC = process.env.ROBINHOOD_MAINNET_RPC_URL;
const privateKey = process.env.V56_DEPLOYER_PRIVATE_KEY;

if (!RPC) throw new Error("Set ROBINHOOD_MAINNET_RPC_URL to your private Robinhood Chain mainnet HTTPS RPC endpoint.");
if (process.env.V56_MAINNET_DEPLOY_CONFIRM !== CONFIRMATION) {
  throw new Error(`Mainnet deployment is locked. Set V56_MAINNET_DEPLOY_CONFIRM=${CONFIRMATION} only for the deliberate deployment command.`);
}
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("Set V56_DEPLOYER_PRIVATE_KEY to the dedicated deployment-wallet key. Never commit it or put it in Vercel/Supabase.");
}

function run(command: string, args: string[], options: { capture?: boolean; redact?: string[] } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: options.capture === false ? "inherit" : "pipe",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    let detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    for (const secret of options.redact ?? []) detail = detail.split(secret).join("[REDACTED]");
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

function extractAddress(output: string) {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const candidate = String(parsed.deployedTo ?? parsed.deployed_to ?? parsed.contractAddress ?? "");
    if (/^0x[0-9a-fA-F]{40}$/.test(candidate)) return candidate.toLowerCase();
  } catch { /* Forge versions may include prose around JSON. */ }
  const labeled = output.match(/(?:Deployed to|deployedTo|contractAddress)\D+(0x[0-9a-fA-F]{40})/i)?.[1];
  if (labeled) return labeled.toLowerCase();
  const addresses = output.match(/0x[0-9a-fA-F]{40}/g) ?? [];
  return String(addresses.at(-1) ?? "").toLowerCase();
}

function extractTransactionHash(output: string) {
  try {
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const candidate = String(parsed.transactionHash ?? parsed.transaction_hash ?? "");
    if (/^0x[0-9a-fA-F]{64}$/.test(candidate)) return candidate.toLowerCase();
  } catch { /* ignore */ }
  return String(output.match(/0x[0-9a-fA-F]{64}/)?.[0] ?? "").toLowerCase();
}

console.log(`Leverage X V56 mainnet deployment\nRPC: ${redactRpc(RPC)}`);
run("forge", ["--version"]);
run("cast", ["--version"]);
const chainId = Number(run("cast", ["chain-id", "--rpc-url", RPC]));
if (chainId !== NETWORK.chainId) throw new Error(`RPC returned chain ID ${chainId}; expected ${NETWORK.chainId}.`);

const deployer = run("cast", ["wallet", "address", "--private-key", privateKey], { redact: [privateKey] }).toLowerCase();
const expectedDeployer = process.env.V56_EXPECTED_DEPLOYER_ADDRESS?.toLowerCase();
if (expectedDeployer && deployer !== expectedDeployer) {
  throw new Error(`The private key resolves to ${deployer}, not V56_EXPECTED_DEPLOYER_ADDRESS ${expectedDeployer}.`);
}
const owner = (process.env.V56_FACTORY_OWNER ?? deployer).toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(owner)) throw new Error("V56_FACTORY_OWNER must be a valid EVM address.");
const balanceEth = run("cast", ["balance", deployer, "--ether", "--rpc-url", RPC]);
console.log(`Deployer: ${deployer}`);
console.log(`Owner: ${owner}`);
console.log(`Deployer balance: ${balanceEth} ETH`);

console.log("\nRunning mandatory V56 compile and contract tests…");
run("forge", ["build", "--contracts", "contracts/src"], { capture: false, redact: [privateKey] });
run("forge", ["test", "--match-path", "contracts/test/LeverageXLaunchFactoryV56.t.sol", "-vvv"], { capture: false, redact: [privateKey] });

const contractTarget = "contracts/src/LeverageXLaunchFactoryV56.sol:LeverageXLaunchFactoryV56";
const commonArgs = [
  "create",
  contractTarget,
  "--rpc-url", RPC,
  "--private-key", privateKey,
  "--constructor-args", owner,
  "--json",
];

console.log("\nSimulating deployment without broadcasting…");
run("forge", commonArgs, { redact: [privateKey, RPC] });

const broadcastArgs = [...commonArgs, "--broadcast"];
if (process.env.V56_VERIFY_CONTRACT === "true") {
  broadcastArgs.push("--verify", "--verifier", "blockscout", "--verifier-url", `${NETWORK.explorer}/api/`);
}
console.log("Simulation passed. Broadcasting the CLOSED + GLOBALLY PAUSED V56 factory…");
const output = run("forge", broadcastArgs, { redact: [privateKey, RPC] });
const factoryAddress = extractAddress(output);
const transactionHash = extractTransactionHash(output);
if (!/^0x[0-9a-f]{40}$/.test(factoryAddress)) {
  console.error(output);
  throw new Error("Forge completed but the V56 factory address could not be parsed.");
}

const onchainOwner = run("cast", ["call", factoryAddress, "owner()(address)", "--rpc-url", RPC]).toLowerCase();
const launchMode = Number(run("cast", ["call", factoryAddress, "launchMode()(uint8)", "--rpc-url", RPC]));
const globalPaused = run("cast", ["call", factoryAddress, "globalTradingPaused()(bool)", "--rpc-url", RPC]).toLowerCase();
const newMarketsPaused = run("cast", ["call", factoryAddress, "newMarketsPaused()(bool)", "--rpc-url", RPC]).toLowerCase();
if (onchainOwner !== owner || launchMode !== 0 || globalPaused !== "true" || newMarketsPaused !== "true") {
  throw new Error(`Post-deploy safety verification failed: owner=${onchainOwner}, launchMode=${launchMode}, globalPaused=${globalPaused}, newMarketsPaused=${newMarketsPaused}`);
}

const runtimeBytecode = run("cast", ["code", factoryAddress, "--rpc-url", RPC]);
if (runtimeBytecode === "0x") throw new Error("No runtime bytecode was found at the deployed address.");
const runtimeBytecodeHash = run("cast", ["keccak", runtimeBytecode]);
const deployedBlock = Number(run("cast", ["block-number", "--rpc-url", RPC]));

mkdirSync(resolve("deployments"), { recursive: true });
const manifest = {
  version: "V56",
  network: "mainnet",
  chainId: NETWORK.chainId,
  rpc: redactRpc(RPC),
  explorerUrl: NETWORK.explorer,
  factoryAddress,
  owner,
  deployer,
  transactionHash: transactionHash || null,
  observedAtBlock: deployedBlock,
  runtimeBytecodeHash,
  deployedAt: new Date().toISOString(),
  verifiedRequested: process.env.V56_VERIFY_CONTRACT === "true",
  safetyState: {
    launchMode: "closed",
    globalTradingPaused: true,
    newMarketsPaused: true,
  },
};
writeFileSync(resolve("deployments", "v56-mainnet.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nV56 factory deployed safely: ${factoryAddress}`);
console.log(`Explorer: ${NETWORK.explorer}/address/${factoryAddress}`);
console.log("Verified state: launch CLOSED, global trading PAUSED, new markets PAUSED.");
console.log("Add only this public value to Vercel after reviewing the explorer receipt:");
console.log(`NEXT_PUBLIC_V56_MAINNET_FACTORY_ADDRESS=${factoryAddress}`);
console.log("Do not enable canary launch or trading until the indexer, Supabase registry, and UI all read this exact address.");
