import { openV47Database, v47DatabasePath, type V47Database } from "./v47-database.ts";
import { validateV85Event, type V85LiveEvent, type V85EventKind } from "../v85-live-data.ts";

type RawRow = {
  chain_id: number;
  transaction_hash: string;
  log_index: number;
  block_number: number;
  address: string;
  event_name: string;
  indexed_at: number;
};

type Cursor = { blockNumber: number; logIndex: number };

const SUPPORTED = new Set(["MarketCreated", "Trade", "PositionOpened", "PositionClosed", "StateCommitted", "MigrationCommitted"]);

function eventId(row: RawRow, kind: V85EventKind) {
  return `${row.chain_id}:${row.block_number}:${row.log_index}:${kind}:${row.transaction_hash.toLowerCase()}`;
}

function market(db: V47Database, row: RawRow) {
  return db.prepare("SELECT * FROM markets WHERE chain_id=? AND market_address=?").get(row.chain_id, row.address.toLowerCase()) as Record<string, unknown> | undefined;
}

function trade(db: V47Database, row: RawRow) {
  return db.prepare("SELECT * FROM trades WHERE chain_id=? AND transaction_hash=? AND log_index=?").get(row.chain_id, row.transaction_hash.toLowerCase(), row.log_index) as Record<string, unknown> | undefined;
}

function positionByOpen(db: V47Database, row: RawRow) {
  return db.prepare("SELECT * FROM positions WHERE chain_id=? AND opened_transaction_hash=? AND opened_block=? ORDER BY position_id DESC LIMIT 1").get(row.chain_id, row.transaction_hash.toLowerCase(), row.block_number) as Record<string, unknown> | undefined;
}

function positionByClose(db: V47Database, row: RawRow) {
  return db.prepare("SELECT * FROM positions WHERE chain_id=? AND closed_transaction_hash=? AND closed_block=? ORDER BY position_id DESC LIMIT 1").get(row.chain_id, row.transaction_hash.toLowerCase(), row.block_number) as Record<string, unknown> | undefined;
}

function marketState(db: V47Database, row: RawRow) {
  return db.prepare("SELECT * FROM market_states WHERE chain_id=? AND market_address=? AND source_transaction_hash=?").get(row.chain_id, row.address.toLowerCase(), row.transaction_hash.toLowerCase()) as Record<string, unknown> | undefined;
}

function isoFromIndexed(row: RawRow) { return new Date(row.indexed_at || Date.now()).toISOString(); }

export function mapV47RowToV85(db: V47Database, row: RawRow): V85LiveEvent[] {
  if (!SUPPORTED.has(row.event_name)) return [];
  const common = {
    chainId: row.chain_id,
    blockNumber: row.block_number,
    transactionHash: row.transaction_hash.toLowerCase() as `0x${string}`,
    marketAddress: row.address.toLowerCase() as `0x${string}`,
    occurredAt: isoFromIndexed(row),
  };

  if (row.event_name === "MarketCreated") {
    const value = market(db, row);
    if (!value) return [];
    return [validateV85Event({ ...common, id: eventId(row, "TOKEN_CREATED"), kind: "TOKEN_CREATED", payload: {
      tokenAddress: value.token_address,
      creatorAddress: value.creator_address,
      metadataHash: value.metadata_hash,
      creatorGenesisBuyWei: value.creator_genesis_buy_wei,
      migrationTargetUsdWad: value.migration_target_usd_wad,
    }})];
  }

  if (row.event_name === "Trade") {
    const value = trade(db, row);
    if (!value) return [];
    return [validateV85Event({ ...common, id: eventId(row, "TRADE_EXECUTED"), kind: "TRADE_EXECUTED", payload: {
      traderAddress: value.trader_address,
      side: Number(value.is_buy) === 1 ? "BUY" : "SELL",
      grossWethWei: value.gross_weth_wei,
      tokenAmountWad: value.token_amount_wad,
      feeWethWei: value.fee_weth_wei,
      marketCapEthWad: value.market_cap_eth_wad,
    }})];
  }

  if (row.event_name === "PositionOpened") {
    const value = positionByOpen(db, row);
    if (!value) return [];
    return [validateV85Event({ ...common, id: eventId(row, "POSITION_OPENED"), kind: "POSITION_OPENED", payload: {
      positionId: value.position_id,
      ownerAddress: value.owner_address,
      direction: Number(value.direction) === 0 ? "LONG" : "SHORT",
      leverage: value.leverage,
      collateralWei: value.collateral_wei,
      notionalWei: value.notional_wei,
      entryPriceWad: value.entry_price_wad,
      liquidationPriceWad: value.liquidation_price_wad,
    }})];
  }

  if (row.event_name === "PositionClosed") {
    const value = positionByClose(db, row);
    if (!value) return [];
    const closed = validateV85Event({ ...common, id: eventId(row, "POSITION_CLOSED"), kind: "POSITION_CLOSED", payload: {
      positionId: value.position_id,
      ownerAddress: value.owner_address,
      liquidated: Number(value.liquidated) === 1,
      payoutWei: value.payout_wei,
      pnlWei: value.pnl_wei,
      feeWei: value.fee_wei,
      badDebtWei: value.bad_debt_wei,
    }});
    if (Number(value.liquidated) !== 1) return [closed];
    return [closed, validateV85Event({ ...common, id: eventId(row, "LIQUIDATION_OCCURRED"), kind: "LIQUIDATION_OCCURRED", payload: {
      positionId: value.position_id,
      ownerAddress: value.owner_address,
      collateralWei: value.collateral_wei,
      pnlWei: value.pnl_wei,
      badDebtWei: value.bad_debt_wei,
    }})];
  }

  if (row.event_name === "StateCommitted") {
    const value = marketState(db, row);
    if (!value) return [];
    return [validateV85Event({ ...common, id: eventId(row, "PRICE_UPDATED"), kind: "PRICE_UPDATED", payload: {
      sequence: value.sequence,
      marginalPriceWad: value.marginal_price_wad,
      marketCapEthWad: value.market_cap_eth_wad,
      openInterestLongWei: value.open_interest_long_wei,
      openInterestShortWei: value.open_interest_short_wei,
      activePositions: value.active_positions,
    }})];
  }

  const value = market(db, row);
  return [validateV85Event({ ...common, id: eventId(row, "MARKET_ENABLED"), kind: "MARKET_ENABLED", payload: {
    active: Boolean(value && Number(value.active) === 1),
    phase: value?.phase ?? 2,
    migrationCommitted: true,
  }})];
}

