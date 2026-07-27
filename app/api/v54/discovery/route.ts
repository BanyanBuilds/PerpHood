import { NextResponse } from "next/server";
import { isV54LaunchStorageConfigured, listV54Launches } from "@/lib/server/v54-launch-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=10, s-maxage=30, stale-while-revalidate=60",
    },
  });
}

export async function GET(request: Request) {
  if (!isV54LaunchStorageConfigured()) return response({ ok: true, configured: false, protocol: "PERPHOOD V54", markets: [] });
  try {
    const url = new URL(request.url);
    const chainId = Number(url.searchParams.get("chainId") ?? 0);
    const token = (url.searchParams.get("token") ?? "").toLowerCase();
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 250)));
    const rows = await listV54Launches(limit);
    const markets = rows
      .filter((row) => !chainId || Number(row.chain_id) === chainId)
      .filter((row) => !token || String(row.token_address).toLowerCase() === token)
      .map((row) => ({
        protocol: "PERPHOOD",
        version: "V54",
        chainId: Number(row.chain_id),
        network: row.network,
        factoryAddress: row.factory_address,
        marketAddress: row.market_address,
        tokenAddress: row.token_address,
        creatorAddress: row.creator_address,
        transactionHash: row.transaction_hash,
        blockNumber: Number(row.block_number),
        name: row.name,
        symbol: row.symbol,
        decimals: 18,
        totalSupply: "1000000000000000000000000000",
        metadataUri: row.metadata_uri,
        metadataHash: row.metadata_hash,
        imageUrl: row.image_url,
        status: row.status,
        creatorGenesisBuyWei: String(row.creator_buy_wei),
        creatorGenesisTokensWad: String(row.creator_tokens_out_wad),
        marketCapEthWadAtLaunch: String(row.market_cap_eth_wad),
        migrationTargetUsdWad: String(row.migration_target_usd_wad),
        events: {
          marketCreated: "MarketCreated(address,address,address,uint256,uint256,uint256,uint256,bytes32)",
          trade: "Trade(address,bool,uint256,uint256,uint256,uint256,uint256,uint256)",
          transfer: "Transfer(address,address,uint256)",
        },
      }));
    return response({ ok: true, configured: true, protocol: "PERPHOOD V54", markets });
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : "Discovery feed failed." }, 500);
  }
}
