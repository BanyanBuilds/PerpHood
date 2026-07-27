"use client";

import Link from "next/link";
import {
  AtSign,
  Bell,
  BookOpenCheck,
  CalendarDays,
  Cloud,
  Copy,
  Download,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Gift,
  History,
  KeyRound,
  LogOut,
  RefreshCw,
  Rocket,
  Settings2,
  Share2,
  ShieldCheck,
  Swords,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildPnlCalendar, signedEth, summarizePnl } from "@/lib/pnl";
import { sharePnlToX } from "@/lib/pnl-share";
import { useMarkets } from "./MarketProvider";
import { useUserState } from "./UserStateProvider";

type ProfileMenuProps = { onClose: () => void; onOpenPnl?: () => void };

export function ProfileMenu({ onClose, onOpenPnl }: ProfileMenuProps) {
  const { balanceEth, positions, holdings, pendingOrders, closedTrades, getPositionPnl, getHoldingPnl, toggleWallet, walletAddress } = useMarkets();
  const userState = useUserState();
  const [xConnected, setXConnected] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [syncAction, setSyncAction] = useState("");

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    try { setXConnected(localStorage.getItem("perphood-x-connected-v1") === "true"); } catch {}
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const summary = useMemo(() => summarizePnl({
    closedTrades,
    positions,
    holdings,
    getPositionPnl,
    getHoldingPnl,
    period: "all",
    sessionStartedAt: 0,
  }), [closedTrades, getHoldingPnl, getPositionPnl, holdings, positions]);
  const calendar = useMemo(() => buildPnlCalendar(closedTrades, 35), [closedTrades]);

  const links = [
    ["Overview", "Wallet, balances and account health", "/?panel=positions", UserRound],
    ["Perps", "Positions and executable live PNL", "/?panel=positions", Swords],
    ["Spot portfolio", "Token holdings", "/?panel=positions", Coins],
    ["Orders", `${pendingOrders.length} open order${pendingOrders.length === 1 ? "" : "s"}`, "/?panel=positions", BookOpenCheck],
    ["Trade history", "Completed Leverage X trades", "/?panel=trade-tracker", History],
    ["Referrals", "Volume-based partner rewards", "/?panel=referrals", Gift],
    ["Holder rewards", "BattlePool community distributions", "/?panel=positions", CircleDollarSign],
    ["Creator", "Launches and community health", "/?panel=launch", Rocket],
    ["Alerts", "Price, wallet and position alerts", "/?panel=alerts", Bell],
    ["Settings", "Security, FPS and terminal preferences", "/?settings=1", Settings2],
  ] as const;

  const toggleX = () => {
    const next = !xConnected;
    setXConnected(next);
    localStorage.setItem("perphood-x-connected-v1", String(next));
  };

  const share = async () => {
    try {
      const result = await sharePnlToX({ title: "My all-time Leverage X PNL", subtitle: "Robinhood Chain BattlePool", summary, periodLabel: "All time" });
      setShareStatus(result === "shared" ? "Shared" : "Card downloaded · X opened");
    } catch { setShareStatus("Share cancelled"); }
    window.setTimeout(() => setShareStatus(""), 2200);
  };

  return <div className="profile-sidebar-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.currentTarget === event.target) onClose();
  }}>
    <aside className="profile-sidebar" role="dialog" aria-modal="true" aria-label="Leverage X trading account">
      <header className="profile-sidebar-title">
        <span><strong>Trading identity</strong><small>One active owner wallet · one X profile · revocable session key</small></span>
        <button onClick={onClose} aria-label="Close account sidebar"><X size={18} /></button>
      </header>

      <div className="profile-popover-head">
        <span className="profile-avatar">PH</span>
        <span><strong>{walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "Local profile"}</strong><small>{walletAddress ? "External owner wallet · Robinhood Chain" : "Connect a wallet when contract execution is enabled"}</small></span>
        <ShieldCheck size={18} />
      </div>

      <div className="profile-popover-balance">
        <span><small>Trading balance</small><strong>{balanceEth.toFixed(4)} ETH</strong></span>
        <span><small>All-time executable PNL</small><strong className={summary.totalEth >= 0 ? "positive" : "negative"}>{signedEth(summary.totalEth)}</strong></span>
      </div>

      <section className="profile-identity-stack">
        <div><WalletCards size={16} /><span><strong>Owner wallet</strong><small>User-controlled and exportable in the wallet app. Only one is active for trading.</small></span><b>Active</b></div>
        <div><KeyRound size={16} /><span><strong>Trading session key</strong><small>Non-exportable, scoped, revocable, and never owns funds.</small></span><b>Authorized</b></div>
        <button onClick={toggleX}><AtSign size={16} /><span><strong>{xConnected ? "X profile connected" : "Connect X profile"}</strong><small>{xConnected ? "PNL sharing and public identity enabled." : "Required for verified public profile and social sharing."}</small></span><b>{xConnected ? "Connected" : "Connect"}</b></button>
      </section>

      <section className="profile-sync-card">
        <header><span><Cloud size={16} /><span><strong>User-state sync</strong><small>{userState.message}</small></span></span><b className={userState.status}>{userState.status.replace("-", " ")}</b></header>
        <div><span><small>Revision</small><strong>{userState.revision}</strong></span><span><small>Synced sections</small><strong>{Object.keys(userState.document.sections).length}</strong></span><span><small>Recovery key</small><strong>{userState.recoveryKey ? `${userState.recoveryKey.slice(0, 9)}…${userState.recoveryKey.slice(-5)}` : "Loading"}</strong></span></div>
        <footer>
          <button onClick={async () => { const copied = await userState.copyRecoveryKey(); setSyncAction(copied ? "Recovery key copied" : "Copy failed"); window.setTimeout(() => setSyncAction(""), 1800); }}><Copy size={13} />Copy key</button>
          <button onClick={() => { const value = window.prompt("Paste your LEVERAGE X V53 settings recovery key. This restores settings only—not funds or trading authority."); if (!value) return; const accepted = userState.importRecoveryKey(value); setSyncAction(accepted ? "Importing…" : "Invalid recovery key"); }}><Download size={13} />Import key</button>
          <button onClick={() => { void userState.syncNow(); }}><RefreshCw size={13} />Sync now</button>
          {syncAction && <em>{syncAction}</em>}
        </footer>
        <p>This key restores presets, layouts, watchlists, likes, and alerts. It cannot move funds, sign trades, or withdraw assets.</p>
      </section>

      <section className="profile-pnl-card">
        <header><span><strong>All-time PNL</strong><small>{summary.trades} settled trades · {summary.winRate.toFixed(1)}% win rate</small></span><div><button onClick={() => { onOpenPnl?.(); onClose(); }} title="Open floating live PNL"><CircleDollarSign size={15} /></button><button onClick={share} title="Share PNL to X"><Share2 size={15} /></button></div></header>
        <strong className={summary.totalEth >= 0 ? "positive" : "negative"}>{signedEth(summary.totalEth)}</strong>
        <div><span><small>Realized</small><b>{signedEth(summary.realizedEth, 3)}</b></span><span><small>Live</small><b>{signedEth(summary.unrealizedEth, 3)}</b></span><span><small>Best</small><b>{signedEth(summary.bestTradeEth, 3)}</b></span></div>
        <div className="profile-pnl-calendar">{calendar.map((day) => <i key={day.dateKey} className={day.pnlEth > 0 ? "gain" : day.pnlEth < 0 ? "loss" : "flat"} title={`${day.label}: ${signedEth(day.pnlEth)} · ${day.trades} trades`} />)}</div>
        <footer><CalendarDays size={13} />35-day settled PNL calendar{shareStatus ? <b>{shareStatus}</b> : null}</footer>
      </section>

      <nav className="profile-popover-links">
        {links.map(([label, subtitle, href, Icon]) => <Link key={label} href={href} onClick={onClose}>
          <Icon size={16} />
          <span><strong>{label}</strong><small>{subtitle}</small></span>
          <ChevronRight size={14} />
        </Link>)}
      </nav>

      <div className="profile-wallet-actions">
        <button title="Switching revokes the active session key"><RefreshCw size={15} />Switch owner wallet</button>
        <button className="profile-disconnect" onClick={() => { toggleWallet(); onClose(); }}><LogOut size={15} />Disconnect</button>
      </div>
    </aside>
  </div>;
}
