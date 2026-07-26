"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CircleDollarSign,
  Database,
  FlaskConical,
  Gauge,
  Play,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  Swords,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { LAUNCHPAD_TEST_MODE, LAUNCHPAD_VERSION } from "@/lib/launchpad";
import type { MarketScenario, Token } from "@/lib/types";
import { money } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";
import { useMarkets } from "./MarketProvider";

function gateValue(value: number | string, key: string) {
  if (typeof value === "string") return value;
  if (key === "market-cap") return money(value);
  if (key === "trader-distribution") return Math.round(value).toLocaleString("en-US");
  return `${value.toFixed(value < 0.1 ? 4 : 3)} ETH`;
}

export function LaunchpadTestConsole() {
  const {
    tokens,
    events,
    positions,
    balanceEth,
    connected,
    toggleWallet,
    fundTradingAccount,
    getMigrationSnapshot,
    advanceLaunchpadMarket,
    migrateToken,
    runScenario,
    resetLocalData,
  } = useMarkets();
  const markets = useMemo(() => tokens.filter((token) => token.launchpadVersion || token.isCustom || token.slug === "perphood-demo"), [tokens]);
  const [selectedSlug, setSelectedSlug] = useState(markets[0]?.slug ?? "perphood-demo");
  const [status, setStatus] = useState("Choose a market, run controlled test flow, then verify every migration gate.");
  const selected = markets.find((token) => token.slug === selectedSlug) ?? markets[0];
  const snapshot = selected ? getMigrationSnapshot(selected) : null;
  const selectedEvents = events.filter((event) => event.slug === selected?.slug).slice(0, 12);
  const selectedPositions = positions.filter((position) => position.slug === selected?.slug);

  const act = (label: string, action: () => unknown) => {
    try {
      action();
      setStatus(`${label} submitted successfully.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `${label} failed.`);
    }
  };

  const scenario = (kind: MarketScenario, label: string) => act(label, () => runScenario(selected.slug, kind));

  if (!selected || !snapshot) return <main className="v41-console-page"><div className="terminal-loading">No launchpad market is available.</div></main>;

  return (
    <main className="v41-console-page">
      <header className="v41-console-head">
        <div>
          <span className="eyebrow"><FlaskConical size={14} /> {LAUNCHPAD_VERSION.toUpperCase()}</span>
          <h1>Launchpad Test Console</h1>
          <p>Local-only lifecycle testing. No wallet deployment, chain transaction, or public-money readiness is implied.</p>
        </div>
        <div className="v41-console-head-actions">
          <span className={LAUNCHPAD_TEST_MODE ? "online" : "offline"}><i />{LAUNCHPAD_TEST_MODE ? "TEST MODE ACTIVE" : "DISABLED"}</span>
          <Link href="/terminal?panel=launch"><Rocket size={14} />Open launcher</Link>
          <Link href="/admin/launchpad/sandbox"><FlaskConical size={14} />Chain sandbox</Link>
          <Link href={`/market/${selected.slug}`}>Open market<ArrowUpRight size={14} /></Link>
        </div>
      </header>

      <section className="v41-console-metrics">
        <article><Rocket size={17} /><span><small>Test markets</small><b>{markets.length}</b></span></article>
        <article><CircleDollarSign size={17} /><span><small>Trading balance</small><b>{balanceEth.toFixed(4)} ETH</b></span></article>
        <article><Swords size={17} /><span><small>Open positions</small><b>{positions.length}</b></span></article>
        <article><ShieldCheck size={17} /><span><small>Migration ready</small><b>{markets.filter((token) => getMigrationSnapshot(token).ready).length}</b></span></article>
      </section>

      <div className="v41-console-grid">
        <aside className="v41-console-markets">
          <header><span><Database size={15} />Market registry</span><small>{markets.length} local records</small></header>
          <div>
            {markets.map((token) => {
              const item = getMigrationSnapshot(token);
              return <button type="button" key={token.slug} className={token.slug === selected.slug ? "active" : ""} onClick={() => setSelectedSlug(token.slug)}>
                <TokenAvatar token={token} size="md" />
                <span><strong>${token.symbol}</strong><small>{token.name}</small></span>
                <em className={item.phase}>{item.phase}</em>
                <b>{item.marketCapProgress.toFixed(0)}%</b>
              </button>;
            })}
          </div>
          <footer>
            {!connected ? <button type="button" onClick={toggleWallet}><Wallet size={14} />Connect local account</button> : <button type="button" onClick={() => fundTradingAccount(1)}><CircleDollarSign size={14} />Add 1 test ETH</button>}
            <button type="button" onClick={() => { resetLocalData(); setStatus("Local launchpad state reset to the bundled demo market."); }}><RefreshCcw size={14} />Reset local data</button>
          </footer>
        </aside>

        <section className="v41-console-main">
          <header className="v41-selected-market">
            <TokenAvatar token={selected} size="lg" />
            <span><strong>{selected.name} <b>${selected.symbol}</b></strong><small>{selected.slug} · creator {selected.creatorWallet}</small></span>
            <em className={snapshot.phase}>{snapshot.phase}</em>
          </header>

          <div className="v41-progress-pair">
            <article>
              <span><small>Market-cap progress</small><b>{money(snapshot.marketCapUsd)} / {money(snapshot.targetMarketCapUsd)}</b></span>
              <div><i style={{ width: `${snapshot.marketCapProgress}%` }} /></div>
              <small>{snapshot.marketCapProgress.toFixed(1)}%</small>
            </article>
            <article>
              <span><small>Real WETH progress</small><b>{snapshot.realWethEth.toFixed(3)} / {snapshot.requiredRealWethEth.toFixed(3)} ETH</b></span>
              <div><i style={{ width: `${snapshot.liquidityProgress}%` }} /></div>
              <small>{snapshot.liquidityProgress.toFixed(1)}%</small>
            </article>
          </div>

          <div className="v41-gate-grid">
            {snapshot.gates.map((gate) => <article key={gate.key} className={gate.passed ? "passed" : "blocked"}>
              {gate.passed ? <Check size={16} /> : <XCircle size={16} />}
              <span><strong>{gate.label}</strong><small>{gate.detail}</small></span>
              <b>{gateValue(gate.current, gate.key)}<small>needs {gateValue(gate.required, gate.key)}</small></b>
            </article>)}
          </div>

          <div className="v41-test-actions">
            <header><Play size={15} /><span><strong>Controlled lifecycle actions</strong><small>These mutate only the local simulator.</small></span></header>
            <div>
              <button type="button" onClick={() => act("Distributed test flow", () => advanceLaunchpadMarket(selected.slug))}><Users size={14} />Advance to target</button>
              <button type="button" onClick={() => scenario("whale-buy", "Whale buy")}><Activity size={14} />Whale buy</button>
              <button type="button" onClick={() => scenario("whale-sell", "Whale sell")}><Activity size={14} />Whale sell</button>
              <button type="button" onClick={() => scenario("liquidation-cascade", "Liquidation cascade")}><AlertTriangle size={14} />Cascade</button>
              <button type="button" onClick={() => scenario("oracle-wick", "Oracle wick")}><Gauge size={14} />Oracle wick</button>
              <button type="button" className="primary" disabled={!snapshot.ready || snapshot.phase === "migrated" || snapshot.phase === "migrating"} onClick={() => act("Migration", () => migrateToken(selected.slug))}><ShieldCheck size={14} />Migrate safely</button>
            </div>
          </div>

          <div className="v41-console-ledger">
            <header><Database size={15} /><span><strong>Market ledger</strong><small>{selectedPositions.length} open positions · {selectedEvents.length} recent events</small></span></header>
            <div>
              {selectedEvents.length === 0 && <p>No events recorded for this market yet.</p>}
              {selectedEvents.map((event) => <article key={event.id}>
                <span><b>{event.action.replaceAll("-", " ")}</b><small>{event.actor ?? "System"}</small></span>
                <strong>{event.amountEth.toFixed(4)} ETH</strong>
                <em>{money(event.marketCap)}</em>
                <small>{event.note}</small>
              </article>)}
            </div>
          </div>
        </section>

        <aside className="v41-console-checklist">
          <header><ShieldCheck size={15} />Alpha readiness checklist</header>
          {[
            ["Token identity", Boolean(selected.normalizedSymbol && selected.metadataLockedAt)],
            ["One-billion supply", selected.totalSupply === 1_000_000_000],
            ["Inclusive launch spend", Boolean(selected.launchTotalSpendEth && selected.launchGasReserveEth !== undefined)],
            ["Creator buy recorded", Boolean(selected.creatorGenesisBuyEth && selected.creatorGenesisBuyEth > 0)],
            ["Creator perps blocked", Boolean(selected.creatorWallet)],
            ["Unified BattlePool", selected.battlePoolVersion === "v43-unified-settlement" || Boolean(selected.battlePoolVersion)],
            ["Migration target", Boolean(selected.migrationTargetMarketCapUsd)],
            ["Zero bad debt", (selected.badDebtEth ?? 0) === 0],
            ["Event trail", selectedEvents.length > 0],
          ].map(([label, passed]) => <span key={String(label)} className={passed ? "passed" : "pending"}>{passed ? <Check size={14} /> : <AlertTriangle size={14} />}{String(label)}</span>)}
          <div className="v41-console-warning"><AlertTriangle size={15} /><span><strong>Still not public-money ready</strong><small>V43 now executes unified local spot and perps settlement. Canonical WETH custody, production session balances, keeper redundancy, audits, and recovery drills remain external milestones.</small></span></div>
        </aside>
      </div>

      <footer className="v41-console-status" aria-live="polite">{status}</footer>
    </main>
  );
}
