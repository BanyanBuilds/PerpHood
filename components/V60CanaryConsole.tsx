"use client";

import { Activity, AlertTriangle, CheckCircle2, CircleDollarSign, ExternalLink, Factory, PauseCircle, RefreshCw, Rocket, ShieldCheck, UserCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Readiness = {
  ok: boolean;
  checkedAt: string;
  chain: { name: string; chainId: number | null; latestBlock: number | null; latestBlockAgeSeconds: number | null; explorer: string; rpcHealthy: boolean };
  accounts: { owner: string | null; canaryCreator: string; firstTrader: string; creatorBalanceWei: string | null; traderBalanceWei: string | null; creatorIsEoa: boolean; traderIsEoa: boolean };
  factory: { configured: boolean; address: string | null; codePresent: boolean; ownerMatchesExpected: boolean; launchMode: number | null; launchModeLabel: string; globalTradingPaused: boolean | null; newMarketsPaused: boolean | null; marketCount: string | null; canaryCreatorAllowed: boolean; activeCanaryCreator: string | null; defaultMaxBuyWei: string | null; defaultMaxSellTokenWad: string | null };
  market: { configured: boolean; address: string | null; token: string | null; creator: string | null; paused: boolean | null; maxBuyWei: string | null; maxSellTokenWad: string | null; tradeCount: string | null };
  release: { stage: string; mainnetUiEnabled: boolean; canaryCreatorRestricted: boolean; perpsEnabled: boolean };
  gates: { rpcReady: boolean; factoryClosedAndPaused: boolean; canaryConfigurationReady: boolean; canaryLaunchReady: boolean; firstMarketCreated: boolean; spotCanaryOpen: boolean; publicLaunchesAllowed: boolean; perpsAllowed: boolean };
  error: string | null;
};

const NUMBER = new Intl.NumberFormat("en-US");
function short(value: string | null) { return value ? `${value.slice(0, 7)}…${value.slice(-5)}` : "—"; }
function eth(wei: string | null) {
  if (!wei) return "0 ETH";
  return `${(Number(BigInt(wei)) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 7 })} ETH`;
}
function gate(value: boolean) { return value ? "PASS" : "PENDING"; }

export function V60CanaryConsole() {
  const [data, setData] = useState<Readiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Reading Robinhood Chain mainnet canary state…");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v60/canary-readiness", { cache: "no-store" });
      const payload = await response.json() as Readiness;
      setData(payload);
      setMessage(payload.error ?? (payload.gates.spotCanaryOpen
        ? "The first capped Spot canary is live. Public launches and perps remain disabled."
        : payload.gates.firstMarketCreated
          ? "The first market exists and remains paused. Verify it before opening Spot."
          : payload.gates.canaryLaunchReady
            ? "The allowlisted creator can launch the first paused market from Launch Token."
            : payload.gates.canaryConfigurationReady
              ? "Canary configured on-chain. Import the V60 Vercel environment block and redeploy."
              : payload.factory.codePresent
                ? "Factory deployed. Run the local V60 canary preflight/configuration flow."
                : "Factory has not been deployed/configured yet."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Canary readiness check failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const phase = data?.gates.spotCanaryOpen ? "SPOT CANARY LIVE"
    : data?.gates.firstMarketCreated ? "MARKET PAUSED"
      : data?.gates.canaryLaunchReady ? "LAUNCH READY"
        : data?.gates.canaryConfigurationReady ? "VERCEL SYNC"
          : data?.factory.codePresent ? "CONFIGURE CANARY" : "DEPLOY FACTORY";
  const healthy = data?.gates.rpcReady ?? false;

  return <main className="v60-canary-page">
    <header className="v60-canary-hero">
      <div><span><Rocket size={17}/>LEVERAGE X V60</span><h1>Mainnet Canary Control</h1><p>One allowlisted creator, one paused launch, one capped Spot market. Public launches and Long/Short remain locked.</p></div>
      <div className={data?.gates.spotCanaryOpen ? "live" : healthy ? "ready" : "blocked"}>{data?.gates.spotCanaryOpen ? <CheckCircle2 size={20}/> : healthy ? <Activity size={20}/> : <AlertTriangle size={20}/>}<span><b>{phase}</b><small>{data?.chain.name ?? "Robinhood Chain Mainnet"}</small></span></div>
    </header>

    <section className="v60-canary-actions">
      <button onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>{busy ? "Checking…" : "Refresh chain state"}</button>
      {data?.factory.address && <a href={`${data.chain.explorer}/address/${data.factory.address}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Factory</a>}
      {data?.market.address && <a href={`${data.chain.explorer}/address/${data.market.address}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/>First market</a>}
      <span>{message}</span>
    </section>

    <section className="v60-canary-metrics">
      <article><Factory/><span><small>Factory mode</small><strong>{data?.factory.launchModeLabel?.toUpperCase() ?? "NOT DEPLOYED"}</strong><em>{short(data?.factory.address ?? null)}</em></span></article>
      <article><UserCheck/><span><small>Canary creator</small><strong>{data?.factory.canaryCreatorAllowed ? "ALLOWLISTED" : "LOCKED"}</strong><em>{short(data?.accounts.canaryCreator ?? null)}</em></span></article>
      <article><PauseCircle/><span><small>Trading posture</small><strong>{data?.gates.spotCanaryOpen ? "CAPPED LIVE" : "PAUSED"}</strong><em>New markets {data?.factory.newMarketsPaused ? "paused" : "open"}</em></span></article>
      <article><CircleDollarSign/><span><small>Creator / trader</small><strong>{eth(data?.accounts.creatorBalanceWei ?? null)}</strong><em>Trader {eth(data?.accounts.traderBalanceWei ?? null)}</em></span></article>
    </section>

    <section className="v60-canary-grid">
      <div className="v60-canary-gates">
        <header><span>Release gate</span><span>State</span><span>Authoritative requirement</span></header>
        <article><span><Activity size={15}/>Private RPC</span><b className={data?.gates.rpcReady ? "pass" : "pending"}>{gate(data?.gates.rpcReady ?? false)}</b><small>{data?.chain.latestBlock ? `Block ${NUMBER.format(data.chain.latestBlock)} · ${data.chain.latestBlockAgeSeconds ?? 0}s old` : "No live head"}</small></article>
        <article><span><ShieldCheck size={15}/>Closed factory</span><b className={data?.gates.factoryClosedAndPaused ? "pass" : "pending"}>{gate(data?.gates.factoryClosedAndPaused ?? false)}</b><small>Owner matched · launch closed · global paused · new markets paused</small></article>
        <article><span><UserCheck size={15}/>Canary configuration</span><b className={data?.gates.canaryConfigurationReady ? "pass" : "pending"}>{gate(data?.gates.canaryConfigurationReady ?? false)}</b><small>Allowlist only · creator restricted · 0.01 ETH buy cap · 5M-token sell cap</small></article>
        <article><span><Rocket size={15}/>First paused launch</span><b className={data?.gates.firstMarketCreated ? "pass" : "pending"}>{gate(data?.gates.firstMarketCreated ?? false)}</b><small>Exactly one market · expected creator · genesis transaction only · market paused</small></article>
        <article><span><CircleDollarSign size={15}/>Capped Spot canary</span><b className={data?.gates.spotCanaryOpen ? "pass" : "pending"}>{gate(data?.gates.spotCanaryOpen ?? false)}</b><small>One market only · global open · market open · future launches remain paused</small></article>
        <article><span><ShieldCheck size={15}/>Public launch / perps</span><b className="locked">LOCKED</b><small>Public launch mode disabled · Long/Short disabled · BattlePool not activated</small></article>
      </div>

      <aside className="v60-canary-side">
        <section><header><WalletCards size={16}/><strong>Controlled accounts</strong></header><div><span>Owner</span><b>{short(data?.accounts.owner ?? null)}</b></div><div><span>Creator</span><b>{short(data?.accounts.canaryCreator ?? null)}</b></div><div><span>First trader</span><b>{short(data?.accounts.firstTrader ?? null)}</b></div></section>
        <section><header><Factory size={16}/><strong>First market</strong></header><div><span>Market</span><b>{short(data?.market.address ?? null)}</b></div><div><span>Token</span><b>{short(data?.market.token ?? null)}</b></div><div><span>Paused</span><b>{data?.market.paused === null ? "—" : data.market.paused ? "YES" : "NO"}</b></div><div><span>Trades</span><b>{data?.market.tradeCount ?? "0"}</b></div></section>
        <section><header><CheckCircle2 size={16}/><strong>Next local command</strong></header><code>{data?.factory.codePresent ? data?.gates.canaryConfigurationReady ? data?.gates.firstMarketCreated ? "npm run chain:v60:canary:open" : "Use Launch Token with the allowlisted wallet" : "npm run chain:v60:canary:preflight" : "npm run chain:v59:preflight"}</code><p>All owner signing remains local. Vercel can read state but cannot sign or broadcast administration transactions.</p></section>
      </aside>
    </section>
  </main>;
}
