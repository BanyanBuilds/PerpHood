"use client";

import Link from "next/link";
import { ArrowRight, BarChart3, Plus } from "lucide-react";
import { BrandMark } from "./icons";
import { KeyButton } from "./KeyButton";
import { SentimentBar } from "./SentimentBar";
import { TokenAvatar } from "./TokenAvatar";
import { useMarkets } from "./MarketProvider";
import { money } from "@/lib/format";

export function Hero() {
  const { tokens } = useMarkets();
  const featured = tokens.find((token) => token.featured) ?? tokens.find((token) => token.launchState !== "auction") ?? tokens[0];
  return (
    <section className="hero-section">
      <div className="hero-copy">
        <span className="eyebrow">LEVERAGE X · ROBINHOOD CHAIN FIRST</span>
        <h1>ONE POOL.<br />FOUR SIDES.</h1>
        <p>Spot buyers, leveraged longs, spot sellers, and leveraged shorts fight through one real TOKEN/WETH BattlePool.</p>
        <div className="hero-actions">
          <Link href="#markets"><KeyButton tone="dark"><BarChart3 size={18} />Explore Markets</KeyButton></Link>
          <Link href="/terminal?panel=launch"><KeyButton><Plus size={18} />Launch BattlePool</KeyButton></Link>
        </div>
        <div className="hero-tags"><span>0.25 ETH genesis FDV</span><span>0.30% execution fee</span><span>Real shared price impact</span></div>
      </div>
      <div className="hero-display">
        <div className="hero-coin-stage glass-panel"><div className="stage-ring"><BrandMark size={94} /></div></div>
        {featured && <Link href={`/market/${featured.slug}`} className="hero-market-card glass-panel">
          <div><TokenAvatar token={featured} size="lg" /><span><small>Featured terminal</small><strong>{featured.symbol}</strong></span></div>
          <b>{money(featured.cap)}</b>
          <SentimentBar longs={featured.longs} compact />
          <span className="hero-market-cta">Open terminal <ArrowRight size={16} /></span>
        </Link>}
      </div>
      <div className="hero-benefits">
        <div><span>01</span><p><strong>One executable curve</strong><small>Every spot and leveraged action mutates the same reserves.</small></p></div>
        <div><span>02</span><p><strong>Liquidations hit spot</strong><small>Short liquidations force buys. Long liquidations force sells.</small></p></div>
        <div><span>03</span><p><strong>Devs are players</strong><small>No free supply, no privileged exit, and no self-perps.</small></p></div>
      </div>
    </section>
  );
}
