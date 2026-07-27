"use client";

import Link from "next/link";
import {
  AtSign,
  Bell,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Copy,
  Download,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { buildPnlCalendar, signedEth, summarizePnl } from "@/lib/pnl";
import { sharePnlToX } from "@/lib/pnl-share";
import { useMarkets } from "./MarketProvider";
import { useUserState } from "./UserStateProvider";

type ProfileMenuProps = { onClose: () => void; onOpenPnl?: () => void };

type AccountLink = {
  label: string;
  detail: string;
  href: string;
  icon: typeof UserRound;
};

const LINK_GROUPS: Array<{ label: string; links: AccountLink[] }> = [
  {
    label: "Trading",
    links: [
      { label: "Perps", detail: "Positions and live PNL", href: "/?panel=positions", icon: Swords },
      { label: "Spot portfolio", detail: "Tokens and cost basis", href: "/?panel=positions", icon: Coins },
      { label: "Orders", detail: "Open and conditional orders", href: "/?panel=positions", icon: BookOpenCheck },
      { label: "Trade history", detail: "Settled Leverage X trades", href: "/?panel=trade-tracker", icon: History },
    ],
  },
  {
    label: "Account",
    links: [
      { label: "Creator", detail: "Launches and market health", href: "/?panel=launch", icon: Rocket },
      { label: "Referrals", detail: "Partner rewards", href: "/?panel=referrals", icon: Gift },
      { label: "Alerts", detail: "Price and risk notifications", href: "/?panel=alerts", icon: Bell },
      { label: "Settings", detail: "Security and terminal preferences", href: "/?settings=1", icon: Settings2 },
    ],
  },
];

export function ProfileMenu({ onClose, onOpenPnl }: ProfileMenuProps) {
  const {
    balanceEth,
    positions,
    holdings,
    pendingOrders,
    closedTrades,
    getPositionPnl,
    getHoldingPnl,
    toggleWallet,
    walletAddress,
  } = useMarkets();
  const userState = useUserState();
  const sidebarRef = useRef<HTMLElement>(null);
  const [xConnected, setXConnected] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const closeOnOutsidePress = (event: PointerEvent) => {
      const panel = sidebarRef.current;
      if (panel && !panel.contains(event.target as Node)) onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    try {
      const current = localStorage.getItem("leveragex-x-connected-v1");
      const legacy = localStorage.getItem("perphood-x-connected-v1");
      setXConnected((current ?? legacy) === "true");
    } catch {}

    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePress, true);
    };
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
  const shortAddress = walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "Local account";

  const flash = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(""), 1900);
  };

  const copyWallet = async () => {
    if (!walletAddress) {
      flash("Connect a wallet first");
      return;
    }
    try {
      await navigator.clipboard.writeText(walletAddress);
      flash("Wallet copied");
    } catch {
      flash("Copy unavailable");
    }
  };

  const toggleX = () => {
    const next = !xConnected;
    setXConnected(next);
    try { localStorage.setItem("leveragex-x-connected-v1", String(next)); } catch {}
    flash(next ? "X profile connected" : "X profile disconnected");
  };

  const share = async () => {
    try {
      const result = await sharePnlToX({
        title: "My all-time Leverage X PNL",
        subtitle: "Robinhood Chain BattlePool",
        summary,
        periodLabel: "All time",
      });
      flash(result === "shared" ? "Shared to X" : "PNL card downloaded");
    } catch {
      flash("Share cancelled");
    }
  };

  return <aside ref={sidebarRef} className="lx-profile-drawer" aria-label="Leverage X account panel">
    <header className="lx-profile-topbar">
      <span>
        <strong>Account</strong>
        <small>Trading identity and performance</small>
      </span>
      <div>
        <span className="lx-profile-live"><i />Live</span>
        <button type="button" onClick={onClose} aria-label="Close account panel"><X size={17} /></button>
      </div>
    </header>

    <section className="lx-profile-identity">
      <span className="lx-profile-avatar">LX</span>
      <span className="lx-profile-wallet-copy">
        <small>{walletAddress ? "Owner wallet" : "Wallet status"}</small>
        <strong>{shortAddress}</strong>
        <em>{walletAddress ? "Robinhood Chain · external custody" : "Connect to activate account execution"}</em>
      </span>
      <button type="button" onClick={copyWallet} aria-label="Copy wallet address"><Copy size={15} /></button>
    </section>

    <section className="lx-profile-metrics" aria-label="Account metrics">
      <span><small>Balance</small><strong>{balanceEth.toFixed(4)} ETH</strong></span>
      <span><small>All-time PNL</small><strong className={summary.totalEth >= 0 ? "positive" : "negative"}>{signedEth(summary.totalEth)}</strong></span>
      <span><small>Open</small><strong>{positions.length + pendingOrders.length}</strong></span>
    </section>

    <section className="lx-profile-pnl">
      <header>
        <span>
          <small>Performance</small>
          <strong>{summary.trades} settled · {summary.winRate.toFixed(1)}% win rate</strong>
        </span>
        <div>
          <button type="button" onClick={() => { onOpenPnl?.(); onClose(); }} title="Open floating PNL"><CircleDollarSign size={15} /></button>
          <button type="button" onClick={share} title="Share PNL"><Share2 size={15} /></button>
        </div>
      </header>
      <div className="lx-profile-pnl-values">
        <span><small>Realized</small><b>{signedEth(summary.realizedEth, 3)}</b></span>
        <span><small>Live</small><b>{signedEth(summary.unrealizedEth, 3)}</b></span>
        <span><small>Best</small><b>{signedEth(summary.bestTradeEth, 3)}</b></span>
      </div>
      <div className="lx-profile-calendar" aria-label="35-day settled PNL calendar">
        {calendar.map((day) => <i key={day.dateKey} className={day.pnlEth > 0 ? "gain" : day.pnlEth < 0 ? "loss" : "flat"} title={`${day.label}: ${signedEth(day.pnlEth)} · ${day.trades} trades`} />)}
      </div>
      <footer><CalendarDays size={12} />Last 35 days</footer>
    </section>

    <nav className="lx-profile-navigation" aria-label="Account navigation">
      {LINK_GROUPS.map((group) => <section key={group.label}>
        <header>{group.label}</header>
        {group.links.map(({ label, detail, href, icon: Icon }) => <Link key={label} href={href} onClick={onClose}>
          <Icon size={16} />
          <span><strong>{label}</strong><small>{label === "Orders" ? `${pendingOrders.length} open · ${detail}` : detail}</small></span>
          <ChevronRight size={14} />
        </Link>)}
      </section>)}
    </nav>

    <section className="lx-profile-access">
      <header><span><ShieldCheck size={15} /><strong>Access & sync</strong></span><b className={userState.status}>{userState.status.replace("-", " ")}</b></header>
      <div className="lx-profile-status-line">
        <span><WalletCards size={14} /><small>Owner wallet</small><b>{walletAddress ? "Active" : "Offline"}</b></span>
        <span><KeyRound size={14} /><small>Session key</small><b>{walletAddress ? "Scoped" : "Waiting"}</b></span>
        <button type="button" onClick={toggleX}><AtSign size={14} /><small>X profile</small><b>{xConnected ? "Connected" : "Connect"}</b></button>
      </div>
      <div className="lx-profile-sync-actions">
        <button type="button" onClick={async () => { const copied = await userState.copyRecoveryKey(); flash(copied ? "Recovery key copied" : "Copy failed"); }}><Copy size={13} />Recovery key</button>
        <button type="button" onClick={() => {
          const value = window.prompt("Paste your Leverage X settings recovery key. This restores settings only—not funds or trading authority.");
          if (!value) return;
          flash(userState.importRecoveryKey(value) ? "Importing settings" : "Invalid recovery key");
        }}><Download size={13} />Import</button>
        <button type="button" onClick={() => { void userState.syncNow(); flash("Sync requested"); }}><RefreshCw size={13} />Sync</button>
      </div>
      <p>{userState.message} · revision {userState.revision}</p>
    </section>

    <footer className="lx-profile-footer">
      <button type="button" title="Switching revokes the active session key"><RefreshCw size={14} />Switch wallet</button>
      <button type="button" className="danger" onClick={() => { toggleWallet(); onClose(); }}><LogOut size={14} />Disconnect</button>
    </footer>

    <div className={`lx-profile-feedback${feedback ? " visible" : ""}`} role="status" aria-live="polite">
      {feedback && <><Check size={13} />{feedback}</>}
    </div>
  </aside>;
}
