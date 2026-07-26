"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock3, Coins, Download, ListOrdered, Share2, WalletCards, X } from "lucide-react";
import { Header } from "@/components/Header";
import { KeyButton } from "@/components/KeyButton";
import { MobileDock } from "@/components/MobileDock";
import { PositionLadder } from "@/components/PositionLadder";
import { TokenAvatar } from "@/components/TokenAvatar";
import { useMarkets } from "@/components/MarketProvider";
import { money, percent } from "@/lib/format";
import type { ClosedTrade, Position, Token } from "@/lib/types";

export default function PositionsPage() {
  const { positions, holdings, closedTrades, pendingOrders, getToken, getPositionPnl, getHoldingPnl, closePosition, addCollateral, sellHolding, cancelOrder, balanceEth } = useMarkets();
  const [view, setView] = useState<"perps" | "orders" | "spot" | "history">("perps");
  const [direction, setDirection] = useState<"all" | "long" | "short">("all");
  const [notice, setNotice] = useState("");
  const visiblePositions = positions.filter((position) => direction === "all" || position.direction === direction);
  const summary = useMemo(() => {
    let perpPnl = 0;
    positions.forEach((position) => {
      perpPnl += getPositionPnl(position).pnlEth;
    });
    const spotValue = holdings.reduce((total, holding) => total + getHoldingPnl(holding).executableValueEth, 0);
    const realized = closedTrades.reduce((total, trade) => total + trade.pnlEth, 0);
    return { perpPnl, spotValue, collateral: positions.reduce((total, position) => total + position.collateral, 0), realized };
  }, [closedTrades, getHoldingPnl, getPositionPnl, holdings, positions]);

  const shareOpen = async (position: Position, token: Token) => {
    const liveMark = token.markCap ?? token.cap;
    const quote = getPositionPnl(position);
    const pnl = quote.pnlEth;
    const roi = quote.roiPercent;
    downloadPnlCard({ symbol: token.symbol, direction: position.direction.toUpperCase(), leverage: position.leverage, pnl, roi, entryCap: position.entryCap, exitCap: liveMark, status: "LIVE" });
    try { await navigator.clipboard.writeText(`${token.symbol} ${position.leverage}× ${position.direction.toUpperCase()} · ${roi >= 0 ? "+" : ""}${roi.toFixed(1)}% P&L on PERPHOOD`); } catch {}
    setNotice("P&L card downloaded and caption copied.");
    window.setTimeout(() => setNotice(""), 2800);
  };

  return <><Header /><main className="positions-page page-shell">
    <section className="utility-hero compact-utility"><span className="eyebrow">YOUR ARENA</span><h1>Positions</h1><p>Live P&amp;L, partial closes, collateral management, spot holdings, and downloadable receipts.</p></section>
    <section className="portfolio-summary glass-panel"><span><small>Available</small><strong>{balanceEth.toFixed(4)} ETH</strong></span><span><small>Perp collateral</small><strong>{summary.collateral.toFixed(4)} ETH</strong></span><span><small>Unrealized P&amp;L</small><strong className={summary.perpPnl >= 0 ? "positive" : "negative"}>{summary.perpPnl >= 0 ? "+" : ""}{summary.perpPnl.toFixed(4)} ETH</strong></span><span><small>Realized P&amp;L</small><strong className={summary.realized >= 0 ? "positive" : "negative"}>{summary.realized >= 0 ? "+" : ""}{summary.realized.toFixed(4)} ETH</strong></span></section>
    <div className="portfolio-tabs"><button className={view === "perps" ? "active" : ""} onClick={() => setView("perps")}><WalletCards size={16} />Perps <b>{positions.length}</b></button><button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}><ListOrdered size={16} />Orders <b>{pendingOrders.length}</b></button><button className={view === "spot" ? "active" : ""} onClick={() => setView("spot")}><Coins size={16} />Spot <b>{holdings.length}</b></button><button className={view === "history" ? "active" : ""} onClick={() => setView("history")}><Clock3 size={16} />History <b>{closedTrades.length}</b></button>{view === "perps" && <div className="direction-filter"><button className={direction === "all" ? "active" : ""} onClick={() => setDirection("all")}>All</button><button className={direction === "long" ? "active" : ""} onClick={() => setDirection("long")}>Long</button><button className={direction === "short" ? "active" : ""} onClick={() => setDirection("short")}>Short</button></div>}</div>

    {view === "perps" && (visiblePositions.length === 0 ? <EmptyState copy="Open any market and open a long or short. It will appear here." /> : <div className="position-list">{visiblePositions.map((position) => {
      const token = getToken(position.slug);
      const liveMark = token.markCap ?? token.cap;
      const liveQuote = getPositionPnl(position);
      const pnl = liveQuote.pnlEth;
      const roi = liveQuote.roiPercent;
      const liqDistance = Math.abs(liveMark - position.liquidationCap) / Math.max(liveMark, 1) * 100;
      const funding = position.accruedFunding ?? 0;
      const borrow = position.accruedBorrow ?? 0;
      const equity = liveQuote.executableValueEth;
      const marginRatio = equity / Math.max(position.notional, 0.0001) * 100;
      return <article key={position.id} className={`position-card glass-panel ${liqDistance < 4 ? "position-danger" : ""}`}><Link href={`/market/${token.slug}`}><TokenAvatar token={token} /><span><strong>{token.symbol}</strong><small>{position.leverage}× {position.direction.toUpperCase()}</small></span></Link><div className="position-pnl"><small>Executable P&amp;L</small><strong className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} ETH</strong><em className={roi >= 0 ? "positive" : "negative"}>{percent(roi)}</em><i>{liveQuote.priceImpactPercent.toFixed(2)}% close impact</i></div><PositionLadder direction={position.direction} entry={position.entryCap} current={liveMark} liquidation={position.liquidationCap} takeProfit={position.takeProfitCap} stopLoss={position.stopLossCap} /><div className="position-stats"><span><small>Entry MC</small><strong>{money(position.entryCap)}</strong></span><span><small>Current MC</small><strong>{money(liveMark)}</strong></span><span><small>Liquidation MC</small><strong>{money(position.liquidationCap)}</strong></span><span><small>Liquidation distance</small><strong className={liqDistance < 4 ? "negative" : ""}>{liqDistance.toFixed(2)}%</strong></span>{position.takeProfitCap && <span><small>Take profit</small><strong>{money(position.takeProfitCap)}</strong></span>}{position.stopLossCap && <span><small>Stop loss</small><strong>{money(position.stopLossCap)}</strong></span>}<span><small>Funding + borrow</small><strong>{(funding + borrow).toFixed(5)} ETH</strong></span><span><small>Margin ratio</small><strong className={marginRatio < 5 ? "negative" : ""}>{marginRatio.toFixed(2)}%</strong></span><span><small>Partial liquidations</small><strong>{position.partialLiquidations ?? 0}</strong></span></div><div className="position-actions">{position.executionMode !== "v43-contract" && position.executionMode !== "v45-account" && position.executionMode !== "v45-session" && <><KeyButton compact onClick={() => { void addCollateral(position.id, 0.01); }}>+0.01 ETH margin</KeyButton><KeyButton compact onClick={() => { void closePosition(position.id, .25); }}>Close 25%</KeyButton></>}<KeyButton compact onClick={() => { void shareOpen(position, token); }}><Share2 size={14} />Share P&amp;L</KeyButton><KeyButton compact tone="red" onClick={() => { void closePosition(position.id); }}>Close all</KeyButton></div></article>;
    })}</div>)}


    {view === "orders" && (pendingOrders.length === 0 ? <EmptyState copy="Place a limit or trigger order from any market terminal. It will wait here until the mark price crosses." /> : <section className="history-list order-history-list glass-panel">{pendingOrders.map((order) => { const token = getToken(order.slug); return <article key={order.id}><Link href={`/market/${token.slug}`}><TokenAvatar token={token} size="sm" /><span><strong>{token.symbol}</strong><small>{order.kind.toUpperCase()} · {order.side.toUpperCase()} {order.side === "buy" ? "SPOT" : `${order.leverage}×`}</small></span></Link><span><small>Trigger market cap</small><strong>{money(order.triggerCap)}</strong></span><span><small>Size</small><strong>{order.collateral.toFixed(3)} ETH</strong></span><span><small>Created</small><strong>{new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></span><button onClick={() => cancelOrder(order.id)} aria-label="Cancel order"><X size={17} /></button></article>; })}</section>)}

    {view === "spot" && (holdings.length === 0 ? <EmptyState copy="Use the Buy tab on any market to add a spot holding." /> : <div className="position-list">{holdings.map((holding) => {
      const token = getToken(holding.slug);
      const spotQuote = getHoldingPnl(holding);
      const currentValue = spotQuote.executableValueEth;
      const pnl = spotQuote.pnlEth;
      return <article key={holding.id} className="position-card spot-position-card glass-panel"><Link href={`/market/${token.slug}`}><TokenAvatar token={token} /><span><strong>{token.symbol}</strong><small>SPOT HOLDING</small></span></Link><div className="position-pnl"><small>Current value</small><strong>{currentValue.toFixed(4)} ETH</strong><em className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} ETH</em></div><div className="position-stats"><span><small>Entry MC</small><strong>{money(holding.entryCap)}</strong></span><span><small>Current MC</small><strong>{money(token.cap)}</strong></span><span><small>Invested</small><strong>{holding.investedEth.toFixed(4)} ETH</strong></span><span><small>Return</small><strong className={pnl >= 0 ? "positive" : "negative"}>{percent((pnl / holding.investedEth) * 100)}</strong></span></div><div className="position-actions"><KeyButton compact onClick={() => { void sellHolding(holding.id, .25); }}>Sell 25%</KeyButton><KeyButton compact onClick={() => { void sellHolding(holding.id, .5); }}>Sell 50%</KeyButton><KeyButton compact tone="red" onClick={() => { void sellHolding(holding.id); }}>Sell all</KeyButton></div></article>;
    })}</div>)}

    {view === "history" && (closedTrades.length === 0 ? <EmptyState copy="Closed trades, liquidations, stop losses, and take profits appear here." /> : <section className="history-list glass-panel">{closedTrades.map((trade) => <HistoryRow key={trade.id} trade={trade} token={getToken(trade.slug)} />)}</section>)}
  </main><MobileDock />{notice && <div className="app-toast">{notice}</div>}</>;
}

