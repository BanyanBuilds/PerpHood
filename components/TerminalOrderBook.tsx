"use client";

import { BarChart3, BookOpen, ChevronsUpDown, Gauge } from "lucide-react";
import { useMemo, useState } from "react";
import type { Direction, Token } from "@/lib/types";
import { money } from "@/lib/format";

type BookRow = {
  cap: number;
  price: number;
  amount: number;
  total: number;
  depth: number;
};

export function TerminalOrderBook({ token, onQuick }: { token: Token; onQuick: (side: Direction) => void }) {
  const [view, setView] = useState<"book" | "depth">("book");
  const [grouping, setGrouping] = useState<"fine" | "wide">("fine");
  const mark = token.markCap ?? token.cap;
  const unit = token.cap > 0 ? token.price / token.cap : 0;

  const { asks, bids } = useMemo(() => {
    const step = grouping === "fine" ? 0.00125 : 0.0035;
    const build = (direction: 1 | -1): BookRow[] => Array.from({ length: 9 }, (_, index) => {
      const distance = step * (index + 1);
      const cap = Math.max(1, mark * (1 + direction * distance));
      const wave = Math.abs(Math.sin((index + 1) * 1.71 + mark * 0.00001));
      const amount = 0.035 + wave * 0.72 + (index === 4 ? 0.85 : 0);
      return {
        cap,
        price: cap * unit,
        amount,
        total: amount * (index + 1) * 1.35,
        depth: Math.min(100, 18 + wave * 58 + (index === 4 ? 24 : 0)),
      };
    });
    return { asks: build(1).reverse(), bids: build(-1) };
  }, [grouping, mark, unit]);

  const spread = asks.at(-1) && bids[0] ? asks.at(-1)!.cap - bids[0].cap : 0;
  const spreadPercent = mark > 0 ? spread / mark * 100 : 0;

  return (
    <section className="terminal-orderbook glass-panel" aria-label="BattlePool depth">
      <header className="orderbook-header">
        <div><BookOpen size={14} /><strong>Battle depth</strong><span>DEMO</span></div>
        <div className="orderbook-tools">
          <button className={view === "book" ? "active" : ""} onClick={() => setView("book")} aria-label="Battle depth rows"><ChevronsUpDown size={13} /></button>
          <button className={view === "depth" ? "active" : ""} onClick={() => setView("depth")} aria-label="Depth view"><BarChart3 size={13} /></button>
          <button onClick={() => setGrouping((value) => value === "fine" ? "wide" : "fine")}><Gauge size={13} /><span>{grouping === "fine" ? "0.1%" : "0.3%"}</span></button>
        </div>
      </header>

      {view === "book" ? <>
        <div className="orderbook-columns"><span>Price / MC</span><span>Amount</span><span>Total</span></div>
        <div className="orderbook-rows asks">
          {asks.map((row, index) => <button key={`ask-${index}`} onClick={() => onQuick("short")} title="Open quick short ticket">
            <i style={{ width: `${row.depth}%` }} /><span className="negative">{money(row.cap)}</span><span>{row.amount.toFixed(3)}</span><span>{row.total.toFixed(2)}</span>
          </button>)}
        </div>
        <button className="orderbook-mid" onClick={() => onQuick("buy")}>
          <strong>{money(mark)}</strong><span>{token.price.toFixed(10)}</span><em>{spreadPercent.toFixed(3)}% spread</em>
        </button>
        <div className="orderbook-rows bids">
          {bids.map((row, index) => <button key={`bid-${index}`} onClick={() => onQuick("long")} title="Open quick long ticket">
            <i style={{ width: `${row.depth}%` }} /><span className="positive">{money(row.cap)}</span><span>{row.amount.toFixed(3)}</span><span>{row.total.toFixed(2)}</span>
          </button>)}
        </div>
      </> : <div className="orderbook-depth-view">
        <div className="depth-side depth-bids" style={{ width: `${Math.max(24, Math.min(76, token.longs))}%` }}><span>Bids</span><b>{token.longs.toFixed(0)}%</b></div>
        <div className="depth-side depth-asks"><span>Asks</span><b>{(100 - token.longs).toFixed(0)}%</b></div>
        <p>Click either side to load a quick trade. Depth will populate from live liquidity and market skew.</p>
        <div className="depth-actions"><button onClick={() => onQuick("long")}>Quick long</button><button onClick={() => onQuick("short")}>Quick short</button></div>
      </div>}
    </section>
  );
}
