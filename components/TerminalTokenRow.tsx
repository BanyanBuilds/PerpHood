"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Bell, Copy, Eye, Flame, Heart, MessageCircle, Radio, ShieldCheck, Star, Users, Zap } from "lucide-react";
import type { Direction, Token } from "@/lib/types";
import type { MoversScore } from "@/lib/movers-engine";
import type { QuickPerpPreset } from "@/lib/terminal-settings";
import { compact, money, percent } from "@/lib/format";
import { TokenAvatar } from "./TokenAvatar";
import { OgBadge } from "./OgBadge";
import { useMarkets } from "./MarketProvider";
import { MarketIntelBadge } from "./MarketIntelBadge";

function ageLabel(minutes: number) {
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export function TerminalTokenRow({ token, compactMode, quickBuyEth, quickLongPreset, quickShortPreset, pendingSide, quickActionsLocked = false, onTrade, liked, likes, moverScore, onLike }: { token: Token; compactMode: boolean; quickBuyEth: number; quickLongPreset: QuickPerpPreset; quickShortPreset: QuickPerpPreset; pendingSide?: Direction | null; quickActionsLocked?: boolean; onTrade: (token: Token, side: Direction) => void; liked?: boolean; likes?: number; moverScore?: MoversScore; onLike?: () => void }) {
  const router = useRouter();
  const { watchlist, toggleWatchlist, getMigrationSnapshot } = useMarkets();
  const watched = watchlist.includes(token.slug);
  const opening = token.launchState === "auction";
  const creator = `@${token.slug.slice(0, 7)}hood`;
  const holderCount = token.uniqueTraders ?? Math.max(12, Math.round(token.volume24h / 3000));
  const confidence = Math.round(token.oracleConfidence ?? 0);
  const leverage = token.maxLeverageUnlocked ?? 0;
  const marketHref = `/market/${token.slug}`;
  const lifecycle = token.launchpadVersion ? getMigrationSnapshot(token) : null;

  function openMarketFromRow(event: React.MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [data-row-action]")) return;
    router.push(marketHref);
  }

  function openMarketFromKeyboard(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    router.push(marketHref);
  }

  return (
    <article
      className={`terminal-token-row ${compactMode ? "is-compact" : ""} ${opening ? "is-opening" : ""} ${token.ogStatus !== "copy" ? "is-og-token" : ""} ${moverScore ? "has-mover-score" : ""}`}
      role="link"
      tabIndex={0}
      aria-label={`Open ${token.symbol} market`}
      onClick={openMarketFromRow}
      onKeyDown={openMarketFromKeyboard}
    >
      <div className="terminal-row-main">
        <div className="terminal-row-avatar"><TokenAvatar token={token} size="sm" /><i className={token.change24h >= 0 ? "positive-dot" : "negative-dot"} /></div>
        <div className="terminal-row-identity">
          <div><strong>{token.symbol}</strong><OgBadge token={token} compact /><span>{token.name}</span>{token.featured && <em><Flame size={9} />HOT</em>}{lifecycle && <em className={`terminal-lifecycle ${lifecycle.phase}`}>{lifecycle.phase}</em>}</div>
          <small><b className={opening ? "opening-copy" : "positive"}>{opening ? "OPENING" : ageLabel(token.launchedMinutesAgo)}</b><span>{creator}</span></small>
        </div>
      </div>

      <div className="terminal-row-value">
        <strong>{opening ? "LEGACY" : money(token.cap)}</strong>
        <small className={opening ? "" : token.change24h >= 0 ? "positive" : "negative"}>{opening ? `${(token.auctionCommittedEth ?? 0).toFixed(3)} ETH` : percent(token.change24h)}</small>
      </div>

      <div className="terminal-row-signals">
        <span title="Unique traders"><Users size={10} />{holderCount}</span>
        <span title="Tracked views"><Eye size={10} />{Math.max(3, Math.round(token.volume24h / 5200))}</span>
        <span title="Social mentions"><MessageCircle size={10} />{Math.max(1, Math.round(Math.abs(token.change24h)))}</span>
        <span title="Oracle confidence"><ShieldCheck size={10} />{confidence}%</span>
        <span title="Leverage live"><Zap size={10} />{opening ? "NEXT" : `${leverage}×`}</span>
        <span title="Community likes"><Heart size={10} fill={liked ? "currentColor" : "none"} />{likes ?? 0}</span>
        <MarketIntelBadge token={token} compact />
      </div>

      {moverScore && <div className="terminal-mover-score">
        <span className={`mover-score-number ${moverScore.score >= 70 ? "hot" : moverScore.score >= 55 ? "active" : ""}`}><b>{moverScore.score.toFixed(0)}</b><small>{moverScore.label}</small></span>
        <div className="mover-score-reasons">{moverScore.reasons.map((reason) => <span className={reason.tone} key={`${reason.key}-${reason.label}`}>{reason.label}</span>)}</div>
        <em>{moverScore.dataQuality}</em>
      </div>}

      <div className="terminal-row-metrics">
        <span className={token.longs >= 50 ? "positive" : "negative"}><ArrowUpRight size={10} />{Math.round(token.longs)}%</span>
        <span><Radio size={10} />V {compact(token.volume24h)}</span>
        <span>OI {compact(token.openInterest)}</span>
        <span className={(token.linkedWalletConcentration ?? 0) > 22 ? "negative" : "positive"}>Cluster {(token.linkedWalletConcentration ?? 0).toFixed(0)}%</span>
        <span className={token.funding >= 0 ? "positive" : "negative"}>F {token.funding >= 0 ? "+" : ""}{token.funding.toFixed(3)}%</span>
      </div>

      <div className="terminal-row-actions">
        <div className="terminal-row-utility-actions">
          <button data-row-action className={liked ? "active like-button" : "like-button"} onClick={onLike} aria-label="Like token"><Heart size={11} fill={liked ? "currentColor" : "none"} /></button>
          <button data-row-action className={watched ? "active" : ""} onClick={() => toggleWatchlist(token.slug)} aria-label="Toggle watchlist"><Star size={11} fill={watched ? "currentColor" : "none"} /></button>
          <button data-row-action aria-label="Copy token address" onClick={() => navigator.clipboard?.writeText(`0x${token.slug.padEnd(38, "0")}`)}><Copy size={11} /></button>
          <button data-row-action aria-label="Create alert"><Bell size={11} /></button>
        </div>
        <div className="terminal-row-trade-actions">
          {opening ? <Link className="terminal-row-open-key opening" href={`/market/${token.slug}`}><Zap size={10} />Join</Link> : <>
            <button data-row-action className="terminal-row-open-key buy" disabled={quickActionsLocked} title={`Quick buy ${quickBuyEth} ETH`} aria-label={`Quick buy ${quickBuyEth} ETH of ${token.symbol}`} onClick={() => onTrade(token, "buy")}><Zap size={13} /><span>{pendingSide === "buy" ? "Sending" : quickBuyEth.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span><small>ETH BUY</small></button>
            <button
              data-row-action
              className={`terminal-row-open-key long preset-action ${quickLongPreset.enabled ? "" : "preset-disabled"}`}
              disabled={!quickLongPreset.enabled || quickActionsLocked}
              title={quickLongPreset.enabled ? `Quick Long ${quickLongPreset.collateralEth} ETH at ${quickLongPreset.leverage}×` : "Set the Quick Long preset in this column before using it"}
              aria-label={quickLongPreset.enabled ? `Quick Long ${token.symbol} with ${quickLongPreset.collateralEth} ETH at ${quickLongPreset.leverage} times leverage` : `Quick Long preset is not configured for ${token.symbol}`}
              onClick={() => onTrade(token, "long")}
            ><ArrowUpRight size={12} /><span>{pendingSide === "long" ? "Sending" : quickLongPreset.enabled ? quickLongPreset.collateralEth.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "SET"}</span><small>{quickLongPreset.enabled ? `${quickLongPreset.leverage}× LONG` : "LONG"}</small></button>
            <button
              data-row-action
              className={`terminal-row-open-key short preset-action ${quickShortPreset.enabled ? "" : "preset-disabled"}`}
              disabled={!quickShortPreset.enabled || quickActionsLocked}
              title={quickShortPreset.enabled ? `Quick Short ${quickShortPreset.collateralEth} ETH at ${quickShortPreset.leverage}×` : "Set the Quick Short preset in this column before using it"}
              aria-label={quickShortPreset.enabled ? `Quick Short ${token.symbol} with ${quickShortPreset.collateralEth} ETH at ${quickShortPreset.leverage} times leverage` : `Quick Short preset is not configured for ${token.symbol}`}
              onClick={() => onTrade(token, "short")}
            ><ArrowDownRight size={12} /><span>{pendingSide === "short" ? "Sending" : quickShortPreset.enabled ? quickShortPreset.collateralEth.toLocaleString(undefined, { maximumFractionDigits: 6 }) : "SET"}</span><small>{quickShortPreset.enabled ? `${quickShortPreset.leverage}× SHORT` : "SHORT"}</small></button>
          </>}
        </div>
      </div>
    </article>
  );
}
