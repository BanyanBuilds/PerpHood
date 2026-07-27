import "server-only";

import { encodeAddress, encodeCall, encodeUint } from "@/lib/chain/abi";
import { functionSelector } from "@/lib/chain/keccak";
import { readV59MainnetReadiness } from "@/lib/server/v59-mainnet-readiness";

const DEFAULT_CREATOR = "0x728fa84c70f7b88ab59c86379745fddbbdd7ad07";
const DEFAULT_TRADER = "0x1728dc75f70070dc74ae2172ef94970e04d9830c";
const EXPECTED_MAX_BUY_WEI = 10_000_000_000_000_000n;
const EXPECTED_MAX_SELL_WAD = 5_000_000n * 10n ** 18n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

type RpcEnvelope<T> = { result?: T; error?: { code?: number; message?: string } };

function rpcUrl() {
  return process.env.ROBINHOOD_MAINNET_RPC_URL
    ?? process.env.ROBINHOOD_CHAIN_RPC_URL
    ?? process.env.V48_RPC_URLS?.split(",").map((value) => value.trim()).find(Boolean)
    ?? "";
}

function configuredFactory() {
  const value = process.env.LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.NEXT_PUBLIC_V56_MAINNET_FACTORY_ADDRESS
    ?? "";
  return ADDRESS.test(value) ? value.toLowerCase() : "";
}

function configuredAddress(value: string | undefined, fallback: string) {
  return ADDRESS.test(value ?? "") ? String(value).toLowerCase() : fallback;
}

async function rpc<T>(url: string, method: string, params: unknown[] = [], timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 60, method, params }),
      cache: "no-store",
      signal: controller.signal,
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

function uint(value: string) { return /^0x[0-9a-fA-F]+$/.test(value) ? BigInt(value) : 0n; }
function address(value: string) { return `0x${value.replace(/^0x/, "").slice(-40)}`.toLowerCase(); }
function bool(value: string) { return uint(value) !== 0n; }

async function call(url: string, target: string, data: string) {
  return rpc<string>(url, "eth_call", [{ to: target, data }, "latest"]);
}

async function staticCall(url: string, target: string, signature: string) {
  return call(url, target, functionSelector(signature));
}

