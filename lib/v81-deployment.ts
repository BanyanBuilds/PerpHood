import { Contract, ContractFactory, JsonRpcProvider, Wallet, formatEther, getAddress, isAddress } from "ethers";
import artifact from "@/artifacts/v80/mint-path.json";

export const RH_CHAIN_ID = 4663n;
export const DEFAULT_RH_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const CANONICAL = {
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  uniswapV3Factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  positionManager: "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3",
  swapRouter02: "0xCaf681a66D020601342297493863E78C959E5cb2",
} as const;

const lockerReadAbi = [
  "function owner() view returns (address)",
  "function factory() view returns (address)",
  "function uniswapV3Factory() view returns (address)",
  "function positionManager() view returns (address)",
  "function weth() view returns (address)",
];
const factoryReadAbi = [
  "function owner() view returns (address)",
  "function liquidityLocker() view returns (address)",
  "function launchesOpen() view returns (bool)",
  "function uniswapV3Factory() view returns (address)",
  "function positionManager() view returns (address)",
  "function swapRouter02() view returns (address)",
  "function weth() view returns (address)",
];

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}
function provider() {
  return new JsonRpcProvider(process.env.RH_RPC_URL?.trim() || DEFAULT_RH_RPC, Number(RH_CHAIN_ID), { staticNetwork: true });
}
async function assertChain(p: JsonRpcProvider) {
  const network = await p.getNetwork();
  if (network.chainId !== RH_CHAIN_ID) throw new Error(`Wrong RPC chain: ${network.chainId}. Expected 4663.`);
}

export async function deploymentReadiness() {
  const p = provider();
  await assertChain(p);
  const ownerRaw = process.env.LEVERAGEX_OWNER?.trim() || "";
  const key = process.env.LEVERAGEX_DEPLOYER_PRIVATE_KEY?.trim() || "";
  const ownerValid = isAddress(ownerRaw);
  let deployer: string | null = null;
  let deployerBalanceWei = "0";
  let deployerBalanceEth = "0";
  if (/^0x[0-9a-fA-F]{64}$/.test(key)) {
    const wallet = new Wallet(key, p);
    deployer = wallet.address;
    const balance = await p.getBalance(wallet.address);
    deployerBalanceWei = balance.toString();
    deployerBalanceEth = formatEther(balance);
  }
  const canonicalCode = Object.fromEntries(await Promise.all(
    Object.entries(CANONICAL).map(async ([name, address]) => [name, (await p.getCode(address)) !== "0x"]),
  ));
  const allCanonicalLive = Object.values(canonicalCode).every(Boolean);
  return {
    version: "81.0.0",
    chainId: 4663,
    rpcConnected: true,
    canonicalCode,
    allCanonicalLive,
    owner: ownerValid ? getAddress(ownerRaw) : null,
    ownerValid,
    deployer,
    deployerBalanceWei,
    deployerBalanceEth,
    deployerFunded: BigInt(deployerBalanceWei) > 0n,
    privateKeyConfigured: Boolean(deployer),
    adminTokenConfigured: (process.env.LEVERAGEX_DEPLOY_ADMIN_TOKEN?.trim().length || 0) >= 32,
    ready: allCanonicalLive && ownerValid && Boolean(deployer) && BigInt(deployerBalanceWei) > 0n,
  };
}

