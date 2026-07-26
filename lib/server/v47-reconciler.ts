import { decodeAddress, decodeUint, decodeWords, encodeAddress, encodeBytes32, encodeCall, type Hex } from "../chain/abi.ts";
import { DEFAULT_LOCAL_RPC, ethCall, rpcRequest } from "../chain/local-battle-client.ts";
import { acquireV47WorkerLease, openV47Database, recordV47Heartbeat, releaseV47WorkerLease, v47DatabasePath, withV47Transaction } from "./v47-database.ts";

export type V47ReconciliationResult = {
  chainId: number;
  blockNumber: number;
  checked: number;
  matched: number;
  mismatched: number;
  accounts: number;
  tokens: number;
  sessions: number;
  markets: number;
  mismatches: Array<{ kind: string; subject: string; indexed: string; chain: string }>;
};

function stringify(values: unknown) { return JSON.stringify(values); }

async function singleUint(rpcUrl: string, contract: string, signature: string, args: string[] = []) {
  const value = await ethCall(rpcUrl, contract, encodeCall(signature, args));
  return decodeUint(decodeWords(value)[0] ?? "0").toString();
}

function recordCheck(db: ReturnType<typeof openV47Database>, input: { runId: string; chainId: number; kind: string; subject: string; indexed: string; chain: string; block: number; details?: Record<string, unknown> }) {
  const ok = input.indexed === input.chain;
  db.prepare("INSERT INTO reconciliation_checks(run_id,chain_id,kind,subject,indexed_value,chain_value,ok,checked_at,block_number,details_json) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(input.runId, input.chainId, input.kind, input.subject, input.indexed, input.chain, ok ? 1 : 0, Date.now(), input.block, stringify(input.details ?? {}));
  return ok;
}

export async function runV47Reconciliation(input: { rpcUrl?: string; router?: string; path?: string; workerId?: string; maxSubjects?: number } = {}): Promise<V47ReconciliationResult> {
  const rpcUrl = input.rpcUrl ?? process.env.LOCAL_CHAIN_RPC ?? process.env.NEXT_PUBLIC_LOCAL_CHAIN_RPC ?? DEFAULT_LOCAL_RPC;
  const router = (input.router ?? process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(router)) throw new Error("NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS is not configured for V47 reconciliation.");
  const path = input.path ?? v47DatabasePath();
  const chainId = Number(BigInt(await rpcRequest<Hex>(rpcUrl, "eth_chainId")));
  const blockNumber = Number(BigInt(await rpcRequest<Hex>(rpcUrl, "eth_blockNumber")));
  const workerId = input.workerId ?? `reconciler-${process.pid}`;
  const leaseKey = `reconciler:${chainId}:${router}`;
  const runId = `${chainId}:${blockNumber}:${Date.now()}:${workerId}`;
  if (!acquireV47WorkerLease({ leaseKey, workerId, leaseMs: 30_000 }, path)) throw new Error("Another healthy V47 reconciler currently owns the canonical lease.");
  const maxSubjects = Math.max(1, input.maxSubjects ?? Number(process.env.V47_RECONCILIATION_LIMIT ?? 1_000));
  recordV47Heartbeat({ workerId, role: "reconciler", status: "starting", chainId, lastBlock: blockNumber, leaseUntil: Date.now() + 30_000, metadata: { router } }, path);

  const db = openV47Database(path);
  const result: V47ReconciliationResult = { chainId, blockNumber, checked: 0, matched: 0, mismatched: 0, accounts: 0, tokens: 0, sessions: 0, markets: 0, mismatches: [] };
  try {
    const accounts = db.prepare("SELECT owner_address,weth_balance_wei FROM account_balances WHERE chain_id=? LIMIT ?").all(chainId, maxSubjects) as unknown as Array<{ owner_address: string; weth_balance_wei: string }>;
    const tokens = db.prepare("SELECT owner_address,market_address,token_balance_wad FROM token_balances WHERE chain_id=? LIMIT ?").all(chainId, maxSubjects) as unknown as Array<{ owner_address: string; market_address: string; token_balance_wad: string }>;
    const sessions = db.prepare("SELECT session_id,owner_address,public_key_hash,valid_until,next_nonce,max_notional_wei,max_cumulative_notional_wei,spent_notional_wei,action_bitmap,active FROM sessions WHERE chain_id=? LIMIT ?").all(chainId, maxSubjects) as unknown as Array<Record<string, string | number>>;
    const markets = db.prepare("SELECT m.market_address,s.sequence,s.state_hash,s.market_cap_eth_wad,s.free_weth_wei,s.open_interest_long_wei,s.open_interest_short_wei,s.active_positions FROM markets m LEFT JOIN market_states s ON s.chain_id=m.chain_id AND s.market_address=m.market_address WHERE m.chain_id=? LIMIT ?").all(chainId, maxSubjects) as unknown as Array<Record<string, string | number | null>>;

    const checks: Array<{ kind: string; subject: string; indexed: string; chain: string; details?: Record<string, unknown> }> = [];
    for (const account of accounts) {
      const chain = await singleUint(rpcUrl, router, "wethBalanceWei(address)", [encodeAddress(account.owner_address)]);
      checks.push({ kind: "weth-balance", subject: account.owner_address, indexed: account.weth_balance_wei, chain });
      result.accounts += 1;
    }
    for (const token of tokens) {
      const chain = await singleUint(rpcUrl, router, "tokenBalanceWad(address,address)", [encodeAddress(token.owner_address), encodeAddress(token.market_address)]);
      checks.push({ kind: "token-balance", subject: `${token.owner_address}:${token.market_address}`, indexed: token.token_balance_wad, chain });
      result.tokens += 1;
    }
    for (const session of sessions) {
      const response = await ethCall(rpcUrl, router, encodeCall("sessionState(bytes32)", [encodeBytes32(String(session.session_id))]));
      const words = decodeWords(response);
      const chain = stringify({ owner_address: decodeAddress(words[0] ?? "0".repeat(64)).toLowerCase(), public_key_hash: `0x${words[1] ?? "0".repeat(64)}`, valid_until: Number(decodeUint(words[2] ?? "0")), next_nonce: decodeUint(words[3] ?? "0").toString(), max_notional_wei: decodeUint(words[4] ?? "0").toString(), max_cumulative_notional_wei: decodeUint(words[5] ?? "0").toString(), spent_notional_wei: decodeUint(words[6] ?? "0").toString(), action_bitmap: decodeUint(words[7] ?? "0").toString(), active: decodeUint(words[8] ?? "0") === 1n ? 1 : 0 });
      const indexed = stringify({ owner_address: String(session.owner_address), public_key_hash: String(session.public_key_hash), valid_until: Number(session.valid_until), next_nonce: String(session.next_nonce), max_notional_wei: String(session.max_notional_wei), max_cumulative_notional_wei: String(session.max_cumulative_notional_wei), spent_notional_wei: String(session.spent_notional_wei), action_bitmap: String(session.action_bitmap), active: Number(session.active) });
      checks.push({ kind: "session", subject: String(session.session_id), indexed, chain });
      result.sessions += 1;
    }
    for (const market of markets) {
      if (!market.sequence) continue;
      const response = await ethCall(rpcUrl, String(market.market_address), encodeCall("runtimeState()"));
      const words = decodeWords(response);
      const chain = stringify({ sequence: decodeUint(words[0] ?? "0").toString(), state_hash: `0x${words[18] ?? "0".repeat(64)}`, market_cap_eth_wad: decodeUint(words[4] ?? "0").toString(), free_weth_wei: decodeUint(words[6] ?? "0").toString(), open_interest_long_wei: decodeUint(words[14] ?? "0").toString(), open_interest_short_wei: decodeUint(words[15] ?? "0").toString(), active_positions: decodeUint(words[16] ?? "0").toString() });
      const indexed = stringify({ sequence: String(market.sequence), state_hash: String(market.state_hash), market_cap_eth_wad: String(market.market_cap_eth_wad), free_weth_wei: String(market.free_weth_wei), open_interest_long_wei: String(market.open_interest_long_wei), open_interest_short_wei: String(market.open_interest_short_wei), active_positions: String(market.active_positions) });
      checks.push({ kind: "market-state", subject: String(market.market_address), indexed, chain });
      result.markets += 1;
    }

    withV47Transaction(db, () => {
      for (const check of checks) {
        result.checked += 1;
        if (recordCheck(db, { runId, chainId, kind: check.kind, subject: check.subject, indexed: check.indexed, chain: check.chain, block: blockNumber, details: check.details })) result.matched += 1;
        else {
          result.mismatched += 1;
          result.mismatches.push({ kind: check.kind, subject: check.subject, indexed: check.indexed, chain: check.chain });
        }
      }
      db.prepare("DELETE FROM reconciliation_checks WHERE id NOT IN (SELECT id FROM reconciliation_checks ORDER BY checked_at DESC LIMIT 50000)").run();
    });
  } finally { db.close(); }
  recordV47Heartbeat({ workerId, role: "reconciler", status: result.mismatched ? "degraded" : "healthy", chainId, lastBlock: blockNumber, leaseUntil: Date.now() + 30_000, metadata: { checked: result.checked, mismatched: result.mismatched } }, path);
  releaseV47WorkerLease(leaseKey, workerId, path);
  return result;
}

export function recentV47Reconciliation(path = v47DatabasePath(), limit = 200) {
  const db = openV47Database(path);
  try {
    const rows = db.prepare("SELECT run_id AS runId,chain_id AS chainId,kind,subject,indexed_value AS indexedValue,chain_value AS chainValue,ok,checked_at AS checkedAt,block_number AS blockNumber,details_json AS detailsJson FROM reconciliation_checks ORDER BY checked_at DESC,id DESC LIMIT ?").all(limit);
    const latest = db.prepare("SELECT run_id AS runId FROM reconciliation_checks ORDER BY checked_at DESC,id DESC LIMIT 1").get() as { runId?: string } | undefined;
    const summary = latest?.runId
      ? db.prepare("SELECT run_id AS runId,COUNT(*) AS checked,SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS matched,SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS mismatched,MAX(checked_at) AS lastCheckedAt FROM reconciliation_checks WHERE run_id=?").get(latest.runId)
      : { runId: null, checked: 0, matched: 0, mismatched: 0, lastCheckedAt: 0 };
    return { summary, rows };
  } finally { db.close(); }
}
