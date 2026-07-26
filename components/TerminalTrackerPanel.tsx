"use client";

import Link from "next/link";
import { Activity, ExternalLink, Gift, Star, TrendingDown, TrendingUp, X as XIcon } from "lucide-react";
import type { Direction, Token } from "@/lib/types";
import { compact, money } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";
import { useMarkets } from "./MarketProvider";

export type TrackerPanelKind = "trade-tracker" | "watchlist" | "wallets" | "alerts" | "news" | "positions" | "referrals";

const WALLETS = [
  ["Hood Whale", "0xA4D…921", "+12.84 ETH", 74],
  ["First Block", "0xC22…4B0", "+7.19 ETH", 68],
  ["Frog Machine", "0x91F…A73", "+3.42 ETH", 61],
  ["Quiet Short", "0xE80…129", "+2.17 ETH", 57],
  ["Curve Runner", "0x6BA…44D", "+1.66 ETH", 54],
] as const;

function PanelHeader({ title, subtitle, onClose }: { title: string; subtitle: string; onClose: () => void }) {
  return <div className="tracker-panel-header"><span><small>{subtitle}</small><strong>{title}</strong></span><button onClick={onClose} aria-label="Close panel"><XIcon size={16} /></button></div>;
}

export function TerminalTrackerPanel({ kind, onClose, onTrade }: { kind: TrackerPanelKind; onClose: () => void; onTrade: (token: Token, side: Direction) => void }) {
  const { tokens, events, watchlist, toggleWatchlist, positions, holdings, closePosition, getPositionPnl } = useMarkets();
  const hot = [...tokens].filter((token) => token.launchState !== "auction").sort((a, b) => b.volume24h - a.volume24h);

  if (kind === "trade-tracker") return <div className="tracker-panel-content"><PanelHeader title="Trade Tracker" subtitle="SMART WALLET FLOW" onClose={onClose} /><div className="tracker-summary"><span><small>Tracked wallets</small><b>18</b></span><span><small>Net flow</small><b className="positive">+8.42 ETH</b></span><span><small>Hit rate</small><b>64%</b></span></div><div className="tracker-feed">
    {[...events].slice(0, 14).map((event, index) => { const token = tokens.find((item) => item.slug === event.slug) ?? hot[index % hot.length]; const positive = ["spot-buy", "long", "whale-buy", "short-squeeze", "order-fill"].includes(event.action); return <article className="wallet-trade-row" key={event.id}><div className="wallet-trade-icon">{positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}</div><span><strong>{event.actor ?? WALLETS[index % WALLETS.length][1]}</strong><small>{event.action.replaceAll("-", " ")} · {Math.max(1, index + 1)}s</small></span><span><b className={positive ? "positive" : "negative"}>{event.amountEth.toFixed(3)} ETH</b><small>{token.symbol} · {money(event.marketCap)}</small></span><button onClick={() => onTrade(token, positive ? "long" : "short")}>Trade</button></article>; })}
    {!events.length && WALLETS.map((wallet, index) => { const token = hot[index % hot.length]; return <article className="wallet-trade-row" key={wallet[1]}><div className="wallet-trade-icon"><Activity size={14} /></div><span><strong>{wallet[0]}</strong><small>{wallet[1]} · {index + 1}m</small></span><span><b className="positive">Bought {(.012 + index * .009).toFixed(3)} ETH</b><small>{token.symbol} · {money(token.cap)}</small></span><button onClick={() => onTrade(token, "buy")}>Trade</button></article>; })}
  </div></div>;

  if (kind === "watchlist") return <div className="tracker-panel-content"><PanelHeader title="Watchlist" subtitle="YOUR MARKETS" onClose={onClose} /><div className="tracker-feed">{tokens.filter((token) => watchlist.includes(token.slug)).length ? tokens.filter((token) => watchlist.includes(token.slug)).map((token) => <article className="watchlist-track-row" key={token.slug}><Link href={`/market/${token.slug}`}><TokenAvatar token={token} size="sm" /><span><strong>{token.symbol}</strong><small>{money(token.cap)} · {token.change24h.toFixed(2)}%</small></span></Link><button onClick={() => onTrade(token, "long")}>Long</button><button onClick={() => toggleWatchlist(token.slug)}><Star size={12} fill="currentColor" /></button></article>) : <div className="tracker-empty"><Star size={26} /><strong>No watched markets</strong><p>Star a token from any trench or market page.</p></div>}</div></div>;

  if (kind === "positions") return <div className="tracker-panel-content"><PanelHeader title="Positions" subtitle="LIVE PERP RISK" onClose={onClose} /><div className="tracker-summary"><span><small>Open perps</small><b>{positions.length}</b></span><span><small>Spot bags</small><b>{holdings.length}</b></span><span><small>Mode</small><b>Isolated</b></span></div><div className="tracker-feed">{positions.length ? positions.map((position) => { const token = tokens.find((item) => item.slug === position.slug) ?? hot[0]; const pnl = getPositionPnl(position).pnlEth; return <article className="terminal-position-card" key={position.id}><div><TokenAvatar token={token} size="sm" /><span><strong>{position.leverage}× {position.direction.toUpperCase()} {token.symbol}</strong><small>Entry {money(position.entryCap)} · Liq {money(position.liquidationCap)}</small></span></div><b className={pnl >= 0 ? "positive" : "negative"}>{pnl >= 0 ? "+" : ""}{pnl.toFixed(4)} ETH</b><div className="position-close-actions">{position.executionMode !== "v43-contract" && <><button onClick={() => { void closePosition(position.id, .25); }}>25%</button><button onClick={() => { void closePosition(position.id, .5); }}>50%</button></>}<button className="close-all" onClick={() => { void closePosition(position.id, 1); }}>Close</button><Link href={`/market/${token.slug}`}>Chart</Link></div></article>; }) : <div className="tracker-empty"><Activity size={26} /><strong>No open perps</strong><p>Open a long or short from any terminal row.</p></div>}</div></div>;

  if (kind === "referrals") return <div className="tracker-panel-content"><PanelHeader title="Referrals" subtitle="PARTNER PROGRAM" onClose={onClose} /><div className="tracker-empty"><Gift size={22} /><strong>No referral activity</strong><p>Your referral code and settled rewards will appear after wallet authentication and the partner service are connected.</p></div></div>;
  return <div className="tracker-panel-content"><PanelHeader title="Perp Pulse" subtitle="FUNDING · OI · LIQUIDATIONS" onClose={onClose} /><div className="tracker-feed">{hot.slice(0, 8).map((token, index) => <article className="terminal-news-row" key={token.slug}><small>{index + 2}m ago · ROBINHOOD CHAIN</small><strong>{token.symbol} {index % 3 === 0 ? "funding flips as short demand accelerates" : index % 3 === 1 ? "moves into the terminal’s highest-volume markets" : "shows a liquidation cluster near the current mark"}</strong><p>{index % 2 ? "Liquidity, oracle confidence, and wallet concentration remain visible inside the market risk strip." : "Traders are watching the one-second chart and smart-wallet flow for the next move."}</p><Link href={`/market/${token.slug}`}>Open market <ExternalLink size={11} /></Link></article>)}</div></div>;
}
