"use client";

import { CircleDollarSign, Crosshair, ShieldPlus, Target, X } from "lucide-react";
import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { Token } from "@/lib/types";
import { useBattleRealtime } from "@/hooks/useBattleRealtime";
import { useMarkets } from "./MarketProvider";

export function MarketPositionManager({ token }: { token: Token }) {
  const { positions, holdings, getPositionPnl, getHoldingPnl, closePosition, sellHolding, addCollateral, updatePositionRisk, balanceEth } = useMarkets();
  const frame = useBattleRealtime(token.slug);
  const [tab, setTab] = useState<"perps" | "spot">("perps");
  const [collateralDrafts, setCollateralDrafts] = useState<Record<string, number>>({});
  const tokenPositions = positions.filter((position) => position.slug === token.slug);
  const tokenHoldings = holdings.filter((holding) => holding.slug === token.slug);
  const liveTotal = useMemo(() => tokenPositions.reduce((sum, position) => sum + (frame?.positionPnl[position.id] ?? getPositionPnl(position)).pnlEth, 0), [frame, getPositionPnl, tokenPositions]);

  return <section className="market-position-manager">
    <header>
      <div className="position-manager-tabs"><button className={tab === "perps" ? "active" : ""} onClick={() => setTab("perps")}>Positions <em>{tokenPositions.length}</em></button><button className={tab === "spot" ? "active" : ""} onClick={() => setTab("spot")}>Spot <em>{tokenHoldings.length}</em></button></div>
      <span><small>Executable PNL</small><strong className={liveTotal >= 0 ? "positive" : "negative"}>{tokenPositions.length ? `${liveTotal >= 0 ? "+" : ""}${liveTotal.toFixed(5)} ETH` : "—"}</strong></span>
    </header>

    {tab === "perps" && <div className="position-manager-list">
      {tokenPositions.length ? tokenPositions.map((position) => {
        const quote = frame?.positionPnl[position.id] ?? getPositionPnl(position);
        const liqDistance = Math.abs((token.markCap ?? token.cap) - position.liquidationCap) / Math.max(token.markCap ?? token.cap, 1) * 100;
        const draft = collateralDrafts[position.id] ?? 0.01;
        return <article key={position.id} className={`managed-position ${position.direction}`}>
          <div className="managed-position-main"><span><strong>{position.leverage}× {position.direction.toUpperCase()}</strong><small>{position.notional.toFixed(4)} ETH notional{position.direction === "short" && position.chainMaximumPayoutEth !== undefined ? ` · floor max ${position.chainMaximumPayoutEth.toFixed(4)} ETH` : ""}</small></span><span><small>Entry / Liq</small><strong>{money(position.entryCap)} / <b className={liqDistance < 5 ? "negative" : ""}>{money(position.liquidationCap)}</b></strong></span><span><small>{quote.executable ? "Executable PNL" : "Quoted PNL · reserve locked"}</small><strong className={quote.pnlEth >= 0 ? "positive" : "negative"}>{quote.pnlEth >= 0 ? "+" : ""}{quote.pnlEth.toFixed(5)} ETH</strong></span></div>
          <div className="managed-position-actions">
            {((position.executionMode === "v43-contract" || position.executionMode === "v45-account" || position.executionMode === "v45-session") ? [1] : [.25,.5,.75,1]).map((fraction) => <button key={fraction} disabled={!quote.executable} title={quote.executable ? "Settle at the exact shared-curve quote." : quote.reason} onClick={() => { void closePosition(position.id, fraction); }}>{fraction === 1 ? "Close" : `${fraction * 100}%`}</button>)}
            {position.executionMode !== "v43-contract" && <><button onClick={() => updatePositionRisk(position.id, { stopLossCap: position.entryCap })}><Crosshair size={13}/>BE</button>
            <button onClick={() => updatePositionRisk(position.id, { takeProfitCap: position.direction === "long" ? (token.markCap ?? token.cap) * 1.15 : (token.markCap ?? token.cap) * .85 })}><Target size={13}/>TP</button></>}
            {position.executionMode !== "v43-contract" && <label><input type="number" min="0.001" step="0.001" max={Math.max(.001,balanceEth)} value={draft} onChange={(event) => setCollateralDrafts((current) => ({ ...current, [position.id]: Math.max(.001, Number(event.target.value) || .001) }))}/><button onClick={() => { void addCollateral(position.id, draft); }}><ShieldPlus size={13}/>Add</button></label>}
          </div>
        </article>;
      }) : <div className="position-manager-empty"><CircleDollarSign size={18}/><span><strong>No open leveraged positions</strong><small>Long and short positions will remain visible here while you trade.</small></span></div>}
    </div>}

    {tab === "spot" && <div className="position-manager-list">
      {tokenHoldings.length ? tokenHoldings.map((holding) => {
        const quote = getHoldingPnl(holding);
        return <article key={holding.id} className="managed-position spot"><div className="managed-position-main"><span><strong>{token.symbol} SPOT</strong><small>{(holding.tokenAmount ?? 0).toLocaleString(undefined,{maximumFractionDigits:2})} tokens</small></span><span><small>Cost / Exit value</small><strong>{holding.investedEth.toFixed(4)} / {quote.executableValueEth.toFixed(4)} ETH</strong></span><span><small>Executable PNL</small><strong className={quote.pnlEth >= 0 ? "positive" : "negative"}>{quote.pnlEth >= 0 ? "+" : ""}{quote.pnlEth.toFixed(5)} ETH</strong></span></div><div className="managed-position-actions">{[.25,.5,.75,1].map((fraction) => <button key={fraction} onClick={() => { void sellHolding(holding.id, fraction); }}>{fraction === 1 ? <><X size={13}/>Sell all</> : `Sell ${fraction * 100}%`}</button>)}</div></article>;
      }) : <div className="position-manager-empty"><CircleDollarSign size={18}/><span><strong>No spot position</strong><small>Your actual executable token exit value will appear here after buying.</small></span></div>}
    </div>}
  </section>;
}
