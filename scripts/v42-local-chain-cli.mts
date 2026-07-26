import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeAddress, encodeBytes32, encodeUint, stripHex, toRpcHex, type Hex } from "../lib/chain/abi.ts";
import { eventTopic, functionSelector, keccak256 } from "../lib/chain/keccak.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rpcUrl = process.env.LOCAL_CHAIN_RPC ?? "http://127.0.0.1:8545";
const expectedChainId = 31_337;
const command = process.argv[2] ?? "deploy";
const skipDemo = process.argv.includes("--no-demo");
const deploymentPath = join(root, "public", "local-chain", "v42-deployment.json");

type RpcReceipt = {
  contractAddress?: string | null;
  transactionHash: Hex;
  status?: Hex;
  blockNumber?: Hex;
  logs?: Array<{ address: string; topics: Hex[]; data: Hex }>;
};

type DeploymentManifest = {
  version: "v42-local-chain-sandbox";
  chainId: number;
  rpcUrl: string;
  owner: string;
  sequencer: string;
  creator?: string;
  factoryAddress: string;
  factoryTransactionHash: string;
  demoMarketAddress?: string;
  demoTokenAddress?: string;
  demoTransactionHash?: string;
  createdAt: string;
  warning: string;
};

let rpcId = 0;
async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: { code: number; message: string } };
  if (payload.error) throw new Error(`RPC ${payload.error.code}: ${payload.error.message}`);
  if (payload.result === undefined) throw new Error(`RPC ${method} returned no result.`);
  return payload.result;
}

async function waitForReceipt(hash: Hex, timeoutMs = 30_000): Promise<RpcReceipt> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await rpc<RpcReceipt | null>("eth_getTransactionReceipt", [hash]);
    if (receipt) {
      if (receipt.status === "0x0") throw new Error(`Transaction reverted: ${hash}`);
      return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${hash}`);
}

function padRightWord(hex: string) {
  const remainder = hex.length % 64;
  return remainder === 0 ? hex : hex.padEnd(hex.length + 64 - remainder, "0");
}

function encodeStringTail(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${encodeUint(bytes.length)}${padRightWord(hex)}`;
}

function encodeCreateMarket(name: string, symbol: string, metadataHash: Hex, targetUsdWad: bigint) {
  const nameTail = encodeStringTail(name);
  const symbolTail = encodeStringTail(symbol);
  const headBytes = 4 * 32;
  const nameOffset = headBytes;
  const symbolOffset = headBytes + nameTail.length / 2;
  return `${functionSelector("createSandboxMarket(string,string,bytes32,uint256)")}${encodeUint(nameOffset)}${encodeUint(symbolOffset)}${encodeBytes32(metadataHash)}${encodeUint(targetUsdWad)}${nameTail}${symbolTail}` as Hex;
}

function addressFromTopic(topic?: string) {
  if (!topic) return undefined;
  const value = stripHex(topic);
  return `0x${value.slice(-40)}`;
}

async function compileFactory() {
  try {
    execFileSync("forge", ["build", "--root", root], { stdio: "inherit" });
  } catch {
    throw new Error("Foundry is required for the V42 bootstrap. Install Foundry, then retry npm run chain:v42.");
  }
  const artifactPath = join(root, "contracts", "out", "LaunchpadFactoryV42.sol", "LaunchpadFactoryV42.json");
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
    abi: unknown[];
    bytecode: { object: string };
  };
  const object = artifact.bytecode?.object;
  if (!object) throw new Error("Forge produced no LaunchpadFactoryV42 bytecode.");
  return { abi: artifact.abi, evm: { bytecode: { object: stripHex(object) } } };
}

async function assertLocalChain() {
  const [chainHex, accounts, blockHex] = await Promise.all([
    rpc<Hex>("eth_chainId"),
    rpc<string[]>("eth_accounts"),
    rpc<Hex>("eth_blockNumber"),
  ]);
  const chainId = Number(BigInt(chainHex));
  if (chainId !== expectedChainId) throw new Error(`Expected Anvil chain ${expectedChainId}, received ${chainId}.`);
  if (accounts.length < 3) throw new Error("The local chain must expose at least three unlocked test accounts.");
  return { chainId, accounts, blockNumber: Number(BigInt(blockHex)) };
}

