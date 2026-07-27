"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChainExecutionState } from "./MarketProvider";

const STEPS = ["Quote", "Wallet", "Submitted", "Confirmed", "Reconciled", "Indexed"] as const;

export function TransactionLifecycleTracker({ execution }: { execution: ChainExecutionState }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (execution.phase === "idle") return;
    setVisible(true);
    if (execution.phase !== "confirmed") return;
    const timer = window.setTimeout(() => setVisible(false), 8_000);
    return () => window.clearTimeout(timer);
  }, [execution.phase, execution.updatedAt]);

  const state = useMemo(() => {
    if (execution.phase === "error") return { current: 1, done: 0, error: true };
    if (execution.phase === "quote") return { current: 0, done: 0, error: false };
    if (execution.phase === "wallet") return { current: 1, done: 1, error: false };
    if (execution.phase === "pending") return { current: 2, done: 2, error: false };
    if (execution.phase === "confirmed") return { current: 5, done: 5, error: false };
    return { current: 0, done: 0, error: false };
  }, [execution.phase]);

  if (!visible || execution.phase === "idle") return null;

  return <aside className="v55-transaction-tracker" role="status" aria-live="polite">
    <header>
      <span><strong>{execution.action ?? "Transaction"}</strong><small>{execution.message ?? "Waiting for execution state…"}</small></span>
      <em>{execution.phase}</em>
    </header>
    <div className="v55-transaction-steps">
      {STEPS.map((step, index) => {
        const className = state.error && index === state.current ? "error" : index < state.done ? "done" : index === state.current ? "current" : "";
        return <span key={step} className={className}><i /><small>{step}</small></span>;
      })}
    </div>
    <div className="v55-transaction-meta">
      <span>{execution.transactionHash ? <><b>TX</b> {execution.transactionHash.slice(0, 10)}…</> : <><b>MODE</b> {execution.mode}</>}</span>
      <span>{execution.blockNumber ? <><b>BLOCK</b> {execution.blockNumber.toLocaleString()}</> : <><b>UPDATED</b> {new Date(execution.updatedAt).toLocaleTimeString()}</>}</span>
    </div>
  </aside>;
}
