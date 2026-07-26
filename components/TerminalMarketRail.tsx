"use client";

import Link from "next/link";
import { Flame, Search, Star, TrendingUp, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { money, percent } from "@/lib/format";
import { useMarkets } from "./MarketProvider";
import { TokenAvatar } from "./TokenAvatar";

export function TerminalMarketRail({ activeSlug }: { activeSlug: string }) {
  const { tokens, watchlist } = useMarkets();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"trending" | "new" | "watchlist">("trending");

  const markets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let source = [...tokens];
    if (mode === "new") source.sort((a, b) => a.launchedMinutesAgo - b.launchedMinutesAgo);
    else if (mode === "watchlist") source = source.filter((token) => watchlist.includes(token.slug));
    else source.sort((a, b) => (b.volume24h + Math.abs(b.change24h) * 900) - (a.volume24h + Math.abs(a.change24h) * 900));
    if (normalized) source = source.filter((token) => `${token.symbol} ${token.name}`.toLowerCase().includes(normalized));
    return source.slice(0, 14);
  }, [mode, query, tokens, watchlist]);

  return (
    <aside className="terminal-market-rail glass-panel" aria-label="Market navigator">
      <label className="terminal-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker or name" /></label>
      <div className="terminal-rail-tabs">
        <button className={mode === "trending" ? "active" : ""} onClick={() => setMode("trending")}><Flame size={13} />Hot</button>
        <button className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}><Zap size={13} />New</button>
        <button className={mode === "watchlist" ? "active" : ""} onClick={() => setMode("watchlist")}><Star size={13} />Watch</button>
      </div>
      <div className="terminal-rail-heading"><span>Market</span><span>MC / 24h</span></div>
      <div className="terminal-market-list">
        {markets.length ? markets.map((token) => (
          <Link key={token.slug} href={`/market/${token.slug}`} className={token.slug === activeSlug ? "active" : ""}>
            <TokenAvatar token={token} size="sm" />
            <span className="terminal-market-name"><b>{token.symbol}</b><small>{token.name}</small></span>
            <span className="terminal-market-price"><b>{token.launchState === "auction" ? "LEGACY" : money(token.cap)}</b><small className={token.launchState === "auction" ? "" : token.change24h >= 0 ? "positive" : "negative"}>{token.launchState === "auction" ? "RESET" : percent(token.change24h)}</small></span>
          </Link>
        )) : <div className="terminal-rail-empty"><TrendingUp size={18} /><span>No markets here yet.</span></div>}
      </div>
      <div className="terminal-rail-footer"><i><span />Awaiting data feed</i><b>{tokens.length} markets</b></div>
    </aside>
  );
}
