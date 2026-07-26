"use client";

import { freeWeth, longNotionalCapacity, poolFromToken, positionObligationsWeth, shortNotionalCapacity } from "@/lib/battle-pool";
import { compact, money } from "@/lib/format";
import type { MarketEvent, Token } from "@/lib/types";
import { SentimentBar } from "./SentimentBar";
import { useMarkets } from "./MarketProvider";

function actionLabel(event: MarketEvent) {
  if (event.action === "spot-buy") return "Buy";
  if (event.action === "spot-sell") return "Sell";
  if (event.action === "long") return `${event.leverage ?? ""}× Long`;
  if (event.action === "short") return `${event.leverage ?? ""}× Short`;
  if (event.action === "graduation") return "Migrated";
  if (event.action === "whale-buy") return "Whale Buy";
  if (event.action === "whale-sell") return "Whale Sell";
  if (event.action === "short-squeeze") return "Short Squeeze";
  if (event.action === "long-squeeze") return "Long Cascade";
  return "Liquidated";
}

function timeLabel(createdAt: number) {
  if (createdAt < 10_000) return `${createdAt}s`;
  return new Date(createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function MarketStats({ token }: { token: Token }) {
  const { getEvents } = useMarkets();
  const rows = getEvents(token.slug).slice(0, 6);
  const pool = token.battlePoolVersion ? poolFromToken(token) : null;
  const curveInventoryPercent = pool ? pool.curveRealTokenReserve / pool.totalSupply * 100 : 0;
  const shortInventoryPercent = pool ? pool.perpTokenReserve / pool.totalSupply * 100 : 0;
  const safetyInventoryPercent = pool ? pool.safetyTokenReserve / pool.totalSupply * 100 : 0;
  const freePoolWeth = pool ? freeWeth(pool) : 0;
  const reservedPositionEquity = pool ? positionObligationsWeth(pool) : 0;
  const longCapacity = pool ? longNotionalCapacity(pool, 20) : 0;
  const shortCapacity = pool ? shortNotionalCapacity(pool) : 0;

  return (
    <div className="market-bottom-grid">
      <section className="info-card glass-panel">
        <div className="card-heading"><h3>Recent BattlePool activity</h3><button>Live</button></div>
        {rows.length ? <div className="trade-list">{rows.map((event) => {
          const positive = event.action === "long" || event.action === "spot-buy" || event.action === "graduation" || event.action === "whale-buy" || event.action === "short-squeeze";
          return <div key={event.id}><span className={positive ? "positive" : "negative"}>{actionLabel(event)}</span><b>{event.amountEth ? `${event.amountEth.toFixed(3)} ETH` : "Milestone"}</b><span>{money(event.marketCap)}</span><small>{timeLabel(event.createdAt)}</small></div>;
        })}</div> : <div className="empty-inline"><strong>No fabricated tape</strong><small>Real local actions will appear here.</small></div>}
      </section>

      <section className="info-card glass-panel">
        <div className="card-heading"><h3>Upward / downward pressure</h3></div>
        <div className="activity-ring" style={{ "--long-share": `${token.longs * 3.6}deg` } as React.CSSProperties}><span><strong>{token.longs.toFixed(0)}%</strong><small>Buy + long</small></span></div>
        <SentimentBar longs={Math.round(token.longs)} />
        <div className="activity-totals"><span><small>Buy + long volume</small><strong>{money(token.volume24h * token.longs / 100)}</strong></span><span><small>Sell + short volume</small><strong>{money(token.volume24h * (100 - token.longs) / 100)}</strong></span></div>
      </section>

      <section className="info-card glass-panel">
        <div className="card-heading"><h3>BattlePool balance sheet</h3></div>
        <div className="stats-stack">
          <span><small>Real WETH in pool</small><strong>{(pool?.realWethBalance ?? token.liquidityEth ?? 0).toFixed(4)} ETH</strong></span>
          <span><small>Reserved position equity</small><strong>{reservedPositionEquity.toFixed(4)} ETH</strong></span>
          <span><small>Instantly free WETH</small><strong>{freePoolWeth.toFixed(4)} ETH</strong></span>
          <span><small>Long notional capacity</small><strong>{longCapacity.toFixed(4)} ETH</strong></span>
          <span><small>Short notional capacity</small><strong>{shortCapacity.toFixed(4)} ETH</strong></span>
          <span><small>Curve inventory remaining</small><strong>{curveInventoryPercent.toFixed(2)}%</strong></span>
          <span><small>Short-borrow inventory</small><strong>{shortInventoryPercent.toFixed(2)}%</strong></span>
          <span><small>Adaptive safety inventory</small><strong>{safetyInventoryPercent.toFixed(2)}%</strong></span>
          <span><small>Liquidation equity retained</small><strong>{(pool?.liquidationEquityEth ?? 0).toFixed(5)} ETH</strong></span>
          <span><small>Pool execution fees</small><strong>{(pool?.poolFeesEth ?? 0).toFixed(5)} ETH</strong></span>
          <span><small>Tokens conserved</small><strong>{compact(pool?.totalSupply ?? token.totalSupply ?? 1_000_000_000)}</strong></span>
        </div>
      </section>
    </div>
  );
}
