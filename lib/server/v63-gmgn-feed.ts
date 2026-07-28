import "server-only";

import { isV54LaunchStorageConfigured, listV55IndexerLaunches } from "@/lib/server/v54-launch-server";

export const V63_CHAIN_ID = 4_663;
export const V63_WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
export const V63_TOKEN_LAUNCHED_EVENT = "TokenLaunched(address,address,address,address,uint256,uint256,bytes32)";
export const V63_MARKET_CREATED_EVENT = "MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)";
export const V63_TRADE_EVENT = "Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)";
export const V63_TOKEN_GRADUATED_EVENT = "TokenGraduated(address,address,address,address,address,uint24)";
export const V63_EVENT_TOPICS = {
  tokenLaunched: "0xa3bbbf73cae8c04d1fafa24105a16f1d2e7d32ab4017881c8b1939163fdedbe8",
  marketCreated: "0xf78d1aaf35b24194aa29e01cf246ad29013ef322854e534d23c870a204781354",
  trade: "0x0c668488dc690d00c35c03638df49a1c8a7b63511eba0f88eeed1bd471719b16",
  tokenGraduated: "0x3d0f06ac1656093b56714b15b1ed46271277c04a83a310c09665bf01c2b0a218",
} as const;

function cleanAddress(value: unknown) {
  const address = String(value ?? "").toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(address) ? address : null;
}

