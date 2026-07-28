import type { SQLInputValue } from "node:sqlite";
import { openV47Database, v47DatabasePath, type V47Database } from "./v47-database.ts";
import { validateV85Event, type V85LiveEvent } from "../v85-live-data.ts";
import type { V87LiveStateSnapshot, V87PositionSnapshot, V87TokenSnapshot } from "../v87-live-state.ts";

function text(value: unknown, fallback = "0") { return typeof value === "string" ? value : value == null ? fallback : String(value); }
function integer(value: unknown, fallback = 0) { const n = Number(value); return Number.isSafeInteger(n) ? n : fallback; }
function address(value: unknown): `0x${string}` | null { return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() as `0x${string}` : null; }
function addIntegerStrings(a: string, b: string) { try { return (BigInt(a) + BigInt(b)).toString(); } catch { return a; } }

export function ensureV87LiveStateSchema(db: V47Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS v87_applied_events (
      event_id TEXT PRIMARY KEY,
      chain_id INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      event_kind TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS v87_applied_events_chain_block_idx ON v87_applied_events(chain_id,block_number,event_id);

    CREATE TABLE IF NOT EXISTS v87_market_snapshots (
      chain_id INTEGER NOT NULL,
      market_address TEXT NOT NULL,
      token_address TEXT,
      creator_address TEXT,
      metadata_hash TEXT,
      active INTEGER NOT NULL DEFAULT 0,
      phase INTEGER NOT NULL DEFAULT 0,
      last_price_wad TEXT NOT NULL DEFAULT '0',
      market_cap_eth_wad TEXT NOT NULL DEFAULT '0',
      open_interest_long_wei TEXT NOT NULL DEFAULT '0',
      open_interest_short_wei TEXT NOT NULL DEFAULT '0',
      active_positions TEXT NOT NULL DEFAULT '0',
      trade_count INTEGER NOT NULL DEFAULT 0,
      buy_volume_wei TEXT NOT NULL DEFAULT '0',
      sell_volume_wei TEXT NOT NULL DEFAULT '0',
      last_block_number INTEGER NOT NULL DEFAULT -1,
      last_event_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(chain_id,market_address)
    );

    CREATE TABLE IF NOT EXISTS v87_position_snapshots (
      chain_id INTEGER NOT NULL,
      market_address TEXT NOT NULL,
      position_id TEXT NOT NULL,
      owner_address TEXT NOT NULL,
      direction TEXT NOT NULL,
      leverage INTEGER NOT NULL,
      collateral_wei TEXT NOT NULL,
      notional_wei TEXT NOT NULL,
      entry_price_wad TEXT NOT NULL,
      liquidation_price_wad TEXT NOT NULL,
      status TEXT NOT NULL,
      payout_wei TEXT,
      pnl_wei TEXT,
      bad_debt_wei TEXT,
      opened_block INTEGER NOT NULL,
      closed_block INTEGER,
      last_event_id TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(chain_id,market_address,position_id)
    );
    CREATE INDEX IF NOT EXISTS v87_positions_owner_status_idx ON v87_position_snapshots(chain_id,owner_address,status,updated_at DESC);
  `);
}

function ensureMarket(db: V47Database, event: V85LiveEvent) {
  if (!event.marketAddress) return;
  db.prepare(`INSERT INTO v87_market_snapshots(chain_id,market_address,last_event_id,last_block_number,updated_at)
    VALUES(?,?,?,?,?) ON CONFLICT(chain_id,market_address) DO NOTHING`)
    .run(event.chainId,event.marketAddress,event.id,event.blockNumber ?? -1,Date.now());
}

export function applyV87LiveEvent(db: V47Database, input: unknown) {
  ensureV87LiveStateSchema(db);
  const event = validateV85Event(input);
  db.exec("BEGIN IMMEDIATE");
  try {
    const inserted = db.prepare(`INSERT OR IGNORE INTO v87_applied_events(event_id,chain_id,block_number,event_kind,applied_at) VALUES(?,?,?,?,?)`)
      .run(event.id,event.chainId,event.blockNumber ?? -1,event.kind,Date.now());
    if (inserted.changes === 0) { db.exec("COMMIT"); return { event, applied: false }; }
    ensureMarket(db,event);
    const p = event.payload;
    const now = Date.now();

    if (event.kind === "TOKEN_CREATED" && event.marketAddress) {
      db.prepare(`UPDATE v87_market_snapshots SET token_address=?,creator_address=?,metadata_hash=?,active=1,phase=MAX(phase,0),last_block_number=?,last_event_id=?,updated_at=? WHERE chain_id=? AND market_address=?`)
        .run(address(p.tokenAddress),address(p.creatorAddress),text(p.metadataHash,""),event.blockNumber ?? -1,event.id,now,event.chainId,event.marketAddress);
    } else if (event.kind === "MARKET_ENABLED" && event.marketAddress) {
      db.prepare(`UPDATE v87_market_snapshots SET active=?,phase=?,last_block_number=?,last_event_id=?,updated_at=? WHERE chain_id=? AND market_address=?`)
        .run(p.active === false ? 0 : 1,integer(p.phase,2),event.blockNumber ?? -1,event.id,now,event.chainId,event.marketAddress);
    } else if (event.kind === "PRICE_UPDATED" && event.marketAddress) {
      db.prepare(`UPDATE v87_market_snapshots SET last_price_wad=?,market_cap_eth_wad=?,open_interest_long_wei=?,open_interest_short_wei=?,active_positions=?,last_block_number=?,last_event_id=?,updated_at=? WHERE chain_id=? AND market_address=?`)
        .run(text(p.marginalPriceWad),text(p.marketCapEthWad),text(p.openInterestLongWei),text(p.openInterestShortWei),text(p.activePositions),event.blockNumber ?? -1,event.id,now,event.chainId,event.marketAddress);
    } else if (event.kind === "TRADE_EXECUTED" && event.marketAddress) {
      const row = db.prepare(`SELECT buy_volume_wei,sell_volume_wei FROM v87_market_snapshots WHERE chain_id=? AND market_address=?`).get(event.chainId,event.marketAddress) as {buy_volume_wei:string;sell_volume_wei:string};
      const buy = text(p.side).toUpperCase() === "BUY";
      db.prepare(`UPDATE v87_market_snapshots SET trade_count=trade_count+1,buy_volume_wei=?,sell_volume_wei=?,market_cap_eth_wad=CASE WHEN ?!='0' THEN ? ELSE market_cap_eth_wad END,last_block_number=?,last_event_id=?,updated_at=? WHERE chain_id=? AND market_address=?`)
        .run(buy ? addIntegerStrings(row.buy_volume_wei,text(p.grossWethWei)) : row.buy_volume_wei,buy ? row.sell_volume_wei : addIntegerStrings(row.sell_volume_wei,text(p.grossWethWei)),text(p.marketCapEthWad),text(p.marketCapEthWad),event.blockNumber ?? -1,event.id,now,event.chainId,event.marketAddress);
    } else if (event.kind === "POSITION_OPENED" && event.marketAddress) {
      const owner = address(p.ownerAddress); if (!owner) throw new Error("POSITION_OPENED requires ownerAddress.");
      db.prepare(`INSERT INTO v87_position_snapshots(chain_id,market_address,position_id,owner_address,direction,leverage,collateral_wei,notional_wei,entry_price_wad,liquidation_price_wad,status,payout_wei,pnl_wei,bad_debt_wei,opened_block,closed_block,last_event_id,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(chain_id,market_address,position_id) DO UPDATE SET owner_address=excluded.owner_address,direction=excluded.direction,leverage=excluded.leverage,collateral_wei=excluded.collateral_wei,notional_wei=excluded.notional_wei,entry_price_wad=excluded.entry_price_wad,liquidation_price_wad=excluded.liquidation_price_wad,status='OPEN',last_event_id=excluded.last_event_id,updated_at=excluded.updated_at`)
        .run(event.chainId,event.marketAddress,text(p.positionId),owner,text(p.direction).toUpperCase()==="SHORT"?"SHORT":"LONG",integer(p.leverage,1),text(p.collateralWei),text(p.notionalWei),text(p.entryPriceWad),text(p.liquidationPriceWad),"OPEN",null,null,null,event.blockNumber ?? -1,null,event.id,now);
    } else if ((event.kind === "POSITION_CLOSED" || event.kind === "LIQUIDATION_OCCURRED") && event.marketAddress) {
      const status = event.kind === "LIQUIDATION_OCCURRED" || p.liquidated === true ? "LIQUIDATED" : "CLOSED";
      db.prepare(`UPDATE v87_position_snapshots SET status=?,payout_wei=COALESCE(?,payout_wei),pnl_wei=COALESCE(?,pnl_wei),bad_debt_wei=COALESCE(?,bad_debt_wei),closed_block=?,last_event_id=?,updated_at=? WHERE chain_id=? AND market_address=? AND position_id=?`)
        .run(status,p.payoutWei == null ? null : text(p.payoutWei),p.pnlWei == null ? null : text(p.pnlWei),p.badDebtWei == null ? null : text(p.badDebtWei),event.blockNumber ?? -1,event.id,now,event.chainId,event.marketAddress,text(p.positionId));
    }
    db.exec("COMMIT");
    return { event, applied: true };
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

export function materializeV87LiveEvents(inputs: unknown[], databasePath = v47DatabasePath()) {
  const db = openV47Database(databasePath);
  try { let applied=0; const events: V85LiveEvent[]=[]; for(const input of inputs){ const result=applyV87LiveEvent(db,input); events.push(result.event); if(result.applied) applied++; } return {events,applied,duplicates:events.length-applied}; }
  finally { db.close(); }
}

export function readV87LiveState(input:{chainId:number;marketAddress?:string;ownerAddress?:string;includeClosed?:boolean;limit?:number;databasePath?:string}):V87LiveStateSnapshot {
  const db=openV47Database(input.databasePath ?? v47DatabasePath());
  try {
    ensureV87LiveStateSchema(db); const limit=Math.max(1,Math.min(500,input.limit ?? 100));
    const marketArgs: SQLInputValue[]=[input.chainId]; let marketWhere="chain_id=?";
    if(input.marketAddress){marketWhere+=" AND market_address=?";marketArgs.push(input.marketAddress.toLowerCase());}
    marketArgs.push(limit);
    const markets=db.prepare(`SELECT * FROM v87_market_snapshots WHERE ${marketWhere} ORDER BY updated_at DESC LIMIT ?`).all(...marketArgs) as Record<string,unknown>[];
    const posArgs: SQLInputValue[]=[input.chainId]; let posWhere="chain_id=?";
    if(input.marketAddress){posWhere+=" AND market_address=?";posArgs.push(input.marketAddress.toLowerCase());}
    if(input.ownerAddress){posWhere+=" AND owner_address=?";posArgs.push(input.ownerAddress.toLowerCase());}
    if(!input.includeClosed) posWhere+=" AND status='OPEN'"; posArgs.push(limit);
    const positions=db.prepare(`SELECT * FROM v87_position_snapshots WHERE ${posWhere} ORDER BY updated_at DESC LIMIT ?`).all(...posArgs) as Record<string,unknown>[];
    const cursor=db.prepare(`SELECT event_id FROM v87_applied_events WHERE chain_id=? ORDER BY block_number DESC,event_id DESC LIMIT 1`).get(input.chainId) as {event_id:string}|undefined;
    return {chainId:input.chainId,markets:markets.map((r):V87TokenSnapshot=>({chainId:Number(r.chain_id),marketAddress:r.market_address as `0x${string}`,tokenAddress:(r.token_address as `0x${string}`|null),creatorAddress:(r.creator_address as `0x${string}`|null),metadataHash:r.metadata_hash as string|null,active:Number(r.active)===1,phase:Number(r.phase),lastPriceWad:String(r.last_price_wad),marketCapEthWad:String(r.market_cap_eth_wad),openInterestLongWei:String(r.open_interest_long_wei),openInterestShortWei:String(r.open_interest_short_wei),activePositions:String(r.active_positions),tradeCount:Number(r.trade_count),buyVolumeWei:String(r.buy_volume_wei),sellVolumeWei:String(r.sell_volume_wei),lastBlockNumber:Number(r.last_block_number),lastEventId:String(r.last_event_id),updatedAt:new Date(Number(r.updated_at)).toISOString()})),positions:positions.map((r):V87PositionSnapshot=>({chainId:Number(r.chain_id),marketAddress:r.market_address as `0x${string}`,positionId:String(r.position_id),ownerAddress:r.owner_address as `0x${string}`,direction:r.direction as "LONG"|"SHORT",leverage:Number(r.leverage),collateralWei:String(r.collateral_wei),notionalWei:String(r.notional_wei),entryPriceWad:String(r.entry_price_wad),liquidationPriceWad:String(r.liquidation_price_wad),status:r.status as "OPEN"|"CLOSED"|"LIQUIDATED",payoutWei:r.payout_wei as string|null,pnlWei:r.pnl_wei as string|null,badDebtWei:r.bad_debt_wei as string|null,openedBlock:Number(r.opened_block),closedBlock:r.closed_block==null?null:Number(r.closed_block),lastEventId:String(r.last_event_id),updatedAt:new Date(Number(r.updated_at)).toISOString()})),cursor:cursor?.event_id ?? null,generatedAt:new Date().toISOString()};
  } finally {db.close();}
}
