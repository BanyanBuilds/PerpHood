import { openV47Database, v47DatabasePath } from "./v47-database.ts";
import { ensureV87LiveStateSchema } from "./v87-live-state-store.ts";

export type V89ProtocolStats = {
  chainId: number;
  tokensMinted: number;
  tokensGraduated: number;
  graduationRate: number;
  mintedToday: number;
  mintedThisWeek: number;
  spotVolumeWei: string;
  perpsOpenInterestWei: string;
  activePositions: number;
  activeTraders: number;
  totalLiquidations: number;
  longShortRatio: number | null;
  recentGraduates: Array<{ marketAddress: string; tokenAddress: string | null; updatedAt: string }>;
  cursor: string | null;
  generatedAt: string;
};

function sumStrings(values: string[]) {
  return values.reduce((total, value) => {
    try { return total + BigInt(value); } catch { return total; }
  }, 0n).toString();
}

export function readV89ProtocolStats(chainId: number, databasePath = v47DatabasePath()): V89ProtocolStats {
  const db = openV47Database(databasePath);
  try {
    ensureV87LiveStateSchema(db);
    const markets = db.prepare(`SELECT market_address,token_address,phase,buy_volume_wei,sell_volume_wei,open_interest_long_wei,open_interest_short_wei,updated_at FROM v87_market_snapshots WHERE chain_id=?`).all(chainId) as Array<Record<string, unknown>>;
    const now = Date.now();
    const today = now - 24 * 60 * 60 * 1000;
    const week = now - 7 * 24 * 60 * 60 * 1000;
    const graduated = markets.filter((row) => Number(row.phase) >= 2);
    const longOi = sumStrings(markets.map((row) => String(row.open_interest_long_wei ?? "0")));
    const shortOi = sumStrings(markets.map((row) => String(row.open_interest_short_wei ?? "0")));
    const spotVolumeWei = sumStrings(markets.flatMap((row) => [String(row.buy_volume_wei ?? "0"), String(row.sell_volume_wei ?? "0")]));
    const positionCounts = db.prepare(`SELECT COUNT(*) AS active_positions,COUNT(DISTINCT owner_address) AS active_traders FROM v87_position_snapshots WHERE chain_id=? AND status='OPEN'`).get(chainId) as { active_positions: number; active_traders: number };
    const liquidationRow = db.prepare(`SELECT COUNT(*) AS count FROM v87_position_snapshots WHERE chain_id=? AND status='LIQUIDATED'`).get(chainId) as { count: number };
    const cursor = db.prepare(`SELECT event_id FROM v87_applied_events WHERE chain_id=? ORDER BY block_number DESC,event_id DESC LIMIT 1`).get(chainId) as { event_id: string } | undefined;
    const longValue = BigInt(longOi);
    const shortValue = BigInt(shortOi);
    return {
      chainId,
      tokensMinted: markets.length,
      tokensGraduated: graduated.length,
      graduationRate: markets.length ? graduated.length / markets.length : 0,
      mintedToday: markets.filter((row) => Number(row.updated_at) >= today).length,
      mintedThisWeek: markets.filter((row) => Number(row.updated_at) >= week).length,
      spotVolumeWei,
      perpsOpenInterestWei: (longValue + shortValue).toString(),
      activePositions: Number(positionCounts?.active_positions ?? 0),
      activeTraders: Number(positionCounts?.active_traders ?? 0),
      totalLiquidations: Number(liquidationRow?.count ?? 0),
      longShortRatio: shortValue === 0n ? (longValue === 0n ? null : 1) : Number(longValue * 10_000n / (longValue + shortValue)) / 10_000,
      recentGraduates: graduated.sort((a,b) => Number(b.updated_at)-Number(a.updated_at)).slice(0,5).map((row) => ({ marketAddress:String(row.market_address), tokenAddress:row.token_address ? String(row.token_address) : null, updatedAt:new Date(Number(row.updated_at)).toISOString() })),
      cursor: cursor?.event_id ?? null,
      generatedAt: new Date().toISOString(),
    };
  } finally { db.close(); }
}
