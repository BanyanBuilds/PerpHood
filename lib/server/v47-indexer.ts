import { eventTopic } from "../chain/keccak.ts";
import { decodeAddress, decodeUint, decodeWords, encodeCall, encodeUint, toRpcHex, type Hex } from "../chain/abi.ts";
import { acquireV47WorkerLease, openV47Database, recordV47Heartbeat, releaseV47WorkerLease, v47DatabasePath, withV47Transaction, type V47Database } from "./v47-database.ts";

const DEFAULT_RPC = "http://127.0.0.1:8545";
const ZERO_HASH = `0x${"0".repeat(64)}`;

export type V47RpcLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: string;
  removed?: boolean;
};

type V47RpcBlock = { number: string; hash: string; parentHash: string; timestamp: string };

type RawEventRow = {
  chain_id: number;
  transaction_hash: string;
  log_index: number;
  block_number: number;
  block_hash: string;
  address: string;
  topic0: string;
  topics_json: string;
  data: string;
  event_name: string;
  removed: number;
  indexed_at: number;
};

const EVENT_SIGNATURES = {
  MarketCreated: "MarketCreated(address,address,address,uint256,uint256,bytes32)",
  Deposited: "Deposited(address,uint256,uint256)",
  Withdrawn: "Withdrawn(address,uint256,uint256)",
  TokenDeposited: "TokenDeposited(address,address,uint256,uint256)",
  TokenWithdrawn: "TokenWithdrawn(address,address,uint256,uint256)",
  SessionAuthorized: "SessionAuthorized(bytes32,address,bytes32,uint64,uint256,uint256,uint256)",
  SessionRevoked: "SessionRevoked(bytes32,address)",
  SessionNonceConsumed: "SessionNonceConsumed(bytes32,uint64,bytes32,uint256,uint256)",
  AccountExecution: "AccountExecution(address,address,uint8,uint256,uint256,uint256,bytes32)",
  Trade: "Trade(address,bool,uint256,uint256,uint256,uint256,uint256)",
  PositionOpened: "PositionOpened(uint256,address,uint8,uint16,uint256,uint256,uint256,uint256,uint256)",
  PositionClosed: "PositionClosed(uint256,address,uint8,bool,uint256,int256,uint256,uint256)",
  StateCommitted: "StateCommitted(uint64,bytes32,uint8,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)",
  MigrationStarted: "MigrationStarted(bytes32)",
  MigrationCommitted: "MigrationCommitted(bytes32,uint64)",
  PhaseChanged: "PhaseChanged(uint8)",
} as const;

const TOPIC_TO_NAME = new Map(Object.entries(EVENT_SIGNATURES).map(([name, signature]) => [eventTopic(signature).toLowerCase(), name]));

function validAddress(value?: string): value is Hex {
  return Boolean(value && /^0x[0-9a-fA-F]{40}$/.test(value));
}

function normalizeAddress(value: string) { return value.toLowerCase(); }
function topicAddress(topic?: string) { return topic ? `0x${topic.slice(-40)}`.toLowerCase() : ZERO_HASH.slice(0, 42); }
function topicUint(topic?: string) { return topic ? BigInt(topic).toString() : "0"; }
function wordAddress(word?: string) { return word ? decodeAddress(word).toLowerCase() : ZERO_HASH.slice(0, 42); }
function wordUint(word?: string) { return word ? decodeUint(word).toString() : "0"; }
function wordBool(word?: string) { return wordUint(word) === "1" ? 1 : 0; }
function wordInt(word?: string) {
  if (!word) return "0";
  const value = decodeUint(word);
  return (value >= 1n << 255n ? value - (1n << 256n) : value).toString();
}
function words(data: string) { return decodeWords(data === "0x" ? "" : data); }

let rpcId = 0;
async function rpc<T>(rpcUrl: string, method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json() as { result?: T; error?: { code: number; message: string } };
  if (payload.error) throw new Error(`RPC ${payload.error.code}: ${payload.error.message}`);
  if (payload.result === undefined) throw new Error(`RPC ${method} returned no result.`);
  return payload.result;
}

