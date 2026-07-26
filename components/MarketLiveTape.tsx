"use client";

import { X } from "lucide-react";
import { money } from "@/lib/format";
import type { MarketEvent, Token } from "@/lib/types";
import { useMarkets } from "./MarketProvider";

function isBuyPrint(event: MarketEvent) {
  return event.action === "market-open" || event.action === "auction-bid" || event.action === "spot-buy" || event.action === "long" || event.action === "whale-buy" || event.action === "short-squeeze";
}

function age(createdAt: number) {
  const seconds = Math.max(1, Math.floor((Date.now() - createdAt) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
}

export function MarketLiveTape({ token, onClose }: { token: Token; onClose: () => void }) {
  const { getEvents } = useMarkets();
  const events = getEvents(token.slug).slice(0, 28);

  return <aside className="v37-live-tape" aria-label="Live market trades">
    <header>
      <span><strong>Live trades</strong><small>Public tape shows Buy / Sell only</small></span>
      <button type="button" onClick={onClose} aria-label="Close live trades"><X size={15} /></button>
    </header>
    <div className="v37-tape-head"><span>Side</span><span>ETH</span><span>MC</span><span>Age</span></div>
    <div className="v37-tape-list">
      {events.length ? events.map((event) => {
        const buy = isBuyPrint(event);
        return <div key={event.id}>
          <b className={buy ? "positive" : "negative"}>{buy ? "Buy" : "Sell"}</b>
          <span>{event.amountEth.toFixed(3)}</span>
          <span>{money(event.marketCap)}</span>
          <small title={event.transactionHash ?? undefined}>{event.blockNumber ? `#${event.blockNumber}` : age(event.createdAt)}</small>
        </div>;
      }) : <p>Live executions appear here.</p>}
    </div>
  </aside>;
}
