"use client";

import { Activity, AlertTriangle, CheckCircle2, Database, ExternalLink, Factory, FileJson2, RefreshCw, Search, ShieldCheck, Waves } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Manifest = {
  protocol: string;
  version: string;
  launchpadId: string;
  chain: { name: string; chainId: number; wrappedNativeToken: string; explorer: string };
  attribution: { factoryAddress: string | null; deploymentBlock: number | null; sourceVerified: boolean; status: string };
  endpoints: { manifest: string; launches: string; token: string; discoveryLegacy: string };
  disclaimer: string;
};
type Launch = {
  tokenAddress: string | null;
  bondingMarket: string | null;
  canonicalPool: string | null;
  name: string;
  symbol: string;
  blockNumber: number;
  imageUrl: string;
  graduated: boolean;
  transactionHash: string;
};

function short(value: string | null) { return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—"; }

export function V63GmgnConsole() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState("Reading the public GMGN compatibility surface…");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const [manifestResponse, launchesResponse] = await Promise.all([
        fetch("/api/v63/gmgn/manifest", { cache: "no-store" }),
        fetch("/api/v63/gmgn/launches?limit=12", { cache: "no-store" }),
      ]);
      const manifestPayload = await manifestResponse.json() as Manifest;
      const launchesPayload = await launchesResponse.json() as { configured?: boolean; launches?: Launch[]; error?: string };
      if (!manifestResponse.ok) throw new Error("GMGN manifest route failed.");
      if (!launchesResponse.ok) throw new Error(launchesPayload.error || "GMGN launch feed failed.");
      setManifest(manifestPayload);
      setLaunches(launchesPayload.launches ?? []);
      setConfigured(Boolean(launchesPayload.configured));
      setMessage(manifestPayload.attribution.factoryAddress
        ? "Factory attribution is configured. Deploy, verify, backfill, and send the integration package to GMGN."
        : "The compatibility surface is live; factory deployment and verification are still pending.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GMGN compatibility check failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!manifest) {
    return <main className="v60-canary-page"><header className="v60-canary-hero"><div><span><Activity size={17}/>LEVERAGE X V63</span><h1>GMGN Compatibility</h1><p>Loading launch attribution, feeds, and market-discovery state…</p></div></header></main>;
  }

  const factoryReady = Boolean(manifest.attribution.factoryAddress && manifest.attribution.deploymentBlock);
  const launchProofReady = launches.length > 0;
  const integrationReady = factoryReady && configured && launchProofReady;

  return <main className="v60-canary-page">
    <header className="v60-canary-hero">
      <div><span><Search size={17}/>LEVERAGE X V63</span><h1>GMGN Launchpad Compatibility</h1><p>Stable factory attribution, public discovery, deterministic backfill, and canonical market mapping for every Leverage X token.</p></div>
      <div className={integrationReady ? "live" : factoryReady ? "ready" : "blocked"}>{integrationReady ? <CheckCircle2 size={20}/> : <AlertTriangle size={20}/>}<span><b>{integrationReady ? "HANDOFF READY" : factoryReady ? "CANARY REQUIRED" : "FACTORY PENDING"}</b><small>Robinhood Chain</small></span></div>
    </header>

    <section className="v60-canary-actions">
      <button onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>{busy ? "Checking…" : "Refresh compatibility"}</button>
      <a href={manifest.endpoints.manifest} target="_blank" rel="noreferrer"><FileJson2 size={15}/>Public manifest</a>
      <a href={manifest.endpoints.launches} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Launch feed</a>
      <span>{message}</span>
    </section>

    <section className="v60-canary-metrics">
      <article><Factory/><span><small>Factory attribution</small><strong>{factoryReady ? "CONFIGURED" : "PENDING"}</strong><em>{short(manifest.attribution.factoryAddress)}</em></span></article>
      <article><Database/><span><small>Public launch feed</small><strong>{configured ? "READY" : "NEEDS SUPABASE"}</strong><em>{launches.length} recent launch(es)</em></span></article>
      <article><Waves/><span><small>Canonical market mapping</small><strong>V63 READY</strong><em>Bonding market → graduated DEX pool</em></span></article>
      <article><Search/><span><small>GMGN label</small><strong>ONBOARDING REQUIRED</strong><em>External acceptance, not a code switch</em></span></article>
    </section>

    <section className="v60-canary-grid">
      <div className="v60-canary-gates">
        <header><span>GMGN gate</span><span>State</span><span>Requirement</span></header>
        <Gate icon={FileJson2} label="Public integration manifest" passed detail="Events, selectors, chain, WETH, token rules, endpoints, and replay policy are machine-readable."/>
        <Gate icon={Factory} label="Verified V63 factory" passed={factoryReady} detail="Factory address and deployment block must be public and source-verified on Blockscout."/>
        <Gate icon={Database} label="Historical launch backfill" passed={configured && launchProofReady} detail="Replay TokenLaunched, MarketCreated, and TokenGraduated in canonical log order."/>
        <Gate icon={Waves} label="Canonical Spot market" passed={launchProofReady} detail="Each token resolves to its live bonding market and later to its external graduated pool."/>
        <Gate icon={Search} label="Contract-address discovery test" passed={false} detail="After the first launch, paste its contract into GMGN and record what GMGN resolves automatically."/>
        <Gate icon={ShieldCheck} label="Official Leverage X launchpad label" passed={false} detail="Send the generated integration package and canary transactions to GMGN for onboarding alongside Pons."/>
      </div>

      <aside className="v60-canary-side">
        <section><header><Factory size={16}/><strong>Attribution</strong></header><div><span>Launchpad ID</span><b>{manifest.launchpadId}</b></div><div><span>Factory</span><b>{short(manifest.attribution.factoryAddress)}</b></div><div><span>Deploy block</span><b>{manifest.attribution.deploymentBlock ?? "—"}</b></div><div><span>WETH</span><b>{short(manifest.chain.wrappedNativeToken)}</b></div></section>
        <section><header><Activity size={16}/><strong>Recent launches</strong></header>{launches.length ? launches.slice(0, 5).map((launch) => <div key={launch.tokenAddress ?? launch.transactionHash}><span>{launch.symbol || launch.name}</span><b>{short(launch.tokenAddress)}</b></div>) : <p>No confirmed V63 canary launch yet.</p>}</section>
        <section><header><CheckCircle2 size={16}/><strong>Exact next command</strong></header><code>{factoryReady ? "npm run chain:v63:gmgn:backfill" : "npm run chain:v63:preflight"}</code><p>{manifest.disclaimer}</p></section>
      </aside>
    </section>
  </main>;
}

function Gate({ icon: Icon, label, passed, detail }: { icon: typeof Activity; label: string; passed: boolean; detail: string }) {
  return <article><span><Icon size={15}/>{label}</span><b className={passed ? "pass" : "pending"}>{passed ? "PASS" : "PENDING"}</b><small>{detail}</small></article>;
}
