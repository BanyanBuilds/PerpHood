"use client";

import { Activity, Eye, Settings2, Star, Swords } from "lucide-react";
import Link from "next/link";
import { forwardRef, useCallback, useMemo, useRef, useState } from "react";
import { money } from "@/lib/format";
import type { Token } from "@/lib/types";
import { useMarkets } from "./MarketProvider";
import { TokenAvatar } from "./TokenAvatar";
import { useOutsideDismiss } from "./useOutsideDismiss";

export type PositionWatchStripSettings = {
  showPositions: boolean;
  showWatchlist: boolean;
  showPnl: boolean;
  showMarketCap: boolean;
  maxPositions: number;
  maxWatchlist: number;
  compact: boolean;
};

type StripProps = {
  settings: PositionWatchStripSettings;
  onSettingsChange: (settings: PositionWatchStripSettings) => void;
  onOpenPositions: () => void;
  onOpenWatchlist: () => void;
  onTrade: (token: Token, side: "long" | "short") => void;
};

export function TerminalPositionWatchStrip({ settings, onSettingsChange, onOpenPositions, onOpenWatchlist, onTrade }: StripProps) {
  const { tokens, positions, watchlist, getPositionPnl } = useMarkets();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useOutsideDismiss([buttonRef, popoverRef], closeSettings, settingsOpen);
  const tokenBySlug = useMemo(() => new Map(tokens.map((token) => [token.slug, token])), [tokens]);
  const watched = useMemo(() => watchlist.map((slug) => tokenBySlug.get(slug)).filter((token): token is Token => Boolean(token)), [tokenBySlug, watchlist]);
  const patch = (next: Partial<PositionWatchStripSettings>) => onSettingsChange({ ...settings, ...next });

  if (!settings.showPositions && !settings.showWatchlist) {
    return <section className="terminal-position-watch-strip collapsed"><button ref={buttonRef} className="strip-settings-button" onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={14} />Restore strip</button>{settingsOpen && <StripSettings ref={popoverRef} settings={settings} patch={patch} />}</section>;
  }

  return (
    <section className={`terminal-position-watch-strip ${settings.compact ? "compact" : ""}`} aria-label="Positions and watchlist">
      {settings.showPositions && <>
        <button className="strip-section-button" onClick={onOpenPositions} title="Open all positions">
          <Swords size={14} />
          <strong>Positions</strong>
          <span>{positions.length}</span>
        </button>

        <div className="strip-scroll" role="list">
          {positions.length ? positions.slice(0, settings.maxPositions).map((position) => {
            const token = tokenBySlug.get(position.slug);
            if (!token) return null;
            const pnl = getPositionPnl(position).pnlEth;
            return (
              <button className="strip-position-chip" key={position.id} onClick={onOpenPositions} role="listitem" title={`Open ${position.leverage}× ${position.direction} position`}>
                <TokenAvatar token={token} size="sm" />
                <span><b>{token.symbol}</b><small>{position.leverage}× {position.direction.toUpperCase()}</small></span>
                {settings.showPnl && <em className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(4)}Ξ</em>}
              </button>
            );
          }) : <span className="strip-empty"><Activity size={13} />No open positions</span>}
        </div>
      </>}

      {settings.showWatchlist && <>
        <button className="strip-section-button watch" onClick={onOpenWatchlist} title="Open full watchlist">
          <Star size={14} />
          <strong>Watchlist</strong>
          <span>{watched.length}</span>
        </button>

        <div className="strip-watch-scroll" role="list">
          {watched.length ? watched.slice(0, settings.maxWatchlist).map((token) => (
            <div className="strip-watch-chip" key={token.slug} role="listitem">
              <Link href={`/market/${token.slug}`} title={`Open ${token.symbol}`}><TokenAvatar token={token} size="sm" /><span><b>{token.symbol}</b>{settings.showMarketCap && <small>{money(token.cap)}</small>}</span></Link>
              <button onClick={() => onTrade(token, "long")} title={`Long ${token.symbol}`}><Eye size={12} /></button>
            </div>
          )) : <span className="strip-empty"><Star size={13} />Star markets to pin them here</span>}
        </div>
      </>}

      <button ref={buttonRef} className={settingsOpen ? "strip-settings-button active" : "strip-settings-button"} onClick={() => setSettingsOpen((open) => !open)} title="Configure positions and watchlist strip"><Settings2 size={14} /></button>
      {settingsOpen && <StripSettings ref={popoverRef} settings={settings} patch={patch} />}
    </section>
  );
}


const StripSettings = forwardRef<HTMLDivElement, { settings: PositionWatchStripSettings; patch: (next: Partial<PositionWatchStripSettings>) => void }>(function StripSettings({ settings, patch }, ref) {
  return <div ref={ref} className="strip-settings-popover">
    <header><strong>Positions + watchlist strip</strong><small>Saved independently from column presets</small></header>
    <Toggle label="Show positions" value={settings.showPositions} onChange={(showPositions) => patch({ showPositions })} />
    <Toggle label="Show watchlist" value={settings.showWatchlist} onChange={(showWatchlist) => patch({ showWatchlist })} />
    <Toggle label="Show executable PNL" value={settings.showPnl} onChange={(showPnl) => patch({ showPnl })} />
    <Toggle label="Show watchlist market cap" value={settings.showMarketCap} onChange={(showMarketCap) => patch({ showMarketCap })} />
    <Toggle label="Compact strip" value={settings.compact} onChange={(compact) => patch({ compact })} />
    <label><span>Position chips</span><input type="number" min={1} max={16} value={settings.maxPositions} onChange={(event) => patch({ maxPositions: Math.max(1, Math.min(16, Number(event.target.value))) })} /></label>
    <label><span>Watchlist chips</span><input type="number" min={1} max={24} value={settings.maxWatchlist} onChange={(event) => patch({ maxWatchlist: Math.max(1, Math.min(24, Number(event.target.value))) })} /></label>
  </div>;
});

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <button className="strip-setting-toggle" onClick={() => onChange(!value)}><span>{label}</span><i className={value ? "on" : ""}><b /></i></button>;
}
