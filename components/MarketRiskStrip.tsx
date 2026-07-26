"use client";

import { Activity, Gauge, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import type { Token } from "@/lib/types";
import { money } from "@/lib/format";
import { useMarkets } from "./MarketProvider";

export function MarketRiskStrip({ token }: { token: Token }) {
  const { getMarketRisk, traderProgress } = useMarkets();
  const risk = getMarketRisk(token);
  const premium = risk.indexCap > 0 ? (risk.markCap - risk.indexCap) / risk.indexCap * 100 : 0;

  return (
    <section className={`market-risk-strip glass-panel risk-${risk.label.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="market-risk-score">
        <span><ShieldCheck size={16} />Risk engine</span>
        <strong>{risk.score.toFixed(0)}</strong>
        <em>{risk.label}</em>
        <i><b style={{ width: `${risk.score}%` }} /></i>
      </div>
      <div className="market-risk-price">
        <span><small>Spot</small><strong>{money(risk.spotCap)}</strong></span>
        <span><small>Index</small><strong>{money(risk.indexCap)}</strong></span>
        <span><small>Mark</small><strong>{money(risk.markCap)}</strong></span>
        <span><small>Premium</small><strong className={premium >= 0 ? "positive" : "negative"}>{premium >= 0 ? "+" : ""}{premium.toFixed(3)}%</strong></span>
      </div>
      <div className="market-risk-caps">
        <span><Gauge size={15} /><small>Max leverage</small><strong>{risk.maxLeverage > 1 ? `${risk.maxLeverage}×` : "Spot only"}</strong></span>
        <span><Activity size={15} /><small>Oracle</small><strong>{risk.oracleConfidence.toFixed(0)}%</strong></span>
        <span><UsersRound size={15} /><small>Linked cluster</small><strong>{(token.linkedWalletConcentration ?? 0).toFixed(1)}%</strong></span>
      </div>
      <div className="trader-level-chip">
        <Sparkles size={15} />
        <span><small>Trader level {traderProgress.level}</small><strong>{traderProgress.title}</strong></span>
        <em>{traderProgress.xp} XP</em>
      </div>
    </section>
  );
}
