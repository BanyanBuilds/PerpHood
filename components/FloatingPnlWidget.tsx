"use client";

import { CalendarDays, GripHorizontal, RotateCcw, Share2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { buildPnlCalendar, signedEth, summarizePnl, type PnlPeriod } from "@/lib/pnl";
import { sharePnlToX } from "@/lib/pnl-share";
import { useMarkets } from "./MarketProvider";

const PERIODS: Array<[PnlPeriod, string]> = [["session", "Session"], ["today", "Today"], ["7d", "7D"], ["30d", "30D"], ["all", "All"]];
const POSITION_KEY = "perphood-floating-pnl-position-v1";
const SESSION_KEY = "perphood-pnl-session-start-v1";

function defaultPosition() {
  if (typeof window === "undefined") return { x: 24, y: 120 };
  return { x: Math.max(12, window.innerWidth - 360), y: Math.max(74, window.innerHeight - 430) };
}

export function FloatingPnlWidget({ onClose }: { onClose: () => void }) {
  const { closedTrades, positions, holdings, getPositionPnl, getHoldingPnl } = useMarkets();
  const [period, setPeriod] = useState<PnlPeriod>("session");
  const [expanded, setExpanded] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now());
  const [position, setPosition] = useState(defaultPosition);
  const drag = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(POSITION_KEY);
      if (saved) setPosition(JSON.parse(saved));
      const session = Number(localStorage.getItem(SESSION_KEY));
      if (Number.isFinite(session) && session > 0) setSessionStartedAt(session);
      else localStorage.setItem(SESSION_KEY, String(Date.now()));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch {}
  }, [position]);

  const summary = useMemo(() => summarizePnl({
    closedTrades,
    positions,
    holdings,
    getPositionPnl,
    getHoldingPnl,
    period,
    sessionStartedAt,
  }), [closedTrades, getHoldingPnl, getPositionPnl, holdings, period, positions, sessionStartedAt]);
  const calendar = useMemo(() => buildPnlCalendar(closedTrades, 35), [closedTrades]);

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: position.x, y: position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const width = expanded ? 390 : 336;
    const height = expanded ? 445 : 240;
    setPosition({
      x: Math.min(Math.max(8, current.x + event.clientX - current.startX), Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(Math.max(58, current.y + event.clientY - current.startY), Math.max(58, window.innerHeight - height - 42)),
    });
  };
  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === event.pointerId) drag.current = null;
  };

  const newSession = () => {
    const now = Date.now();
    setSessionStartedAt(now);
    setPeriod("session");
    localStorage.setItem(SESSION_KEY, String(now));
  };

  const resetPosition = () => {
    const next = defaultPosition();
    setPosition(next);
    localStorage.setItem(POSITION_KEY, JSON.stringify(next));
  };

  const share = async () => {
    try {
      const result = await sharePnlToX({ title: "My PerpHood PNL", subtitle: "Robinhood Chain BattlePool", summary, periodLabel: PERIODS.find(([value]) => value === period)?.[1] ?? period });
      setShareStatus(result === "shared" ? "Shared" : "Card downloaded · X opened");
    } catch {
      setShareStatus("Share cancelled");
    }
    window.setTimeout(() => setShareStatus(""), 2400);
  };

  return <aside className={`floating-pnl-widget ${expanded ? "expanded" : ""}`} style={{ transform: `translate3d(${position.x}px,${position.y}px,0)` }} aria-label="Floating live PNL">
    <div className="floating-pnl-title" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <span><GripHorizontal size={15} /><strong>Live PNL</strong><i /></span>
      <div>
        <button onClick={resetPosition} title="Reset box position"><RotateCcw size={14} /></button>
        <button onClick={share} title="Share PNL to X"><Share2 size={14} /></button>
        <button onClick={onClose} title="Close live PNL"><X size={15} /></button>
      </div>
    </div>
    <div className="floating-pnl-periods">{PERIODS.map(([value, label]) => <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{label}</button>)}</div>
    <div className={`floating-pnl-total ${summary.totalEth >= 0 ? "positive" : "negative"}`}>
      <small>Executable total PNL</small>
      <strong>{signedEth(summary.totalEth)}</strong>
      <span>{summary.unrealizedEth >= 0 ? "+" : ""}{summary.unrealizedEth.toFixed(4)} live · {summary.realizedEth >= 0 ? "+" : ""}{summary.realizedEth.toFixed(4)} settled</span>
    </div>
    <div className="floating-pnl-stats">
      <span><small>Trades</small><b>{summary.trades}</b></span>
      <span><small>Win rate</small><b>{summary.winRate.toFixed(1)}%</b></span>
      <span><small>Best</small><b className={summary.bestTradeEth >= 0 ? "positive" : "negative"}>{signedEth(summary.bestTradeEth, 3)}</b></span>
    </div>
    <button className="floating-pnl-expand" onClick={() => setExpanded((value) => !value)}><CalendarDays size={14} />{expanded ? "Hide calendar" : "PNL calendar"}</button>
    {expanded && <div className="floating-pnl-calendar" aria-label="35 day PNL calendar">
      {calendar.map((day) => {
        const strength = Math.min(4, Math.ceil(Math.abs(day.pnlEth) * 10));
        return <button key={day.dateKey} className={`${day.pnlEth > 0 ? "gain" : day.pnlEth < 0 ? "loss" : "flat"} strength-${strength}`} title={`${day.label}: ${signedEth(day.pnlEth)} · ${day.trades} trades`}><span>{new Date(`${day.dateKey}T12:00:00`).getDate()}</span></button>;
      })}
      <footer><span><i className="loss" />Loss</span><span><i className="flat" />Flat</span><span><i className="gain" />Profit</span></footer>
    </div>}
    <div className="floating-pnl-footer"><button onClick={newSession}>Reset session PNL</button><button onClick={share}>Share to X</button></div>
    {shareStatus && <div className="floating-pnl-toast">{shareStatus}</div>}
  </aside>;
}
