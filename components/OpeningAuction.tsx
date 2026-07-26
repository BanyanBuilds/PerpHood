"use client";

import { RefreshCcw, ShieldAlert } from "lucide-react";
import type { Token } from "@/lib/types";

export function OpeningAuction({ token, compact = false }: { token: Token; compact?: boolean }) {
  return (
    <section className={`opening-auction ${compact ? "opening-auction-compact" : ""}`}>
      <div className="auction-chart glass-panel">
        <div className="auction-zero-lockup">
          <ShieldAlert size={28} />
          <span>
            <small>Legacy V17 market</small>
            <strong>Auction execution is disabled</strong>
            <em>{token.symbol} must be reset or relaunched into the V20 adaptive BattlePool.</em>
          </span>
        </div>
        <p className="auction-chart-note"><RefreshCcw size={14} /> V20 launches directly near 0.25 ETH FDV with a minimum 0.001 ETH creator genesis buy.</p>
      </div>
    </section>
  );
}
