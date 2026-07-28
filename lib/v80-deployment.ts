import { ContractFactory, JsonRpcProvider, Wallet, getAddress, isAddress } from "ethers";
import artifact from "@/artifacts/v80/mint-path.json";

export const RH_CHAIN_ID = 4663n;
export const DEFAULT_RH_RPC = "https://rpc.mainnet.chain.robinhood.com";
export const CANONICAL = {
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  uniswapV3Factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  positionManager: "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3",
  swapRouter02: "0xCaf681a66D020601342297493863E78C959E5cb2",
} as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

export async function deploymentStatus() {
  const rpcUrl = process.env.RH_RPC_URL?.trim() || DEFAULT_RH_RPC;
  const provider = new JsonRpcProvider(rpcUrl, Number(RH_CHAIN_ID), { staticNetwork: true });
  const network = await provider.getNetwork();
  if (network.chainId !== RH_CHAIN_ID) throw new Error(`Wrong RPC chain: ${network.chainId}`);
  const canonicalCode = Object.fromEntries(
    await Promise.all(Object.entries(CANONICAL).map(async ([key, address]) => [key, (await provider.getCode(address)) !== "0x"])),
  );
  const locker = process.env.LEVERAGEX_LIQUIDITY_LOCKER_ADDRESS?.trim() || null;
  const factory = process.env.LEVERAGEX_LAUNCH_FACTORY_ADDRESS?.trim() || null;
  const [lockerLive, factoryLive] = await Promise.all([
    locker && isAddress(locker) ? provider.getCode(locker).then((x) => x !== "0x") : Promise.resolve(false),
    factory && isAddress(factory) ? provider.getCode(factory).then((x) => x !== "0x") : Promise.resolve(false),
  ]);
  return { chainId: Number(network.chainId), canonicalCode, locker, factory, lockerLive, factoryLive };
}

export async function deployLaunchContracts() {
  const rpcUrl = process.env.RH_RPC_URL?.trim() || DEFAULT_RH_RPC;
  const privateKey = required("LEVERAGEX_DEPLOYER_PRIVATE_KEY");
  const ownerRaw = required("LEVERAGEX_OWNER");
  if (!isAddress(ownerRaw)) throw new Error("LEVERAGEX_OWNER is not a valid address.");
  const owner = getAddress(ownerRaw);
  const provider = new JsonRpcProvider(rpcUrl, Number(RH_CHAIN_ID), { staticNetwork: true });
  const network = await provider.getNetwork();
  if (network.chainId !== RH_CHAIN_ID) throw new Error(`Refusing deployment on chain ${network.chainId}.`);

  for (const [name, address] of Object.entries(CANONICAL)) {
    if ((await provider.getCode(address)) === "0x") throw new Error(`Canonical ${name} has no bytecode at ${address}.`);
  }

  const wallet = new Wallet(privateKey, provider);
  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n) throw new Error("Deployment wallet has no ETH for gas.");

  const lockerArtifact = artifact.contracts.LeverageXPermanentLiquidityLockerV65;
  const factoryArtifact = artifact.contracts.LeverageXLaunchFactoryV65;
  const lockerFactory = new ContractFactory(lockerArtifact.abi, lockerArtifact.bytecode, wallet);
  const locker = await lockerFactory.deploy(owner, CANONICAL.uniswapV3Factory, CANONICAL.positionManager, CANONICAL.weth);
  const lockerReceipt = await locker.deploymentTransaction()?.wait(1);
  const lockerAddress = await locker.getAddress();
  if (!lockerReceipt || (await provider.getCode(lockerAddress)) === "0x") throw new Error("Liquidity locker deployment was not confirmed.");

  const launchFactoryFactory = new ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const launchFactory = await launchFactoryFactory.deploy(
    owner,
    CANONICAL.uniswapV3Factory,
    CANONICAL.positionManager,
    CANONICAL.swapRouter02,
    CANONICAL.weth,
    lockerAddress,
  );
  const factoryReceipt = await launchFactory.deploymentTransaction()?.wait(1);
  const launchFactoryAddress = await launchFactory.getAddress();
  if (!factoryReceipt || (await provider.getCode(launchFactoryAddress)) === "0x") throw new Error("Launch factory deployment was not confirmed.");

  const bindTx = await locker.bindFactory(launchFactoryAddress);
  const bindReceipt = await bindTx.wait(1);
  if (!bindReceipt) throw new Error("Locker/factory binding was not confirmed.");

  return {
    version: "80.0.0",
    chainId: Number(RH_CHAIN_ID),
    deployedAt: new Date().toISOString(),
    deployer: wallet.address,
    owner,
    liquidityLocker: lockerAddress,
    launchFactory: launchFactoryAddress,
    transactions: {
      locker: lockerReceipt.hash,
      factory: factoryReceipt.hash,
      bindFactory: bindReceipt.hash,
    },
    launchesOpen: false,
  };
}
