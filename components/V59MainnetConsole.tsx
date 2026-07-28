"use client";

import { Activity, AlertTriangle, Blocks, CheckCircle2, CircleDollarSign, ExternalLink, Factory, RefreshCw, Rocket, ShieldCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Readiness = {
  ok: boolean;
  checkedAt: string;
  chain: {
    name: string;
    expectedChainId: number;
    chainId: number | null;
    latestBlock: number | null;
    latestBlockAgeSeconds: number | null;
    gasPriceWei: string | null;
    rpcConfigured: boolean;
    rpcHealthy: boolean;
    explorer: string;
  };
  accounts: { expectedDeployer: string; deployerBalanceWei: string | null; firstTrader: string };
  factory: {
    configured: boolean;
    address: string | null;
    codePresent: boolean;
    owner: string | null;
    ownerMatchesExpected: boolean;
    launchMode: number | null;
    launchModeLabel: string;
    globalTradingPaused: boolean | null;
    newMarketsPaused: boolean | null;
    marketCount: string | null;
  };
  release: { stage: string; mainnetUiEnabled: boolean; perpsEnabled: boolean };
  gates: { rpcReady: boolean; factoryDeployable: boolean; factorySafelyDeployed: boolean; sourceVerificationRequired: boolean; canaryActivationAllowed: boolean };
  error: string | null;
};

const NUMBER = new Intl.NumberFormat("en-US");
function short(value: string | null) { return value ? `${value.slice(0, 7)}…${value.slice(-5)}` : "—"; }
function eth(wei: string | null) {
  if (!wei) return "0 ETH";
  const value = Number(BigInt(wei)) / 1e18;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 7 })} ETH`;
}

export function V59MainnetConsole() {
  const [data, setData] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking the private Robinhood Chain mainnet RPC…");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v59/readiness", { cache: "no-store" });
      const payload = await response.json() as Readiness;
      setData(payload);
      setMessage(payload.error ?? (payload.factory.codePresent ? "Factory state read directly from Robinhood Chain." : "RPC is ready. The factory has not been deployed/configured yet."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mainnet readiness check failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (data === null) {
    return <main className="v59-mainnet-page">
      <header className="v59-mainnet-hero">
        <div><span><Activity size={17}/>LEVERAGE X V60</span><h1>Mainnet Preflight & Factory Gate</h1><p>Loading authoritative Robinhood Chain mainnet state…</p></div>
      </header>
    </main>;
  }

  const safe = data?.gates.factorySafelyDeployed ?? false;
  const rpcReady = data?.gates.rpcReady ?? false;
  const factoryLabel = data?.factory.codePresent ? "DEPLOYED" : "NOT DEPLOYED";
  const globalTradingPaused = data?.factory.globalTradingPaused ?? null;
  const newMarketsPaused = data?.factory.newMarketsPaused ?? null;

  return <main className="v59-mainnet-page">
    <header className="v59-mainnet-hero">
      <div><span><Rocket size={17}/>LEVERAGE X V59</span><h1>Mainnet Preflight &amp; Factory Gate</h1><p>Live RPC health and contract safety truth. Signing, deployment, and activation remain local-only operations.</p></div>
      <div className={safe ? "safe" : rpcReady ? "ready" : "blocked"}>{safe ? <ShieldCheck size={20}/> : rpcReady ? <Activity size={20}/> : <AlertTriangle size={20}/>}<span><b>{safe ? "FACTORY SAFE" : rpcReady ? "RPC READY" : "BLOCKED"}</b><small>{data?.chain.name ?? "Robinhood Chain Mainnet"}</small></span></div>
    </header>

    <section className="v59-mainnet-actions">
      <button onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>{busy ? "Checking…" : "Refresh chain state"}</button>
      {data?.factory.address && <a href={`${data.chain.explorer}/address/${data.factory.address}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Open factory</a>}
      <span>{message}</span>
    </section>

    <section className="v59-mainnet-metrics">
      <article><Blocks/><span><small>RPC / chain ID</small><strong>{rpcReady ? "HEALTHY" : "NOT READY"}</strong><em>{data?.chain.chainId ?? "—"} / expected 4663</em></span></article>
      <article><WalletCards/><span><small>Deployer balance</small><strong>{eth(data?.accounts.deployerBalanceWei ?? null)}</strong><em>{short(data?.accounts.expectedDeployer ?? null)}</em></span></article>
      <article><Factory/><span><small>Mainnet factory</small><strong>{factoryLabel}</strong><em>{short(data?.factory.address ?? null)}</em></span></article>
      <article><ShieldCheck/><span><small>Release posture</small><strong>{data?.factory.launchModeLabel?.toUpperCase() ?? "BUILD"}</strong><em>Perps disabled · UI {data?.release.mainnetUiEnabled ? "enabled" : "locked"}</em></span></article>
    </section>

    <section className="v59-mainnet-grid">
      <div className="v59-mainnet-checks">
        <header><span>Gate</span><span>State</span><span>Authoritative result</span></header>
        <article><span><Activity size={15}/>RPC freshness</span><b className={rpcReady ? "pass" : "fail"}>{rpcReady ? "PASS" : "BLOCKED"}</b><small>{data?.chain.latestBlock ? `Block ${NUMBER.format(data.chain.latestBlock)} · ${data.chain.latestBlockAgeSeconds ?? 0}s old` : "No live block returned"}</small></article>
        <article><span><Factory size={15}/>Factory bytecode</span><b className={data?.factory.codePresent ? "pass" : "pending"}>{data?.factory.codePresent ? "PASS" : "PENDING"}</b><small>{data?.factory.codePresent ? "Runtime bytecode found at configured address" : "Deploy closed and paused after local Foundry preflight"}</small></article>
        <article><span><ShieldCheck size={15}/>Factory safety</span><b className={safe ? "pass" : "pending"}>{safe ? "PASS" : "PENDING"}</b><small>{safe ? "Owner matches · launch closed · global paused · new markets paused" : "Activation remains prohibited until all reads pass"}</small></article>
        <article><span><CircleDollarSign size={15}/>Trading exposure</span><b className="pass">LOCKED</b><small>Public launches off · Spot off · Long/Short off</small></article>
      </div>

      <aside className="v59-mainnet-side">
        <section><header><WalletCards size={16}/><strong>Controlled accounts</strong></header><div><span>Deployer</span><b>{short(data?.accounts.expectedDeployer ?? null)}</b></div><div><span>First trader</span><b>{short(data?.accounts.firstTrader ?? null)}</b></div><div><span>Factory owner</span><b>{short(data?.factory.owner ?? data?.accounts.expectedDeployer ?? null)}</b></div></section>
        <section><header><Factory size={16}/><strong>On-chain state</strong></header><div><span>Launch mode</span><b>{data?.factory.launchModeLabel ?? "not deployed"}</b></div><div><span>Global pause</span><b>{globalTradingPaused === null ? "—" : globalTradingPaused ? "ON" : "OFF"}</b></div><div><span>New markets paused</span><b>{newMarketsPaused === null ? "—" : newMarketsPaused ? "ON" : "OFF"}</b></div><div><span>Markets</span><b>{data?.factory.marketCount ?? "0"}</b></div></section>
        <section><header><CheckCircle2 size={16}/><strong>Next local command</strong></header><code>npm run chain:v59:preflight</code><p>No browser or Vercel route can sign or broadcast the factory deployment.</p></section>
      </aside>
    </section>
  </main>;
}
