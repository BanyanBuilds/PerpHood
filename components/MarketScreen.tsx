"use client";

import Link from "next/link";
import { ArrowLeft, Bell, GripHorizontal, List, Share2, Star, Table2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { money, percent } from "@/lib/format";
import { KeyButton } from "./KeyButton";
import { MarketChart, type MarketChartLiveSnapshot } from "./MarketChart";
import { MarketAlertCenter } from "./MarketAlertCenter";
import { MarketLiveTape } from "./MarketLiveTape";
import { OgBadge } from "./OgBadge";
import { OpeningAuction } from "./OpeningAuction";
import { TerminalDataPanel, type TerminalTab } from "./TerminalDataPanel";
import { TokenAvatar } from "./TokenAvatar";
import { WorkspaceTradeTicket } from "./WorkspaceTradeTicket";
import { useMarkets } from "./MarketProvider";

type TicketMode = "buy" | "sell" | "long" | "short";
const AMOUNTS = [0.01, 0.025, 0.05, 0.1];
const LEVERAGES = [2, 5, 10, 20];
const LOWER_TABS: readonly TerminalTab[] = ["Tape", "Pulse", "Positions", "Orders", "BattlePool", "Holders", "Top traders", "Token info"];

export function MarketScreen({ slug }: { slug: string }) {
  const { tokens, getToken, watchlist, toggleWatchlist } = useMarkets();
  const token = getToken(slug);
  const exists = tokens.some((item) => item.slug === slug);
  const watched = watchlist.includes(token.slug);
  const chartStackRef = useRef<HTMLDivElement>(null);
  const [ticketMode, setTicketMode] = useState<TicketMode>("long");
  const [quickAmount, setQuickAmount] = useState(0.05);
  const [quickLeverage, setQuickLeverage] = useState(10);
  const [ticketVersion, setTicketVersion] = useState(0);
  const [showSideTape, setShowSideTape] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [bottomHeight, setBottomHeight] = useState(245);
  const [resizing, setResizing] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertUnread, setAlertUnread] = useState(0);
  const [liveSnapshot, setLiveSnapshot] = useState<MarketChartLiveSnapshot>({ price: token.price, marketCap: token.cap, sequence: 0, updatedAt: Date.now() });
  const handleLiveSnapshot = useCallback((snapshot: MarketChartLiveSnapshot) => setLiveSnapshot((current) => current.sequence === snapshot.sequence && current.price === snapshot.price ? current : snapshot), []);

  useEffect(() => {
    const sideTape = localStorage.getItem("perphood-v37-side-tape");
    const lower = localStorage.getItem("perphood-v37-lower-panel");
    const savedHeight = Number(localStorage.getItem("perphood-v37-lower-height"));
    if (sideTape !== null) setShowSideTape(sideTape === "true");
    if (lower !== null) setShowBottomPanel(lower === "true");
    if (Number.isFinite(savedHeight) && savedHeight >= 160) setBottomHeight(savedHeight);
  }, []);

  useEffect(() => localStorage.setItem("perphood-v37-side-tape", String(showSideTape)), [showSideTape]);
  useEffect(() => localStorage.setItem("perphood-v37-lower-panel", String(showBottomPanel)), [showBottomPanel]);
  useEffect(() => localStorage.setItem("perphood-v37-lower-height", String(Math.round(bottomHeight))), [bottomHeight]);

  const selectTradeMode = (mode: TicketMode) => {
    setTicketMode(mode);
    setTicketVersion((value) => value + 1);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (event.shiftKey && key === "s") selectTradeMode("sell");
      else if (key === "b") selectTradeMode("buy");
      else if (key === "l") selectTradeMode("long");
      else if (key === "s") selectTradeMode("short");
      else if (["1", "2", "3", "4"].includes(key)) {
        setQuickAmount(AMOUNTS[Number(key) - 1]);
        setTicketVersion((value) => value + 1);
      } else if (["q", "w", "e", "r"].includes(key)) {
        setQuickLeverage(LEVERAGES[["q", "w", "e", "r"].indexOf(key)]);
        setTicketVersion((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizing(true);
  };

  const resize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!resizing || !chartStackRef.current) return;
    const rect = chartStackRef.current.getBoundingClientRect();
    const max = Math.max(180, rect.height - 300);
    setBottomHeight(Math.max(160, Math.min(max, rect.bottom - event.clientY)));
  };

  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
  };

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: `${token.symbol} on PerpHood`, text: `Trade ${token.symbol} on PerpHood.`, url });
    else await navigator.clipboard.writeText(url);
  };

  if (!exists) return <main className="market-unavailable page-shell"><section className="empty-state glass-panel"><span>◎</span><h1>Market unavailable</h1><p>This market is not available from the connected Robinhood Chain data source.</p><Link href="/">Return to PerpHood</Link></section></main>;

  return <main className="terminal-page market-workspace-page v37-clean-chart-page">
    <div className="terminal-pair-bar market-workspace-commandbar v37-commandbar">
      <div className="terminal-pair-left">
        <Link href="/" className="terminal-back" aria-label="Back to PerpHood"><ArrowLeft size={17} /></Link>
        <TokenAvatar token={token} size="sm" />
        <span className="terminal-pair-name"><strong>{token.symbol}<OgBadge token={token} compact /><em>/WETH</em></strong><small>{token.name}</small></span>
        <span className="terminal-live-price"><b>${liveSnapshot.price.toFixed(10)}</b><small className={token.change24h >= 0 ? "positive" : "negative"}>{percent(token.change24h)}</small></span>
      </div>
      <div className="terminal-pair-metrics v37-pair-metrics">
        <span><small>Market cap</small><b>{money(liveSnapshot.marketCap)}</b></span>
        <span><small>Liquidity</small><b>{(token.liquidityEth ?? 0).toFixed(2)} ETH</b></span>
        <span><small>Volume</small><b>{money(token.volume24h)}</b></span>
        <span><small>Perp OI</small><b>{money(token.openInterest)}</b></span>
        <span><small>Funding</small><b className={token.funding >= 0 ? "positive" : "negative"}>{token.funding >= 0 ? "+" : ""}{token.funding.toFixed(4)}%</b></span>
      </div>
      <div className="terminal-pair-actions v37-view-actions">
        <button type="button" className={showSideTape ? "active" : ""} onClick={() => setShowSideTape((value) => !value)} title="Toggle live trades beside chart"><List size={16} /><span>Trades</span></button>
        <button type="button" className={showBottomPanel ? "active" : ""} onClick={() => setShowBottomPanel((value) => !value)} title="Toggle lower data panel"><Table2 size={16} /><span>Panel</span></button>
        <button type="button" onClick={() => toggleWatchlist(token.slug)} className={watched ? "active" : ""} aria-label="Watch market"><Star size={16} fill={watched ? "currentColor" : "none"} /></button>
        <button type="button" onClick={share} aria-label="Share market"><Share2 size={16} /></button>
        <button type="button" onClick={() => setAlertsOpen((value) => !value)} className={alertsOpen ? "active v38-alert-button" : "v38-alert-button"} aria-label="Market alerts"><Bell size={16} />{alertUnread > 0 && <em>{Math.min(99, alertUnread)}</em>}</button>
      </div>
    </div>

    <MarketAlertCenter token={token} marketCap={liveSnapshot.marketCap} open={alertsOpen} onClose={() => setAlertsOpen(false)} onUnreadChange={setAlertUnread} />

    {token.launchState === "auction" ? <OpeningAuction token={token} /> : <div className={`v37-market-shell ${showSideTape ? "with-side-tape" : ""}`}>
      <section className="v37-chart-workspace">
        <div className="v37-chart-and-tape">
          <div ref={chartStackRef} className={`v37-chart-stack ${showBottomPanel ? "with-bottom-panel" : ""}`} style={{ gridTemplateRows: showBottomPanel ? `minmax(280px,1fr) 8px ${bottomHeight}px` : "minmax(0,1fr)" }}>
            <MarketChart token={token} onLiveSnapshot={handleLiveSnapshot} />
            {showBottomPanel && <button type="button" className={`v37-chart-resizer ${resizing ? "resizing" : ""}`} onPointerDown={startResize} onPointerMove={resize} onPointerUp={finishResize} onPointerCancel={finishResize} onDoubleClick={() => setBottomHeight(245)} aria-label="Resize chart and lower panel"><GripHorizontal size={18} /></button>}
            {showBottomPanel && <TerminalDataPanel token={token} tabs={LOWER_TABS} defaultTab="Tape" compact />}
          </div>
          {showSideTape && <MarketLiveTape token={token} onClose={() => setShowSideTape(false)} />}
        </div>
      </section>

      <WorkspaceTradeTicket token={token} requestedMode={ticketMode} requestedAmount={quickAmount} requestedLeverage={quickLeverage} version={ticketVersion} />
    </div>}

    <footer className="terminal-status-bar v35-status-bar v37-status-bar"><span><i />Robinhood Chain</span><span>1s candles</span><span>Executable PNL</span><span>One BattlePool</span><b>{showSideTape ? "Trades visible" : "Chart wide"} · {showBottomPanel ? `${Math.round(bottomHeight)}px panel` : "Panel hidden"}</b></footer>

    <div className="mobile-terminal-actions glass-panel">
      <KeyButton compact onClick={() => selectTradeMode("buy")}>Buy</KeyButton>
      <KeyButton compact tone="red" onClick={() => selectTradeMode("sell")}>Sell</KeyButton>
      <KeyButton compact tone="green" onClick={() => selectTradeMode("long")}>Long</KeyButton>
      <KeyButton compact tone="red" onClick={() => selectTradeMode("short")}>Short</KeyButton>
    </div>
  </main>;
}
