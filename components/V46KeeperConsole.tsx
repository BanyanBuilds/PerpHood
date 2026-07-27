"use client";

import { Activity, CheckCircle2, Clock3, Play, RefreshCw, ShieldCheck, Siren, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { V46StoredOrder } from "@/lib/chain/v46-order";

const SHORT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function short(value: string) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function age(value?: number) {
  if (!value) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1_000));
  return seconds < 60 ? `${seconds}s` : seconds < 3_600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3_600)}h`;
}

export function V46KeeperConsole() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [orders, setOrders] = useState<V46StoredOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const [statusResponse, ordersResponse] = await Promise.all([
      fetch("/api/v46/keeper/status", { cache: "no-store" }),
      fetch("/api/v46/orders", { cache: "no-store" }),
    ]);
    const statusPayload = await statusResponse.json() as { ok?: boolean; error?: string } & Record<string, unknown>;
    const orderPayload = await ordersResponse.json() as { ok?: boolean; orders?: V46StoredOrder[]; error?: string };
    if (!statusResponse.ok || !statusPayload.ok) throw new Error(statusPayload.error ?? "Keeper status unavailable.");
    if (!ordersResponse.ok || !orderPayload.ok) throw new Error(orderPayload.error ?? "Order store unavailable.");
    setStatus(statusPayload);
    setOrders(orderPayload.orders ?? []);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Refresh failed."));
    const interval = window.setInterval(() => void refresh().catch(() => undefined), 2_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const run = async () => {
    setBusy(true);
    setMessage("Running order and liquidation cycle…");
    try {
      const response = await fetch("/api/v46/keeper/run", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = await response.json() as { ok?: boolean; result?: { checked?: number; filled?: number; activated?: number; liquidations?: number; errors?: string[] }; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Keeper cycle failed.");
      const result = payload.result ?? {};
      setMessage(`Checked ${result.checked ?? 0} · filled ${result.filled ?? 0} · activated ${result.activated ?? 0} · liquidations ${result.liquidations ?? 0}${result.errors?.length ? ` · ${result.errors.length} warning(s)` : ""}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Keeper cycle failed.");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] ?? 0) + 1;
    return acc;
  }, {}), [orders]);
  const healthy = Boolean(status?.ok);

  return <main className="v46-keeper-page">
    <header className="v46-keeper-hero">
      <div><span><ShieldCheck size={18} />LEVERAGE X V46</span><h1>Order &amp; Keeper Network</h1><p>Durable signed orders, trigger evaluation, sponsored settlement, failover, and permissionless BattlePool liquidations.</p></div>
      <div className={healthy ? "healthy" : "offline"}>{healthy ? <CheckCircle2 size={18} /> : <XCircle size={18} />}<span><b>{healthy ? "KEEPER READY" : "KEEPER OFFLINE"}</b><small>{String(status?.mode ?? "No status")}</small></span></div>
    </header>

    <section className="v46-keeper-actions">
      <button onClick={() => void run()} disabled={busy}><Play size={15} />{busy ? "Running…" : "Run cycle"}</button>
      <button onClick={() => void refresh()}><RefreshCw size={15} />Refresh</button>
      <span>{message || "Waiting for the next keeper cycle."}</span>
    </section>

    <section className="v46-keeper-metrics">
      <article><Activity /><span><small>Total orders</small><strong>{SHORT.format(orders.length)}</strong></span></article>
      <article><Clock3 /><span><small>Armed / watching</small><strong>{(counts.armed ?? 0) + (counts.watching ?? 0)}</strong></span></article>
      <article><CheckCircle2 /><span><small>Filled</small><strong>{counts.filled ?? 0}</strong></span></article>
      <article><Siren /><span><small>Failed / expired</small><strong>{(counts.failed ?? 0) + (counts.expired ?? 0)}</strong></span></article>
    </section>

    <section className="v46-order-table">
      <header><span>State</span><span>Order</span><span>Trigger</span><span>Account / market</span><span>Attempts</span><span>Receipt</span></header>
      {orders.length ? orders.slice(0, 200).map((order) => <article key={order.intent.orderId}>
        <span className={`status ${order.status}`}>{order.status}</span>
        <span><b>{order.intent.kind} · {order.intent.side}</b><small>{order.intent.reduceOnly ? `Reduce position #${order.intent.positionId}` : `${order.intent.leverage}× · ${order.intent.clientOrderId.slice(-8)}`}</small></span>
        <span><b>${SHORT.format(order.intent.displayTriggerCapUsd)}</b><small>{order.intent.comparator.toUpperCase()} · checked {age(order.lastCheckedAt)}</small></span>
        <span><b>{short(order.intent.owner)}</b><small>{short(order.intent.market)}</small></span>
        <span><b>{order.attempts}/{order.intent.maxAttempts}</b><small>{order.failureReason ?? "No error"}</small></span>
        <span><b>{order.blockNumber ? `Block ${order.blockNumber}` : "—"}</b><small>{order.transactionHash ? short(order.transactionHash) : `Created ${age(order.intent.createdAt * 1_000)} ago`}</small></span>
      </article>) : <div className="v46-order-empty">No durable orders have been signed yet.</div>}
    </section>
  </main>;
}
