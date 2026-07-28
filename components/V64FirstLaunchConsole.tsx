"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Database,
  ExternalLink,
  Factory,
  FileCheck2,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Receipt = { hash: string | null; confirmed: boolean; blockNumber: number | null; status: string | null };
type Launch = {
  tokenAddress: string | null;
  bondingMarket: string | null;
  canonicalPool: string | null;
  factoryAddress: string | null;
  name: string;
  symbol: string;
  imageUrl: string;
  transactionHash: string;
  blockNumber: number;
} | null;
type Readiness = {
  checkedAt: string;
  chain: { name: string; chainId: number | null; latestBlock: number | null; explorer: string; rpcHealthy: boolean };
  accounts: { owner: string | null; canaryCreator: string; firstTrader: string; creatorBalanceWei: string | null; traderBalanceWei: string | null };
  factory: { address: string | null; codePresent: boolean; launchModeLabel: string; sourceVerified: boolean; deploymentBlock: number | null };
  market: { address: string | null; token: string | null; paused: boolean | null; tradeCount: string | null };
  launchpad: { manifest: string; launches: string; wellKnown: string; configured: boolean };
  firstLaunch: Launch;
  transactions: { launch: Receipt; buy: Receipt; approve: Receipt; sell: Receipt };
  gates: {
    rpcReady: boolean;
    factoryReady: boolean;
    sourceVerified: boolean;
    canaryConfigured: boolean;
    canaryLaunchConfirmed: boolean;
    productionRegistryReady: boolean;
    cappedSpotOpen: boolean;
    roundtripConfirmed: boolean;
    gmgnEvidenceReady: boolean;
    officialGmgnLabel: boolean;
    publicLaunchesAllowed: boolean;
    perpsAllowed: boolean;
  };
  next: { stage: string; command: string; detail: string };
  error: string | null;
};

