"use client";

import { Activity, ShieldCheck, Users, WalletCards } from "lucide-react";
import { DEMO_HOLDER_INTEL, DEMO_WINDOW_STATS, type DemoWindow } from "@/lib/demo-market";
import type { Token } from "@/lib/types";

const WINDOWS: DemoWindow[] = ["5m", "1h", "6h", "24h"];

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function MarketDexStats({ token }: { token: Token }) {
  return (
    <section className="market-dex-stats" aria-label="Market activity and holder intelligence">
      <div className="dex-window-grid">
        {WINDOWS.map((window) => {
          const row = DEMO_WINDOW_STATS[window];
          return <article key={window} className="dex-window-card">
            <header><strong>{window.toUpperCase()}</strong><em className={row.change >= 0 ? "positive" : "negative"}>{row.change >= 0 ? "+" : ""}{row.change.toFixed(2)}%</em></header>
            <div><span><small>Txns</small><b>{compact(row.txns)}</b></span><span><small>Volume</small><b>${compact(row.volume)}</b></span><span><small>Traders</small><b>{compact(row.traders)}</b></span></div>
            <footer><span className="positive">{row.buys} buys · ${compact(row.buyVolume)}</span><span className="negative">{row.sells} sells · ${compact(row.sellVolume)}</span></footer>
          </article>;
        })}
      </div>
      <div className="market-intel-grid">
        <span><Users size={14}/><small>Holders</small><strong>{DEMO_HOLDER_INTEL.holders.toLocaleString()}</strong></span>
        <span><WalletCards size={14}/><small>Top 10</small><strong>{DEMO_HOLDER_INTEL.top10Share.toFixed(1)}%</strong></span>
        <span><Activity size={14}/><small>First 70 held</small><strong>{DEMO_HOLDER_INTEL.first70Holding.toFixed(1)}%</strong></span>
        <span><ShieldCheck size={14}/><small>Creator / bundled</small><strong>{DEMO_HOLDER_INTEL.creatorShare.toFixed(1)}% / {DEMO_HOLDER_INTEL.bundledShare.toFixed(1)}%</strong></span>
        <span className="intel-risk"><small>Wallet intel</small><strong>{DEMO_HOLDER_INTEL.insiders} insiders · {DEMO_HOLDER_INTEL.snipers} snipers</strong></span>
        <span className="intel-demo"><small>Review market</small><strong>{token.symbol} demo replay</strong></span>
      </div>
    </section>
  );
}
