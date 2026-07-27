import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const networkKey = process.argv[2] === "mainnet" ? "mainnet" : "testnet";
const network = networkKey === "mainnet"
  ? { name: "Robinhood Chain Mainnet", chainId: 4_663, rpc: process.env.ROBINHOOD_MAINNET_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com", explorer: "https://robinhoodchain.blockscout.com", envName: "NEXT_PUBLIC_V55_MAINNET_FACTORY_ADDRESS" }
  : { name: "Robinhood Chain Testnet", chainId: 46_630, rpc: process.env.ROBINHOOD_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com", explorer: "https://explorer.testnet.chain.robinhood.com", envName: "NEXT_PUBLIC_V55_TESTNET_FACTORY_ADDRESS" };

if (networkKey === "mainnet" && process.env.V55_ALLOW_MAINNET_DEPLOY !== "true") {
  throw new Error("Mainnet deployment is locked. Set V55_ALLOW_MAINNET_DEPLOY=true only after testnet launch verification is complete.");
}

const privateKey = process.env.V55_DEPLOYER_PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("Set V55_DEPLOYER_PRIVATE_KEY to a dedicated deployment-wallet key. Never commit it or add it to NEXT_PUBLIC variables.");
}

function run(command: string, args: string[], options: { capture?: boolean } = {}) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", stdio: options.capture ? "pipe" : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0] ?? ""} failed with exit code ${result.status}.`);
  return options.capture ? String(result.stdout ?? "").trim() : "";
}

run("forge", ["--version"]);
run("cast", ["--version"]);
const chainId = Number(run("cast", ["chain-id", "--rpc-url", network.rpc], { capture: true }));
if (chainId !== network.chainId) throw new Error(`RPC returned chain ID ${chainId}; expected ${network.chainId}.`);

const deployer = run("cast", ["wallet", "address", "--private-key", privateKey], { capture: true }).toLowerCase();
const owner = (process.env.V55_FACTORY_OWNER ?? deployer).toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(owner)) throw new Error("V55_FACTORY_OWNER must be a valid EVM address.");

console.log(`\nCompiling LEVERAGE X V55 for ${network.name}…`);
run("forge", ["build", "--contracts", "contracts/src"]);

const args = [
  "create",
  "contracts/src/LeverageXLaunchFactoryV55.sol:LeverageXLaunchFactoryV55",
  "--rpc-url", network.rpc,
  "--private-key", privateKey,
  "--constructor-args", owner,
  "--broadcast",
  "--json",
];
if (process.env.V55_VERIFY_CONTRACT === "true") {
  args.push("--verify", "--verifier", "blockscout", "--verifier-url", `${network.explorer}/api/`);
}

console.log(`Deploying from ${deployer}; owner ${owner}…`);
const output = run("forge", args, { capture: true });
let parsed: Record<string, unknown> = {};
try { parsed = JSON.parse(output) as Record<string, unknown>; } catch { /* Forge versions may prepend text. */ }
const addressMatch = output.match(/0x[0-9a-fA-F]{40}/g) ?? [];
const deployedAddress = String(parsed.deployedTo ?? parsed.deployed_to ?? addressMatch.at(-1) ?? "").toLowerCase();
const transactionHash = String(parsed.transactionHash ?? parsed.transaction_hash ?? "");
if (!/^0x[0-9a-f]{40}$/.test(deployedAddress)) {
  console.error(output);
  throw new Error("Forge completed but the factory address could not be parsed.");
}

mkdirSync(resolve("deployments"), { recursive: true });
const manifest = {
  version: "V55",
  network: networkKey,
  chainId: network.chainId,
  rpcUrl: network.rpc,
  explorerUrl: network.explorer,
  factoryAddress: deployedAddress,
  owner,
  deployer,
  transactionHash: transactionHash || null,
  deployedAt: new Date().toISOString(),
  verified: process.env.V55_VERIFY_CONTRACT === "true",
};
writeFileSync(resolve("deployments", `v55-${networkKey}.json`), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nV55 factory deployed: ${deployedAddress}`);
console.log(`Explorer: ${network.explorer}/address/${deployedAddress}`);
console.log(`Add this to Vercel and .env.local:`);
console.log(`${network.envName}=${deployedAddress}`);
