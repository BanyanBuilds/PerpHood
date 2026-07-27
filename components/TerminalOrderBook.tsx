"use client";

import { BookOpen, DatabaseZap } from "lucide-react";
import type { Token } from "@/lib/types";

type SpotAction = "buy" | "sell";

export function TerminalOrderBook({ token, onQuick }: { token: Token; onQuick: (side: SpotAction) => void }) {
  return (
    <section className="terminal-orderbook glass-panel" aria-label="Market depth">
      <header className="orderbook-header">
        <div><BookOpen size={14} /><strong>Market depth</strong><span>{token.chainMarketAddress ? "ON-CHAIN" : "OFFLINE"}</span></div>
      </header>
      <div className="tracker-empty">
        <DatabaseZap size={22} />
        <strong>Canonical depth is not indexed yet</strong>
        <p>LEVERAGE X will not fabricate bids, asks, spread, or liquidity rows.</p>
        {token.chainMarketAddress && <div className="depth-actions"><button onClick={() => onQuick("buy")}>Spot buy</button><button onClick={() => onQuick("sell")}>Spot sell</button></div>}
      </div>
    </section>
  );
}
