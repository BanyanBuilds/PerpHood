"use client";

import Link from "next/link";
import { Activity, AlertTriangle, Boxes, CheckCircle2, CircleDashed, Cloud, Database, Gauge, GitBranch, Network, RefreshCw, Server, ShieldCheck, Users, Workflow } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { V52CompletionArea, V52CompletionItem, V52CompletionStatus } from "@/lib/v52-product-completion";
import type { V52ScaleTier } from "@/lib/v52-scale-foundation";

const STATUS_LABEL: Record<V52CompletionStatus, string> = {
  complete: "Implemented",
  connected: "Connected / local",
  prototype: "Prototype",
  missing: "Missing",
};

const AREA_LABEL: Record<V52CompletionArea, string> = {
  product: "Product",
  execution: "Execution",
  infrastructure: "Infrastructure",
  security: "Security",
  operations: "Operations",
};

type RuntimeReadiness = {
  ok: boolean;
  version: number;
  release: string;
  generatedAt: number;
  summary: {
    total: number;
    byStatus: Record<V52CompletionStatus, number>;
    completionPercent: number;
    productionBlockers: number;
    productReadyForPublicFunds: boolean;
  };
  capabilities: Record<string, boolean | string>;
  configuredCapabilities: number;
  items: V52CompletionItem[];
  scaleTiers: V52ScaleTier[];
  serviceBoundaries: Array<{ id: string; label: string; responsibility: string; scaling: string }>;
  safety: { publicFundsApproved: boolean; testnetApproved: boolean; reason: string };
};

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function StatusIcon({ status }: { status: V52CompletionStatus }) {
  if (status === "complete") return <CheckCircle2 size={17} />;
  if (status === "connected") return <Activity size={17} />;
  if (status === "prototype") return <CircleDashed size={17} />;
  return <AlertTriangle size={17} />;
}

