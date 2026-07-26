"use client";

import Link from "next/link";
import { Activity, ArrowLeft, CircleDollarSign, FlaskConical, HardDrive, ShieldCheck, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { KeyButton } from "@/components/KeyButton";
import { useMarkets } from "@/components/MarketProvider";

const ETH_USD = 3200;
const EXECUTION_FEE_RATE = 0.003;

function usd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
}

export default function RevenuePage() {
  const { tokens, events } = useMarkets();
  const [volumeMultiplier, setVolumeMultiplier] = useState(1);
  const [futureTreasurySharePercent, setFutureTreasurySharePercent] = useState(0);
  const [monthlyInfrastructure, setMonthlyInfrastructure] = useState(3500);

  const model = useMemo(() => {
    const indexedVolume = tokens.reduce((sum, token) => sum + token.volume24h, 0);
    const localVolume = events.reduce((sum, event) => sum + event.amountEth * ETH_USD, 0);
    const executedVolume = Math.max(indexedVolume, localVolume) * volumeMultiplier;
    const grossExecutionFees = executedVolume * EXECUTION_FEE_RATE;
    const treasury = grossExecutionFees * futureTreasurySharePercent / 100;
    const battlePoolRetained = grossExecutionFees - treasury;
    const dailyInfrastructure = monthlyInfrastructure / 30;
    return {
      executedVolume,
      grossExecutionFees,
      treasury,
      battlePoolRetained,
      dailyInfrastructure,
      treasuryAfterInfrastructure: treasury - dailyInfrastructure,
    };
  }, [events, futureTreasurySharePercent, monthlyInfrastructure, tokens, volumeMultiplier]);

  return <><Header /><main className="admin-revenue-page page-shell">
    <section className="admin-revenue-hero glass-panel">
      <div><span className="eyebrow">PRIVATE OWNER WORKSPACE</span><h1>BattlePool economics lab</h1><p>V20 executes one 0.30% fee across the shared curve and retains the entire fee inside pool equity. This page only stress-tests a possible future treasury share; it does not change the engine.</p></div>
      <Link href="/admin/risk-lab"><KeyButton compact><FlaskConical size={15} />Risk Lab</KeyButton></Link>
      <Link href="/terminal"><KeyButton compact tone="dark"><ArrowLeft size={15} />Terminal</KeyButton></Link>
    </section>

    <section className="revenue-controls glass-panel">
      <label><span><strong>Volume scenario</strong><small>Scale indexed or local executed volume</small></span><select value={volumeMultiplier} onChange={(event) => setVolumeMultiplier(Number(event.target.value))}><option value={0.1}>0.1×</option><option value={0.5}>0.5×</option><option value={1}>Current baseline</option><option value={2}>2×</option><option value={5}>5×</option><option value={10}>10×</option></select></label>
      <label><span><strong>Future treasury share</strong><small>Percent of the 0.30% fee, not extra trader cost</small></span><input type="range" min="0" max="50" step="1" value={futureTreasurySharePercent} onChange={(event) => setFutureTreasurySharePercent(Number(event.target.value))} /><b>{futureTreasurySharePercent}%</b></label>
      <label><span><strong>Monthly infrastructure</strong><small>RPC, indexer, keepers, monitoring, support</small></span><input type="number" min="0" step="250" value={monthlyInfrastructure} onChange={(event) => setMonthlyInfrastructure(Number(event.target.value) || 0)} /></label>
    </section>

    <section className="revenue-kpi-grid">
      <Kpi icon={Activity} label="Daily executed volume" value={usd(model.executedVolume)} note="Spot and leveraged actions through one curve" />
      <Kpi icon={CircleDollarSign} label="Gross 0.30% fees" value={usd(model.grossExecutionFees)} note="Current V20 routing retains 100% in pool equity" />
      <Kpi icon={Waves} label="BattlePool retained" value={usd(model.battlePoolRetained)} note={`${100 - futureTreasurySharePercent}% of execution fees in this sensitivity`} />
      <Kpi icon={HardDrive} label="Treasury after infrastructure" value={usd(model.treasuryAfterInfrastructure)} note="Hypothetical only; treasury routing is disabled" tone={model.treasuryAfterInfrastructure >= 0 ? "positive" : "negative"} />
    </section>

    <section className="revenue-detail-grid">
      <article className="revenue-ledger glass-panel"><header><span><ShieldCheck size={18} /><strong>Executable V20 routing</strong></span><b>0.30% total</b></header><LedgerRow label="BattlePool equity" rate="100% of fee" value={model.grossExecutionFees} /><LedgerRow label="Creator reward" rate="disabled" value={0} muted /><LedgerRow label="Holder reward" rate="disabled" value={0} muted /><LedgerRow label="Treasury extraction" rate="disabled" value={0} muted /><footer><span>Value retained for settlement</span><strong>{usd(model.grossExecutionFees)}</strong></footer></article>
      <article className="revenue-ledger glass-panel"><header><span><CircleDollarSign size={18} /><strong>Future sensitivity only</strong></span><b>{futureTreasurySharePercent}% fee share</b></header><LedgerRow label="BattlePool" rate={`${100 - futureTreasurySharePercent}% of fee`} value={model.battlePoolRetained} /><LedgerRow label="Protocol treasury" rate={`${futureTreasurySharePercent}% of fee`} value={model.treasury} /><LedgerRow label="Daily infrastructure" rate="monthly ÷ 30" value={model.dailyInfrastructure} /><LedgerRow label="Treasury remainder" rate="before tax/reserves" value={model.treasuryAfterInfrastructure} /><footer><span>Additional trader fee</span><strong>$0</strong></footer></article>
      <article className="revenue-ledger glass-panel"><header><span><FlaskConical size={18} /><strong>Required extraction gates</strong></span><b>All must pass</b></header><LedgerText label="Randomized solvency" note="No treasury share until action-sequence fuzzing remains green." /><LedgerText label="Bank-run closeability" note="Every spot and leveraged exit path must remain payable." /><LedgerText label="Contract invariants" note="Fixed-point Solidity implementation must conserve assets exactly." /><LedgerText label="Independent audits" note="Economic and smart-contract reviewers approve the route." /><footer><span>Current treasury share</span><strong>0%</strong></footer></article>
    </section>

    <section className="revenue-policy-note glass-panel"><ShieldCheck size={20} /><span><strong>Solvency before revenue</strong><small>PERPHOOD does not reward creators merely for deploying coins. V20 keeps fees in the shared BattlePool until testing proves a treasury extraction can never weaken instant settlement.</small></span><Waves size={20} /></section>
  </main></>;
}

function Kpi({ icon: Icon, label, value, note, tone }: { icon: typeof Activity; label: string; value: string; note: string; tone?: "positive" | "negative" }) {
  return <article className="revenue-kpi glass-panel"><Icon size={19} /><small>{label}</small><strong className={tone}>{value}</strong><span>{note}</span></article>;
}

function LedgerRow({ label, rate, value, muted = false }: { label: string; rate: string; value: number; muted?: boolean }) {
  return <div className={muted ? "muted" : ""}><span><strong>{label}</strong><small>{rate}</small></span><b>{usd(value)}</b></div>;
}

function LedgerText({ label, note }: { label: string; note: string }) {
  return <div><span><strong>{label}</strong><small>{note}</small></span><b>Required</b></div>;
}
