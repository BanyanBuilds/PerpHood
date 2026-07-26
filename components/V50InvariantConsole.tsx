"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, Sigma, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readV50InvariantSnapshot, type V50InvariantSnapshot } from "@/lib/chain/v44-market-client";

const DEMO_MARKET = process.env.NEXT_PUBLIC_V45_DEMO_MARKET_ADDRESS ?? process.env.NEXT_PUBLIC_V43_DEMO_MARKET_ADDRESS ?? "";
const ETH = 1e18;
function eth(value: bigint) { return (Number(value) / ETH).toLocaleString("en-US", { maximumFractionDigits: 8 }); }
function tokens(value: bigint) { return (Number(value) / ETH).toLocaleString("en-US", { maximumFractionDigits: 0 }); }

export function V50InvariantConsole() {
  const [market, setMarket] = useState(DEMO_MARKET);
  const [state, setState] = useState<V50InvariantSnapshot | null>(null);
  const [message, setMessage] = useState(DEMO_MARKET ? "Reading the on-chain invariant snapshot…" : "Enter a deployed V45/V50 market address.");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(market)) {
      setState(null);
      setMessage("Enter a valid deployed market address.");
      return;
    }
    setBusy(true);
    try {
      const next = await readV50InvariantSnapshot(market);
      setState(next);
      setMessage(next.solvent && next.logicalTokenConservation && next.tokenCustodyMatches && next.collateralLedgerMatches && next.shortInventoryMatches
        ? "All V50 on-chain invariants are currently green."
        : "One or more invariant checks are degraded. Stop openings and investigate.");
    } catch (error) {
      setState(null);
      setMessage(error instanceof Error ? error.message : "Invariant read failed.");
    } finally {
      setBusy(false);
    }
  }, [market]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const checks = useMemo(() => state ? [
    ["Token conservation", state.logicalTokenConservation, `${tokens(state.accountedTokensWad)} accounted`],
    ["Market token custody", state.tokenCustodyMatches, `${tokens(state.marketTokenCustodyWad)} held by market`],
    ["Collateral sub-ledgers", state.collateralLedgerMatches, `${eth(state.lockedCollateralWei)} ETH locked`],
    ["Short inventory", state.shortInventoryMatches, `${tokens(state.shortInventoryWad)} tokens`],
    ["WETH solvency", state.solvent, `${eth(state.realWethBalanceWei)} ETH real balance`],
  ] as const : [], [state]);
  const healthy = checks.length > 0 && checks.every(([, ok]) => ok);

  return <main className="v50-invariant-page">
    <header className="v50-invariant-hero">
      <div><span><Sigma size={18}/>PERPHOOD V50</span><h1>Formal Invariants &amp; Settlement Safety</h1><p>Live contract diagnostics for token conservation, custody, collateral reconciliation, short inventory, and guaranteed WETH solvency.</p></div>
      <div className={healthy ? "healthy" : "degraded"}>{healthy ? <ShieldCheck size={24}/> : <AlertTriangle size={24}/>}<span><b>{healthy ? "ALL INVARIANTS GREEN" : "VALIDATION REQUIRED"}</b><small>Read directly from the BattlePool contract</small></span></div>
    </header>

    <section className="v50-invariant-controls">
      <input value={market} onChange={(event) => setMarket(event.target.value)} placeholder="0x… BattlePool market address" />
      <button onClick={() => void refresh()} disabled={busy}><RefreshCw size={15}/>{busy ? "Checking…" : "Check now"}</button>
      <span>{message}</span>
    </section>

    <section className="v50-invariant-checks">
      {checks.length ? checks.map(([label, ok, detail]) => <article key={label} className={ok ? "pass" : "fail"}>
        {ok ? <CheckCircle2 size={20}/> : <AlertTriangle size={20}/>}<span><small>{label}</small><strong>{ok ? "PASS" : "FAIL"}</strong><em>{detail}</em></span>
      </article>) : <article className="empty"><WalletCards size={22}/><span><strong>No live market loaded</strong><em>Deploy V50 locally or enter a compatible market address.</em></span></article>}
    </section>

    {state ? <section className="v50-invariant-ledger">
      <article><small>Guaranteed position liabilities</small><strong>{eth(state.guaranteedObligationsWei)} ETH</strong></article>
      <article><small>Protected WETH reserve</small><strong>{eth(state.protectedWethWei)} ETH</strong></article>
      <article><small>Collateral aggregate / sub-ledger</small><strong>{eth(state.lockedCollateralWei)} / {eth(state.collateralSubledgerWei)} ETH</strong></article>
      <article><small>Short inventory / expected</small><strong>{tokens(state.shortInventoryWad)} / {tokens(state.expectedShortInventoryWad)}</strong></article>
    </section> : null}
  </main>;
}
