"use client";

import { Crosshair, ShieldAlert, Swords } from "lucide-react";
import { money } from "@/lib/format";
import type { Token } from "@/lib/types";
import { useMarkets } from "./MarketProvider";

export function MarketLiquidationMap({ token }: { token: Token }) {
  const { positions } = useMarkets();
  const current = token.markCap ?? token.cap;
  const tokenPositions = positions.filter((position) => position.slug === token.slug);
  const longOi = token.longOpenInterestEth ?? 0;
  const shortOi = token.shortOpenInterestEth ?? 0;
  const totalOi = Math.max(longOi + shortOi, 0.000001);
  const longShare = longOi / totalOi * 100;
  const visibleMin = current * 0.72;
  const visibleMax = current * 1.28;
  const markerLeft = (cap: number) => `${Math.max(1, Math.min(99, (cap - visibleMin) / Math.max(visibleMax - visibleMin, 1) * 100))}%`;

  return <section className="market-liquidation-map">
    <header><span><Swords size={16}/><strong>Battle map</strong><small>Real account liquidations + aggregate pool pressure</small></span><em>{money(current)} MC</em></header>
    <div className="battle-pressure-row">
      <span className="long"><small>LONG PRESSURE</small><strong>{longOi.toFixed(3)} ETH</strong></span>
      <i><b style={{ width: `${longShare}%` }}/></i>
      <span className="short"><small>SHORT PRESSURE</small><strong>{shortOi.toFixed(3)} ETH</strong></span>
    </div>
    <div className="liquidation-map-stage">
      <div className="liquidation-map-axis"><span>{money(visibleMin)}</span><span>{money(current)}</span><span>{money(visibleMax)}</span></div>
      <div className="liquidation-current" style={{ left: markerLeft(current) }}><Crosshair size={13}/><span>NOW</span></div>
      {tokenPositions.map((position) => <button key={position.id} className={`liquidation-marker ${position.direction}`} style={{ left: markerLeft(position.liquidationCap) }} title={`${position.leverage}× ${position.direction} liquidates near ${money(position.liquidationCap)}`}>
        <ShieldAlert size={13}/><span>{position.leverage}× {position.direction.toUpperCase()}</span>
      </button>)}
      {!tokenPositions.length && <p>No account positions on this market. Public liquidation-cluster indexing will populate this map from live chain state.</p>}
    </div>
  </section>;
}
