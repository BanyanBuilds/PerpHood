"use client";

import { Activity, Coins, ShieldCheck, Swords, Zap } from "lucide-react";
import { freeWeth, poolFromToken, positionObligationsWeth } from "@/lib/battle-pool";
import type { Token } from "@/lib/types";

export function CommunityRewardsPanel({ token }: { token: Token }) {
  const pool = token.battlePoolVersion ? poolFromToken(token) : null;
  const reserved = pool ? positionObligationsWeth(pool) : 0;
  const available = pool ? freeWeth(pool) : 0;
  const retained = (pool?.poolFeesEth ?? 0) + (pool?.liquidationEquityEth ?? 0);

  return <section className="community-rewards glass-panel">
    <header className="community-rewards-head">
      <span><Swords size={17}/><div><small>BATTLEPOOL COMPOUNDING</small><strong>Losing leverage and fees strengthen the same market</strong></div></span>
      <em><Zap size={13}/> ONE POOL</em>
    </header>
    <div className="reward-rule-grid">
      <article><Coins size={16}/><span><small>Execution fee</small><strong>0.30% retained</strong></span></article>
      <article><Activity size={16}/><span><small>Liquidation equity</small><strong>Stays in pool</strong></span></article>
      <article><ShieldCheck size={16}/><span><small>Position promises</small><strong>Reserved first</strong></span></article>
      <article><Zap size={16}/><span><small>Settlement</small><strong>Same curve</strong></span></article>
    </div>
    <div className="reward-pool-row">
      <span><small>Real WETH balance</small><strong>{(pool?.realWethBalance ?? token.liquidityEth ?? 0).toFixed(6)} ETH</strong></span>
      <span><small>Reserved instant payouts</small><strong>{reserved.toFixed(6)} ETH</strong></span>
      <span><small>Fees + liquidations retained</small><strong>{retained.toFixed(6)} ETH</strong></span>
    </div>
    <div className="reward-leaderboard">
      <div className="reward-leaderboard-label"><span>Battle side</span><span>Open action</span><span>Close action</span><span>Pool effect</span></div>
      <article><span><b>↑</b><strong>Spot buyers</strong></span><span>Buy token</span><span>Sell token</span><span>Real curve impact</span></article>
      <article><span><b>↑</b><strong>Leveraged longs</strong></span><span>Borrow WETH + buy</span><span>Sell + repay</span><span>Real curve impact</span></article>
      <article><span><b>↓</b><strong>Spot sellers</strong></span><span>Sell token</span><span>—</span><span>Real curve impact</span></article>
      <article><span><b>↓</b><strong>Leveraged shorts</strong></span><span>Borrow token + sell</span><span>Buy + repay</span><span>Real curve impact</span></article>
    </div>
    <p className="reward-explainer">No holder or creator reward routing is active in V20. The pool protects {reserved.toFixed(5)} ETH of current position equity and exposes {available.toFixed(5)} ETH as instantly free capacity.</p>
  </section>;
}