function HistoryRow({ trade, token }: { trade: ClosedTrade; token: Token }) {
  const download = () => downloadPnlCard({ symbol: token.symbol, direction: trade.direction.toUpperCase(), leverage: trade.leverage, pnl: trade.pnlEth, roi: trade.roiPercent, entryCap: trade.entryCap, exitCap: trade.exitCap, status: trade.reason.replaceAll("-", " ").toUpperCase() });
  return <article><Link href={`/market/${token.slug}`}><TokenAvatar token={token} size="sm" /><span><strong>{token.symbol}</strong><small>{trade.leverage}× {trade.direction.toUpperCase()} · {trade.reason.replaceAll("-", " ")}</small></span></Link><span><small>Entry / exit</small><strong>{money(trade.entryCap)} → {money(trade.exitCap)}</strong></span><span><small>P&amp;L</small><strong className={trade.pnlEth >= 0 ? "positive" : "negative"}>{trade.pnlEth >= 0 ? "+" : ""}{trade.pnlEth.toFixed(4)} ETH</strong></span><span><small>ROI</small><strong className={trade.roiPercent >= 0 ? "positive" : "negative"}>{percent(trade.roiPercent)}</strong></span><button onClick={download} aria-label="Download P&L card"><Download size={17} /></button></article>;
}

