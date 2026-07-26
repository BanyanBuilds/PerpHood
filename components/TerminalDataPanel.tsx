"use client";

import { useState } from "react";
import { freeWeth, poolFromToken, positionObligationsWeth, shortInventoryUtilization } from "@/lib/battle-pool";
import { DEMO_HOLDER_INTEL, DEMO_HOLDERS, DEMO_LIQUIDATION_CLUSTERS, DEMO_TOP_TRADERS, isDemoMarket } from "@/lib/demo-market";
import { buildLiquidationClusters, buildMarketDefensePulse } from "@/lib/market-alerts";
import { money } from "@/lib/format";
import type { MarketEvent, Token } from "@/lib/types";
import { useBattleRealtime } from "@/hooks/useBattleRealtime";
import { useMarkets } from "./MarketProvider";

export const TERMINAL_DATA_TABS = ["Tape", "Pulse", "Transactions", "Orders", "Positions", "BattlePool", "Top traders", "Insiders", "Holders", "Token info"] as const;
export type TerminalTab = (typeof TERMINAL_DATA_TABS)[number];

function isBuyPrint(event: MarketEvent) {
  return event.action === "market-open" || event.action === "auction-bid" || event.action === "spot-buy" || event.action === "long" || event.action === "whale-buy" || event.action === "short-squeeze";
}

