"use client";

import Link from "next/link";
import { ShieldCheck, Swords, Trophy, Zap } from "lucide-react";
import { useState } from "react";
import { Header } from "@/components/Header";
import { KeyButton } from "@/components/KeyButton";
import { MobileDock } from "@/components/MobileDock";
import { useMarkets } from "@/components/MarketProvider";

type WindowKey = "24h" | "7d" | "all";

function signedEth(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(4)} ETH`; }

export default function LeaderboardPage() {
  const { closedTrades, positions, getPositionPnl } = useMarkets();
  const [windowKey] = useState<WindowKey>("7d");
  const [renderedAt] = useState(Date.now);
  const cutoff = windowKey === "24h" ? renderedAt - 86_400_000 : windowKey === "7d" ? renderedAt - 604_800_000 : 0;
  const perpClosedTrades = closedTrades.filter((trade) => trade.direction !== "spot" && trade.closedAt >= cutoff);
  const realized = perpClosedTrades.reduce((sum, trade) => sum + trade.pnlEth, 0);
  const unrealized = positions.reduce((sum, position) => sum + getPositionPnl(position).pnlEth, 0);
  const total = realized + unrealized;
  const hasSettledData = closedTrades.length > 0 || positions.length > 0;

  return <><Header /><main className="leaderboard-page page-shell">
    <section className="leaderboard-player-card glass-panel">
      <div><span className="player-rank">—</span><span><small>YOUR PERPS RANK</small><strong>{signedEth(total)}</strong><em>{positions.length} open perp position{positions.length === 1 ? "" : "s"}</em></span></div>
      <div className="player-card-stats"><span><small>Total perp P&amp;L</small><b>{signedEth(total)}</b></span><span><small>Realized</small><b>{signedEth(realized)}</b></span><span><small>Unrealized</small><b>{signedEth(unrealized)}</b></span><span><small>Open perps</small><b>{positions.length}</b></span></div>
      <Link href="/terminal"><KeyButton tone="dark"><Zap size={15} />Open terminal</KeyButton></Link>
    </section>

    {!hasSettledData && <section className="empty-state glass-panel"><span>◎</span><h2>No settled leaderboard data</h2><p>Rankings will populate from verified LEVERAGE X perpetual executions. No generated traders or fabricated P&amp;L are shown.</p></section>}

    <section className="leaderboard-table perps-leaderboard-table glass-panel">
      <div className="leaderboard-table-head"><span>Rank / Trader</span><span>Total perp P&amp;L</span><span>Realized P&amp;L</span><span>Unrealized P&amp;L</span><span>Open perps</span></div>
      <div className="leaderboard-table-body">{hasSettledData && <article className="is-user"><span><b>—</b><i>◎</i><em><strong>Connected wallet</strong><small>LEVERAGE X Trader</small></em></span><span>{signedEth(total)}</span><span>{signedEth(realized)}</span><span>{signedEth(unrealized)}</span><span>{positions.length}</span></article>}</div>
    </section>

    <section className="league-rules glass-panel"><div><ShieldCheck size={22} /><span><strong>P&amp;L-only ranking</strong><small>No volume farming, XP bonuses, spot gains, or launch activity can move a wallet up the table.</small></span></div><div><Swords size={22} /><span><strong>Realized + unrealized</strong><small>Open positions use executable shared-pool close quotes; closing moves that result into realized P&amp;L.</small></span></div><div><Trophy size={22} /><span><strong>Verified executions only</strong><small>Only settled LEVERAGE X perpetual activity is eligible.</small></span></div></section>
  </main><MobileDock /></>;
}
