import { functionSelector } from "@/lib/chain/keccak";

const EXPECTED_CHAIN_ID = 4_663;
const EXPLORER = "https://robinhoodchain.blockscout.com";
const DEFAULT_DEPLOYER = "0x728fa84c70f7b88ab59c86379745fddbbdd7ad07";
const DEFAULT_TRADER = "0x1728dc75f70070dc74ae2172ef94970e04d9830c";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

type RpcError = { code?: number; message?: string };
type RpcEnvelope<T> = { result?: T; error?: RpcError };

function rpcUrl() {
  return process.env.ROBINHOOD_MAINNET_RPC_URL
    ?? process.env.ROBINHOOD_CHAIN_RPC_URL
    ?? process.env.V48_RPC_URLS?.split(",").map((value) => value.trim()).find(Boolean)
    ?? "";
}

function factoryAddress() {
  const value = process.env.LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.NEXT_PUBLIC_V56_MAINNET_FACTORY_ADDRESS
    ?? "";
  return ADDRESS.test(value) ? value.toLowerCase() : "";
}

async function rpc<T>(url: string, method: string, params: unknown[] = [], timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 59, method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
    const payload = await response.json() as RpcEnvelope<T>;
    if (payload.error) throw new Error(payload.error.message ?? `RPC error ${payload.error.code ?? "unknown"}`);
    if (payload.result === undefined) throw new Error(`${method} returned no result.`);
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

function hexBigInt(value: string) {
  return /^0x[0-9a-fA-F]+$/.test(value) ? BigInt(value) : 0n;
}

function decodeAddress(value: string) {
  return `0x${value.replace(/^0x/, "").slice(-40)}`.toLowerCase();
}

async function call(url: string, address: string, signature: string) {
  return rpc<string>(url, "eth_call", [{ to: address, data: functionSelector(signature) }, "latest"]);
}

export async function readV59MainnetReadiness() {
  const url = rpcUrl();
  const factory = factoryAddress();
  const configuredDeployer = process.env.V59_EXPECTED_DEPLOYER_ADDRESS ?? "";
  const configuredTrader = process.env.V59_FIRST_TRADER_ADDRESS ?? "";
  const expectedDeployer = ADDRESS.test(configuredDeployer) ? configuredDeployer.toLowerCase() : DEFAULT_DEPLOYER;
  const firstTrader = ADDRESS.test(configuredTrader) ? configuredTrader.toLowerCase() : DEFAULT_TRADER;
  const releaseStage = process.env.NEXT_PUBLIC_LEVERAGEX_RELEASE_STAGE ?? "build";

  const base = {
    product: "leverage X",
    version: "V59",
    checkedAt: new Date().toISOString(),
    chain: {
      name: "Robinhood Chain Mainnet",
      expectedChainId: EXPECTED_CHAIN_ID,
      chainId: null as number | null,
      latestBlock: null as number | null,
      latestBlockAgeSeconds: null as number | null,
      gasPriceWei: null as string | null,
      rpcConfigured: Boolean(url),
      rpcHealthy: false,
      explorer: EXPLORER,
    },
    accounts: {
      expectedDeployer,
      deployerBalanceWei: null as string | null,
      firstTrader,
    },
    factory: {
      configured: Boolean(factory),
      address: factory || null,
      codePresent: false,
      owner: null as string | null,
      ownerMatchesExpected: false,
      launchMode: null as number | null,
      launchModeLabel: "not deployed",
      globalTradingPaused: null as boolean | null,
      newMarketsPaused: null as boolean | null,
      marketCount: null as string | null,
    },
    release: {
      stage: releaseStage,
      mainnetUiEnabled: process.env.NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED === "true"
        || process.env.NEXT_PUBLIC_V56_MAINNET_ENABLED === "true",
      perpsEnabled: false,
    },
    gates: {
      rpcReady: false,
      factoryDeployable: false,
      factorySafelyDeployed: false,
      sourceVerificationRequired: Boolean(factory),
      canaryActivationAllowed: false,
    },
    error: null as string | null,
  };

  if (!url) {
    base.error = "Server-only Robinhood Chain mainnet RPC is not configured.";
    return base;
  }

  try {
    const chainId = Number(hexBigInt(await rpc<string>(url, "eth_chainId")));
    const blockHex = await rpc<string>(url, "eth_blockNumber");
    const latestBlock = Number(hexBigInt(blockHex));
    const block = await rpc<{ timestamp: string }>(url, "eth_getBlockByNumber", [blockHex, false]);
    const blockAgeSeconds = Math.max(0, Math.floor(Date.now() / 1000) - Number(hexBigInt(block.timestamp)));
    const gasPriceWei = hexBigInt(await rpc<string>(url, "eth_gasPrice"));
    const deployerBalanceWei = hexBigInt(await rpc<string>(url, "eth_getBalance", [expectedDeployer, "latest"]));

    base.chain.chainId = chainId;
    base.chain.latestBlock = latestBlock;
    base.chain.latestBlockAgeSeconds = blockAgeSeconds;
    base.chain.gasPriceWei = gasPriceWei.toString();
    base.chain.rpcHealthy = chainId === EXPECTED_CHAIN_ID && blockAgeSeconds <= 600;
    base.accounts.deployerBalanceWei = deployerBalanceWei.toString();
    base.gates.rpcReady = base.chain.rpcHealthy;
    base.gates.factoryDeployable = base.chain.rpcHealthy && !factory;

    if (factory) {
      const code = await rpc<string>(url, "eth_getCode", [factory, "latest"]);
      base.factory.codePresent = code !== "0x";
      if (base.factory.codePresent) {
        const [ownerRaw, launchModeRaw, globalPausedRaw, newMarketsPausedRaw, marketCountRaw] = await Promise.all([
          call(url, factory, "owner()"),
          call(url, factory, "launchMode()"),
          call(url, factory, "globalTradingPaused()"),
          call(url, factory, "newMarketsPaused()"),
          call(url, factory, "marketCount()"),
        ]);
        const launchMode = Number(hexBigInt(launchModeRaw));
        base.factory.owner = decodeAddress(ownerRaw);
        base.factory.ownerMatchesExpected = base.factory.owner === expectedDeployer;
        base.factory.launchMode = launchMode;
        base.factory.launchModeLabel = ["closed", "allowlist", "public"][launchMode] ?? `unknown(${launchMode})`;
        base.factory.globalTradingPaused = hexBigInt(globalPausedRaw) !== 0n;
        base.factory.newMarketsPaused = hexBigInt(newMarketsPausedRaw) !== 0n;
        base.factory.marketCount = hexBigInt(marketCountRaw).toString();
        base.gates.factorySafelyDeployed = base.factory.ownerMatchesExpected
          && launchMode === 0
          && base.factory.globalTradingPaused === true
          && base.factory.newMarketsPaused === true;
        base.gates.canaryActivationAllowed = false;
      }
    }
  } catch (error) {
    base.error = error instanceof Error ? error.message : "Mainnet readiness probe failed.";
  }

  return base;
}