async function ethCall(rpcUrl: string, to: string, data: Hex) {
  return rpc<Hex>(rpcUrl, "eth_call", [{ to, data }, "latest"]);
}

export async function discoverV47Markets(factory: string, rpcUrl: string) {
  if (!validAddress(factory)) throw new Error("V47 factory address is invalid.");
  const countResult = await ethCall(rpcUrl, factory, encodeCall("marketCount()"));
  const count = Number(decodeUint(decodeWords(countResult)[0] ?? "0"));
  const markets: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const result = await ethCall(rpcUrl, factory, encodeCall("markets(uint256)", [encodeUint(index)]));
    const address = decodeAddress(decodeWords(result)[0] ?? "0".repeat(64)).toLowerCase();
    if (validAddress(address)) markets.push(address);
  }
  return markets;
}

function eventName(log: V47RpcLog) {
  return TOPIC_TO_NAME.get(log.topics[0]?.toLowerCase() ?? "") ?? "Unknown";
}

function insertRawEvent(db: V47Database, chainId: number, log: V47RpcLog) {
  db.prepare(`INSERT OR IGNORE INTO raw_events(chain_id,transaction_hash,log_index,block_number,block_hash,address,topic0,topics_json,data,event_name,removed,indexed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      chainId,
      log.transactionHash.toLowerCase(),
      Number(BigInt(log.logIndex)),
      Number(BigInt(log.blockNumber)),
      log.blockHash.toLowerCase(),
      log.address.toLowerCase(),
      (log.topics[0] ?? ZERO_HASH).toLowerCase(),
      JSON.stringify(log.topics.map((topic) => topic.toLowerCase())),
      log.data.toLowerCase(),
      eventName(log),
      log.removed ? 1 : 0,
      Date.now(),
    );
}

function indexedWethBalance(db: V47Database, chainId: number, owner: string) {
  const row = db.prepare("SELECT weth_balance_wei FROM account_balances WHERE chain_id=? AND owner_address=?").get(chainId, owner) as { weth_balance_wei?: string } | undefined;
  return BigInt(row?.weth_balance_wei ?? "0");
}

function indexedTokenBalance(db: V47Database, chainId: number, owner: string, market: string) {
  const row = db.prepare("SELECT token_balance_wad FROM token_balances WHERE chain_id=? AND owner_address=? AND market_address=?").get(chainId, owner, market) as { token_balance_wad?: string } | undefined;
  return BigInt(row?.token_balance_wad ?? "0");
}

function setIndexedWethBalance(db: V47Database, chainId: number, owner: string, balance: bigint, block: number, tx: string) {
  if (balance < 0n) throw new Error(`Indexed WETH liability underflow for ${owner}.`);
  db.prepare(`INSERT INTO account_balances(chain_id,owner_address,weth_balance_wei,source_block,source_transaction_hash) VALUES(?,?,?,?,?)
    ON CONFLICT(chain_id,owner_address) DO UPDATE SET weth_balance_wei=excluded.weth_balance_wei,source_block=excluded.source_block,source_transaction_hash=excluded.source_transaction_hash`)
    .run(chainId, owner, balance.toString(), block, tx);
}

function setIndexedTokenBalance(db: V47Database, chainId: number, owner: string, market: string, balance: bigint, block: number, tx: string) {
  if (balance < 0n) throw new Error(`Indexed token liability underflow for ${owner}/${market}.`);
  db.prepare(`INSERT INTO token_balances(chain_id,owner_address,market_address,token_balance_wad,source_block,source_transaction_hash) VALUES(?,?,?,?,?,?)
    ON CONFLICT(chain_id,owner_address,market_address) DO UPDATE SET token_balance_wad=excluded.token_balance_wad,source_block=excluded.source_block,source_transaction_hash=excluded.source_transaction_hash`)
    .run(chainId, owner, market, balance.toString(), block, tx);
}

function applyProjection(db: V47Database, row: RawEventRow) {
  if (row.removed) return;
  const topics = JSON.parse(row.topics_json) as string[];
  const data = words(row.data);
  const tx = row.transaction_hash;
  const block = row.block_number;
  const address = row.address;
  switch (row.event_name) {
    case "MarketCreated":
      db.prepare(`INSERT INTO markets(chain_id,market_address,token_address,creator_address,metadata_hash,creator_genesis_buy_wei,migration_target_usd_wad,created_block,created_transaction_hash,active)
        VALUES(?,?,?,?,?,?,?,?,?,1)
        ON CONFLICT(chain_id,market_address) DO UPDATE SET token_address=excluded.token_address,creator_address=excluded.creator_address,metadata_hash=excluded.metadata_hash,creator_genesis_buy_wei=excluded.creator_genesis_buy_wei,migration_target_usd_wad=excluded.migration_target_usd_wad,created_block=excluded.created_block,created_transaction_hash=excluded.created_transaction_hash,active=1`)
        .run(row.chain_id, topicAddress(topics[1]), topicAddress(topics[2]), topicAddress(topics[3]), `0x${data[2] ?? "0".repeat(64)}`, wordUint(data[0]), wordUint(data[1]), block, tx);
      break;
    case "Deposited":
    case "Withdrawn":
      db.prepare(`INSERT INTO account_balances(chain_id,owner_address,weth_balance_wei,source_block,source_transaction_hash) VALUES(?,?,?,?,?)
        ON CONFLICT(chain_id,owner_address) DO UPDATE SET weth_balance_wei=excluded.weth_balance_wei,source_block=excluded.source_block,source_transaction_hash=excluded.source_transaction_hash`)
        .run(row.chain_id, topicAddress(topics[1]), wordUint(data[1]), block, tx);
      break;
    case "TokenDeposited":
    case "TokenWithdrawn":
      db.prepare(`INSERT INTO token_balances(chain_id,owner_address,market_address,token_balance_wad,source_block,source_transaction_hash) VALUES(?,?,?,?,?,?)
        ON CONFLICT(chain_id,owner_address,market_address) DO UPDATE SET token_balance_wad=excluded.token_balance_wad,source_block=excluded.source_block,source_transaction_hash=excluded.source_transaction_hash`)
        .run(row.chain_id, topicAddress(topics[1]), topicAddress(topics[2]), wordUint(data[1]), block, tx);
      break;
    case "SessionAuthorized":
      db.prepare(`INSERT INTO sessions(chain_id,session_id,owner_address,public_key_hash,valid_until,next_nonce,max_notional_wei,max_cumulative_notional_wei,spent_notional_wei,action_bitmap,active,source_block,source_transaction_hash)
        VALUES(?,?,?,?,?,'0',?,?, '0',?,1,?,?)
        ON CONFLICT(chain_id,session_id) DO UPDATE SET owner_address=excluded.owner_address,public_key_hash=excluded.public_key_hash,valid_until=excluded.valid_until,next_nonce='0',max_notional_wei=excluded.max_notional_wei,max_cumulative_notional_wei=excluded.max_cumulative_notional_wei,spent_notional_wei='0',action_bitmap=excluded.action_bitmap,active=1,source_block=excluded.source_block,source_transaction_hash=excluded.source_transaction_hash`)
        .run(row.chain_id, topics[1], topicAddress(topics[2]), `0x${data[0] ?? "0".repeat(64)}`, Number(BigInt(wordUint(data[1]))), wordUint(data[2]), wordUint(data[3]), wordUint(data[4]), block, tx);
      break;
    case "SessionRevoked":
      db.prepare("UPDATE sessions SET active=0,source_block=?,source_transaction_hash=? WHERE chain_id=? AND session_id=?")
        .run(block, tx, row.chain_id, topics[1]);
      break;
    case "SessionNonceConsumed": {
      const nextNonce = (BigInt(topicUint(topics[2])) + 1n).toString();
      db.prepare("UPDATE sessions SET next_nonce=?,spent_notional_wei=?,source_block=?,source_transaction_hash=? WHERE chain_id=? AND session_id=?")
        .run(nextNonce, wordUint(data[1]), block, tx, row.chain_id, topics[1]);
      break;
    }
    case "AccountExecution": {
      const owner = topicAddress(topics[1]);
      const market = topicAddress(topics[2]);
      const action = Number(BigInt(topicUint(topics[3])));
      const inputAmount = BigInt(wordUint(data[0]));
      const outputAmount = BigInt(wordUint(data[1]));
      db.prepare(`INSERT OR REPLACE INTO account_executions(chain_id,transaction_hash,log_index,owner_address,market_address,action,input_amount,output_amount,position_id,intent_hash,block_number)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .run(row.chain_id, tx, row.log_index, owner, market, action, inputAmount.toString(), outputAmount.toString(), wordUint(data[2]), `0x${data[3] ?? "0".repeat(64)}`, block);
      if (action === 1) {
        setIndexedWethBalance(db, row.chain_id, owner, indexedWethBalance(db, row.chain_id, owner) - inputAmount, block, tx);
        setIndexedTokenBalance(db, row.chain_id, owner, market, indexedTokenBalance(db, row.chain_id, owner, market) + outputAmount, block, tx);
      } else if (action === 2) {
        setIndexedTokenBalance(db, row.chain_id, owner, market, indexedTokenBalance(db, row.chain_id, owner, market) - inputAmount, block, tx);
        setIndexedWethBalance(db, row.chain_id, owner, indexedWethBalance(db, row.chain_id, owner) + outputAmount, block, tx);
      } else if (action === 3 || action === 4) {
        setIndexedWethBalance(db, row.chain_id, owner, indexedWethBalance(db, row.chain_id, owner) - inputAmount, block, tx);
      } else if (action === 5 || action === 6) {
        setIndexedWethBalance(db, row.chain_id, owner, indexedWethBalance(db, row.chain_id, owner) + outputAmount, block, tx);
      }
      break;
    }
    case "Trade":
      db.prepare(`INSERT OR REPLACE INTO trades(chain_id,transaction_hash,log_index,market_address,trader_address,is_buy,gross_weth_wei,token_amount_wad,fee_weth_wei,sold_after_wad,market_cap_eth_wad,block_number)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(row.chain_id, tx, row.log_index, address, topicAddress(topics[1]), topicUint(topics[2]) === "1" ? 1 : 0, wordUint(data[0]), wordUint(data[1]), wordUint(data[2]), wordUint(data[3]), wordUint(data[4]), block);
      break;
    case "PositionOpened":
      db.prepare(`INSERT INTO positions(chain_id,market_address,position_id,owner_address,direction,leverage,collateral_wei,notional_wei,token_amount_wad,entry_price_wad,liquidation_price_wad,status,liquidated,opened_block,opened_transaction_hash)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'open',0,?,?)
        ON CONFLICT(chain_id,market_address,position_id) DO UPDATE SET owner_address=excluded.owner_address,direction=excluded.direction,leverage=excluded.leverage,collateral_wei=excluded.collateral_wei,notional_wei=excluded.notional_wei,token_amount_wad=excluded.token_amount_wad,entry_price_wad=excluded.entry_price_wad,liquidation_price_wad=excluded.liquidation_price_wad,status='open',liquidated=0,opened_block=excluded.opened_block,opened_transaction_hash=excluded.opened_transaction_hash,closed_block=NULL,closed_transaction_hash=NULL`)
        .run(row.chain_id, address, topicUint(topics[1]), topicAddress(topics[2]), Number(BigInt(topicUint(topics[3]))), Number(BigInt(wordUint(data[0]))), wordUint(data[1]), wordUint(data[2]), wordUint(data[3]), wordUint(data[4]), wordUint(data[5]), block, tx);
      break;
    case "PositionClosed":
      db.prepare(`UPDATE positions SET status='closed',liquidated=?,payout_wei=?,pnl_wei=?,fee_wei=?,bad_debt_wei=?,closed_block=?,closed_transaction_hash=?
        WHERE chain_id=? AND market_address=? AND position_id=?`)
        .run(wordBool(data[0]), wordUint(data[1]), wordInt(data[2]), wordUint(data[3]), wordUint(data[4]), block, tx, row.chain_id, address, topicUint(topics[1]));
      break;
    case "MigrationStarted":
      db.prepare("UPDATE markets SET phase=1,migration_gate_digest=?,migration_started_block=? WHERE chain_id=? AND market_address=?")
        .run(topics[1] ?? ZERO_HASH, block, row.chain_id, address);
      break;
    case "MigrationCommitted":
      db.prepare("UPDATE markets SET active=0,phase=2,migration_gate_digest=?,migrated_at=?,migration_committed_block=? WHERE chain_id=? AND market_address=?")
        .run(topics[1] ?? ZERO_HASH, Number(BigInt(wordUint(data[0]))), block, row.chain_id, address);
      break;
    case "PhaseChanged":
      db.prepare("UPDATE markets SET phase=? WHERE chain_id=? AND market_address=?")
        .run(Number(BigInt(topicUint(topics[1]))), row.chain_id, address);
      break;
    case "StateCommitted":
      db.prepare(`INSERT INTO market_states(chain_id,market_address,sequence,state_hash,action,actor,marginal_price_wad,market_cap_eth_wad,real_weth_balance_wei,free_weth_wei,curve_sold_token_wad,open_interest_long_wei,open_interest_short_wei,active_positions,source_block,source_transaction_hash)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(chain_id,market_address) DO UPDATE SET sequence=excluded.sequence,state_hash=excluded.state_hash,action=excluded.action,actor=excluded.actor,marginal_price_wad=excluded.marginal_price_wad,market_cap_eth_wad=excluded.market_cap_eth_wad,real_weth_balance_wei=excluded.real_weth_balance_wei,free_weth_wei=excluded.free_weth_wei,curve_sold_token_wad=excluded.curve_sold_token_wad,open_interest_long_wei=excluded.open_interest_long_wei,open_interest_short_wei=excluded.open_interest_short_wei,active_positions=excluded.active_positions,source_block=excluded.source_block,source_transaction_hash=excluded.source_transaction_hash`)
        .run(row.chain_id, address, topicUint(topics[1]), topics[2] ?? ZERO_HASH, Number(BigInt(topicUint(topics[3]))), wordAddress(data[0]), wordUint(data[1]), wordUint(data[2]), wordUint(data[3]), wordUint(data[4]), wordUint(data[5]), wordUint(data[6]), wordUint(data[7]), wordUint(data[8]), block, tx);
      break;
  }
}

const PROJECTION_TABLES = ["markets", "market_states", "trades", "positions", "account_balances", "token_balances", "sessions", "account_executions"];

export function rebuildV47Projections(db: V47Database) {
  for (const table of PROJECTION_TABLES) db.exec(`DELETE FROM ${table}`);
  const rows = db.prepare("SELECT * FROM raw_events WHERE removed=0 ORDER BY block_number ASC, log_index ASC").all() as unknown as RawEventRow[];
  for (const row of rows) applyProjection(db, row);
  return rows.length;
}

export function ingestV47Batch(input: { path?: string; chainId: number; factoryAddress: string; blocks: Array<{ blockNumber: number; blockHash: string; parentHash: string; timestamp: number }>; logs: V47RpcLog[]; finalizedBlock: number }) {
  const db = openV47Database(input.path);
  try {
    return withV47Transaction(db, () => {
      for (const block of input.blocks) {
        db.prepare(`INSERT INTO chain_blocks(chain_id,block_number,block_hash,parent_hash,timestamp,canonical,indexed_at) VALUES(?,?,?,?,?,1,?)
          ON CONFLICT(chain_id,block_number) DO UPDATE SET block_hash=excluded.block_hash,parent_hash=excluded.parent_hash,timestamp=excluded.timestamp,canonical=1,indexed_at=excluded.indexed_at`)
          .run(input.chainId, block.blockNumber, block.blockHash.toLowerCase(), block.parentHash.toLowerCase(), block.timestamp, Date.now());
      }
      for (const log of input.logs) insertRawEvent(db, input.chainId, log);
      const projected = rebuildV47Projections(db);
      const head = input.blocks.at(-1);
      if (head) db.prepare(`INSERT INTO indexed_heads(chain_id,factory_address,block_number,block_hash,finalized_block,updated_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(chain_id) DO UPDATE SET factory_address=excluded.factory_address,block_number=excluded.block_number,block_hash=excluded.block_hash,finalized_block=excluded.finalized_block,updated_at=excluded.updated_at`)
        .run(input.chainId, input.factoryAddress.toLowerCase(), head.blockNumber, head.blockHash.toLowerCase(), input.finalizedBlock, Date.now());
      return { blocks: input.blocks.length, logs: input.logs.length, projected };
    });
  } finally { db.close(); }
}

export function rollbackV47ToBlock(chainId: number, ancestorBlock: number, path = v47DatabasePath()) {
  const db = openV47Database(path);
  const jobId = `rollback-${chainId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  try {
    return withV47Transaction(db, () => {
      const currentHead = db.prepare("SELECT block_number AS blockNumber FROM indexed_heads WHERE chain_id=?").get(chainId) as { blockNumber?: number } | undefined;
      db.prepare("INSERT INTO recovery_jobs(job_id,kind,status,requested_at,started_at,from_block,to_block,details_json) VALUES(?, 'reorg-rollback', 'running', ?, ?, ?, ?, ?)")
        .run(jobId, Date.now(), Date.now(), currentHead?.blockNumber ?? ancestorBlock, ancestorBlock, JSON.stringify({ chainId }));
      const head = db.prepare("SELECT block_hash FROM chain_blocks WHERE chain_id=? AND block_number=?").get(chainId, ancestorBlock) as { block_hash?: string } | undefined;
      db.prepare("DELETE FROM raw_events WHERE chain_id=? AND block_number>?").run(chainId, ancestorBlock);
      db.prepare("DELETE FROM chain_blocks WHERE chain_id=? AND block_number>?").run(chainId, ancestorBlock);
      const replayedEvents = rebuildV47Projections(db);
      db.prepare("UPDATE indexed_heads SET block_number=?,block_hash=?,finalized_block=MIN(finalized_block,?),updated_at=? WHERE chain_id=?")
        .run(ancestorBlock, head?.block_hash ?? ZERO_HASH, ancestorBlock, Date.now(), chainId);
      db.prepare("UPDATE recovery_jobs SET status='completed',completed_at=?,details_json=? WHERE job_id=?")
        .run(Date.now(), JSON.stringify({ chainId, replayedEvents }), jobId);
      return { jobId, ancestorBlock, blockHash: head?.block_hash ?? ZERO_HASH, replayedEvents };
    });
  } finally { db.close(); }
}

async function findCommonAncestor(db: V47Database, chainId: number, rpcUrl: string, fromBlock: number, maxDepth: number) {
  const floor = Math.max(0, fromBlock - maxDepth);
  for (let blockNumber = fromBlock; blockNumber >= floor; blockNumber -= 1) {
    const stored = db.prepare("SELECT block_hash FROM chain_blocks WHERE chain_id=? AND block_number=?").get(chainId, blockNumber) as { block_hash?: string } | undefined;
    if (!stored?.block_hash) continue;
    const live = await rpc<V47RpcBlock | null>(rpcUrl, "eth_getBlockByNumber", [toRpcHex(blockNumber), false]);
    if (live?.hash?.toLowerCase() === stored.block_hash.toLowerCase()) return blockNumber;
  }
  return Math.max(0, floor - 1);
}

export type V47IndexerResult = {
  chainId: number;
  factoryAddress: string;
  latestBlock: number;
  finalizedBlock: number;
  previousHead: number;
  indexedTo: number;
  blocks: number;
  logs: number;
  markets: number;
  reorgDepth: number;
  databasePath: string;
};

export async function runV47IndexerCycle(input: { rpcUrl?: string; factoryAddress?: string; path?: string; confirmations?: number; batchSize?: number; maxReorgDepth?: number; workerId?: string } = {}): Promise<V47IndexerResult> {
  const rpcUrl = input.rpcUrl ?? process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_RPC;
  const factoryAddress = (input.factoryAddress ?? process.env.NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS ?? "").toLowerCase();
  if (!validAddress(factoryAddress)) throw new Error("NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS is not configured for V47.");
  const path = input.path ?? v47DatabasePath();
  const chainId = Number(BigInt(await rpc<Hex>(rpcUrl, "eth_chainId")));
  const latestBlock = Number(BigInt(await rpc<Hex>(rpcUrl, "eth_blockNumber")));
  const defaultConfirmations = chainId === 31_337 ? 0 : 2;
  const confirmations = input.confirmations ?? Number(process.env.V47_FINALITY_CONFIRMATIONS ?? defaultConfirmations);
  const finalizedBlock = Math.max(0, latestBlock - Math.max(0, confirmations));
  const batchSize = Math.max(1, input.batchSize ?? Number(process.env.V47_INDEX_BATCH_SIZE ?? 250));
  const maxReorgDepth = Math.max(1, input.maxReorgDepth ?? Number(process.env.V47_MAX_REORG_DEPTH ?? 128));
  const workerId = input.workerId ?? `indexer-${process.pid}`;
  const leaseKey = `indexer:${chainId}:${factoryAddress}`;
  if (!acquireV47WorkerLease({ leaseKey, workerId, leaseMs: 30_000 }, path)) throw new Error("Another healthy V47 indexer currently owns the canonical lease.");
  recordV47Heartbeat({ workerId, role: "indexer", status: "starting", chainId, lastBlock: 0, leaseUntil: Date.now() + 30_000, metadata: { rpcUrl, factoryAddress } }, path);

  let previousHead = Number(process.env.V47_START_BLOCK ?? 0) - 1;
  let reorgDepth = 0;
  const db = openV47Database(path);
  try {
    const stored = db.prepare("SELECT block_number AS blockNumber, block_hash AS blockHash FROM indexed_heads WHERE chain_id=?").get(chainId) as { blockNumber?: number; blockHash?: string } | undefined;
    if (stored?.blockNumber !== undefined) {
      previousHead = stored.blockNumber;
      const live = await rpc<V47RpcBlock | null>(rpcUrl, "eth_getBlockByNumber", [toRpcHex(previousHead), false]);
      if (!live || live.hash.toLowerCase() !== stored.blockHash?.toLowerCase()) {
        const ancestor = await findCommonAncestor(db, chainId, rpcUrl, previousHead, maxReorgDepth);
        reorgDepth = previousHead - ancestor;
        db.close();
        rollbackV47ToBlock(chainId, ancestor, path);
      }
    }
  } finally {
    try { db.close(); } catch { /* already closed for rollback */ }
  }

  const headDb = openV47Database(path);
  try {
    const current = headDb.prepare("SELECT block_number AS blockNumber FROM indexed_heads WHERE chain_id=?").get(chainId) as { blockNumber?: number } | undefined;
    previousHead = current?.blockNumber ?? previousHead;
  } finally { headDb.close(); }

  const markets = await discoverV47Markets(factoryAddress, rpcUrl);
  let cursor = Math.max(previousHead + 1, Number(process.env.V47_START_BLOCK ?? 0));
  let indexedTo = previousHead;
  let totalBlocks = 0;
  let totalLogs = 0;

  while (cursor <= finalizedBlock) {
    const toBlock = Math.min(finalizedBlock, cursor + batchSize - 1);
    const blocks: Array<{ blockNumber: number; blockHash: string; parentHash: string; timestamp: number }> = [];
    for (let blockNumber = cursor; blockNumber <= toBlock; blockNumber += 1) {
      const block = await rpc<V47RpcBlock | null>(rpcUrl, "eth_getBlockByNumber", [toRpcHex(blockNumber), false]);
      if (!block) throw new Error(`Block ${blockNumber} disappeared while indexing.`);
      blocks.push({ blockNumber, blockHash: block.hash, parentHash: block.parentHash, timestamp: Number(BigInt(block.timestamp)) });
    }
    const addresses = [factoryAddress, ...markets];
    const logs = await rpc<V47RpcLog[]>(rpcUrl, "eth_getLogs", [{ fromBlock: toRpcHex(cursor), toBlock: toRpcHex(toBlock), address: addresses }]);
    ingestV47Batch({ path, chainId, factoryAddress, blocks, logs, finalizedBlock });
    totalBlocks += blocks.length;
    totalLogs += logs.length;
    indexedTo = toBlock;
    acquireV47WorkerLease({ leaseKey, workerId, leaseMs: 30_000 }, path);
    recordV47Heartbeat({ workerId, role: "indexer", status: "healthy", chainId, lastBlock: indexedTo, leaseUntil: Date.now() + 30_000, metadata: { markets: markets.length, logs: totalLogs, reorgDepth } }, path);
    cursor = toBlock + 1;
  }

  if (indexedTo < 0) indexedTo = previousHead;
  recordV47Heartbeat({ workerId, role: "indexer", status: "healthy", chainId, lastBlock: indexedTo, leaseUntil: Date.now() + 30_000, metadata: { markets: markets.length, logs: totalLogs, reorgDepth, caughtUp: indexedTo >= finalizedBlock } }, path);
  releaseV47WorkerLease(leaseKey, workerId, path);
  return { chainId, factoryAddress, latestBlock, finalizedBlock, previousHead, indexedTo, blocks: totalBlocks, logs: totalLogs, markets: markets.length, reorgDepth, databasePath: path };
}

export function v47IndexedSnapshot(input: { path?: string; owner?: string; market?: string } = {}) {
  const db = openV47Database(input.path);
  try {
    const owner = input.owner?.toLowerCase();
    const market = input.market?.toLowerCase();
    const head = db.prepare("SELECT chain_id AS chainId,factory_address AS factoryAddress,block_number AS blockNumber,block_hash AS blockHash,finalized_block AS finalizedBlock,updated_at AS updatedAt FROM indexed_heads ORDER BY updated_at DESC LIMIT 1").get() ?? null;
    const markets = db.prepare(`SELECT m.chain_id AS chainId,m.market_address AS marketAddress,m.token_address AS tokenAddress,m.creator_address AS creatorAddress,m.created_block AS createdBlock,m.phase AS phase,m.migrated_at AS migratedAt,m.migration_started_block AS migrationStartedBlock,m.migration_committed_block AS migrationCommittedBlock,
      s.market_cap_eth_wad AS marketCapEthWad,s.marginal_price_wad AS marginalPriceWad,s.free_weth_wei AS freeWethWei,s.open_interest_long_wei AS openInterestLongWei,s.open_interest_short_wei AS openInterestShortWei,s.active_positions AS activePositions,s.source_block AS stateBlock
      FROM markets m LEFT JOIN market_states s ON s.chain_id=m.chain_id AND s.market_address=m.market_address ORDER BY m.created_block DESC`).all();
    const positions = owner ? db.prepare("SELECT * FROM positions WHERE owner_address=? ORDER BY opened_block DESC LIMIT 500").all(owner) : market ? db.prepare("SELECT * FROM positions WHERE market_address=? ORDER BY opened_block DESC LIMIT 500").all(market) : [];
    const trades = market ? db.prepare("SELECT * FROM trades WHERE market_address=? ORDER BY block_number DESC,log_index DESC LIMIT 500").all(market) : db.prepare("SELECT * FROM trades ORDER BY block_number DESC,log_index DESC LIMIT 100").all();
    const account = owner ? db.prepare("SELECT * FROM account_balances WHERE owner_address=?").get(owner) ?? null : null;
    const tokens = owner ? db.prepare("SELECT * FROM token_balances WHERE owner_address=? ORDER BY source_block DESC").all(owner) : [];
    const sessions = owner ? db.prepare("SELECT * FROM sessions WHERE owner_address=? ORDER BY source_block DESC").all(owner) : [];
    return { head, markets, positions, trades, account, tokens, sessions };
  } finally { db.close(); }
}
