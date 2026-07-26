"use client";

import Link from "next/link";
import { ArrowRight, Flame, Gavel, GraduationCap, ShieldAlert, Waves } from "lucide-react";
import { useMemo } from "react";
import { money } from "@/lib/format";
import { useMarkets } from "./MarketProvider";

export function MarketMoment() {
  const { events, getToken } = useMarkets();
  const moment = useMemo(() => events.find((event) => ["market-open", "graduation", "liquidation", "short-squeeze", "long-squeeze", "whale-buy", "whale-sell"].includes(event.action)), [events]);
  if (!moment) return null;
  const token = getToken(moment.slug);
  const positive = moment.action === "market-open" || moment.action === "graduation" || moment.action === "short-squeeze" || moment.action === "whale-buy";
  const Icon = moment.action === "market-open" ? Gavel : moment.action === "graduation" ? GraduationCap : moment.action === "liquidation" ? ShieldAlert : moment.action.includes("squeeze") ? Waves : Flame;
  const headline = moment.action === "market-open" ? `${token.symbol} BattlePool opened` : moment.action === "graduation" ? `${token.symbol} graduated` : moment.action === "liquidation" ? `${token.symbol} liquidation` : `${token.symbol} ${moment.action.replace("-", " ")}`;
  return <Link href={`/market/${token.slug}`} className={`market-moment ${positive ? "positive-moment" : "negative-moment"}`}><span><Icon size={19} /></span><div><small>LIVE MARKET MOMENT</small><strong>{headline}</strong><p>{moment.amountEth > 0 ? `${moment.amountEth.toFixed(2)} ETH moved · ` : ""}{moment.marketCap > 0 ? `${money(moment.marketCap)} market cap` : "BattlePool genesis"}</p></div><ArrowRight size={18} /></Link>;
}