export async function readV60CanaryReadiness() {
  const v59 = await readV59MainnetReadiness();
  const url = rpcUrl();
  const factory = configuredFactory();
  const creator = configuredAddress(process.env.NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS ?? process.env.V60_CANARY_CREATOR_ADDRESS, DEFAULT_CREATOR);
  const trader = configuredAddress(process.env.V59_FIRST_TRADER_ADDRESS, DEFAULT_TRADER);

  const result = {
    product: "leverage X",
    version: "V60",
    checkedAt: new Date().toISOString(),
    chain: v59.chain,
    accounts: {
      owner: v59.factory.owner,
      canaryCreator: creator,
      firstTrader: trader,
      creatorBalanceWei: null as string | null,
      traderBalanceWei: null as string | null,
      creatorIsEoa: false,
      traderIsEoa: false,
    },
    factory: {
      ...v59.factory,
      canaryCreatorAllowed: false,
      activeCanaryCreator: null as string | null,
      defaultMaxBuyWei: null as string | null,
      defaultMaxSellTokenWad: null as string | null,
    },
    market: {
      configured: false,
      address: null as string | null,
      token: null as string | null,
      creator: null as string | null,
      paused: null as boolean | null,
      maxBuyWei: null as string | null,
      maxSellTokenWad: null as string | null,
      tradeCount: null as string | null,
    },
    release: {
      stage: process.env.NEXT_PUBLIC_LEVERAGEX_RELEASE_STAGE ?? "factory-preflight",
      mainnetUiEnabled: process.env.NEXT_PUBLIC_LEVERAGEX_MAINNET_ENABLED === "true"
        || process.env.NEXT_PUBLIC_V56_MAINNET_ENABLED === "true",
      canaryCreatorRestricted: Boolean(process.env.NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS),
      perpsEnabled: false,
    },
    gates: {
      rpcReady: v59.gates.rpcReady,
      factoryClosedAndPaused: v59.gates.factorySafelyDeployed,
      canaryConfigurationReady: false,
      canaryLaunchReady: false,
      firstMarketCreated: false,
      spotCanaryOpen: false,
      publicLaunchesAllowed: false,
      perpsAllowed: false,
    },
    error: v59.error,
  };

  if (!url || !factory || !v59.factory.codePresent) return result;

  try {
    const [creatorCode, traderCode, creatorBalance, traderBalance, creatorAllowedRaw, activeCreatorRaw, maxBuyRaw, maxSellRaw] = await Promise.all([
      rpc<string>(url, "eth_getCode", [creator, "latest"]),
      rpc<string>(url, "eth_getCode", [trader, "latest"]),
      rpc<string>(url, "eth_getBalance", [creator, "latest"]),
      rpc<string>(url, "eth_getBalance", [trader, "latest"]),
      call(url, factory, encodeCall("canaryCreator(address)", [encodeAddress(creator)])),
      staticCall(url, factory, "activeCanaryCreator()"),
      staticCall(url, factory, "defaultMaxBuyWei()"),
      staticCall(url, factory, "defaultMaxSellTokenWad()"),
    ]);
    result.accounts.creatorBalanceWei = uint(creatorBalance).toString();
    result.accounts.traderBalanceWei = uint(traderBalance).toString();
    result.accounts.creatorIsEoa = creatorCode === "0x";
    result.accounts.traderIsEoa = traderCode === "0x";
    result.factory.canaryCreatorAllowed = bool(creatorAllowedRaw);
    result.factory.activeCanaryCreator = address(activeCreatorRaw);
    result.factory.defaultMaxBuyWei = uint(maxBuyRaw).toString();
    result.factory.defaultMaxSellTokenWad = uint(maxSellRaw).toString();

    const canaryConfigured = v59.factory.ownerMatchesExpected
      && v59.factory.launchMode === 1
      && v59.factory.globalTradingPaused === true
      && v59.factory.newMarketsPaused === true
      && result.factory.canaryCreatorAllowed
      && result.factory.activeCanaryCreator === creator
      && uint(maxBuyRaw) === EXPECTED_MAX_BUY_WEI
      && uint(maxSellRaw) === EXPECTED_MAX_SELL_WAD
      && result.accounts.creatorIsEoa
      && result.accounts.traderIsEoa;
    result.gates.canaryConfigurationReady = canaryConfigured;
    result.gates.canaryLaunchReady = canaryConfigured && result.release.mainnetUiEnabled && result.release.canaryCreatorRestricted;

    const count = BigInt(v59.factory.marketCount ?? "0");
    if (count > 0n) {
      const marketRaw = await call(url, factory, encodeCall("marketAt(uint256)", [encodeUint(0)]));
      const marketAddress = address(marketRaw);
      const [tokenRaw, creatorRaw, pausedRaw, marketMaxBuyRaw, marketMaxSellRaw, tradeCountRaw] = await Promise.all([
        staticCall(url, marketAddress, "token()"),
        staticCall(url, marketAddress, "creator()"),
        staticCall(url, marketAddress, "paused()"),
        staticCall(url, marketAddress, "maxBuyWei()"),
        staticCall(url, marketAddress, "maxSellTokenWad()"),
        staticCall(url, marketAddress, "tradeCount()"),
      ]);
      result.market = {
        configured: true,
        address: marketAddress,
        token: address(tokenRaw),
        creator: address(creatorRaw),
        paused: bool(pausedRaw),
        maxBuyWei: uint(marketMaxBuyRaw).toString(),
        maxSellTokenWad: uint(marketMaxSellRaw).toString(),
        tradeCount: uint(tradeCountRaw).toString(),
      };
      result.gates.firstMarketCreated = count === 1n
        && result.market.creator === creator
        && result.market.tradeCount === "1"
        && result.market.paused === true;
      result.gates.spotCanaryOpen = count === 1n
        && v59.factory.launchMode === 1
        && v59.factory.globalTradingPaused === false
        && v59.factory.newMarketsPaused === true
        && result.market.paused === false
        && result.market.maxBuyWei === EXPECTED_MAX_BUY_WEI.toString()
        && result.market.maxSellTokenWad === EXPECTED_MAX_SELL_WAD.toString();
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "V60 canary readiness probe failed.";
  }
  return result;
}