export function TerminalDataPanel({ token, tabs = TERMINAL_DATA_TABS, defaultTab = "Tape", compact = false }: { token: Token; tabs?: readonly TerminalTab[]; defaultTab?: TerminalTab; compact?: boolean }) {
  const { getEvents, positions, getPositionPnl, closePosition, pendingOrders, cancelOrder } = useMarkets();
  const liveFrame = useBattleRealtime(token.slug);
  const [tab, setTab] = useState<TerminalTab>(tabs.includes(defaultTab) ? defaultTab : tabs[0] ?? "Tape");
  const events = getEvents(token.slug);
  const tokenPositions = positions.filter((position) => position.slug === token.slug);
  const tokenOrders = pendingOrders.filter((order) => order.slug === token.slug);
  const battlePool = token.battlePoolVersion ? poolFromToken(token) : null;
  const freeRatio = battlePool?.realWethBalance ? Math.max(0, Math.min(1, freeWeth(battlePool) / battlePool.realWethBalance)) : 1;
  const clusters = isDemoMarket(token.slug) ? DEMO_LIQUIDATION_CLUSTERS : buildLiquidationClusters(tokenPositions, token.cap);
  const pulse = buildMarketDefensePulse(token, events, clusters, freeRatio);

  return (
    <section className={`terminal-data-panel glass-panel ${compact ? "terminal-data-panel-compact" : ""}`}>
      <div className="terminal-data-tabs">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}{item === "Positions" && tokenPositions.length ? <em>{tokenPositions.length}</em> : item === "Orders" && tokenOrders.length ? <em>{tokenOrders.length}</em> : null}</button>)}</div>

      {tab === "Tape" && <div className="terminal-table terminal-transactions">
        <div className="terminal-table-head"><span>Side</span><span>Wallet</span><span>Amount</span><span>Price / MC</span><span>Age</span></div>
        {events.length ? events.slice(0, 14).map((event) => { const positive = isBuyPrint(event); return <div key={event.id}><span className={positive ? "positive" : "negative"}>{positive ? "Buy" : "Sell"}</span><span>{event.actor ?? "Public"}</span><span>{event.amountEth.toFixed(3)} ETH</span><span>{money(event.marketCap)}</span><span title={event.transactionHash ?? undefined}>{event.blockNumber ? `#${event.blockNumber}` : age(event.createdAt)}</span></div>; }) : <TerminalEmpty copy="Live executions will appear here after the market-data service is connected." />}
      </div>}

      {tab === "Pulse" && <div className="v38-pulse-panel">
        <section className={`v38-pulse-score ${pulse.status}`}><span><small>Market defense</small><strong>{Math.round(pulse.score)}</strong><em>/100</em></span><div><b>{pulse.status}</b><small>{pulse.warnings.length ? pulse.warnings[0] : "Flow and payout capacity look healthy"}</small></div></section>
        <section className="v38-pulse-flow"><article><small>Buy-side pressure</small><strong className="positive">{pulse.buyPressureEth.toFixed(3)} ETH</strong><span>Spot buys + longs</span></article><article><small>Sell-side pressure</small><strong className="negative">{pulse.sellPressureEth.toFixed(3)} ETH</strong><span>Spot sells + shorts</span></article><article><small>Independent actors</small><strong>{pulse.uniqueActors}</strong><span>{(pulse.repeatingActorShare * 100).toFixed(0)}% largest actor share</span></article><article><small>Free payout WETH</small><strong className={freeRatio >= .45 ? "positive" : freeRatio >= .3 ? "" : "negative"}>{(freeRatio * 100).toFixed(1)}%</strong><span>After current obligations</span></article></section>
        <section className="v38-pulse-clusters"><header><strong>Liquidation pressure</strong><small>Aggregated positions; wallet direction remains private</small></header><div>{clusters.slice(0, 6).map((cluster) => <article key={cluster.id} className={cluster.direction}><span><b>{cluster.direction === "short" ? "Short squeeze" : "Long cascade"}</b><small>{cluster.positions} positions</small></span><strong>{cluster.notionalEth.toFixed(2)} ETH</strong><em>{cluster.distancePercent >= 0 ? "+" : ""}{cluster.distancePercent.toFixed(1)}%</em></article>)}</div></section>
        <section className="v38-pulse-warnings"><strong>Manipulation checks</strong>{pulse.warnings.length ? pulse.warnings.map((warning) => <span key={warning} className="warning">{warning}</span>) : <span className="positive">No elevated manipulation warning</span>}<small>Labels are analytical signals, not accusations. Enforcement uses provable links only.</small></section>
      </div>}

      {tab === "Transactions" && <div className="terminal-table terminal-transaction-detail">
        <div className="terminal-table-head"><span>Type</span><span>Wallet / label</span><span>ETH</span><span>Market cap</span><span>Context</span><span>Age</span></div>
        {events.length ? events.slice(0, 16).map((event) => { const positive = isBuyPrint(event); return <div key={event.id}><span className={positive ? "positive" : "negative"}>{event.action.replaceAll("-", " ")}</span><span>{event.actor ?? "Public"}</span><span>{event.amountEth.toFixed(4)}</span><span>{money(event.marketCap)}</span><span>{event.note ?? "BattlePool execution"}</span><span title={event.transactionHash ?? undefined}>{event.blockNumber ? `#${event.blockNumber}` : age(event.createdAt)}</span></div>; }) : <TerminalEmpty copy="Verified transactions will appear here." />}
      </div>}

      {tab === "Orders" && <div className="terminal-table terminal-orders-table">
        <div className="terminal-table-head"><span>Side</span><span>Type</span><span>Trigger MC</span><span>Size</span><span>Age</span><span /></div>
        {tokenOrders.length ? tokenOrders.map((order) => <div key={order.id}><span className={order.side === "short" ? "negative" : "positive"}>{order.side.toUpperCase()}</span><span>{order.kind}</span><span>{money(order.triggerCap)}</span><span>{order.collateral.toFixed(3)} ETH{order.side !== "buy" ? ` · ${order.leverage}×` : ""}</span><span>{age(order.createdAt)}</span><button onClick={() => cancelOrder(order.id)}>Cancel</button></div>) : <TerminalEmpty copy="Limit and trigger orders will appear here." />}
      </div>}

      {tab === "Positions" && <div className="terminal-table terminal-positions-table">
        <div className="terminal-table-head"><span>Side</span><span>Size</span><span>Entry</span><span>Liquidation</span><span>PnL</span><span /></div>
        {tokenPositions.length ? tokenPositions.map((position) => { const quote = liveFrame?.positionPnl[position.id] ?? getPositionPnl(position); const pnl = quote.pnlEth; return <div key={position.id}><span className={position.direction === "long" ? "positive" : "negative"}>{position.leverage}× {position.direction}</span><span>{position.notional.toFixed(3)} ETH</span><span>{money(position.entryCap)}</span><span>{money(position.liquidationCap)}</span><span className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} ETH</span><button onClick={() => { void closePosition(position.id); }}>Close</button></div>; }) : <TerminalEmpty copy="Your open positions will appear here." />}
      </div>}

      {tab === "BattlePool" && (battlePool ? <div className="terminal-token-info terminal-battle-pool">
        <article><small>Real WETH balance</small><strong>{battlePool.realWethBalance.toFixed(6)} ETH</strong><span>One pool backing every exit</span></article>
        <article><small>Instantly free WETH</small><strong>{freeWeth(battlePool).toFixed(6)} ETH</strong><span>After current position obligations</span></article>
        <article><small>Reserved position equity</small><strong>{positionObligationsWeth(battlePool).toFixed(6)} ETH</strong><span>Executable long + short equity</span></article>
        <article><small>Short inventory used</small><strong>{(shortInventoryUtilization(battlePool) * 100).toFixed(2)}%</strong><span>Adaptive release begins at {(battlePool.adaptiveReleaseTrigger * 100).toFixed(0)}%</span></article>
        <article><small>Public curve inventory</small><strong>{(battlePool.curveRealTokenReserve / battlePool.totalSupply * 100).toFixed(2)}%</strong><span>{Math.round(battlePool.curveRealTokenReserve).toLocaleString()} tokens</span></article>
        <article><small>Available short inventory</small><strong>{(battlePool.perpTokenReserve / battlePool.totalSupply * 100).toFixed(2)}%</strong><span>{Math.round(battlePool.perpTokenReserve).toLocaleString()} tokens</span></article>
        <article><small>Adaptive inventory active</small><strong>{Math.round(battlePool.adaptivePerpReleasedTokens).toLocaleString()}</strong><span>{battlePool.adaptiveRebalanceCount} reserve rebalances</span></article>
        <article><small>Liquidation equity retained</small><strong>{battlePool.liquidationEquityEth.toFixed(6)} ETH</strong><span>Losses permanently strengthening this pool</span></article>
        <article><small>Pool fees retained</small><strong>{battlePool.poolFeesEth.toFixed(6)} ETH</strong><span>Current 0.30% battle execution fee</span></article>
        <article><small>Realized bad debt</small><strong className={battlePool.badDebtEth > 0 ? "negative" : "positive"}>{battlePool.badDebtEth.toFixed(12)} ETH</strong><span>Target: zero</span></article>
        <article><small>Engine version</small><strong>{battlePool.battlePoolVersion}</strong><span>Exact-liquidation boundary solver</span></article>
        <article><small>Live state sequence</small><strong>#{liveFrame?.sequence ?? 0}</strong><span>{liveFrame ? `${Math.max(0, Date.now() - liveFrame.updatedAt)} ms since BattlePool frame` : "Demo replay until chain feed connects"}</span></article>
        <p><strong>One battlefield:</strong> spot buys and leveraged longs remove tokens; spot sells and leveraged shorts add tokens. Every liquidation executes through this same curve and any remaining trader equity stays here.</p>
      </div> : <TerminalEmpty copy="This market has not been migrated to the unified BattlePool engine." />)}

      {tab === "Top traders" && <div className="terminal-table terminal-top-traders"><div className="terminal-table-head"><span>Trader</span><span>Realized PnL</span><span>Unrealized PnL</span><span>Volume</span><span>Win rate</span></div>{DEMO_TOP_TRADERS.map((trader) => <div key={trader.wallet}><span><b>{trader.wallet}</b><small>{trader.label}</small></span><span className="positive">+{trader.realized.toFixed(3)} ETH</span><span className={trader.unrealized >= 0 ? "positive" : "negative"}>{trader.unrealized >= 0 ? "+" : ""}{trader.unrealized.toFixed(3)} ETH</span><span>{trader.volume.toFixed(1)} ETH</span><span>{trader.winRate}%</span></div>)}</div>}

      {tab === "Insiders" && <div className="wallet-intel-panel">
        <article><small>Creator holding</small><strong>{DEMO_HOLDER_INTEL.creatorShare.toFixed(1)}%</strong><span>Creator has no fee or perp privileges</span></article>
        <article><small>Top 10 concentration</small><strong>{DEMO_HOLDER_INTEL.top10Share.toFixed(1)}%</strong><span>Healthy for current pool depth</span></article>
        <article><small>Bundled / linked</small><strong>{DEMO_HOLDER_INTEL.bundledShare.toFixed(1)}%</strong><span>Strong links only; weak heuristics excluded</span></article>
        <article><small>Insider wallets</small><strong>{DEMO_HOLDER_INTEL.insiders}</strong><span>Visible as chart markers</span></article>
        <article><small>Sniper wallets</small><strong>{DEMO_HOLDER_INTEL.snipers}</strong><span>First-block and low-latency buyers</span></article>
        <article><small>First 70 still holding</small><strong>{DEMO_HOLDER_INTEL.first70Holding.toFixed(1)}%</strong><span>Retention from earliest buyers</span></article>
        <p>Wallet labels are analytical signals—not accusations. Only provable creator links are used for enforcement.</p>
      </div>}

      {tab === "Holders" && <div className="terminal-table terminal-holders-table"><div className="terminal-table-head"><span>Rank / Wallet</span><span>Share</span><span>7d PnL</span><span>Bought</span><span>Sold</span></div>{DEMO_HOLDERS.map((holder, index) => <div key={holder.wallet}><span><b>#{index + 1} {holder.wallet}</b><small>{holder.label}</small></span><span>{holder.share.toFixed(1)}%</span><span className={holder.pnl >= 0 ? "positive" : "negative"}>{holder.pnl >= 0 ? "+" : ""}{holder.pnl.toFixed(2)} ETH</span><span>{holder.bought.toFixed(2)} ETH</span><span>{holder.sold.toFixed(2)} ETH</span></div>)}</div>}

      {tab === "Token info" && <div className="terminal-token-info">
        <article><small>Contract</small><strong>{token.contractAddress ?? "Awaiting deployment"}</strong><button disabled={!token.contractAddress}>Copy</button></article>
        <article><small>Liquidity</small><strong>{(token.liquidityEth ?? 0).toFixed(2)} ETH</strong><span>Shared BattlePool</span></article>
        <article><small>Perp open interest</small><strong>{money(token.openInterest)}</strong><span>{token.longs.toFixed(0)}% long</span></article>
        <article><small>Bonding progress</small><strong>{token.graduation.toFixed(1)}%</strong><span>Migration preserves token address</span></article>
        <article><small>Pair age</small><strong>47 minutes</strong><span>Robinhood Chain demo</span></article>
        <article><small>Security</small><strong className="positive">No critical warnings</strong><span>Demo review data</span></article>
        <p>{token.description}</p>
      </div>}
    </section>
  );
}

function TerminalEmpty({ copy }: { copy: string }) { return <div className="terminal-empty-row"><span>{copy}</span></div>; }
function age(createdAt: number) { const seconds = Math.max(1, Math.floor((Date.now() - createdAt) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`; }