function EmptyState({ copy }: { copy: string }) {
  return <section className="empty-state glass-panel"><span>◎</span><h2>No positions yet</h2><p>{copy}</p><Link href="/"><KeyButton tone="dark">Explore markets</KeyButton></Link></section>;
}

function downloadPnlCard({ symbol, direction, leverage, pnl, roi, entryCap, exitCap, status }: { symbol: string; direction: string; leverage: number; pnl: number; roi: number; entryCap: number; exitCap: number; status: string }) {
  const positive = pnl >= 0;
  const accent = positive ? "#2f9456" : "#db6158";
  const escapedSymbol = symbol.replace(/[<>&]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#edf3ee"/><stop offset="1" stop-color="#cad9ce"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#385043" flood-opacity=".22"/></filter></defs><rect width="1200" height="675" fill="url(#bg)"/><circle cx="1035" cy="85" r="180" fill="#fff" opacity=".28"/><rect x="70" y="65" width="1060" height="545" rx="42" fill="#f8fbf8" fill-opacity=".72" stroke="#fff" filter="url(#shadow)"/><text x="125" y="145" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#101611">PERPHOOD · ROBINHOOD CHAIN</text><text x="125" y="245" font-family="Arial, sans-serif" font-size="82" font-weight="800" fill="#101611">${escapedSymbol}</text><text x="125" y="305" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="${accent}">${leverage}× ${direction}</text><text x="125" y="440" font-family="Arial, sans-serif" font-size="104" font-weight="850" fill="${accent}">${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%</text><text x="130" y="492" font-family="Arial, sans-serif" font-size="28" fill="#667269">${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)} ETH · ${status}</text><text x="720" y="250" font-family="Arial, sans-serif" font-size="24" fill="#667269">ENTRY MARKET CAP</text><text x="720" y="295" font-family="Arial, sans-serif" font-size="42" font-weight="750" fill="#101611">${money(entryCap)}</text><text x="720" y="385" font-family="Arial, sans-serif" font-size="24" fill="#667269">EXIT / CURRENT MARKET CAP</text><text x="720" y="430" font-family="Arial, sans-serif" font-size="42" font-weight="750" fill="#101611">${money(exitCap)}</text><text x="125" y="560" font-family="Arial, sans-serif" font-size="19" fill="#667269">PERPHOOD POSITION RECEIPT</text></svg>`;
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `perphood-${symbol.toLowerCase()}-pnl.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}
