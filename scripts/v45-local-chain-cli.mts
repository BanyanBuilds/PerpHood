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
const deploymentPath = join(root, "public", "local-chain", "v45-deployment.json");

type RpcReceipt = {
  contractAddress?: string | null;
  transactionHash: Hex;
  status?: Hex;
  blockNumber?: Hex;
  gasUsed?: Hex;
  logs?: Array<{ address: string; topics: Hex[]; data: Hex }>;
};

type DeploymentManifest = {
  version: "v45-authorized-account-execution";
  accountRouterAddress: string;
  chainId: number;
  rpcUrl: string;
  owner: string;
  sequencer: string;
  creator?: string;
  spotTrader?: string;
  longTrader?: string;
  shortTrader?: string;
  factoryAddress: string;
  factoryTransactionHash: string;
  demoMarketAddress?: string;
  demoTokenAddress?: string;
  demoTransactionHash?: string;
  demoSpotBuyTransactionHash?: string;
  demoLongTransactionHash?: string;
  demoShortTransactionHash?: string;
  demoLongPositionId?: string;
  demoShortPositionId?: string;
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

async function waitForReceipt(hash: Hex, timeoutMs = 45_000): Promise<RpcReceipt> {
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

function encodeStaticCall(signature: string, values: Array<bigint | number>) {
  return `${functionSelector(signature)}${values.map((value) => encodeUint(value)).join("")}` as Hex;
}

function addressFromTopic(topic?: string) {
  if (!topic) return undefined;
  const value = stripHex(topic);
  return `0x${value.slice(-40)}`;
}

function uintFromTopic(topic?: string) {
  return topic ? BigInt(topic).toString() : undefined;
}

async function compileFactory() {
  try {
    execFileSync("forge", ["build", "--root", root], { stdio: "inherit" });
  } catch {
    throw new Error("Foundry is required for the V45 bootstrap. Install Foundry, then retry npm run chain:v45.");
  }
  const artifactPath = join(root, "contracts", "out", "LaunchpadFactoryV45.sol", "LaunchpadFactoryV45.json");
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
    abi: unknown[];
    bytecode: { object: string };
  };
  const object = artifact.bytecode?.object;
  if (!object) throw new Error("Forge produced no LaunchpadFactoryV45 bytecode.");
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
  if (accounts.length < 6) throw new Error("The V45 demo requires at least six unlocked Anvil accounts.");
  return { chainId, accounts, blockNumber: Number(BigInt(blockHex)) };
}

async function sendTransaction(input: { from: string; to?: string; data?: Hex; value?: bigint }) {
  const request = {
    from: input.from,
    ...(input.to ? { to: input.to } : {}),
    ...(input.data ? { data: input.data } : {}),
    ...(input.value !== undefined ? { value: toRpcHex(input.value) } : {}),
  };
  const estimatedGas = await rpc<Hex>("eth_estimateGas", [request]);
  const hash = await rpc<Hex>("eth_sendTransaction", [{
    ...request,
    gas: toRpcHex(BigInt(estimatedGas) * 13n / 10n),
  }]);
  const receipt = await waitForReceipt(hash);
  return { hash, receipt };
}

async function deploy() {
  const chain = await assertLocalChain();
  const compiled = await compileFactory();
  const [owner, sequencer, creator, spotTrader, longTrader, shortTrader] = chain.accounts;
  const constructorData = `${encodeAddress(owner)}${encodeAddress(sequencer)}`;
  const deploymentData = `0x${compiled.evm.bytecode.object}${constructorData}` as Hex;
  const factoryDeployment = await sendTransaction({ from: owner, data: deploymentData });
  const factoryAddress = factoryDeployment.receipt.contractAddress;
  if (!factoryAddress) throw new Error("Factory deployment receipt contained no contract address.");

  const manifest: DeploymentManifest = {
    version: "v45-authorized-account-execution",
    chainId: chain.chainId,
    rpcUrl,
    owner,
    sequencer,
    creator,
    spotTrader,
    longTrader,
    shortTrader,
    factoryAddress,
    accountRouterAddress: factoryAddress,
    factoryTransactionHash: factoryDeployment.hash,
    createdAt: new Date().toISOString(),
    warning: "Unaudited local unified-settlement sandbox. Never use these contracts with public funds.",
  };

  if (!skipDemo) {
    const metadataHash = keccak256("perphood-v45-authorized-demo:HOOD") as Hex;
    const launch = await sendTransaction({
      from: creator,
      to: factoryAddress,
      data: encodeCreateMarket("PerpHood Authorized", "HOOD", metadataHash, 45_000n * 10n ** 18n),
      value: 820_000_000_000_000n,
    });
    const createdTopic = eventTopic("MarketCreated(address,address,address,uint256,uint256,bytes32)").toLowerCase();
    const created = launch.receipt.logs?.find((log) => log.topics[0]?.toLowerCase() === createdTopic);
    const marketAddress = addressFromTopic(created?.topics[1]);
    const tokenAddress = addressFromTopic(created?.topics[2]);
    if (!marketAddress || !tokenAddress) throw new Error("V45 MarketCreated event could not be decoded.");
    manifest.demoMarketAddress = marketAddress;
    manifest.demoTokenAddress = tokenAddress;
    manifest.demoTransactionHash = launch.hash;

    const reserveSeed = await sendTransaction({
      from: owner,
      to: factoryAddress,
      data: encodeStaticCall("seedRiskReserve(address)", [BigInt(marketAddress)]),
      value: 3n * 10n ** 18n,
    });
    reserveSeed.receipt;

    // Seed three independent internal accounts. The router—not the market—holds user liabilities.
    const depositSelector = functionSelector("deposit()") as Hex;
    await sendTransaction({ from: spotTrader, to: factoryAddress, data: depositSelector, value: 2n * 10n ** 18n });
    await sendTransaction({ from: longTrader, to: factoryAddress, data: depositSelector, value: 1n * 10n ** 18n });
    await sendTransaction({ from: shortTrader, to: factoryAddress, data: depositSelector, value: 1n * 10n ** 18n });

    const spotBuy = await sendTransaction({
      from: spotTrader,
      to: factoryAddress,
      data: `${functionSelector("spotBuyFromBalance(address,uint256,uint256)")}${encodeAddress(marketAddress)}${encodeUint(750_000_000_000_000_000n)}${encodeUint(0)}` as Hex,
    });
    manifest.demoSpotBuyTransactionHash = spotBuy.hash;

    const longCollateral = 40_000_000_000_000_000n;
    const longOpen = await sendTransaction({
      from: longTrader,
      to: factoryAddress,
      data: `${functionSelector("openLongFromBalance(address,uint16,uint16,uint256)")}${encodeAddress(marketAddress)}${encodeUint(3)}${encodeUint(200)}${encodeUint(longCollateral)}` as Hex,
    });
    manifest.demoLongTransactionHash = longOpen.hash;

    const shortCollateral = 20_000_000_000_000_000n;
    const shortOpen = await sendTransaction({
      from: shortTrader,
      to: factoryAddress,
      data: `${functionSelector("openShortFromBalance(address,uint16,uint16,uint256)")}${encodeAddress(marketAddress)}${encodeUint(2)}${encodeUint(200)}${encodeUint(shortCollateral)}` as Hex,
    });
    manifest.demoShortTransactionHash = shortOpen.hash;

    const openedTopic = eventTopic("PositionOpened(uint256,address,uint8,uint16,uint256,uint256,uint256,uint256,uint256)").toLowerCase();
    const longEvent = longOpen.receipt.logs?.find((log) => log.topics[0]?.toLowerCase() === openedTopic);
    const shortEvent = shortOpen.receipt.logs?.find((log) => log.topics[0]?.toLowerCase() === openedTopic);
    manifest.demoLongPositionId = uintFromTopic(longEvent?.topics[1]);
    manifest.demoShortPositionId = uintFromTopic(shortEvent?.topics[1]);
  }

  await mkdir(dirname(deploymentPath), { recursive: true });
  await writeFile(deploymentPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(manifest, null, 2));
  console.log("\nAdd these values to .env.local, then restart Next.js:");
  console.log(`NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS=${manifest.factoryAddress}`);
  console.log(`NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS=${manifest.factoryAddress}`);
  console.log(`NEXT_PUBLIC_LOCAL_CHAIN_RPC=${rpcUrl}`);
  if (manifest.demoMarketAddress) console.log(`NEXT_PUBLIC_V45_DEMO_MARKET_ADDRESS=${manifest.demoMarketAddress}`);
  if (manifest.demoTokenAddress) console.log(`NEXT_PUBLIC_V45_DEMO_TOKEN_ADDRESS=${manifest.demoTokenAddress}`);
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
else throw new Error(`Unknown V45 local-chain command: ${command}`);
