"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Gavel, Radio, Sparkles } from "lucide-react";
import { useMarkets } from "./MarketProvider";
import { money } from "@/lib/format";

function eventCopy(action: string) {
  if (action === "spot-buy") return "spot buy";
  if (action === "spot-sell") return "spot sell";
  if (action === "long") return "long opened";
  if (action === "short") return "short opened";
  if (action === "graduation") return "graduated";
  if (action === "whale-buy") return "whale buy";
  if (action === "whale-sell") return "whale sell";
  if (action === "short-squeeze") return "short squeeze";
  if (action === "long-squeeze") return "long squeeze";
  if (action === "auction-bid") return "opening bid";
  if (action === "market-open") return "market opened";
  return "liquidation";
}

export function ActivityTicker() {
  const { events, getToken } = useMarkets();
  const latest = events.slice(0, 7);
  return (
    <section className="live-tape glass-panel" aria-label="Live market activity">
      <div className="live-tape-label"><Radio size={15} /><span>LIVE</span></div>
      <div className="live-tape-track">
        {latest.length === 0 ? <span className="ticker-idle"><Sparkles size={14} />Waiting for the first trade…</span> : latest.map((event) => {
          const token = getToken(event.slug);
          const auction = event.action === "auction-bid" || event.action === "market-open";
          const up = auction || event.action === "spot-buy" || event.action === "long" || event.action === "graduation" || event.action === "whale-buy" || event.action === "short-squeeze";
          return <Link href={`/market/${event.slug}`} key={event.id} className="ticker-event">
            {auction ? <Gavel size={14} /> : up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            <b>{token.symbol}</b><span>{eventCopy(event.action)}</span>
            {event.amountEth > 0 && <strong>{event.amountEth.toFixed(3)} ETH</strong>}
            <small>{event.marketCap > 0 ? money(event.marketCap) : "BattlePool genesis"}</small>
          </Link>;
        })}
      </div>
    </section>
  );
}
