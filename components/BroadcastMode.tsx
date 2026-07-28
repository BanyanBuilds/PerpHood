"use client";

import { EyeOff, Radio, Shield, Trophy, X } from "lucide-react";
import { useMemo, useState } from "react";
import { signedEth, summarizePnl } from "@/lib/pnl";
import { useMarkets } from "./MarketProvider";

type Props = { onClose: () => void };

export function BroadcastMode({ onClose }: Props) {
  const { positions, holdings, closedTrades, getPositionPnl, getHoldingPnl, getToken } = useMarkets();
  const [privacy, setPrivacy] = useState(true);
  const summary = useMemo(() => summarizePnl({ closedTrades, positions, holdings, getPositionPnl, getHoldingPnl, period: "today", sessionStartedAt: 0 }), [closedTrades, positions, holdings, getPositionPnl, getHoldingPnl]);
  const active = positions.slice(0, 3);
  const livePnl = summary.unrealizedEth;

  return <section className="lx-broadcast-layer" aria-label="Leverage X Broadcast Mode">
    <header className="lx-broadcast-bar">
      <span><Radio size={15} /><b>BROADCAST MODE</b><i>LIVE</i></span>
      <div>
        <button type="button" className={privacy ? "active" : ""} onClick={() => setPrivacy((value) => !value)}><EyeOff size={14} />Privacy</button>
        <button type="button" onClick={onClose} aria-label="Close Broadcast Mode"><X size={15} /></button>
      </div>
    </header>

    <aside className={`lx-broadcast-pnl ${livePnl >= 0 ? "positive" : "negative"}`}>
      <div className="lx-broadcast-kicker"><span><i />LIVE PNL</span><em>{positions.length} ACTIVE</em></div>
      <strong>{signedEth(livePnl, 3)}</strong>
      <small>{summary.trades} settled today · {summary.winRate.toFixed(0)}% win rate</small>
      <div className="lx-broadcast-meter"><i style={{ width: `${Math.min(92, Math.max(18, 50 + summary.winRate / 2))}%` }} /></div>
    </aside>

    <div className="lx-broadcast-positions">
      {active.length ? active.map((position, index) => {
        const pnl = getPositionPnl(position).pnlEth;
        const token = getToken(position.slug);
        const side = position.direction.toUpperCase();
        return <article key={position.id} className={pnl >= 0 ? "positive" : "negative"}>
          <header><span className={position.direction}>{side}</span><b>{token.symbol || `POSITION ${index + 1}`}</b><em>{position.leverage}×</em></header>
          <strong>{privacy ? signedEth(pnl, 3) : "•••• ETH"}</strong>
          <div><span><small>Entry</small><b>{privacy ? position.entryCap.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "Hidden"}</b></span><span><small>Liquidation</small><b>{privacy ? position.liquidationCap.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "Hidden"}</b></span></div>
          <footer><Shield size={12} />Position live</footer>
        </article>;
      }) : <article className="empty"><Trophy size={20} /><b>Waiting for the next trade</b><small>Active positions will appear here in a viewer-first format.</small></article>}
    </div>
  </section>;
}