export async function verifyDeployment(lockerAddressRaw?: string, factoryAddressRaw?: string) {
  const p = provider();
  await assertChain(p);
  const lockerRaw = lockerAddressRaw?.trim() || process.env.LEVERAGEX_LIQUIDITY_LOCKER_ADDRESS?.trim() || "";
  const factoryRaw = factoryAddressRaw?.trim() || process.env.LEVERAGEX_LAUNCH_FACTORY_ADDRESS?.trim() || "";
  if (!isAddress(lockerRaw) || !isAddress(factoryRaw)) throw new Error("Valid locker and factory addresses are required.");
  const lockerAddress = getAddress(lockerRaw);
  const factoryAddress = getAddress(factoryRaw);
  const [lockerCode, factoryCode] = await Promise.all([p.getCode(lockerAddress), p.getCode(factoryAddress)]);
  if (lockerCode === "0x" || factoryCode === "0x") throw new Error("One or both deployment addresses have no bytecode.");
  const locker = new Contract(lockerAddress, lockerReadAbi, p);
  const factory = new Contract(factoryAddress, factoryReadAbi, p);
  const [lockerOwner, boundFactory, lockerUni, lockerPm, lockerWeth, factoryOwner, configuredLocker, launchesOpen, factoryUni, factoryPm, router, factoryWeth] = await Promise.all([
    locker.owner(), locker.factory(), locker.uniswapV3Factory(), locker.positionManager(), locker.weth(),
    factory.owner(), factory.liquidityLocker(), factory.launchesOpen(), factory.uniswapV3Factory(), factory.positionManager(), factory.swapRouter02(), factory.weth(),
  ]);
  const expectedOwner = process.env.LEVERAGEX_OWNER?.trim();
  const checks = {
    lockerHasCode: true,
    factoryHasCode: true,
    lockerBoundToFactory: getAddress(boundFactory) === factoryAddress,
    factoryUsesLocker: getAddress(configuredLocker) === lockerAddress,
    ownersMatch: getAddress(lockerOwner) === getAddress(factoryOwner),
    expectedOwnerMatches: expectedOwner && isAddress(expectedOwner) ? getAddress(factoryOwner) === getAddress(expectedOwner) : null,
    lockerCanonical: getAddress(lockerUni) === CANONICAL.uniswapV3Factory && getAddress(lockerPm) === CANONICAL.positionManager && getAddress(lockerWeth) === CANONICAL.weth,
    factoryCanonical: getAddress(factoryUni) === CANONICAL.uniswapV3Factory && getAddress(factoryPm) === CANONICAL.positionManager && getAddress(router) === CANONICAL.swapRouter02 && getAddress(factoryWeth) === CANONICAL.weth,
    launchesClosed: launchesOpen === false,
  };
  return { version: "81.0.0", chainId: 4663, lockerAddress, factoryAddress, owner: getAddress(factoryOwner), launchesOpen, checks, verified: Object.values(checks).filter((v) => v !== null).every(Boolean) };
}

export async function deployLaunchContracts() {
  const readiness = await deploymentReadiness();
  if (!readiness.ready) throw new Error("Deployment readiness failed. Check RPC, canonical contracts, owner, deployer key, and gas balance.");
  const p = provider();
  const wallet = new Wallet(required("LEVERAGEX_DEPLOYER_PRIVATE_KEY"), p);
  const owner = getAddress(required("LEVERAGEX_OWNER"));
  const lockerArtifact = artifact.contracts.LeverageXPermanentLiquidityLockerV65;
  const factoryArtifact = artifact.contracts.LeverageXLaunchFactoryV65;
  const lockerFactory = new ContractFactory(lockerArtifact.abi, lockerArtifact.bytecode, wallet);
  const locker = await lockerFactory.deploy(owner, CANONICAL.uniswapV3Factory, CANONICAL.positionManager, CANONICAL.weth);
  const lockerTx = locker.deploymentTransaction();
  const lockerReceipt = await lockerTx?.wait(1);
  const lockerAddress = await locker.getAddress();
  if (!lockerReceipt || (await p.getCode(lockerAddress)) === "0x") throw new Error("Liquidity locker deployment was not confirmed.");
  const launchFactoryFactory = new ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const launchFactory = await launchFactoryFactory.deploy(owner, CANONICAL.uniswapV3Factory, CANONICAL.positionManager, CANONICAL.swapRouter02, CANONICAL.weth, lockerAddress);
  const factoryTx = launchFactory.deploymentTransaction();
  const factoryReceipt = await factoryTx?.wait(1);
  const factoryAddress = await launchFactory.getAddress();
  if (!factoryReceipt || (await p.getCode(factoryAddress)) === "0x") throw new Error("Launch factory deployment was not confirmed.");
  const bindTx = await locker.bindFactory(factoryAddress);
  const bindReceipt = await bindTx.wait(1);
  if (!bindReceipt) throw new Error("Locker/factory binding was not confirmed.");
  const verification = await verifyDeployment(lockerAddress, factoryAddress);
  if (!verification.verified) throw new Error("Contracts deployed, but post-deployment verification failed.");
  return {
    version: "81.0.0", chainId: 4663, deployedAt: new Date().toISOString(), deployer: wallet.address, owner,
    liquidityLocker: lockerAddress, launchFactory: factoryAddress,
    transactions: { locker: lockerReceipt.hash, factory: factoryReceipt.hash, bindFactory: bindReceipt.hash },
    launchesOpen: false, verification,
    vercelEnvironment: {
      LEVERAGEX_LIQUIDITY_LOCKER_ADDRESS: lockerAddress,
      LEVERAGEX_LAUNCH_FACTORY_ADDRESS: factoryAddress,
    },
  };
}