function ensureBridgeSchema(db: V47Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS v86_live_bridge_cursor (
    destination TEXT NOT NULL,
    chain_id INTEGER NOT NULL,
    block_number INTEGER NOT NULL DEFAULT -1,
    log_index INTEGER NOT NULL DEFAULT -1,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(destination, chain_id)
  )`);
}

export function readBridgeCursor(db: V47Database, destination: string, chainId: number): Cursor {
  ensureBridgeSchema(db);
  const row = db.prepare("SELECT block_number AS blockNumber,log_index AS logIndex FROM v86_live_bridge_cursor WHERE destination=? AND chain_id=?").get(destination, chainId) as Cursor | undefined;
  return row ?? { blockNumber: -1, logIndex: -1 };
}

export function writeBridgeCursor(db: V47Database, destination: string, chainId: number, cursor: Cursor) {
  ensureBridgeSchema(db);
  db.prepare(`INSERT INTO v86_live_bridge_cursor(destination,chain_id,block_number,log_index,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(destination,chain_id) DO UPDATE SET block_number=excluded.block_number,log_index=excluded.log_index,updated_at=excluded.updated_at`)
    .run(destination, chainId, cursor.blockNumber, cursor.logIndex, Date.now());
}

export function readNextBridgeBatch(input: { databasePath?: string; destination: string; chainId: number; limit?: number }) {
  const db = openV47Database(input.databasePath ?? v47DatabasePath());
  try {
    const cursor = readBridgeCursor(db, input.destination, input.chainId);
    const rows = db.prepare(`SELECT chain_id,transaction_hash,log_index,block_number,address,event_name,indexed_at
      FROM raw_events WHERE chain_id=? AND removed=0 AND (block_number>? OR (block_number=? AND log_index>?))
      ORDER BY block_number ASC,log_index ASC LIMIT ?`)
      .all(input.chainId, cursor.blockNumber, cursor.blockNumber, cursor.logIndex, Math.max(1, Math.min(250, input.limit ?? 100))) as unknown as RawRow[];
    const events = rows.flatMap((row) => mapV47RowToV85(db, row));
    const last = rows.at(-1);
    return { cursor, rows, events, nextCursor: last ? { blockNumber: last.block_number, logIndex: last.log_index } : cursor };
  } finally { db.close(); }
}

export async function deliverBridgeBatch(input: { databasePath?: string; destination: string; secret: string; chainId: number; limit?: number; fetchImpl?: typeof fetch }) {
  const batch = readNextBridgeBatch(input);
  if (!batch.rows.length) return { delivered: 0, scanned: 0, cursor: batch.cursor };
  const fetcher = input.fetchImpl ?? fetch;
  if (batch.events.length) {
    const response = await fetcher(input.destination, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${input.secret}` },
      body: JSON.stringify(batch.events),
    });
    if (!response.ok) throw new Error(`Live ingest rejected bridge batch: HTTP ${response.status} ${await response.text()}`);
  }
  const db = openV47Database(input.databasePath ?? v47DatabasePath());
  try { writeBridgeCursor(db, input.destination, input.chainId, batch.nextCursor); }
  finally { db.close(); }
  return { delivered: batch.events.length, scanned: batch.rows.length, cursor: batch.nextCursor };
}