export function V52CompletionConsole() {
  const [data, setData] = useState<RuntimeReadiness | null>(null);
  const [statusFilter, setStatusFilter] = useState<V52CompletionStatus | "all">("all");
  const [areaFilter, setAreaFilter] = useState<V52CompletionArea | "all">("all");
  const [message, setMessage] = useState("Loading the V52 completion inventory…");

  const refresh = useCallback(async () => {
    setMessage("Refreshing product and runtime readiness…");
    const response = await fetch("/api/v52/readiness", { cache: "no-store" });
    const payload = await response.json() as RuntimeReadiness & { error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "V52 readiness is unavailable.");
    setData(payload);
    setMessage(`Readiness inventory refreshed at ${new Date(payload.generatedAt).toLocaleTimeString("en-US")}.`);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Readiness refresh failed."));
  }, [refresh]);

  const items = useMemo(() => (data?.items ?? []).filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (areaFilter !== "all" && item.area !== areaFilter) return false;
    return true;
  }), [areaFilter, data?.items, statusFilter]);

  const capabilities = Object.entries(data?.capabilities ?? {});
  const maxTier = data?.scaleTiers.at(-1);

  return <main className="v52-completion-page">
    <header className="v52-completion-hero">
      <div>
        <span><Workflow size={18}/>PERPHOOD V52</span>
        <h1>Product Completion &amp; Scale Foundation</h1>
        <p>An honest inventory of what is implemented, what is only connected locally, what remains a prototype, and what must exist before PERPHOOD can serve real users or funds.</p>
      </div>
      <div className="v52-safety-lock">
        <ShieldCheck size={23}/>
        <span><b>BUILD MODE</b><small>No public funds · no testnet approval</small></span>
      </div>
    </header>

    <section className="v52-summary-grid">
      <article><Gauge/><span><small>Weighted completion</small><strong>{data?.summary.completionPercent ?? 0}%</strong><em>Repository implementation, not launch readiness</em></span></article>
      <article><Boxes/><span><small>Systems inventoried</small><strong>{data?.summary.total ?? 0}</strong><em>{data?.summary.byStatus.complete ?? 0} implemented</em></span></article>
      <article><AlertTriangle/><span><small>Production blockers</small><strong>{data?.summary.productionBlockers ?? 0}</strong><em>Must reach zero before public funds</em></span></article>
      <article><Users/><span><small>Architecture target</small><strong>{maxTier ? number(maxTier.registeredUsers) : "—"}</strong><em>{maxTier ? `${number(maxTier.peakConnectedClients)} peak connected clients` : "Awaiting topology"}</em></span></article>
    </section>

    <section className="v52-control-bar">
      <div className="v52-filter-group" aria-label="Filter by status">
        {(["all", "complete", "connected", "prototype", "missing"] as const).map((status) => <button key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status === "all" ? "All statuses" : STATUS_LABEL[status]}</button>)}
      </div>
      <div className="v52-filter-group" aria-label="Filter by area">
        {(["all", "product", "execution", "infrastructure", "security", "operations"] as const).map((area) => <button key={area} className={areaFilter === area ? "active" : ""} onClick={() => setAreaFilter(area)}>{area === "all" ? "All areas" : AREA_LABEL[area]}</button>)}
      </div>
      <button className="v52-refresh" onClick={() => void refresh()}><RefreshCw size={14}/>Refresh</button>
      <span className="v52-message">{message}</span>
    </section>

    <section className="v52-main-grid">
      <div className="v52-inventory">
        <header><span>System</span><span>Status</span><span>Current truth</span><span>Next build requirement</span></header>
        {items.map((item) => <article key={item.id}>
          <span className="v52-system-name"><b>{item.label}</b><small>{AREA_LABEL[item.area]}{item.productionBlocker ? " · launch blocker" : ""}</small></span>
          <span className={`v52-status ${item.status}`}><StatusIcon status={item.status}/><b>{STATUS_LABEL[item.status]}</b></span>
          <span><p>{item.summary}</p><small>{item.evidence.join(" · ")}</small></span>
          <span><p>{item.nextAction}</p></span>
        </article>)}
      </div>

      <aside className="v52-runtime-side">
        <section>
          <header><Cloud size={16}/><strong>Connected runtime</strong></header>
          {capabilities.map(([key, value]) => <div key={key}><span className={`v52-cap-dot ${value === true || (typeof value === "string" && value.length > 0) ? "on" : "off"}`}/><span><b>{key.replace(/([A-Z])/g, " $1")}</b><small>{typeof value === "boolean" ? (value ? "Configured" : "Not configured") : value}</small></span></div>)}
        </section>
        <section>
          <header><GitBranch size={16}/><strong>Build consoles</strong></header>
          <Link href="/admin/chain-assault"><ShieldCheck size={15}/><span><b>Chain assault</b><small>Stale quote and hostile actor layer</small></span></Link>
          <Link href="/admin/invariants"><Gauge size={15}/><span><b>Settlement invariants</b><small>Conservation and solvency snapshot</small></span></Link>
          <Link href="/admin/data-plane"><Network size={15}/><span><b>Data plane</b><small>RPC quorum, candles and streams</small></span></Link>
          <Link href="/admin/indexer"><Database size={15}/><span><b>Indexer</b><small>Canonical history and recovery</small></span></Link>
          <Link href="/admin/keeper"><Server size={15}/><span><b>Keeper network</b><small>Orders and liquidations</small></span></Link>
        </section>
        <section className="v52-boundary-card">
          <header><AlertTriangle size={16}/><strong>Current safety boundary</strong></header>
          <p>{data?.safety.reason ?? "Loading the current safety boundary…"}</p>
        </section>
      </aside>
    </section>

    <section className="v52-scale-section">
      <header><span><Network size={17}/>Scale topology</span><p>Planning targets only. Capacity is not claimed until repeatable load and failure testing measures the deployed system.</p></header>
      <div className="v52-scale-tiers">
        {(data?.scaleTiers ?? []).map((tier) => <article key={tier.id}>
          <span>{tier.id.toUpperCase()}</span>
          <strong>{number(tier.registeredUsers)} users</strong>
          <p>{tier.description}</p>
          <dl><div><dt>Peak clients</dt><dd>{number(tier.peakConnectedClients)}</dd></div><div><dt>Execution shards</dt><dd>{tier.marketExecutionShards}</dd></div><div><dt>Stream gateways</dt><dd>{tier.streamGatewaysMinimum}+</dd></div><div><dt>Queue partitions</dt><dd>{tier.queuePartitions}</dd></div></dl>
        </article>)}
      </div>
      <div className="v52-service-grid">
        {(data?.serviceBoundaries ?? []).map((service) => <article key={service.id}><span><Server size={15}/><b>{service.label}</b></span><p>{service.responsibility}</p><small>{service.scaling}</small></article>)}
      </div>
    </section>
  </main>;
}
