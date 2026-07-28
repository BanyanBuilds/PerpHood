"use client";

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Database,
  ExternalLink,
  Factory,
  FileCheck2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  UserCheck,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Readiness = {
  checkedAt: string;
  chain: { name: string; chainId: number | null; latestBlock: number | null; latestBlockAgeSeconds: number | null; explorer: string; rpcHealthy: boolean };
  accounts: { owner: string | null; canaryCreator: string; firstTrader: string; creatorBalanceWei: string | null; traderBalanceWei: string | null };
  factory: { address: string | null; codePresent: boolean; launchModeLabel: string; activeCanaryCreator: string | null; globalTradingPaused: boolean | null; newMarketsPaused: boolean | null; marketCount: string | null };
  market: { address: string | null; token: string | null; paused: boolean | null; tradeCount: string | null };
  storage: { configured: boolean; bucketReady: boolean; registryReady: boolean; publicReadReady: boolean; launchCount: number | null; firstMarketRecordReady: boolean; error: string | null };
  environment: { serverFactory: string | null; publicFactory: string | null; publicFactoryMatchesServer: boolean; expectedCreator: string | null; creatorMatches: boolean; mainnetUiEnabled: boolean };
  gates: { rpcReady: boolean; productionStorageReady: boolean; closedFactoryReady: boolean; canaryConfigured: boolean; applicationConfigured: boolean; firstLaunchReady: boolean; firstMarketCreated: boolean; firstLaunchConfirmed: boolean; cappedSpotOpen: boolean; publicLaunchesAllowed: boolean; perpsAllowed: boolean };
  next: { stage: string; label: string; command: string; detail: string };
  error: string | null;
};

