"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Gavel, Star } from "lucide-react";
import { compact, money, percent } from "@/lib/format";
import type { Token } from "@/lib/types";
import { KeyButton } from "./KeyButton";
import { SentimentBar } from "./SentimentBar";
import { TokenAvatar } from "./TokenAvatar";
import { OgBadge } from "./OgBadge";
import { useMarkets } from "./MarketProvider";

export function TokenCard({ token, compactCard = false }: { token: Token; compactCard?: boolean }) {
  const { watchlist, toggleWatchlist } = useMarkets();
  const watched = watchlist.includes(token.slug);
  const opening = token.launchState === "auction";

  if (compactCard) {
    return (
      <Link href={`/market/${token.slug}`} className="compact-token-card glass-panel">
        <TokenAvatar token={token} size="sm" />
        <span><strong>{token.symbol} <OgBadge token={token} compact /></strong><small>{opening ? "Legacy V17 market" : token.name}</small></span>
        <b>{opening ? "$0" : `${token.longs}%`}</b>
      </Link>
    );
  }

  return (
    <article className={`token-card glass-panel ${opening ? "opening-token-card" : ""}`}>
      <button className={`watch-star ${watched ? "active" : ""}`} aria-label={watched ? "Remove from watchlist" : "Add to watchlist"} onClick={() => toggleWatchlist(token.slug)}><Star size={16} fill={watched ? "currentColor" : "none"} /></button>
      <Link href={`/market/${token.slug}`} className="token-card-main">
        <div className="token-card-head">
          <TokenAvatar token={token} />
          <span className="token-name"><strong>{token.symbol} <OgBadge token={token} compact /></strong><small>{token.name}</small></span>
          <b className={opening ? "auction-card-badge" : token.change24h >= 0 ? "positive" : "negative"}>{opening ? "OPENING" : percent(token.change24h)}</b>
        </div>
        <div className="token-card-data">
          <span><strong>{opening ? "$0" : money(token.cap)}</strong><small>{opening ? "Starting market cap" : "Market cap"}</small></span>
          {opening ? <span className="graduation-copy"><small>Committed <b>{(token.auctionCommittedEth ?? 0).toFixed(3)} ETH</b></small><i><em className="auction-progress-bar" style={{ width: `${Math.max(4, Math.min(100, (token.auctionCommittedEth ?? 0) / 0.2 * 100))}%` }} /></i></span> : <span className="graduation-copy"><small>Graduation <b>{token.graduation.toFixed(0)}%</b></small><i><em style={{ width: `${token.graduation}%` }} /></i></span>}
        </div>
        {opening ? <div className="opening-card-copy"><Gavel size={14} /><span><strong>The crowd sets the first price.</strong><small>{token.auctionParticipants ?? 0} participants · same clearing price</small></span></div> : <SentimentBar longs={Math.round(token.longs)} compact />}
        <div className={`mini-chart ${opening ? "auction-mini-chart" : ""}`} aria-hidden="true">
          {Array.from({ length: 24 }, (_, index) => <i key={index} style={{ height: `${opening ? 10 + index * .9 : 16 + Math.abs(Math.sin(index * 0.73 + token.hue + token.cap / 10_000)) * 26}px` }} />)}
        </div>
      </Link>
      {opening ? <div className="token-card-actions opening-card-action"><Link href={`/market/${token.slug}`}><KeyButton full tone="green"><Gavel size={15} />Join opening</KeyButton></Link></div> : <div className="token-card-actions">
        <Link href={`/market/${token.slug}?side=buy`}><KeyButton compact>Buy</KeyButton></Link>
        <Link href={`/market/${token.slug}?side=long`}><KeyButton compact tone="green"><ArrowUpRight size={15} />Long</KeyButton></Link>
        <Link href={`/market/${token.slug}?side=short`}><KeyButton compact tone="red"><ArrowDownRight size={15} />Short</KeyButton></Link>
      </div>}
      <span className="token-card-volume">{opening ? `${(token.auctionCommittedEth ?? 0).toFixed(3)} ETH opening demand` : `24h ${compact(token.volume24h)} volume · ${compact(token.openInterest)} OI`}</span>
    </article>
  );
}