async function deploy() {
  const chain = await assertLocalChain();
  const compiled = await compileFactory();
  const owner = chain.accounts[0];
  const sequencer = chain.accounts[1];
  const creator = chain.accounts[2];
  const constructorData = `${encodeAddress(owner)}${encodeAddress(sequencer)}`;
  const deploymentData = `0x${compiled.evm.bytecode.object}${constructorData}` as Hex;
  const estimatedGas = await rpc<Hex>("eth_estimateGas", [{ from: owner, data: deploymentData }]);
  const factoryTransactionHash = await rpc<Hex>("eth_sendTransaction", [{
    from: owner,
    data: deploymentData,
    gas: toRpcHex(BigInt(estimatedGas) * 12n / 10n),
  }]);
  const factoryReceipt = await waitForReceipt(factoryTransactionHash);
  const factoryAddress = factoryReceipt.contractAddress;
  if (!factoryAddress) throw new Error("Factory deployment receipt contained no contract address.");

  const manifest: DeploymentManifest = {
    version: "v42-local-chain-sandbox",
    chainId: chain.chainId,
    rpcUrl,
    owner,
    sequencer,
    creator,
    factoryAddress,
    factoryTransactionHash,
    createdAt: new Date().toISOString(),
    warning: "Unaudited local sandbox. Never use these contracts with public funds.",
  };

  if (!skipDemo) {
    const metadataHash = keccak256("perphood-v42-demo:HOOD") as Hex;
    const callData = encodeCreateMarket("PerpHood Local", "HOOD", metadataHash, 45_000n * 10n ** 18n);
    const creatorBuyWei = 820_000_000_000_000n;
    const gas = await rpc<Hex>("eth_estimateGas", [{ from: creator, to: factoryAddress, data: callData, value: toRpcHex(creatorBuyWei) }]);
    const demoTransactionHash = await rpc<Hex>("eth_sendTransaction", [{
      from: creator,
      to: factoryAddress,
      data: callData,
      value: toRpcHex(creatorBuyWei),
      gas: toRpcHex(BigInt(gas) * 12n / 10n),
    }]);
    const receipt = await waitForReceipt(demoTransactionHash);
    const createdTopic = eventTopic("MarketCreated(address,address,address,uint256,uint256,bytes32)").toLowerCase();
    const event = receipt.logs?.find((log) => log.topics[0]?.toLowerCase() === createdTopic);
    manifest.demoMarketAddress = addressFromTopic(event?.topics[1]);
    manifest.demoTokenAddress = addressFromTopic(event?.topics[2]);
    manifest.demoTransactionHash = demoTransactionHash;
  }

  await mkdir(dirname(deploymentPath), { recursive: true });
  await writeFile(deploymentPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(manifest, null, 2));
  console.log("\nAdd these values to .env.local, then restart Next.js:");
  console.log(`NEXT_PUBLIC_V42_LAUNCHPAD_FACTORY_ADDRESS=${manifest.factoryAddress}`);
  console.log(`NEXT_PUBLIC_LOCAL_CHAIN_RPC=${rpcUrl}`);
  if (manifest.demoMarketAddress) console.log(`NEXT_PUBLIC_V42_DEMO_MARKET_ADDRESS=${manifest.demoMarketAddress}`);
}

async function status() {
  const chain = await assertLocalChain();
  let manifest: unknown = null;
  try {
    manifest = JSON.parse(await readFile(deploymentPath, "utf8"));
  } catch {
    // No deployment yet.
  }
  console.log(JSON.stringify({ ...chain, rpcUrl, manifest }, null, 2));
}

if (command === "deploy") await deploy();
else if (command === "status") await status();
else throw new Error(`Unknown V42 local-chain command: ${command}`);
