"use client";

import { Activity, AlertTriangle, Archive, Blocks, CheckCircle2, Cloud, Database, Network, Play, Radio, RefreshCw, Server, Waves } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Provider = { rpcUrl: string; status: string; latencyMs: number; blockNumber: number; consecutiveFailures: number; lastError?: string; checkedAt: number };
type Alert = { alertKey: string; severity: string; status: string; title: string; message: string; lastSeenAt: number };
type Market = { marketAddress: string; tokenAddress: string; marketCapEthWad?: string; freeWethWei?: string; openInterestLongWei?: string; openInterestShortWei?: string; stateBlock?: number };
type Status = {
  ok: boolean;
  mode: string;
  chain: { environment: string; chainId: number; name: string; canonicalWethAddress: string | null; applicationConfirmations: number; rpcProviderCount: number };
  database: { counts: Record<string, number>; latestEvent: { sequence: number; eventType: string; createdAt: number } | null; alerts: Alert[]; providers: Provider[] };
  canonical: { head: { blockNumber: number; finalizedBlock: number } | null; markets: Market[] };
};

const NUMBER = new Intl.NumberFormat("en-US");
function short(value?: string | null) { return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "—"; }
function eth(value?: string) { return (Number(BigInt(value ?? "0")) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 4 }); }
function age(value?: number) { if (!value) return "never"; const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000)); return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`; }

export function V48DataPlaneConsole() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState("Loading the V48 data plane…");
  const [busy, setBusy] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<"connecting" | "live" | "offline">("connecting");
  const [streamSequence, setStreamSequence] = useState(0);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/v48/status", { cache: "no-store" });
    const payload = await response.json() as Status & { error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "V48 status unavailable.");
    setStatus(payload);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Refresh failed."));
    const interval = window.setInterval(() => void refresh().catch(() => undefined), 3_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const stream = new EventSource("/api/v48/stream");
    stream.addEventListener("ready", () => setStreamState("live"));
    stream.addEventListener("market.updated", (event) => { setStreamState("live"); setStreamSequence(Number((event as MessageEvent).lastEventId || 0)); void refresh(); });
    stream.addEventListener("system.health", (event) => { setStreamState("live"); setStreamSequence(Number((event as MessageEvent).lastEventId || 0)); void refresh(); });
    stream.onerror = () => setStreamState("offline");
    return () => stream.close();
  }, [refresh]);

  const run = async (kind: "data-plane" | "backup" | "replicate") => {
    setBusy(kind);
    setMessage(kind === "data-plane" ? "Resolving RPC quorum, indexing finalized blocks, and materializing live market data…" : kind === "backup" ? "Creating a consistent SQLite recovery snapshot…" : "Replicating finalized read models to Supabase/Postgres…");
    try {
      const endpoint = kind === "data-plane" ? "/api/v48/run" : kind === "backup" ? "/api/v48/backup" : "/api/v48/replicate";
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = await response.json() as { ok?: boolean; result?: Record<string, unknown>; snapshot?: Record<string, unknown>; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? `${kind} failed.`);
      setMessage(kind === "data-plane" ? `Data plane confirmed through quorum block ${String(payload.result?.quorumBlock ?? "—")}.` : kind === "backup" ? `Recovery snapshot created: ${String(payload.snapshot?.sha256 ?? "").slice(0, 16)}…` : payload.result?.enabled === false ? "Supabase replication is disabled until server credentials are configured." : `Replicated ${String(payload.result?.replicated ?? 0)} finalized rows.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : `${kind} failed.`); }
    finally { setBusy(null); }
  };

  const providers = status?.database.providers ?? [];
  const activeAlerts = (status?.database.alerts ?? []).filter((alert) => alert.status === "active");
  const head = status?.canonical.head;
  const counts = status?.database.counts ?? {};
  const markets = status?.canonical.markets ?? [];
  const healthyProviders = providers.filter((provider) => provider.status === "healthy").length;
  const live = streamState === "live" && activeAlerts.every((alert) => alert.severity !== "critical");
  const totalLiquidity = useMemo(() => markets.reduce((sum, market) => sum + Number(BigInt(market.freeWethWei ?? "0")), 0) / 1e18, [markets]);

  return <main className="v48-plane-page">
    <header className="v48-plane-hero">
      <div><span><Waves size={18}/>PERPHOOD V48</span><h1>Live Data Plane &amp; Chain Readiness</h1><p>RPC quorum, finalized indexing, durable SSE, 1s/15s/30s candles, market metrics, health alerts, backups, and optional Supabase/Postgres replication.</p></div>
      <div className={live ? "healthy" : "degraded"}>{live ? <CheckCircle2 size={20}/> : <AlertTriangle size={20}/>}<span><b>{live ? "LIVE & CANONICAL" : "ATTENTION REQUIRED"}</b><small>{status?.chain.name ?? "Chain configuration unavailable"}</small></span></div>
    </header>

    <section className="v48-plane-actions">
      <button onClick={() => void run("data-plane")} disabled={busy !== null}><Play size={15}/>{busy === "data-plane" ? "Running…" : "Run data plane"}</button>
      <button onClick={() => void run("backup")} disabled={busy !== null}><Archive size={15}/>{busy === "backup" ? "Backing up…" : "Create backup"}</button>
      <button onClick={() => void run("replicate")} disabled={busy !== null}><Cloud size={15}/>{busy === "replicate" ? "Replicating…" : "Replicate"}</button>
      <button onClick={() => void refresh()} disabled={busy !== null}><RefreshCw size={15}/>Refresh</button>
      <span>{message}</span>
    </section>

    <section className="v48-plane-metrics">
      <article><Blocks/><span><small>Canonical / finalized</small><strong>{head ? `${NUMBER.format(head.blockNumber)} / ${NUMBER.format(head.finalizedBlock)}` : "—"}</strong><em>{status?.chain.applicationConfirmations ?? 0} app confirmations</em></span></article>
      <article><Network/><span><small>Healthy RPC providers</small><strong>{healthyProviders} / {status?.chain.rpcProviderCount ?? 0}</strong><em>Chain ID {status?.chain.chainId ?? "—"}</em></span></article>
      <article><Radio/><span><small>Durable stream</small><strong>{streamState.toUpperCase()}</strong><em>Sequence {NUMBER.format(streamSequence || status?.database.latestEvent?.sequence || 0)}</em></span></article>
      <article><Database/><span><small>Markets / candles</small><strong>{markets.length} / {NUMBER.format(counts.market_candles ?? 0)}</strong><em>{totalLiquidity.toLocaleString("en-US", { maximumFractionDigits: 3 })} ETH free liquidity</em></span></article>
    </section>

    <section className="v48-plane-grid">
      <div className="v48-plane-markets">
        <header><span>Market</span><span>Market cap</span><span>Liquidity</span><span>Open interest</span><span>Source</span></header>
        {markets.length ? markets.map((market) => <article key={market.marketAddress}>
          <span><b>{short(market.marketAddress)}</b><small>Token {short(market.tokenAddress)}</small></span>
          <span><b>{eth(market.marketCapEthWad)} ETH</b><small>Executable BattlePool cap</small></span>
          <span><b>{eth(market.freeWethWei)} ETH</b><small>Free WETH</small></span>
          <span><b>{eth(market.openInterestLongWei)} / {eth(market.openInterestShortWei)}</b><small>Long / short ETH</small></span>
          <span><b>{market.stateBlock ? `Block ${NUMBER.format(market.stateBlock)}` : "Awaiting state"}</b><small>Indexed + streamed</small></span>
        </article>) : <div className="v48-plane-empty">Deploy and index a V45 market to populate the live data plane.</div>}
      </div>

      <aside className="v48-plane-side">
        <section><header><Server size={16}/><strong>RPC provider pool</strong></header>{providers.length ? providers.map((provider) => <div key={provider.rpcUrl}><span className={`pulse ${provider.status === "healthy" ? "healthy" : "stale"}`}/><span><b>{provider.status.toUpperCase()} · {provider.latencyMs} ms</b><small>{provider.rpcUrl} · block {NUMBER.format(provider.blockNumber)} · {age(provider.checkedAt)}</small></span></div>) : <p>Run the V48 data plane to probe configured RPC providers.</p>}</section>
        <section><header><AlertTriangle size={16}/><strong>Operational alerts</strong></header>{activeAlerts.length ? activeAlerts.map((alert) => <div key={alert.alertKey}><span className={`severity ${alert.severity}`}>{alert.severity}</span><span><b>{alert.title}</b><small>{alert.message} · {age(alert.lastSeenAt)}</small></span></div>) : <div><CheckCircle2 className="ok-icon" size={17}/><span><b>No active V48 alerts</b><small>RPC, indexer, reconciliation, and worker checks are clear.</small></span></div>}</section>
        <section><header><Activity size={16}/><strong>Readiness configuration</strong></header><div><span className="config-icon"><Network size={15}/></span><span><b>{status?.chain.environment ?? "—"}</b><small>RPC quorum + failover environment</small></span></div><div><span className="config-icon"><Database size={15}/></span><span><b>{short(status?.chain.canonicalWethAddress)}</b><small>Canonical WETH adapter</small></span></div><div><span className="config-icon"><Cloud size={15}/></span><span><b>Optional replica</b><small>Supabase/Postgres remains a read model.</small></span></div></section>
      </aside>
    </section>
  </main>;
}
