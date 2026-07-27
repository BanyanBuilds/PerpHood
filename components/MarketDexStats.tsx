"use client";

import { Activity, DatabaseZap, ShieldCheck, Users, WalletCards } from "lucide-react";
import type { Token } from "@/lib/types";

const WINDOWS = ["5m", "1h", "6h", "24h"] as const;

function compact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function MarketDexStats({ token }: { token: Token }) {
  const indexed = (token.uniqueTraders ?? 0) > 1 || token.volume24h > 0;
  return (
    <section className="market-dex-stats" aria-label="Market activity and holder intelligence">
      <div className="dex-window-grid">
        {WINDOWS.map((window) => <article key={window} className="dex-window-card">
          <header><strong>{window.toUpperCase()}</strong><em>{indexed ? "INDEXED" : "PENDING"}</em></header>
          <div>
            <span><small>Txns</small><b>{indexed && window === "24h" ? compact(token.uniqueTraders ?? 0) : "—"}</b></span>
            <span><small>Volume</small><b>{indexed && window === "24h" ? `$${compact(token.volume24h)}` : "—"}</b></span>
            <span><small>Traders</small><b>{indexed && window === "24h" ? compact(token.uniqueTraders ?? 0) : "—"}</b></span>
          </div>
          <footer><span>Awaiting canonical Robinhood Chain trade indexing</span></footer>
        </article>)}
      </div>
      <div className="market-intel-grid">
        <span><Users size={14}/><small>Holders</small><strong>—</strong></span>
        <span><WalletCards size={14}/><small>Top 10</small><strong>—</strong></span>
        <span><Activity size={14}/><small>First 70 held</small><strong>—</strong></span>
        <span><ShieldCheck size={14}/><small>Creator allocation</small><strong>Purchased only</strong></span>
        <span className="intel-risk"><DatabaseZap size={14}/><small>Wallet intelligence</small><strong>Indexer not connected</strong></span>
        <span className="intel-demo"><small>On-chain market</small><strong>{token.chainId === 4_663 ? "Robinhood mainnet" : "Robinhood testnet"}</strong></span>
      </div>
    </section>
  );
}
