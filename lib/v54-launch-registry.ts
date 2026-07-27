import type { Token } from "./types";
import { readV54MarketRuntime } from "./chain/robinhood-v54";

export type V54PublicLaunchRow = {
  chain_id: number;
  network: "testnet" | "mainnet";
  factory_address: string;
  market_address: string;
  token_address: string;
  creator_address: string;
  transaction_hash: string;
  block_number: number | string;
  name: string;
  symbol: string;
  description: string;
  metadata_uri: string;
  metadata_hash: string;
  image_url: string;
  website?: string | null;
  x_handle?: string | null;
  telegram?: string | null;
  creator_buy_wei: string | number;
  creator_tokens_out_wad: string | number;
  market_cap_eth_wad: string | number;
  migration_target_usd_wad: string | number;
  status: "confirmed" | "paused" | "migrated";
  created_at?: string;
};

function wadNumber(value: string | number, decimals = 18) {
  const raw = typeof value === "number" ? BigInt(Math.trunc(value)) : BigInt(value);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  return Number(whole) + Number(fraction) / Number(divisor);
}

function hueFor(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function v54LaunchRowToToken(row: V54PublicLaunchRow): Token {
  const tokenAddress = row.token_address.toLowerCase();
  const marketCapEth = wadNumber(row.market_cap_eth_wad);
  const supply = 1_000_000_000;
  const priceEth = marketCapEth / supply;
  const createdAt = row.created_at ? Date.parse(row.created_at) : Date.now();
  const launchedMinutesAgo = Math.max(0, (Date.now() - (Number.isFinite(createdAt) ? createdAt : Date.now())) / 60_000);
  const network = row.chain_id === 4_663 ? "mainnet" : "testnet";
  const explorer = network === "mainnet" ? "https://robinhoodchain.blockscout.com" : "https://explorer.testnet.chain.robinhood.com";
  return {
    slug: tokenAddress,
    symbol: row.symbol,
    name: row.name,
    emoji: "🪙",
    hue: hueFor(tokenAddress),
    cap: 0,
    price: 0,
    priceEth,
    marketCapEth,
    change24h: 0,
    graduation: 0.1,
    longs: 50,
    volume24h: 0,
    openInterest: 0,
    funding: 0,
    launchedMinutesAgo,
    description: row.description,
    imageDataUrl: row.image_url,
    imageUrl: row.image_url,
    metadataUri: row.metadata_uri,
    metadataHash: row.metadata_hash,
    creatorWallet: row.creator_address,
    chainDeploymentMode: network === "mainnet" ? "robinhood-mainnet-v55" : "robinhood-testnet-v55",
    chainId: row.chain_id,
    chainFactoryAddress: row.factory_address,
    chainMarketAddress: row.market_address,
    chainTokenAddress: tokenAddress,
    contractAddress: tokenAddress,
    launchTransactionHash: row.transaction_hash,
    launchBlock: Number(row.block_number),
    chainExplorerUrl: `${explorer}/address/${tokenAddress}`,
    launchpadVersion: "V55",
    launchState: "live",
    battlePhase: row.status === "migrated" ? "migrated" : row.status === "paused" ? "paused" : "bonding",
    totalSupply: supply,
    creatorGenesisBuyEth: wadNumber(row.creator_buy_wei),
    migrationTargetMarketCapUsd: wadNumber(row.migration_target_usd_wad),
    website: row.website || undefined,
    xHandle: row.x_handle || undefined,
    telegram: row.telegram || undefined,
    oracleConfidence: 0,
    maxLeverageUnlocked: 0,
    uniqueTraders: 1,
    marketAgeSeconds: launchedMinutesAgo * 60,
    ogStatus: "og",
    isCustom: false,
  };
}

export async function fetchV54LaunchTokens(limit = 250): Promise<Token[]> {
  const response = await fetch(`/api/v55/launches?limit=${Math.max(1, Math.min(500, Math.floor(limit)))}`, { cache: "no-store" });
  const payload = await response.json() as { configured?: boolean; launches?: V54PublicLaunchRow[]; error?: string };
  if (!response.ok) throw new Error(payload.error || "V55 launch registry request failed.");
  if (!payload.configured) return [];
  const baseTokens = (payload.launches ?? []).map(v54LaunchRowToToken);
  const hydrated = await Promise.allSettled(baseTokens.map(async (token) => {
    if (!token.chainMarketAddress) return token;
    const networkKey = (token.chainDeploymentMode === "robinhood-mainnet-v55" || token.chainDeploymentMode === "robinhood-mainnet-v54") ? "mainnet" as const : "testnet" as const;
    const runtime = await readV54MarketRuntime(token.chainMarketAddress, networkKey);
    return {
      ...token,
      priceEth: runtime.priceEth,
      marketCapEth: runtime.marketCapEth,
      realWethBalance: runtime.realEthBalance,
      freeWethEth: runtime.realEthBalance,
      poolFeesEth: runtime.feesEth,
      curveAllocation: 800_000_000,
      curveTokenReserve: Math.max(0, 800_000_000 - runtime.soldTokens),
      curveRealTokenReserve: Math.max(0, 800_000_000 - runtime.soldTokens),
      circulatingSpotTokens: runtime.soldTokens,
      chainLastSyncedAt: Date.now(),
      chainStateSequence: runtime.tradeCount,
      battlePhase: runtime.paused ? "paused" : token.battlePhase,
    } satisfies Token;
  }));
  return hydrated.map((result, index) => result.status === "fulfilled" ? result.value : baseTokens[index]);
}