const NUMBER = new Intl.NumberFormat("en-US");
function short(value: string | null) { return value ? `${value.slice(0, 7)}…${value.slice(-5)}` : "—"; }
function eth(wei: string | null) {
  if (!wei) return "0 ETH";
  const whole = BigInt(wei) / 10n ** 18n;
  const fraction = (BigInt(wei) % 10n ** 18n).toString().padStart(18, "0").slice(0, 7).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} ETH`;
}
function status(value: boolean) { return value ? "PASS" : "PENDING"; }

export function V62GoLiveConsole() {
  const [data, setData] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Reading the full mainnet launch stack…");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v62/go-live-readiness", { cache: "no-store" });
      const payload = await response.json() as Readiness;
      setData(payload);
      setMessage(payload.error ?? payload.next.detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "V62 go-live readiness failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (data === null) {
    return <main className="v60-canary-page"><header className="v60-canary-hero"><div><span><Activity size={17}/>LEVERAGE X V62</span><h1>Go-Live Control</h1><p>Loading RPC, contract, storage, launch, and canary state…</p></div></header></main>;
  }

  const live = data.gates.cappedSpotOpen;
  const ready = data.gates.firstLaunchReady || data.gates.firstLaunchConfirmed;
  const phase = live ? "CAPPED SPOT LIVE" : data.next.label.toUpperCase();

  return <main className="v60-canary-page">
    <header className="v60-canary-hero">
      <div><span><Rocket size={17}/>LEVERAGE X V62</span><h1>Mainnet Go-Live Control</h1><p>The authoritative path from code and storage readiness to the first real paused token and capped Spot proof.</p></div>
      <div className={live ? "live" : ready ? "ready" : "blocked"}>{live ? <CheckCircle2 size={20}/> : ready ? <Activity size={20}/> : <AlertTriangle size={20}/>}<span><b>{phase}</b><small>{data.chain.name}</small></span></div>
    </header>

    <section className="v60-canary-actions">
      <button onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>{busy ? "Checking…" : "Refresh full stack"}</button>
      {data.factory.address && <a href={`${data.chain.explorer}/address/${data.factory.address}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Factory</a>}
      {data.market.token && <a href={`${data.chain.explorer}/address/${data.market.token}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/>First token</a>}
      <span>{message}</span>
    </section>

    <section className="v60-canary-metrics">
      <article><Factory/><span><small>Factory</small><strong>{data.factory.codePresent ? data.factory.launchModeLabel.toUpperCase() : "NOT DEPLOYED"}</strong><em>{short(data.factory.address)}</em></span></article>
      <article><Database/><span><small>Launch storage</small><strong>{data.gates.productionStorageReady ? "READY" : "INCOMPLETE"}</strong><em>{data.storage.launchCount ?? 0} confirmed launch record(s)</em></span></article>
      <article><UserCheck/><span><small>Creator gate</small><strong>{data.gates.canaryConfigured ? "ALLOWLISTED" : "LOCKED"}</strong><em>{short(data.accounts.canaryCreator)}</em></span></article>
      <article><CircleDollarSign/><span><small>Creator / trader</small><strong>{eth(data.accounts.creatorBalanceWei)}</strong><em>Trader {eth(data.accounts.traderBalanceWei)}</em></span></article>
    </section>

    <section className="v60-canary-grid">
      <div className="v60-canary-gates">
        <header><span>Go-live gate</span><span>State</span><span>Authoritative requirement</span></header>
        <Gate icon={Activity} label="Robinhood mainnet RPC" passed={data.gates.rpcReady} detail={data.chain.latestBlock ? `Chain ${data.chain.chainId} · block ${NUMBER.format(data.chain.latestBlock)} · ${data.chain.latestBlockAgeSeconds ?? 0}s old` : "No live chain head"}/>
        <Gate icon={Database} label="Supabase launch storage" passed={data.gates.productionStorageReady} detail="Public media bucket · service-role registry writes · anonymous confirmed-launch reads"/>
        <Gate icon={ShieldCheck} label="Closed factory safety" passed={data.gates.closedFactoryReady || data.gates.canaryConfigured || data.gates.firstMarketCreated || data.gates.cappedSpotOpen} detail="Expected owner · closed/allowlist mode · future markets remain paused"/>
        <Gate icon={UserCheck} label="Canary creator" passed={data.gates.canaryConfigured} detail="Only the configured creator wallet may create the first market"/>
        <Gate icon={FileCheck2} label="Vercel environment sync" passed={data.gates.applicationConfigured} detail="Server/public factory addresses match · mainnet UI explicitly enabled · creator restriction present"/>
        <Gate icon={Rocket} label="First real token" passed={data.gates.firstLaunchConfirmed} detail={data.gates.firstMarketCreated ? "On-chain market exists; proof and registry must agree" : "Launch from the wallet after every prior gate passes"}/>
        <Gate icon={CircleDollarSign} label="Capped Spot proof" passed={data.gates.cappedSpotOpen} detail="One market · capped buys/sells · public launching still disabled"/>
        <article><span><ShieldCheck size={15}/>Public launch / 20× perps</span><b className="locked">LOCKED</b><small>Not unlocked by this release; requires separate production proof and BattlePool activation.</small></article>
      </div>

      <aside className="v60-canary-side">
        <section><header><WalletCards size={16}/><strong>Controlled accounts</strong></header><div><span>Owner</span><b>{short(data.accounts.owner)}</b></div><div><span>Creator</span><b>{short(data.accounts.canaryCreator)}</b></div><div><span>Trader</span><b>{short(data.accounts.firstTrader)}</b></div></section>
        <section><header><Factory size={16}/><strong>First market</strong></header><div><span>Market</span><b>{short(data.market.address)}</b></div><div><span>Token</span><b>{short(data.market.token)}</b></div><div><span>Paused</span><b>{data.market.paused === null ? "—" : data.market.paused ? "YES" : "NO"}</b></div><div><span>Trades</span><b>{data.market.tradeCount ?? "0"}</b></div></section>
        <section><header><CheckCircle2 size={16}/><strong>Exact next action</strong></header><code>{data.next.command}</code><p>{data.next.detail}</p></section>
      </aside>
    </section>
  </main>;
}

function Gate({ icon: Icon, label, passed, detail }: { icon: typeof Activity; label: string; passed: boolean; detail: string }) {
  return <article><span><Icon size={15}/>{label}</span><b className={passed ? "pass" : "pending"}>{status(passed)}</b><small>{detail}</small></article>;
}
