"use client";

import { Activity, Gauge, ShieldCheck, Swords, WalletCards } from "lucide-react";
import { freeWeth, poolFromToken, positionObligationsWeth } from "@/lib/battle-pool";
import { money } from "@/lib/format";
import type { Token } from "@/lib/types";
import { useBattleRealtime } from "@/hooks/useBattleRealtime";
import { useMarkets } from "./MarketProvider";

function signedEth(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(5)} ETH`;
}

export function MarketBattleRibbon({ token }: { token: Token }) {
  const { positions, getMarketRisk, getPositionPnl } = useMarkets();
  const frame = useBattleRealtime(token.slug);
  const risk = getMarketRisk(token);
  const pool = token.battlePoolVersion ? poolFromToken(token) : null;
  const tokenPositions = positions.filter((position) => position.slug === token.slug);
  const executablePnl = tokenPositions.reduce((sum, position) => {
    const quote = frame?.positionPnl[position.id] ?? getPositionPnl(position);
    return sum + quote.pnlEth;
  }, 0);
  const free = pool ? freeWeth(pool) : token.freeWethEth ?? 0;
  const reserved = pool ? positionObligationsWeth(pool) : token.positionObligationsEth ?? 0;
  const longOi = token.longOpenInterestEth ?? 0;
  const shortOi = token.shortOpenInterestEth ?? 0;
  const totalOi = Math.max(longOi + shortOi, 0.000001);
  const closest = tokenPositions.length
    ? Math.min(...tokenPositions.map((position) => Math.abs((token.markCap ?? token.cap) - position.liquidationCap) / Math.max(token.markCap ?? token.cap, 1) * 100))
    : null;

  return <section className="market-battle-ribbon" aria-label="Live BattlePool status">
    <article><ShieldCheck size={16}/><span><small>Risk</small><strong>{risk.score.toFixed(0)} · {risk.label}</strong></span></article>
    <article><WalletCards size={16}/><span><small>Free / reserved</small><strong>{free.toFixed(4)} / {reserved.toFixed(4)} ETH</strong></span></article>
    <article className="battle-ribbon-oi"><Swords size={16}/><span><small>Long / short OI</small><strong>{money(longOi * 3200)} / {money(shortOi * 3200)}</strong><i><b style={{ width: `${longOi / totalOi * 100}%` }}/></i></span></article>
    <article><Activity size={16}/><span><small>Executable PNL</small><strong className={executablePnl >= 0 ? "positive" : "negative"}>{tokenPositions.length ? signedEth(executablePnl) : "No open perps"}</strong></span></article>
    <article><Gauge size={16}/><span><small>Nearest liquidation</small><strong className={closest !== null && closest < 5 ? "negative" : ""}>{closest === null ? "No account risk" : `${closest.toFixed(2)}% away`}</strong></span></article>
    <em><i/>Frame #{frame?.sequence ?? 0}</em>
  </section>;
}
