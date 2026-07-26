import { createHash } from "node:crypto";
import { openV48Database, publishV48Event } from "./v48-database.ts";
import { v47DatabasePath, withV47Transaction } from "./v47-database.ts";

const INTERVALS = [1, 15, 30] as const;

type TradeRow = {
  chain_id: number;
  market_address: string;
  trader_address: string;
  is_buy: number;
  gross_weth_wei: string;
  market_cap_eth_wad: string;
  block_number: number;
  timestamp: number;
  log_index: number;
};

function sum(values: string[]) { return values.reduce((total, value) => total + BigInt(value), 0n).toString(); }
function bps(current: bigint, previous: bigint) { return previous > 0n ? Number(((current - previous) * 10_000n) / previous) : 0; }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export function materializeV48MarketData(input: { path?: string; chainId: number; emitEvents?: boolean }) {
  const path = input.path ?? v47DatabasePath();
  const db = openV48Database(path);
  const changedMarkets: Array<{ marketAddress: string; blockNumber: number; payload: Record<string, unknown> }> = [];
  try {
    const trades = db.prepare(`SELECT t.chain_id,t.market_address,t.trader_address,t.is_buy,t.gross_weth_wei,t.market_cap_eth_wad,t.block_number,b.timestamp,t.log_index
      FROM trades t JOIN chain_blocks b ON b.chain_id=t.chain_id AND b.block_number=t.block_number
      WHERE t.chain_id=? AND b.canonical=1 ORDER BY t.block_number ASC,t.log_index ASC`).all(input.chainId) as unknown as TradeRow[];
    const byMarket = new Map<string, TradeRow[]>();
    for (const trade of trades) byMarket.set(trade.market_address, [...(byMarket.get(trade.market_address) ?? []), trade]);
    const states = db.prepare("SELECT market_address,market_cap_eth_wad,free_weth_wei,open_interest_long_wei,open_interest_short_wei,active_positions,source_block FROM market_states WHERE chain_id=?").all(input.chainId) as unknown as Array<Record<string, string | number>>;

    withV47Transaction(db, () => {
      db.prepare("DELETE FROM market_candles WHERE chain_id=?").run(input.chainId);
      for (const [market, marketTrades] of byMarket) {
        for (const interval of INTERVALS) {
          const buckets = new Map<number, TradeRow[]>();
          for (const trade of marketTrades) {
            const bucket = Math.floor(trade.timestamp / interval) * interval;
            buckets.set(bucket, [...(buckets.get(bucket) ?? []), trade]);
          }
          for (const [bucketStart, rows] of buckets) {
            const caps = rows.map((row) => BigInt(row.market_cap_eth_wad));
            const buyRows = rows.filter((row) => row.is_buy === 1);
            const sellRows = rows.filter((row) => row.is_buy === 0);
            db.prepare(`INSERT INTO market_candles(chain_id,market_address,interval_seconds,bucket_start,open_market_cap_wei,high_market_cap_wei,low_market_cap_wei,close_market_cap_wei,volume_weth_wei,buy_volume_weth_wei,sell_volume_weth_wei,trade_count,buy_count,sell_count,first_block,last_block,updated_at)
              VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
              .run(input.chainId,market,interval,bucketStart,caps[0].toString(),caps.reduce((a,b)=>a>b?a:b).toString(),caps.reduce((a,b)=>a<b?a:b).toString(),caps.at(-1)!.toString(),sum(rows.map((row)=>row.gross_weth_wei)),sum(buyRows.map((row)=>row.gross_weth_wei)),sum(sellRows.map((row)=>row.gross_weth_wei)),rows.length,buyRows.length,sellRows.length,rows[0].block_number,rows.at(-1)!.block_number,Date.now());
          }
        }
      }

      for (const state of states) {
        const market = String(state.market_address);
        const rows = byMarket.get(market) ?? [];
        const latestTimestamp = rows.at(-1)?.timestamp ?? Math.floor(Date.now() / 1000);
        const inWindow = (seconds: number) => rows.filter((row) => row.timestamp >= latestTimestamp - seconds);
        const window10 = inWindow(10), window60 = inWindow(60), window5m = inWindow(300), window1h = inWindow(3600);
        const latestCap = BigInt(String(state.market_cap_eth_wad ?? "0"));
        const prior60 = [...rows].reverse().find((row) => row.timestamp <= latestTimestamp - 60);
        const prior5m = [...rows].reverse().find((row) => row.timestamp <= latestTimestamp - 300);
        const payload = {
          marketAddress: market,
          sourceBlock: Number(state.source_block ?? 0),
          marketCapWei: latestCap.toString(),
          freeWethWei: String(state.free_weth_wei ?? "0"),
          openInterestLongWei: String(state.open_interest_long_wei ?? "0"),
          openInterestShortWei: String(state.open_interest_short_wei ?? "0"),
          activePositions: String(state.active_positions ?? "0"),
          volume10sWei: sum(window10.map((row) => row.gross_weth_wei)),
          volume60sWei: sum(window60.map((row) => row.gross_weth_wei)),
          volume5mWei: sum(window5m.map((row) => row.gross_weth_wei)),
          volume1hWei: sum(window1h.map((row) => row.gross_weth_wei)),
          buys60s: window60.filter((row) => row.is_buy === 1).length,
          sells60s: window60.filter((row) => row.is_buy === 0).length,
          traders5m: new Set(window5m.map((row) => row.trader_address)).size,
          change60sBps: bps(latestCap, BigInt(prior60?.market_cap_eth_wad ?? latestCap)),
          change5mBps: bps(latestCap, BigInt(prior5m?.market_cap_eth_wad ?? latestCap)),
        };
        const nextDigest = digest(payload);
        const existing = db.prepare("SELECT digest FROM market_metrics WHERE chain_id=? AND market_address=?").get(input.chainId,market) as { digest?: string } | undefined;
        db.prepare(`INSERT INTO market_metrics(chain_id,market_address,source_block,market_cap_wei,free_weth_wei,open_interest_long_wei,open_interest_short_wei,active_positions,volume_10s_wei,volume_60s_wei,volume_5m_wei,volume_1h_wei,buys_60s,sells_60s,traders_5m,change_60s_bps,change_5m_bps,digest,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(chain_id,market_address) DO UPDATE SET source_block=excluded.source_block,market_cap_wei=excluded.market_cap_wei,free_weth_wei=excluded.free_weth_wei,open_interest_long_wei=excluded.open_interest_long_wei,open_interest_short_wei=excluded.open_interest_short_wei,active_positions=excluded.active_positions,volume_10s_wei=excluded.volume_10s_wei,volume_60s_wei=excluded.volume_60s_wei,volume_5m_wei=excluded.volume_5m_wei,volume_1h_wei=excluded.volume_1h_wei,buys_60s=excluded.buys_60s,sells_60s=excluded.sells_60s,traders_5m=excluded.traders_5m,change_60s_bps=excluded.change_60s_bps,change_5m_bps=excluded.change_5m_bps,digest=excluded.digest,updated_at=excluded.updated_at`)
          .run(input.chainId,market,payload.sourceBlock,payload.marketCapWei,payload.freeWethWei,payload.openInterestLongWei,payload.openInterestShortWei,payload.activePositions,payload.volume10sWei,payload.volume60sWei,payload.volume5mWei,payload.volume1hWei,payload.buys60s,payload.sells60s,payload.traders5m,payload.change60sBps,payload.change5mBps,nextDigest,Date.now());
        if (existing?.digest !== nextDigest) changedMarkets.push({ marketAddress: market, blockNumber: payload.sourceBlock, payload });
      }
    });
  } finally { db.close(); }

  if (input.emitEvents !== false) for (const changed of changedMarkets) publishV48Event({ chainId: input.chainId, eventType: "market.updated", marketAddress: changed.marketAddress, blockNumber: changed.blockNumber, payload: changed.payload }, path);
  return { markets: changedMarkets.length, emitted: input.emitEvents === false ? 0 : changedMarkets.length, intervals: [...INTERVALS] };
}

export function v48MarketDataSnapshot(input: { path?: string; chainId: number; market: string; intervalSeconds?: 1 | 15 | 30; limit?: number }) {
  const db = openV48Database(input.path ?? v47DatabasePath());
  try {
    const market = input.market.toLowerCase();
    const metrics = db.prepare("SELECT chain_id AS chainId,market_address AS marketAddress,source_block AS sourceBlock,market_cap_wei AS marketCapWei,free_weth_wei AS freeWethWei,open_interest_long_wei AS openInterestLongWei,open_interest_short_wei AS openInterestShortWei,active_positions AS activePositions,volume_10s_wei AS volume10sWei,volume_60s_wei AS volume60sWei,volume_5m_wei AS volume5mWei,volume_1h_wei AS volume1hWei,buys_60s AS buys60s,sells_60s AS sells60s,traders_5m AS traders5m,change_60s_bps AS change60sBps,change_5m_bps AS change5mBps,updated_at AS updatedAt FROM market_metrics WHERE chain_id=? AND market_address=?").get(input.chainId,market) ?? null;
    const candles = db.prepare("SELECT bucket_start AS time,open_market_cap_wei AS open,high_market_cap_wei AS high,low_market_cap_wei AS low,close_market_cap_wei AS close,volume_weth_wei AS volume,buy_volume_weth_wei AS buyVolume,sell_volume_weth_wei AS sellVolume,trade_count AS trades,buy_count AS buys,sell_count AS sells,first_block AS firstBlock,last_block AS lastBlock FROM market_candles WHERE chain_id=? AND market_address=? AND interval_seconds=? ORDER BY bucket_start DESC LIMIT ?")
      .all(input.chainId,market,input.intervalSeconds ?? 1,Math.min(5_000,Math.max(1,input.limit ?? 500))).reverse();
    return { metrics, candles };
  } finally { db.close(); }
}
