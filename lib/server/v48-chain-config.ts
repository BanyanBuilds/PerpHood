export type V48ChainEnvironment = "local" | "testnet" | "mainnet";

export type V48ChainConfig = {
  environment: V48ChainEnvironment;
  chainId: number;
  name: string;
  nativeSymbol: "ETH";
  publicRpcUrls: string[];
  explorerUrl: string;
  canonicalWethAddress?: string;
  applicationConfirmations: number;
  maxIndexerBatchSize: number;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const PRESETS: Record<V48ChainEnvironment, V48ChainConfig> = {
  local: {
    environment: "local",
    chainId: 31_337,
    name: "PERPHOOD Local Anvil",
    nativeSymbol: "ETH",
    publicRpcUrls: ["http://127.0.0.1:8545"],
    explorerUrl: "",
    applicationConfirmations: 0,
    maxIndexerBatchSize: 250,
  },
  testnet: {
    environment: "testnet",
    chainId: 46_630,
    name: "Robinhood Chain Testnet",
    nativeSymbol: "ETH",
    publicRpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    applicationConfirmations: 2,
    maxIndexerBatchSize: 1_000,
  },
  mainnet: {
    environment: "mainnet",
    chainId: 4_663,
    name: "Robinhood Chain",
    nativeSymbol: "ETH",
    publicRpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
    explorerUrl: "https://robinhoodchain.blockscout.com",
    canonicalWethAddress: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    applicationConfirmations: 12,
    maxIndexerBatchSize: 2_000,
  },
};

function list(value?: string) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function integer(value: string | undefined, fallback: number, minimum = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

export function resolveV48Environment(value = process.env.V48_CHAIN_ENV): V48ChainEnvironment {
  if (value === "mainnet" || value === "testnet" || value === "local") return value;
  return process.env.NODE_ENV === "production" ? "mainnet" : "local";
}

export function getV48ChainConfig(environment = resolveV48Environment()): V48ChainConfig {
  const preset = PRESETS[environment];
  const rpcUrls = list(process.env.V48_RPC_URLS);
  const canonicalWethAddress = process.env.V48_CANONICAL_WETH_ADDRESS ?? preset.canonicalWethAddress;
  if (canonicalWethAddress && !ADDRESS.test(canonicalWethAddress)) throw new Error("V48_CANONICAL_WETH_ADDRESS must be a valid EVM address.");
  const config: V48ChainConfig = {
    ...preset,
    publicRpcUrls: rpcUrls.length ? rpcUrls : preset.publicRpcUrls,
    canonicalWethAddress,
    applicationConfirmations: integer(process.env.V48_FINALITY_CONFIRMATIONS, preset.applicationConfirmations),
    maxIndexerBatchSize: integer(process.env.V48_INDEXER_BATCH_SIZE, preset.maxIndexerBatchSize, 1),
  };
  if (!config.publicRpcUrls.length) throw new Error("At least one V48 RPC endpoint is required.");
  return config;
}

export function assertV48ChainId(actualChainId: number, config = getV48ChainConfig()) {
  if (actualChainId !== config.chainId) throw new Error(`RPC chain mismatch: expected ${config.chainId}, received ${actualChainId}.`);
  return true;
}

export function v48ChainPublicSummary(config = getV48ChainConfig()) {
  return {
    environment: config.environment,
    chainId: config.chainId,
    name: config.name,
    nativeSymbol: config.nativeSymbol,
    explorerUrl: config.explorerUrl,
    canonicalWethAddress: config.canonicalWethAddress ?? null,
    applicationConfirmations: config.applicationConfirmations,
    rpcProviderCount: config.publicRpcUrls.length,
  };
}
