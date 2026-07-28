import "server-only";

import { isV65LaunchStorageConfigured, listV65Launches } from "@/lib/server/v65-launch-server";
import {
  V65_CANONICAL_POOL_EVENT,
  V65_CANONICAL_POOL_FEE,
  V65_OPENING_FDV_ETH_WAD,
  V65_POSITION_MANAGER,
  V65_QUOTER_V2,
  V65_SWAP_ROUTER_02,
  V65_TARGET_FDV_ETH_WAD,
  V65_TOKEN_LAUNCHED_EVENT,
  V65_TOTAL_SUPPLY_WAD,
  V65_UNISWAP_V3_FACTORY,
  V65_WETH,
} from "@/lib/chain/robinhood-v65";

export const V65_CHAIN_ID = 4_663;
export const V65_TOKEN_GRADUATED_EVENT = "TokenGraduated(address,address,uint256,address,uint24)";
export const V65_POOL_EVENTS = {
  initialize: { signature: "Initialize(uint160,int24)", topic0: "0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95" },
  mint: { signature: "Mint(address,address,int24,int24,uint128,uint256,uint256)", topic0: "0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde" },
  burn: { signature: "Burn(address,int24,int24,uint128,uint256,uint256)", topic0: "0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45908acfd67e028cd568da98982c" },
  collect: { signature: "Collect(address,address,int24,int24,uint128,uint128)", topic0: "0x70935338e69775456a85ddef226c395fb668b63fa0115f5f20610b388e6ca9c0" },
  swap: { signature: "Swap(address,address,int256,int256,uint160,uint128,int24)", topic0: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67" },
} as const;

export const V65_EVENT_TOPICS = {
  tokenLaunched: "0x6a01ec9b9da2fbadef86c83182bf823e3a51fd7ac745df9bbc27bc9154171751",
  canonicalPoolCreated: "0x3a6dc9b4ef8987d25c56faf6f0a32485a6a40c5b253d8243b2128d44c6500f20",
  tokenGraduated: "0xfe904242a86b7371d8a98cc9728aa782201483135c42baae94260231d413fd3c",
  transfer: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
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

export function v65FactoryAddress() {
  return cleanAddress(process.env.LEVERAGEX_V65_FACTORY_ADDRESS
    ?? process.env.LEVERAGEX_FACTORY_ADDRESS
    ?? process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS);
}

export function v65LockerAddress() {
  return cleanAddress(process.env.LEVERAGEX_V65_LIQUIDITY_LOCKER_ADDRESS);
}

export function v65DeploymentBlock() {
  const value = Number(process.env.LEVERAGEX_V65_FACTORY_DEPLOYMENT_BLOCK ?? process.env.LEVERAGEX_FACTORY_DEPLOYMENT_BLOCK ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function v65Manifest(origin?: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? origin ?? "https://perp-hood.vercel.app").replace(/\/$/, "");
  const factoryAddress = v65FactoryAddress();
  const deploymentBlock = v65DeploymentBlock();
  return {
    schema: "https://leveragex.fun/schemas/launchpad-manifest-v2.json",
    protocol: "LEVERAGE X",
    version: "V65",
    launchpadId: "leverage-x-robinhood",
    purpose: "GMGN-readable Robinhood Chain memecoin launches with a canonical Uniswap V3 pool from the first confirmed launch transaction.",
    chain: {
      name: "Robinhood Chain",
      chainId: V65_CHAIN_ID,
      nativeCurrency: "ETH",
      wrappedNativeToken: V65_WETH.toLowerCase(),
      explorer: "https://robinhoodchain.blockscout.com",
    },
    attribution: {
      factoryAddress,
      deploymentBlock,
      liquidityLocker: v65LockerAddress(),
      contractVersion: "LeverageXLaunchFactoryV65",
      sourceVerified: process.env.LEVERAGEX_V65_SOURCE_VERIFIED === "true",
      officialGmgnLabel: false,
      status: factoryAddress && deploymentBlock ? "configured" : "pre-deployment",
    },
    tokenStandard: {
      standard: "ERC-20",
      decimals: 18,
      fixedSupply: V65_TOTAL_SUPPLY_WAD.toString(),
      transferTaxBps: 0,
      creatorFreeAllocation: "0",
      hiddenMinting: false,
      blacklist: false,
    },
    canonicalMarket: {
      model: "Uniswap V3 concentrated-liquidity launch range, followed by permanent full-range liquidity in the same pool",
      poolFromFirstBlock: true,
      poolFactory: V65_UNISWAP_V3_FACTORY,
      nonfungiblePositionManager: V65_POSITION_MANAGER,
      swapRouter02: V65_SWAP_ROUTER_02,
      quoterV2: V65_QUOTER_V2,
      pairToken: V65_WETH,
      poolFee: V65_CANONICAL_POOL_FEE,
      openingFdvEthWad: V65_OPENING_FDV_ETH_WAD.toString(),
      targetFdvEthWad: V65_TARGET_FDV_ETH_WAD.toString(),
      liquidityCustody: "Permanent immutable Leverage X locker; no creator withdrawal or rescue surface.",
      standardPoolEvents: V65_POOL_EVENTS,
    },
    launchEvents: {
      tokenLaunched: { signature: V65_TOKEN_LAUNCHED_EVENT, topic0: V65_EVENT_TOPICS.tokenLaunched },
      canonicalPoolCreated: { signature: V65_CANONICAL_POOL_EVENT, topic0: V65_EVENT_TOPICS.canonicalPoolCreated },
      tokenGraduated: { signature: V65_TOKEN_GRADUATED_EVENT, topic0: V65_EVENT_TOPICS.tokenGraduated },
      transfer: { signature: "Transfer(address,address,uint256)", topic0: V65_EVENT_TOPICS.transfer },
    },
    reads: {
      getLaunchedToken: "getLaunchedToken(address)",
      getTokenInfo: "getTokenInfo(address)",
      canonicalPoolForToken: "canonicalPoolForToken(address)",
      marketForToken: "marketForToken(address)",
      launchAt: "launchAt(uint256)",
      graduationStatus: "graduationStatus(address)",
      isLeverageXToken: "isLeverageXToken(address)",
      tokenCount: "tokenCount()",
      allTokens: "allTokens(uint256)",
      dexConfiguration: "canonicalDexConfiguration()",
    },
    endpoints: {
      manifest: `${base}/api/v65/gmgn/manifest`,
      launches: `${base}/api/v65/gmgn/launches`,
      token: `${base}/api/v65/gmgn/token/{tokenAddress}`,
      poolEvents: `${base}/api/v65/gmgn/pool-events?pool={poolAddress}`,
      evidence: `${base}/api/v65/gmgn/evidence`,
      wellKnown: `${base}/.well-known/leveragex-launchpad`,
      factoryAbi: `${base}/integrations/gmgn/abi/LeverageXLaunchFactoryV65.json`,
      tokenAbi: `${base}/integrations/gmgn/abi/LeverageXTokenV65.json`,
      lockerAbi: `${base}/integrations/gmgn/abi/LeverageXPermanentLiquidityLockerV65.json`,
      poolAbi: `${base}/integrations/gmgn/abi/LeverageXCanonicalPoolV65.json`,
    },
    indexing: {
      factoryReplayOrder: ["blockNumber", "transactionIndex", "logIndex"],
      poolReplayOrder: ["blockNumber", "transactionIndex", "logIndex"],
      confirmations: 3,
      reorgPolicy: "Persist block hash, mark replaced logs non-canonical, then replay both factory and pool event streams.",
      priceSource: "Canonical Uniswap V3 pool slot0 and Swap events",
      historicalDiscovery: "Replay TokenLaunched/CanonicalPoolCreated from the factory deployment block, then follow each discovered pool.",
    },
    disclaimer: "The standard pool and deterministic attribution make launches technically indexable. An official Leverage X label still requires GMGN onboarding and approval.",
  };
}

export function mapV65Launch(row: Record<string, unknown>) {
  const tokenAddress = cleanAddress(row.token_address);
  const poolAddress = cleanAddress(row.market_address);
  const factoryAddress = cleanAddress(row.factory_address);
  return {
    launchpadId: "leverage-x-robinhood",
    launchpad: "leverage X",
    version: "V65",
    chainId: numberValue(row.chain_id),
    network: stringValue(row.network),
    factoryAddress,
    deploymentBlock: v65DeploymentBlock(),
    tokenAddress,
    creatorAddress: cleanAddress(row.creator_address),
    canonicalPool: poolAddress,
    poolAddress,
    poolType: "uniswap-v3",
    dexFactory: cleanAddress(row.dex_factory) ?? V65_UNISWAP_V3_FACTORY.toLowerCase(),
    pairToken: cleanAddress(row.pair_token) ?? V65_WETH.toLowerCase(),
    quoteTokenAddress: cleanAddress(row.pair_token) ?? V65_WETH.toLowerCase(),
    positionManager: cleanAddress(row.position_manager) ?? V65_POSITION_MANAGER.toLowerCase(),
    liquidityLocker: cleanAddress(row.liquidity_locker),
    launchPositionId: stringValue(row.launch_position_id),
    finalPositionId: stringValue(row.final_position_id),
    poolFee: numberValue(row.pool_fee) || V65_CANONICAL_POOL_FEE,
    tokenIsToken0: Boolean(row.token_is_token0),
    graduated: stringValue(row.status) === "migrated" || Boolean(row.final_position_id),
    transactionHash: stringValue(row.transaction_hash).toLowerCase(),
    blockNumber: numberValue(row.block_number),
    name: stringValue(row.name),
    symbol: stringValue(row.symbol),
    decimals: 18,
    totalSupply: V65_TOTAL_SUPPLY_WAD.toString(),
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
    openingFdvEthWad: stringValue(row.opening_fdv_eth_wad) || V65_OPENING_FDV_ETH_WAD.toString(),
    targetFdvEthWad: stringValue(row.target_fdv_eth_wad) || V65_TARGET_FDV_ETH_WAD.toString(),
    status: stringValue(row.status),
    tokenExplorer: tokenAddress ? `https://robinhoodchain.blockscout.com/address/${tokenAddress}` : null,
    poolExplorer: poolAddress ? `https://robinhoodchain.blockscout.com/address/${poolAddress}` : null,
    gmgnSearch: tokenAddress ? `https://gmgn.ai/robinhood/token/${tokenAddress}` : null,
  };
}

export async function listV65GmgnLaunches(options: { limit?: number; token?: string; creator?: string; fromBlock?: number } = {}) {
  if (!isV65LaunchStorageConfigured()) return { configured: false, launches: [] as ReturnType<typeof mapV65Launch>[] };
  const limit = Math.min(500, Math.max(1, Math.floor(Number(options.limit ?? 250) || 250)));
  const token = cleanAddress(options.token);
  const creator = cleanAddress(options.creator);
  const fromBlock = Math.max(0, Math.floor(Number(options.fromBlock ?? 0) || 0));
  const rows = await listV65Launches(500);
  const launches = rows.map(mapV65Launch)
    .filter((launch) => !token || launch.tokenAddress === token)
    .filter((launch) => !creator || launch.creatorAddress === creator)
    .filter((launch) => !fromBlock || launch.blockNumber >= fromBlock)
    .slice(0, limit);
  return { configured: true, launches };
}

export async function listV65PoolEvents(options: { pool?: string; token?: string; limit?: number } = {}) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return { configured: false, events: [] as Record<string, unknown>[] };
  const pool = cleanAddress(options.pool);
  const token = cleanAddress(options.token);
  const limit = Math.min(1_000, Math.max(1, Math.floor(Number(options.limit ?? 250) || 250)));
  const filters = ["select=*", "canonical=eq.true", "order=block_number.desc,transaction_index.desc,log_index.desc", `limit=${limit}`];
  if (pool) filters.push(`pool_address=eq.${pool}`);
  if (token) filters.push(`token_address=eq.${token}`);
  const response = await fetch(`${base}/rest/v1/leveragex_v65_pool_events?${filters.join("&")}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` }, cache: "no-store",
  });
  if (!response.ok) throw new Error(`V65 pool-event read failed (${response.status}).`);
  return { configured: true, events: await response.json() as Record<string, unknown>[] };
}
