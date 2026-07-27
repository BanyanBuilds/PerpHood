"use client";

import { ArrowDownRight, ArrowUpRight, Clock3, Search, TrendingUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import type { Token } from "@/lib/types";
import { money, percent } from "@/lib/format";
import { normalizeTickerQuery, searchTickerMarkets, sortMarketCapLeaders, sortTickerLineage } from "@/lib/ticker-search";
import { TokenAvatar } from "./TokenAvatar";
import { OgBadge } from "./OgBadge";

function ageLabel(token: Token) {
  const minutes = token.launchedMinutesAgo;
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function SearchResultRow({ token, onSelect }: { token: Token; onSelect: (token: Token) => void }) {
  return (
    <button className="ticker-search-result" onClick={() => onSelect(token)}>
      <TokenAvatar token={token} size="sm" />
      <span className="ticker-search-identity">
        <span><strong>${token.symbol}</strong><OgBadge token={token} compact />{token.isTickerOrigin && <em>FIRST TICKER</em>}</span>
        <small>{token.name}</small>
      </span>
      <span className="ticker-search-age"><Clock3 size={11} />{ageLabel(token)}</span>
      <span className="ticker-search-market">
        <strong>{money(token.cap)}</strong>
        <small className={token.change24h >= 0 ? "positive" : "negative"}>
          {token.change24h >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{percent(token.change24h)}
        </small>
      </span>
    </button>
  );
}

export function TerminalSearchOverlay({
  open,
  query,
  setQuery,
  tokens,
  onClose,
}: {
  open: boolean;
  query: string;
  setQuery: (value: string) => void;
  tokens: Token[];
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const normalized = normalizeTickerQuery(query);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  const matches = useMemo(() => searchTickerMarkets(tokens, query), [query, tokens]);
  const lineage = useMemo(() => sortTickerLineage(matches), [matches]);
  const marketLeaders = useMemo(() => sortMarketCapLeaders(matches), [matches]);

  if (!open) return null;

  const select = (token: Token) => {
    onClose();
    router.push(`/market/${token.slug}`);
  };

  return (
    <div className="ticker-search-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="ticker-search-modal" role="dialog" aria-modal="true" aria-label="Search LEVERAGE X markets">
        <header className="ticker-search-head">
          <Search size={20} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type $TICKER, token name, or contract"
            spellCheck={false}
          />
          <kbd>ESC</kbd>
          <button onClick={onClose} aria-label="Close search"><X size={18} /></button>
        </header>

        <div className="ticker-search-explainer">
          <span><strong>Two truths at once.</strong> Find the ticker origin on the left and the market currently winning on the right.</span>
          <span><span className="search-og-sample">OG</span> = first observed ticker + artwork pairing</span>
        </div>

        {!normalized ? (
          <div className="ticker-search-empty">
            <Search size={28} />
            <strong>Search any ticker lineage</strong>
            <span>Try <b>$COIN</b>. LEVERAGE X will separate the oldest listings from the highest-market-cap listings.</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="ticker-search-empty">
            <Search size={28} />
            <strong>No matching live markets</strong>
            <span>The Robinhood Chain indexer has not returned a token matching <b>${normalized.toUpperCase()}</b>.</span>
          </div>
        ) : (
          <div className="ticker-search-columns">
            <section className="ticker-search-column">
              <header><span><Clock3 size={14} /><strong>Ticker lineage</strong></span><small>Oldest → newest · origin always first</small></header>
              <div>{lineage.map((token) => <SearchResultRow key={`lineage-${token.slug}`} token={token} onSelect={select} />)}</div>
            </section>
            <section className="ticker-search-column">
              <header><span><TrendingUp size={14} /><strong>Market-cap leaders</strong></span><small>Largest → smallest · see what is pumping now</small></header>
              <div>{marketLeaders.map((token) => <SearchResultRow key={`cap-${token.slug}`} token={token} onSelect={select} />)}</div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
