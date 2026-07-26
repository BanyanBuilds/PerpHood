"use client";

import Link from "next/link";
import { ArrowUpRight, BarChart3, Flame, Heart, Search, ShieldCheck, Sparkles, Star, TrendingUp, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { compact, money, percent } from "@/lib/format";
import type { Token } from "@/lib/types";
import { analyzeMarket } from "@/lib/market-intelligence";
import { useMarkets } from "./MarketProvider";
import { TokenAvatar } from "./TokenAvatar";
import { OgBadge } from "./OgBadge";

const FILTERS = ["Trending", "New", "Momentum", "Most liked", "Whale heat", "Perps"] as const;
type Filter = (typeof FILTERS)[number];

function likesFor(token: Token) {
  return Math.max(7, Math.round((token.uniqueTraders ?? 12) * 1.9 + Math.abs(token.change24h) * 2.4));
}

function stateEmoji(state: ReturnType<typeof analyzeMarket>["state"]) {
  return state === "Ignition" ? "🌱" : state === "Expansion" ? "🚀" : state === "Parabolic" ? "🔥" : state === "Distribution" ? "⚖️" : state === "Collapse" ? "📉" : state === "Recovery" ? "♻️" : state === "Dormant" ? "👻" : "💀";
}

export function MoversPage() {
  const { tokens, watchlist, toggleWatchlist, buySpot, connected, toggleWallet } = useMarkets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Trending");
  const [liked, setLiked] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  const markets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = tokens.filter((token) => token.launchState !== "auction" && (!needle || `${token.name} ${token.symbol} ${token.slug}`.toLowerCase().includes(needle)));
    return [...list].sort((a, b) => {
      if (filter === "New") return a.launchedMinutesAgo - b.launchedMinutesAgo;
      if (filter === "Momentum") return analyzeMarket(b).momentum - analyzeMarket(a).momentum;
      if (filter === "Most liked") return likesFor(b) - likesFor(a);
      if (filter === "Whale heat") return (b.volume24h / Math.max(1, b.uniqueTraders ?? 1)) - (a.volume24h / Math.max(1, a.uniqueTraders ?? 1));
      if (filter === "Perps") return b.openInterest - a.openInterest;
      return analyzeMarket(b).composite - analyzeMarket(a).composite;
    }).slice(0, 15);
  }, [filter, query, tokens]);

  const quickBuy = async (token: Token) => {
    const contractExecution = (token.chainDeploymentMode === "anvil-v43" || token.chainDeploymentMode === "anvil-v45") && Boolean(token.chainMarketAddress);
    if (!connected && !contractExecution) {
      toggleWallet();
      setNotice("Wallet connected — Quick Buy again to place 0.01 ETH.");
    } else {
      try {
        await buySpot(token.slug, 0.01);
        setNotice(`Bought 0.01 ETH of ${token.symbol}`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Quick Buy failed");
      }
    }
    window.setTimeout(() => setNotice(""), 2600);
  };

  return <main className="movers-page movers-v12 page-shell">
    <section className="movers-v12-head">
      <div>
        <span className="eyebrow">PERPHOOD · ROBINHOOD CHAIN</span>
        <h1>Meet the market.</h1>
      </div>
      <div className="movers-v12-actions">
        <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search token, ticker, or contract" /></label>
        <Link href="/terminal"><BarChart3 size={16} />Markets</Link>
        <Link href="/terminal?panel=launch"><Sparkles size={16} />Launch</Link>
      </div>
    </section>

    <nav className="movers-v12-filters" aria-label="Mover filters">
      {FILTERS.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item === "Trending" && <Flame size={13} />}{item === "Momentum" && <TrendingUp size={13} />}{item === "Most liked" && <Heart size={13} />}{item}</button>)}
      <span>{markets.length} live markets</span>
    </nav>

    <section className="movers-card-grid">
      {markets.map((token, index) => <MoverCard key={token.slug} token={token} rank={index + 1} liked={liked.includes(token.slug)} watched={watchlist.includes(token.slug)} onLike={() => setLiked((current) => current.includes(token.slug) ? current.filter((slug) => slug !== token.slug) : [...current, token.slug])} onWatch={() => toggleWatchlist(token.slug)} onQuickBuy={() => { void quickBuy(token); }} />)}
    </section>

    {notice && <div className="movers-buy-notice"><Zap size={14} />{notice}</div>}
  </main>;
}

function MoverCard({ token, rank, liked, watched, onLike, onWatch, onQuickBuy }: { token: Token; rank: number; liked: boolean; watched: boolean; onLike: () => void; onWatch: () => void; onQuickBuy: () => void }) {
  const intel = analyzeMarket(token);
  const likes = likesFor(token) + (liked ? 1 : 0);

  return <article className="mover-art-card">
    <Link href={`/market/${token.slug}`} className="mover-art-link" aria-label={`Open ${token.name} chart`}>
      <div className="mover-art-stage">
        <TokenAvatar token={token} size="xl" />
        <span className="mover-rank">#{rank}</span>
        <span className={`mover-change ${token.change24h >= 0 ? "positive" : "negative"}`}>{percent(token.change24h)}</span>
        <div className="mover-art-badges"><OgBadge token={token} compact /><span className={`risk-${intel.grade.toLowerCase().replace("+", "plus")}`}><ShieldCheck size={10} />{intel.grade}</span></div>
        <div className="mover-hover-actions" onClick={(event) => event.preventDefault()}>
          <button className={liked ? "active" : ""} onClick={(event) => { event.preventDefault(); onLike(); }} aria-label={`Like ${token.name}`}><Heart size={14} fill={liked ? "currentColor" : "none"} /></button>
          <button className={watched ? "active watch" : ""} onClick={(event) => { event.preventDefault(); onWatch(); }} aria-label={`Watch ${token.name}`}><Star size={14} fill={watched ? "currentColor" : "none"} /></button>
          <button className="quick-buy" onClick={(event) => { event.preventDefault(); onQuickBuy(); }}><Zap size={14} />Buy</button>
          <span><ArrowUpRight size={14} />Chart</span>
        </div>
      </div>
      <div className="mover-card-copy">
        <div className="mover-token-title"><strong>{token.name}</strong><span>{token.symbol}</span></div>
        <div className="mover-market-line"><b>{money(token.cap)}</b><small>MC</small><em className={token.change24h >= 0 ? "positive" : "negative"}>{percent(token.change24h)}</em></div>
        <div className="mover-meta-line"><span>{stateEmoji(intel.state)} {intel.state}</span><span><Heart size={10} fill={liked ? "currentColor" : "none"} />{likes}</span><span>{compact(token.volume24h)} vol</span></div>
      </div>
    </Link>
  </article>;
}
