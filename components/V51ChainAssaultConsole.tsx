"use client";

import { AlertTriangle, CheckCircle2, Cpu, RefreshCw, ShieldCheck, Swords, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ToolStatus = { available: boolean; status: number | null; version: string };
type ToolchainReport = {
  generatedAt: string;
  forge: ToolStatus;
  anvil: ToolStatus;
  cast: ToolStatus;
  node: string;
  requiredForCompiledCampaign: string[];
};

const PORTABLE_CHECKS = [
  ["Stale spot-buy rollback", "Deadline and minimum-token protection"],
  ["Stale long rollback", "Minimum acquired inventory protection"],
  ["Stale short rollback", "Maximum borrow and minimum proceeds protection"],
  ["Stale close rollback", "Minimum executable payout protection"],
  ["Reentrancy assault fixtures", "Market, router, and rejecting receiver actors"],
  ["Forced-ETH surplus isolation", "Unexpected ETH cannot become user liability"],
] as const;

export function V51ChainAssaultConsole() {
  const [report, setReport] = useState<ToolchainReport | null>(null);
  const [message, setMessage] = useState("Reading the V51 compiler toolchain report…");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(`/local-chain/v51-toolchain.json?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Toolchain report returned HTTP ${response.status}.`);
      const next = await response.json() as ToolchainReport;
      setReport(next);
      setMessage(next.forge.available && next.anvil.available && next.cast.available
        ? "The complete V51 compiler-backed assault toolchain is available."
        : "Portable checks are available; install Foundry to run the compiled-contract campaign.");
    } catch (error) {
      setReport(null);
      setMessage(error instanceof Error ? error.message : "Unable to read the V51 toolchain report.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const tools = useMemo(() => report ? [
    ["Forge", report.forge],
    ["Anvil", report.anvil],
    ["Cast", report.cast],
  ] as const : [], [report]);
  const compiledReady = tools.length === 3 && tools.every(([, status]) => status.available);

  return <main className="v51-assault-page">
    <header className="v51-assault-hero">
      <div>
        <span><Swords size={18}/>LEVERAGE X V51</span>
        <h1>Compiler-Backed Chain Assault</h1>
        <p>Stale-quote rollback, hostile receivers, reentrancy actors, forced-balance attacks, gas ceilings, and compiled invariant campaigns.</p>
      </div>
      <div className={compiledReady ? "healthy" : "pending"}>
        {compiledReady ? <ShieldCheck size={24}/> : <AlertTriangle size={24}/>} 
        <span><b>{compiledReady ? "COMPILED CAMPAIGN READY" : "FOUNDRY REQUIRED"}</b><small>{compiledReady ? "Forge, Anvil, and Cast detected" : "Portable verification remains available"}</small></span>
      </div>
    </header>

    <section className="v51-assault-controls">
      <button onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>{busy ? "Refreshing…" : "Refresh toolchain"}</button>
      <span>{message}</span>
    </section>

    <section className="v51-assault-grid">
      <article className="v51-assault-card">
        <header><CheckCircle2 size={20}/><span><small>Portable assault layer</small><strong>READY</strong></span></header>
        <div>{PORTABLE_CHECKS.map(([label, detail]) => <p key={label}><CheckCircle2 size={15}/><span><b>{label}</b><small>{detail}</small></span></p>)}</div>
      </article>

      <article className="v51-assault-card">
        <header><Cpu size={20}/><span><small>Compiler toolchain</small><strong>{compiledReady ? "READY" : "NOT INSTALLED"}</strong></span></header>
        <div>{tools.length ? tools.map(([label, status]) => <p key={label} className={status.available ? "pass" : "pending"}>
          {status.available ? <CheckCircle2 size={15}/> : <AlertTriangle size={15}/>}<span><b>{label}</b><small>{status.available ? status.version : "Unavailable in this environment"}</small></span>
        </p>) : <p className="pending"><AlertTriangle size={15}/><span><b>No report loaded</b><small>Run npm run test:v51-toolchain.</small></span></p>}</div>
      </article>

      <article className="v51-assault-card commands">
        <header><TerminalSquare size={20}/><span><small>Exact campaign commands</small><strong>REPRODUCIBLE</strong></span></header>
        <code>npm run test:v51</code>
        <code>npm run chain:test:v51</code>
        <code>npm run chain:invariant:v51</code>
        <code>npm run chain:assault:v51</code>
      </article>
    </section>

    <section className="v51-assault-boundary">
      <AlertTriangle size={18}/><p><b>Safety boundary:</b> portable source and model checks are not a substitute for compiling and executing the Solidity contracts. Public funds remain prohibited until the Foundry campaign, live-chain lifecycle, and independent audits pass.</p>
    </section>
  </main>;
}
