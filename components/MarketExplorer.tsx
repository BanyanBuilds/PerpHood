"use client";

import { Search, SlidersHorizontal, Star, Swords, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { MarketShelf } from "./MarketShelf";
import { TokenCard } from "./TokenCard";
import { useMarkets } from "./MarketProvider";

const FILTERS = [
  ["all", "All"], ["opening", "Bonding pools"], ["new", "New"], ["trending", "Trending"], ["20x", "20× Live"],
  ["near", "Near graduation"], ["long", "Most longed"], ["short", "Most shorted"], ["watchlist", "Watchlist"],
] as const;

export function MarketExplorer() {
  const { tokens, watchlist } = useMarkets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("all");

  const results = useMemo(() => {
    let list = [...tokens];
    if (query.trim()) {
      const value = query.toLowerCase();
      list = list.filter((token) => `${token.symbol} ${token.name} ${token.description}`.toLowerCase().includes(value));
    }
    if (filter === "opening") list = list.filter((token) => token.battlePhase === "bonding").sort((a, b) => a.launchedMinutesAgo - b.launchedMinutesAgo);
    if (filter === "new") list.sort((a, b) => a.launchedMinutesAgo - b.launchedMinutesAgo);
    if (filter === "trending") list.sort((a, b) => (b.volume24h * Math.max(1, b.change24h + 20)) - (a.volume24h * Math.max(1, a.change24h + 20)));
    if (filter === "20x") list = list.filter((token) => token.launchState !== "auction" && (token.graduation >= 35 || token.openInterest >= 40_000)).sort((a, b) => b.openInterest - a.openInterest);
    if (filter === "near") list = list.filter((token) => token.launchState !== "auction" && token.graduation >= 60 && token.graduation < 100).sort((a, b) => b.graduation - a.graduation);
    if (filter === "long") list = list.filter((token) => token.launchState !== "auction").sort((a, b) => b.longs - a.longs);
    if (filter === "short") list = list.filter((token) => token.launchState !== "auction").sort((a, b) => a.longs - b.longs);
    if (filter === "watchlist") list = list.filter((token) => watchlist.includes(token.slug));
    return list;
  }, [filter, query, tokens, watchlist]);

  const isBrowsing = Boolean(query.trim()) || filter !== "all";
  const opening = tokens.filter((token) => token.battlePhase === "bonding");
  const live = tokens.filter((token) => token.launchState !== "auction");

  return (
    <div id="markets" className="market-explorer">
      <section className="market-toolbar glass-panel">
        <label className="market-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets, tickers, or memes" /></label>
        <div className="filter-scroll" aria-label="Market filters">
          {FILTERS.map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
            {value === "opening" && <Swords size={13} />}{value === "20x" && <Zap size={13} />}{value === "long" && <TrendingUp size={13} />}{value === "short" && <TrendingDown size={13} />}{value === "watchlist" && <Star size={13} />}{value === "all" && <SlidersHorizontal size={13} />}{label}
          </button>)}
        </div>
      </section>

      {isBrowsing ? <section className="search-results">
        <div className="results-heading"><h2>{filter === "watchlist" ? "Your watchlist" : query ? `Results for “${query}”` : FILTERS.find(([value]) => value === filter)?.[1]}</h2><span>{results.length} markets</span></div>
        {results.length ? <div className="token-grid search-token-grid">{results.map((token) => <TokenCard key={token.slug} token={token} />)}</div> : <div className="no-market-results glass-panel"><Star size={28} /><h3>Nothing here yet</h3><p>{filter === "watchlist" ? "Tap the star on any market card to keep it here." : "Try another search or category."}</p></div>}
      </section> : <>
        {opening.length > 0 && <MarketShelf title="Bonding BattlePools" tokens={opening.slice(0, 4)} />}
        <MarketShelf title="Featured" tokens={live.filter((token) => token.featured).slice(0, 4).concat(live.filter((token) => !token.featured).slice(0, 4)).slice(0, 4)} />
        <MarketShelf title="New" tokens={[...tokens].sort((a, b) => a.launchedMinutesAgo - b.launchedMinutesAgo).slice(0, 4)} />
        <MarketShelf title="Near Graduation" tokens={[...live].filter((token) => token.graduation < 100).sort((a, b) => b.graduation - a.graduation).slice(0, 4)} />
        <div className="split-shelves"><MarketShelf title="20× Live" compact tokens={[...live].sort((a, b) => b.openInterest - a.openInterest).slice(0, 4)} /><MarketShelf title="Most Longed" compact tokens={[...live].sort((a, b) => b.longs - a.longs).slice(0, 4)} /></div>
      </>}
    </div>
  );
}