function short(value: string | null) { return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—"; }
function Gate({ icon: Icon, label, passed, detail }: { icon: typeof Activity; label: string; passed: boolean; detail: string }) {
  return <article><span><Icon size={15}/>{label}</span><b className={passed ? "pass" : "pending"}>{passed ? "PASS" : "PENDING"}</b><small>{detail}</small></article>;
}

export function V64FirstLaunchConsole() {
  const [data, setData] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Reading the first-mainnet-launch evidence chain…");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v64/first-launch-readiness", { cache: "no-store" });
      const payload = await response.json() as Readiness & { error?: string };
      if (!response.ok) throw new Error(payload.error || "V64 readiness route failed.");
      setData(payload);
      setMessage(payload.error ?? payload.next.detail);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "V64 readiness failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (data === null) {
    return <main className="v60-canary-page"><header className="v60-canary-hero"><div><span><Activity size={17}/>LEVERAGE X V64</span><h1>First Mainnet Launch</h1><p>Loading factory, token, Spot, evidence, and GMGN handoff state…</p></div></header></main>;
  }

  const launch = data.firstLaunch;
  const completed = data.gates.gmgnEvidenceReady;
  const progressing = data.gates.canaryLaunchConfirmed || data.gates.cappedSpotOpen;
  const stateLabel = completed ? "GMGN HANDOFF READY" : progressing ? "CANARY IN PROGRESS" : "DEPLOYMENT GATES";
  const gmgnUrl = launch?.tokenAddress ? `https://gmgn.ai/robinhood/token/${launch.tokenAddress}` : null;

  return <main className="v60-canary-page">
    <header className="v60-canary-hero">
      <div><span><Rocket size={17}/>LEVERAGE X V64</span><h1>First Real Token Control</h1><p>One closed factory, one paused launch, one capped Spot market, one outside-wallet buy/sell, then a complete GMGN onboarding package.</p></div>
      <div className={completed ? "live" : progressing ? "ready" : "blocked"}>{completed ? <CheckCircle2 size={20}/> : progressing ? <Activity size={20}/> : <AlertTriangle size={20}/>}<span><b>{stateLabel}</b><small>Robinhood Chain</small></span></div>
    </header>

    <section className="v60-canary-actions">
      <button onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>{busy ? "Checking…" : "Refresh evidence"}</button>
      <a href={data.launchpad.manifest} target="_blank" rel="noreferrer"><FileCheck2 size={15}/>GMGN manifest</a>
      {gmgnUrl && <a href={gmgnUrl} target="_blank" rel="noreferrer"><Search size={15}/>Open token on GMGN</a>}
      <span>{message}</span>
    </section>

    <section className="v60-canary-metrics">
      <article><Factory/><span><small>Factory</small><strong>{data.gates.factoryReady ? "DEPLOYED" : "PENDING"}</strong><em>{short(data.factory.address)}</em></span></article>
      <article><Rocket/><span><small>First token</small><strong>{data.gates.canaryLaunchConfirmed ? launch?.symbol || "CONFIRMED" : "PENDING"}</strong><em>{short(launch?.tokenAddress ?? null)}</em></span></article>
      <article><ArrowRightLeft/><span><small>External roundtrip</small><strong>{data.gates.roundtripConfirmed ? "BUY + SELL" : "PENDING"}</strong><em>{data.market.tradeCount ?? "0"} total market trades</em></span></article>
      <article><Search/><span><small>GMGN</small><strong>{data.gates.gmgnEvidenceReady ? "SUBMIT PACKAGE" : "NOT READY"}</strong><em>Official label requires GMGN approval</em></span></article>
    </section>

    <section className="v60-canary-grid">
      <div className="v60-canary-gates">
        <header><span>First-launch gate</span><span>State</span><span>Authoritative requirement</span></header>
        <Gate icon={Activity} label="Robinhood mainnet RPC" passed={data.gates.rpcReady} detail={`Chain ${data.chain.chainId ?? "—"} · latest block ${data.chain.latestBlock?.toLocaleString("en-US") ?? "—"}`}/>
        <Gate icon={Factory} label="Closed factory deployed" passed={data.gates.factoryReady} detail="Exact bytecode · correct owner · closed/paused deployment · zero unintended markets"/>
        <Gate icon={ShieldCheck} label="Factory source verified" passed={data.gates.sourceVerified} detail="Blockscout verification lets GMGN and traders inspect the launchpad implementation"/>
        <Gate icon={WalletCards} label="Single creator allowlist" passed={data.gates.canaryConfigured} detail={`Only ${short(data.accounts.canaryCreator)} may create the first market`}/>
        <Gate icon={Rocket} label="First paused token" passed={data.gates.canaryLaunchConfirmed} detail="Token, market, creator buy, metadata hash, fixed supply, and launch receipt agree"/>
        <Gate icon={Database} label="Public launch registry" passed={data.gates.productionRegistryReady} detail="Supabase launch record and public V63 discovery feed resolve the same token"/>
        <Gate icon={ArrowRightLeft} label="Capped Spot buy/sell" passed={data.gates.roundtripConfirmed} detail="A separate trader wallet completes a real buy, approval, and sell"/>
        <Gate icon={Search} label="GMGN evidence package" passed={data.gates.gmgnEvidenceReady} detail="Factory, ABIs, topics, metadata, token, market, launch, buy, and sell proofs are ready to submit"/>
        <article><span><Search size={15}/>Official Leverage X label</span><b className="locked">EXTERNAL</b><small>GMGN must accept and map the factory; no website code can self-award this label.</small></article>
      </div>

      <aside className="v60-canary-side">
        <section><header><Rocket size={16}/><strong>Canary token</strong></header><div><span>Name</span><b>{launch?.name || "—"}</b></div><div><span>Ticker</span><b>{launch?.symbol ? `$${launch.symbol}` : "—"}</b></div><div><span>Token</span><b>{short(launch?.tokenAddress ?? null)}</b></div><div><span>Market</span><b>{short(launch?.bondingMarket ?? data.market.address)}</b></div></section>
        <section><header><ArrowRightLeft size={16}/><strong>Public transactions</strong></header><div><span>Launch</span><b>{data.transactions.launch.confirmed ? short(data.transactions.launch.hash) : "PENDING"}</b></div><div><span>Buy</span><b>{data.transactions.buy.confirmed ? short(data.transactions.buy.hash) : "PENDING"}</b></div><div><span>Approve</span><b>{data.transactions.approve.confirmed ? short(data.transactions.approve.hash) : "PENDING"}</b></div><div><span>Sell</span><b>{data.transactions.sell.confirmed ? short(data.transactions.sell.hash) : "PENDING"}</b></div></section>
        <section><header><CheckCircle2 size={16}/><strong>Exact next action</strong></header><code>{data.next.command}</code><p>{data.next.detail}</p></section>
        {data.factory.address && <section><header><ExternalLink size={16}/><strong>Explorer</strong></header><a href={`${data.chain.explorer}/address/${data.factory.address}`} target="_blank" rel="noreferrer">Open factory</a>{launch?.tokenAddress && <a href={`${data.chain.explorer}/address/${launch.tokenAddress}`} target="_blank" rel="noreferrer">Open token</a>}</section>}
      </aside>
    </section>
  </main>;
}
