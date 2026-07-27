"use client";

import { Activity, Blocks, CheckCircle2, Database, GitBranch, Play, Radio, RefreshCw, ShieldCheck, Siren, Waypoints } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type MarketRow = {
  marketAddress: string;
  tokenAddress: string;
  creatorAddress: string;
  createdBlock: number;
  phase?: number;
  migratedAt?: number;
  marketCapEthWad?: string;
  freeWethWei?: string;
  openInterestLongWei?: string;
  openInterestShortWei?: string;
  activePositions?: string;
  stateBlock?: number;
};

type Heartbeat = { workerId: string; role: string; status: string; lastSeenAt: number; lastBlock: number; leaseUntil: number };
type Trade = { transaction_hash: string; market_address: string; trader_address: string; is_buy: number; gross_weth_wei: string; token_amount_wad: string; block_number: number };
type ReconciliationRow = { kind: string; subject: string; ok: number; checkedAt: number; blockNumber: number };
type StatusPayload = {
  ok: boolean;
  mode: string;
  database: { path: string; counts: Record<string, number>; head: { chainId: number; blockNumber: number; finalizedBlock: number; updatedAt: number } | null; unhealthyWorkers: number };
  snapshot: { markets: MarketRow[]; trades: Trade[] };
  heartbeats: Heartbeat[];
  reconciliation: { summary: { checked?: number; matched?: number; mismatched?: number; lastCheckedAt?: number }; rows: ReconciliationRow[] };
  error?: string;
};

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
function short(value?: string) { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—"; }
function eth(wei?: string) { return wei ? (Number(wei) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "0"; }
function age(value?: number) {
  if (!value) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1_000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3_600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3_600)}h ago`;
}

export function V47IndexerConsole() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [busy, setBusy] = useState<"indexer" | "keeper" | "reconciler" | null>(null);
  const [message, setMessage] = useState("Waiting for canonical chain state.");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v47/indexer/status", { cache: "no-store" });
    const payload = await response.json() as StatusPayload;
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "V47 status unavailable.");
    setStatus(payload);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Refresh failed."));
    const interval = window.setInterval(() => void refresh().catch(() => undefined), 2_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const run = async (kind: "indexer" | "keeper" | "reconciler") => {
    setBusy(kind);
    setMessage(kind === "indexer" ? "Indexing finalized blocks and rebuilding canonical projections…" : kind === "keeper" ? "Running durable orders and liquidation cycle…" : "Comparing indexed liabilities, sessions, and market state against live contracts…");
    try {
      const endpoint = kind === "indexer" ? "/api/v47/indexer/run" : kind === "keeper" ? "/api/v46/keeper/run" : "/api/v47/reconcile/run";
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = await response.json() as { ok?: boolean; result?: Record<string, unknown>; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `${kind} cycle failed.`);
      setMessage(kind === "indexer"
        ? `Indexed through block ${String(payload.result?.indexedTo ?? "—")} · ${String(payload.result?.logs ?? 0)} logs · reorg depth ${String(payload.result?.reorgDepth ?? 0)}`
        : kind === "keeper"
          ? `Keeper checked ${String(payload.result?.checked ?? 0)} orders · filled ${String(payload.result?.filled ?? 0)} · liquidations ${String(payload.result?.liquidations ?? 0)}`
          : `Reconciled ${String(payload.result?.checked ?? 0)} subjects · ${String(payload.result?.matched ?? 0)} matched · ${String(payload.result?.mismatched ?? 0)} mismatch(es)`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${kind} cycle failed.`);
    } finally { setBusy(null); }
  };

  const head = status?.database.head;
  const heartbeats = status?.heartbeats ?? [];
  const healthyWorkers = heartbeats.filter((heartbeat) => heartbeat.leaseUntil >= Date.now() && ["healthy", "starting"].includes(heartbeat.status)).length;
  const caughtUp = Boolean(head && head.blockNumber >= head.finalizedBlock);
  const counts = status?.database.counts ?? {};
  const markets = status?.snapshot.markets ?? [];
  const trades = status?.snapshot.trades ?? [];
  const reconciliationMismatch = Number(status?.reconciliation?.summary?.mismatched ?? 0);
  const canonical = Boolean(status?.ok && caughtUp && (status?.database.unhealthyWorkers ?? 0) === 0 && reconciliationMismatch === 0);
  const totalOpenInterest = useMemo(() => markets.reduce((sum, market) => sum + Number(market.openInterestLongWei ?? 0) + Number(market.openInterestShortWei ?? 0), 0), [markets]);

  return <main className="v47-indexer-page">
    <header className="v47-indexer-hero">
      <div><span><ShieldCheck size={18}/>LEVERAGE X V47</span><h1>Authoritative Indexer &amp; Recovery</h1><p>Transactional SQLite history, factory-wide discovery, reorg rollback, deterministic replay, indexed accounts, cross-device sessions, and keeper health.</p></div>
      <div className={canonical ? "healthy" : "degraded"}>{canonical ? <CheckCircle2 size={19}/> : <Siren size={19}/>}<span><b>{canonical ? "CANONICAL" : "SYNC REQUIRED"}</b><small>{status?.mode ?? "Indexer unavailable"}</small></span></div>
    </header>

    <section className="v47-indexer-actions">
      <button onClick={() => void run("indexer")} disabled={busy !== null}><Play size={15}/>{busy === "indexer" ? "Indexing…" : "Run indexer"}</button>
      <button onClick={() => void run("keeper")} disabled={busy !== null}><Waypoints size={15}/>{busy === "keeper" ? "Running…" : "Run keeper"}</button>
      <button onClick={() => void run("reconciler")} disabled={busy !== null}><ShieldCheck size={15}/>{busy === "reconciler" ? "Checking…" : "Reconcile"}</button>
      <button onClick={() => void refresh()} disabled={busy !== null}><RefreshCw size={15}/>Refresh</button>
      <span>{message}</span>
    </section>

    <section className="v47-indexer-metrics">
      <article><Blocks/><span><small>Canonical head</small><strong>{head ? NUMBER.format(head.blockNumber) : "—"}</strong><em>Finalized {head ? NUMBER.format(head.finalizedBlock) : "—"}</em></span></article>
      <article><Database/><span><small>Indexed events</small><strong>{NUMBER.format(counts.raw_events ?? 0)}</strong><em>{NUMBER.format(counts.chain_blocks ?? 0)} blocks</em></span></article>
      <article><Activity/><span><small>Markets / positions</small><strong>{markets.length} / {NUMBER.format(counts.positions ?? 0)}</strong><em>{eth(String(totalOpenInterest))} ETH open interest</em></span></article>
      <article><Radio/><span><small>Workers / reconciliation</small><strong>{healthyWorkers} / {reconciliationMismatch}</strong><em>{reconciliationMismatch ? "Indexed truth differs from chain" : "No recorded mismatch"}</em></span></article>
    </section>

    <section className="v47-indexer-grid">
      <div className="v47-indexed-markets">
        <header><span>Market</span><span>State</span><span>Liquidity</span><span>Open interest</span><span>Indexed</span></header>
        {markets.length ? markets.map((market) => <article key={market.marketAddress}>
          <span><b>{short(market.marketAddress)}</b><small>Token {short(market.tokenAddress)} · creator {short(market.creatorAddress)}</small></span>
          <span><b>{market.phase === 2 ? "Migrated" : market.phase === 1 ? "Migrating" : `${market.activePositions ?? "0"} active`}</b><small>Created block {NUMBER.format(market.createdBlock)}</small></span>
          <span><b>{eth(market.freeWethWei)} ETH</b><small>Free BattlePool WETH</small></span>
          <span><b>{eth(market.openInterestLongWei)} / {eth(market.openInterestShortWei)}</b><small>Long / short ETH</small></span>
          <span><b>{market.stateBlock ? `Block ${NUMBER.format(market.stateBlock)}` : "Awaiting state"}</b><small>{short(market.marketCapEthWad)}</small></span>
        </article>) : <div className="v47-indexer-empty">Run the local chain and indexer to discover V45 markets.</div>}
      </div>

      <aside className="v47-indexer-side">
        <section><header><GitBranch size={16}/><strong>Worker heartbeats</strong></header>{heartbeats.length ? heartbeats.map((heartbeat) => <div key={heartbeat.workerId}><span className={heartbeat.leaseUntil >= Date.now() ? "pulse healthy" : "pulse stale"}/><span><b>{heartbeat.role} · {heartbeat.status}</b><small>{heartbeat.workerId} · block {heartbeat.lastBlock} · {age(heartbeat.lastSeenAt)}</small></span></div>) : <p>No worker heartbeat has been recorded.</p>}</section>
        <section><header><Activity size={16}/><strong>Recent canonical trades</strong></header>{trades.length ? trades.slice(0, 8).map((trade) => <div key={`${trade.transaction_hash}-${trade.block_number}`}><span className={trade.is_buy ? "trade-side buy" : "trade-side sell"}>{trade.is_buy ? "BUY" : "SELL"}</span><span><b>{eth(trade.gross_weth_wei)} ETH</b><small>{short(trade.market_address)} · block {trade.block_number}</small></span></div>) : <p>No indexed trades yet.</p>}</section>
        <section><header><ShieldCheck size={16}/><strong>Reconciliation checks</strong></header>{status?.reconciliation?.rows?.length ? status.reconciliation.rows.slice(0, 8).map((check, index) => <div key={`${check.kind}-${check.subject}-${check.checkedAt}-${index}`}><span className={check.ok ? "pulse healthy" : "pulse stale"}/><span><b>{check.kind} · {check.ok ? "MATCH" : "MISMATCH"}</b><small>{short(check.subject)} · block {check.blockNumber} · {age(check.checkedAt)}</small></span></div>) : <p>No chain reconciliation has run yet.</p>}</section>
      </aside>
    </section>
  </main>;
}