function stringValue(value: unknown) {
  return value === null || value === undefined ? "" : String(value);
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function v63FactoryAddress() {
  return cleanAddress(
    process.env.LEVERAGEX_FACTORY_ADDRESS
      ?? process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS
      ?? process.env.V63_MAINNET_FACTORY_ADDRESS,
  );
}

export function v63DeploymentBlock() {
  const value = Number(process.env.LEVERAGEX_FACTORY_DEPLOYMENT_BLOCK ?? process.env.V63_FACTORY_DEPLOYMENT_BLOCK ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

type V63GraduationMapping = {
  canonicalPool: string;
  dexFactory: string;
  pairToken: string;
  poolFeeBps: number;
  blockNumber: number;
};

async function listV63GraduationMappings() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return new Map<string, V63GraduationMapping>();
  const query = "/rest/v1/leveragex_v63_chain_events?select=token_address,payload,block_number&event_name=eq.TokenGraduated&canonical=eq.true&order=block_number.desc,transaction_index.desc,log_index.desc&limit=2000";
  const response = await fetch(`${base}${query}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!response.ok) return new Map<string, V63GraduationMapping>();
  const rows = await response.json() as Array<Record<string, unknown>>;
  const mappings = new Map<string, V63GraduationMapping>();
  for (const row of rows) {
    const token = cleanAddress(row.token_address);
    const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
    const canonicalPool = cleanAddress(payload.canonicalPool);
    const dexFactory = cleanAddress(payload.dexFactory);
    const pairToken = cleanAddress(payload.pairToken);
    if (!token || !canonicalPool || !dexFactory || !pairToken || mappings.has(token)) continue;
    mappings.set(token, {
      canonicalPool,
      dexFactory,
      pairToken,
      poolFeeBps: numberValue(payload.poolFee),
      blockNumber: numberValue(row.block_number),
    });
  }
  return mappings;
}

export function v63Manifest(origin?: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? origin ?? "https://perp-hood.vercel.app").replace(/\/$/, "");
  const factoryAddress = v63FactoryAddress();
  const deploymentBlock = v63DeploymentBlock();
  return {
    schema: "https://leveragex.fun/schemas/launchpad-manifest-v1.json",
    protocol: "LEVERAGE X",
    version: "V63",
    launchpadId: "leverage-x-robinhood",
    chain: {
      name: "Robinhood Chain",
      chainId: V63_CHAIN_ID,
      nativeCurrency: "ETH",
      wrappedNativeToken: V63_WETH,
      explorer: "https://robinhoodchain.blockscout.com",
    },
    attribution: {
      factoryAddress,
      deploymentBlock,
      contractVersion: "LeverageXLaunchFactoryV63",
      sourceVerified: process.env.LEVERAGEX_FACTORY_SOURCE_VERIFIED === "true",
      status: factoryAddress && deploymentBlock ? "configured" : "pre-deployment",
    },
    tokenStandard: {
      standard: "ERC-20",
      decimals: 18,
      fixedSupply: "1000000000000000000000000000",
      transferTaxBps: 0,
      creatorFreeAllocation: "0",
      hiddenMinting: false,
      blacklist: false,
    },
    marketModel: {
      phaseOne: "Leverage X ETH bonding market",
      phaseTwo: "external canonical DEX pool after recorded graduation",
      quoteToken: V63_WETH,
      pricing: "Read marginalPriceWad()/runtimeState() before graduation; use canonical external pool after TokenGraduated.",
    },
    events: {
      tokenLaunched: { signature: V63_TOKEN_LAUNCHED_EVENT, topic0: V63_EVENT_TOPICS.tokenLaunched },
      marketCreated: { signature: V63_MARKET_CREATED_EVENT, topic0: V63_EVENT_TOPICS.marketCreated },
      trade: { signature: V63_TRADE_EVENT, topic0: V63_EVENT_TOPICS.trade },
      tokenGraduated: { signature: V63_TOKEN_GRADUATED_EVENT, topic0: V63_EVENT_TOPICS.tokenGraduated },
      transfer: { signature: "Transfer(address,address,uint256)", topic0: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" },
    },
    reads: {
      getLaunchedToken: "getLaunchedToken(address)",
      getTokenInfo: "getTokenInfo(address)",
      graduationStatus: "graduationStatus(address)",
      isLeverageXToken: "isLeverageXToken(address)",
      tokenCount: "tokenCount()",
      allTokens: "allTokens(uint256)",
      marketRuntime: "runtimeState()",
      tokenMetadata: "metadataURI()",
    },
    endpoints: {
      manifest: `${base}/api/v63/gmgn/manifest`,
      launches: `${base}/api/v63/gmgn/launches`,
      token: `${base}/api/v63/gmgn/token/{tokenAddress}`,
      wellKnown: `${base}/.well-known/leveragex-launchpad`,
      canaryEvidence: `${base}/api/v64/gmgn/evidence`,
      factoryAbi: `${base}/integrations/gmgn/abi/LeverageXLaunchFactoryV63.json`,
      tokenAbi: `${base}/integrations/gmgn/abi/LeverageXTokenV63.json`,
      marketAbi: `${base}/integrations/gmgn/abi/LeverageXSpotMarketV63.json`,
      discoveryLegacy: `${base}/api/v62/discovery`,
    },
    indexing: {
      replayOrder: ["blockNumber", "transactionIndex", "logIndex"],
      confirmations: 3,
      reorgPolicy: "Store block hash and mark replaced logs non-canonical before replay.",
      metadataSchemes: ["https://", "ipfs://", "ar://"],
    },
    disclaimer: "An official GMGN launchpad label requires GMGN onboarding. This manifest makes Leverage X launches deterministic to discover and backfill.",
  };
}

export function mapV63Launch(row: Record<string, unknown>) {
  const tokenAddress = cleanAddress(row.token_address);
  const marketAddress = cleanAddress(row.market_address);
  const factoryAddress = cleanAddress(row.factory_address);
  const creatorAddress = cleanAddress(row.creator_address);
  return {
    launchpadId: "leverage-x-robinhood",
    launchpad: "leverage X",
    protocol: "LEVERAGE X",
    version: "V63",
    chainId: numberValue(row.chain_id),
    network: stringValue(row.network),
    factoryAddress,
    deploymentBlock: v63DeploymentBlock(),
    tokenAddress,
    creatorAddress,
    bondingMarket: marketAddress,
    canonicalPool: marketAddress,
    poolAddress: marketAddress,
    pairToken: V63_WETH.toLowerCase(),
    quoteTokenAddress: V63_WETH.toLowerCase(),
    dexFactory: factoryAddress,
    poolType: "leveragex-bonding-v1",
    poolFeeBps: 30,
    graduated: stringValue(row.status) === "migrated",
    graduationBlockNumber: null as number | null,
    transactionHash: stringValue(row.transaction_hash).toLowerCase(),
    blockNumber: numberValue(row.block_number),
    name: stringValue(row.name),
    symbol: stringValue(row.symbol),
    decimals: 18,
    totalSupply: "1000000000000000000000000000",
    metadataUri: stringValue(row.metadata_uri),
    metadataHash: stringValue(row.metadata_hash).toLowerCase(),
    imageUrl: stringValue(row.image_url),
    description: stringValue(row.description),
    socials: {
      website: stringValue(row.website),
      twitter: stringValue(row.x_handle),
      telegram: stringValue(row.telegram),
    },
    creatorInitialBuyWei: stringValue(row.creator_buy_wei),
    creatorTokensOutWad: stringValue(row.creator_tokens_out_wad),
    launchMarketCapEthWad: stringValue(row.market_cap_eth_wad),
    migrationTargetUsdWad: stringValue(row.migration_target_usd_wad),
    status: stringValue(row.status),
    explorer: tokenAddress ? `https://robinhoodchain.blockscout.com/address/${tokenAddress}` : null,
  };
}

export async function listV63GmgnLaunches(options: { limit?: number; token?: string; creator?: string; fromBlock?: number } = {}) {
  if (!isV54LaunchStorageConfigured()) return { configured: false, launches: [] as ReturnType<typeof mapV63Launch>[] };
  const requestedLimit = Number(options.limit ?? 250);
  const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, Math.floor(requestedLimit))) : 250;
  const token = cleanAddress(options.token)?.toLowerCase() ?? null;
  const creator = cleanAddress(options.creator)?.toLowerCase() ?? null;
  const requestedFromBlock = Number(options.fromBlock ?? 0);
  const fromBlock = Number.isSafeInteger(requestedFromBlock) && requestedFromBlock > 0 ? requestedFromBlock : 0;
  const [rows, graduationMappings] = await Promise.all([
    listV55IndexerLaunches(2_000),
    listV63GraduationMappings(),
  ]);
  const launches = rows
    .map(mapV63Launch)
    .map((launch) => {
      const graduation = launch.tokenAddress ? graduationMappings.get(launch.tokenAddress) : undefined;
      if (!graduation) return launch;
      return {
        ...launch,
        canonicalPool: graduation.canonicalPool,
        pairToken: graduation.pairToken,
        dexFactory: graduation.dexFactory,
        poolType: "external-dex",
        poolFeeBps: graduation.poolFeeBps,
        graduated: true,
        graduationBlockNumber: graduation.blockNumber,
      };
    })
    .filter((launch) => launch.chainId === V63_CHAIN_ID)
    .filter((launch) => !token || launch.tokenAddress === token)
    .filter((launch) => !creator || launch.creatorAddress === creator)
    .filter((launch) => !fromBlock || launch.blockNumber >= fromBlock)
    .sort((a, b) => b.blockNumber - a.blockNumber)
    .slice(0, limit);
  return { configured: true, launches };
}
