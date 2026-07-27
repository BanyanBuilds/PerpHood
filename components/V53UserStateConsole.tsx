"use client";

import { Cloud, Copy, Database, Download, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import { useState } from "react";
import { useUserState } from "./UserStateProvider";
import type { V53UserStateSection } from "@/lib/v53-user-state";

export function V53UserStateConsole() {
  const state = useUserState();
  const [action, setAction] = useState("");
  const sections = (Object.entries(state.document.sections) as Array<[string, V53UserStateSection]>).sort((a, b) => b[1].updatedAt - a[1].updatedAt);

  return <main className="v53-user-state-console">
    <header>
      <span><Cloud size={18}/>LEVERAGE X V53</span>
      <h1>Cross-device user state</h1>
      <p>Supabase stores settings only. BattlePool settlement, account custody, session authority and withdrawals remain outside this sync layer.</p>
    </header>

    <section className="v53-sync-hero">
      <article><Database size={18}/><span><small>Sync status</small><strong className={state.status}>{state.status.replace("-", " ")}</strong><em>{state.message}</em></span></article>
      <article><RefreshCw size={18}/><span><small>Remote revision</small><strong>{state.revision}</strong><em>{sections.length} persisted section{sections.length === 1 ? "" : "s"}</em></span></article>
      <article><Smartphone size={18}/><span><small>Device</small><strong>{state.deviceId ? `${state.deviceId.slice(0, 8)}…` : "Loading"}</strong><em>Independent device heartbeat</em></span></article>
      <article><ShieldCheck size={18}/><span><small>Authority</small><strong>Settings only</strong><em>No funds or trading permission</em></span></article>
    </section>

    <section className="v53-recovery-card">
      <header><span><strong>Settings recovery key</strong><small>{state.recoveryKey ? `${state.recoveryKey.slice(0, 11)}…${state.recoveryKey.slice(-7)}` : "Generating…"}</small></span><b>256-bit</b></header>
      <p>Copy this key to restore presets, workspaces, watchlists, likes and alerts on another device. Anyone with it can change those settings, but cannot move assets or place trades.</p>
      <div>
        <button onClick={async () => { const copied = await state.copyRecoveryKey(); setAction(copied ? "Recovery key copied" : "Clipboard access failed"); }}><Copy size={14}/>Copy recovery key</button>
        <button onClick={() => { const value = window.prompt("Paste a LEVERAGE X V53 settings recovery key"); if (!value) return; setAction(state.importRecoveryKey(value) ? "Importing key…" : "Invalid key"); }}><Download size={14}/>Import recovery key</button>
        <button onClick={() => { setAction("Sync requested"); void state.syncNow(); }}><RefreshCw size={14}/>Sync now</button>
        {action && <em>{action}</em>}
      </div>
    </section>

    <section className="v53-section-list">
      <header><strong>Persisted sections</strong><small>Newest section wins during cross-device merge conflicts.</small></header>
      {sections.length ? sections.map(([key, section]) => <article key={key}><span><b>{key}</b><small>{new Date(section.updatedAt).toLocaleString()}</small></span><code>{JSON.stringify(section.value).length.toLocaleString()} bytes</code></article>) : <p>No settings have changed yet. Local fallback is ready.</p>}
    </section>
  </main>;
}
