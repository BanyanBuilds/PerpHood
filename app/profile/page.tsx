"use client";

import Link from "next/link";
import {
  Activity,
  Bell,
  BookOpenCheck,
  CircleDollarSign,
  Coins,
  Gift,
  History,
  LayoutDashboard,
  LockKeyhole,
  Rocket,
  Settings2,
  ShieldCheck,
  Swords,
  UserRound,
  WalletCards,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { KeyButton } from "@/components/KeyButton";
import { MobileDock } from "@/components/MobileDock";
import { TokenAvatar } from "@/components/TokenAvatar";
import { useMarkets } from "@/components/MarketProvider";

type ProfileTab = "overview" | "perps" | "spot" | "orders" | "history" | "referrals" | "rewards" | "creator" | "alerts" | "settings";

const TABS: Array<[ProfileTab, string, typeof UserRound]> = [
  ["overview", "Overview", UserRound],
  ["perps", "Perps", Swords],
  ["spot", "Spot", Coins],
  ["orders", "Orders", BookOpenCheck],
  ["history", "History", History],
  ["referrals", "Referrals", Gift],
  ["rewards", "Rewards", CircleDollarSign],
  ["creator", "Creator", Rocket],
  ["alerts", "Alerts", Bell],
  ["settings", "Settings", Settings2],
];

function signedEth(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)} ETH`;
}

function formatCap(value: number) {
  return `$${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value)}`;
}

function formatEth(value: number) {
  return `${value.toFixed(4)} ETH`;
}

export default function ProfilePage() {
  const {
    connected,
    toggleWallet,
    walletAddress,
    balanceEth,
    positions,
    holdings,
    closedTrades,
    pendingOrders,
    tokens,
    getToken,
    getPositionPnl,
    getHoldingPnl,
    cancelOrder,
  } = useMarkets();
  const [tab, setTab] = useState<ProfileTab>("overview");
  const [gasSponsor, setGasSponsor] = useState(true);
  const [sounds, setSounds] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);

  useEffect(() => {
    const applyHash = () => {
      const value = window.location.hash.replace("#", "") as ProfileTab;
      if (TABS.some(([key]) => key === value)) setTab(value);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  const stats = useMemo(() => {
    const realized = closedTrades.filter((trade) => trade.direction !== "spot").reduce((sum, trade) => sum + trade.pnlEth, 0);
    const unrealized = positions.reduce((sum, position) => sum + getPositionPnl(position).pnlEth, 0);
    const spotInvested = holdings.reduce((sum, holding) => sum + holding.investedEth, 0);
    const customTokens = tokens.filter((token) => walletAddress && token.creatorWallet?.toLowerCase() === walletAddress.toLowerCase());
    return { realized, unrealized, total: realized + unrealized, spotInvested, customTokens };
  }, [closedTrades, getPositionPnl, holdings, positions, tokens, walletAddress]);

  const selectTab = (next: ProfileTab) => {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  };

  if (!connected) return <><Header /><main className="profile-page page-shell"><section className="profile-connect-card glass-panel"><span className="profile-avatar large">PH</span><h1>Connect your wallet profile</h1><p>Your profile brings together LEVERAGE X perps, open orders, history, referrals, rewards, alerts, and account preferences. Only one active trading wallet is supported.</p><KeyButton tone="dark" onClick={toggleWallet}><WalletCards size={17} />Connect wallet</KeyButton></section></main><MobileDock /></>;

  return <><Header /><main className="profile-page page-shell">
    <section className="profile-identity-card glass-panel">
      <div className="profile-identity-main"><span className="profile-avatar large">PH</span><span><small>LEVERAGE X PROFILE</small><h1>{walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}` : "Connected wallet"}</h1><p><i />Connected EVM wallet</p></span></div>
      <div className="profile-identity-badges"><span><ShieldCheck size={14} />Single wallet</span><span><Zap size={14} />Gas sponsor eligible</span><span><LockKeyhole size={14} />Session protected</span></div>
      <Link href="/terminal"><KeyButton tone="dark"><LayoutDashboard size={16} />Open terminal</KeyButton></Link>
    </section>

    <section className="profile-account-strip glass-panel">
      <span><small>Available balance</small><strong>{balanceEth.toFixed(4)} ETH</strong></span>
      <span><small>Total perp P&amp;L</small><strong className={stats.total >= 0 ? "positive" : "negative"}>{signedEth(stats.total)}</strong></span>
      <span><small>Open perps</small><strong>{positions.length}</strong></span>
      <span><small>Open orders</small><strong>{pendingOrders.length}</strong></span>
      <span><small>Spot deployed</small><strong>{formatEth(stats.spotInvested)}</strong></span>
    </section>

    <div className="profile-workspace">
      <aside className="profile-tabs glass-panel">{TABS.map(([key, label, Icon]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => selectTab(key)}><Icon size={16} /><span>{label}</span></button>)}</aside>
      <section className="profile-tab-panel glass-panel">
        {tab === "overview" && <div className="profile-section"><header><span><UserRound size={20} /><strong>Account overview</strong></span><small>One profile for the entire LEVERAGE X trading experience.</small></header><div className="profile-overview-grid"><article><small>Realized perp P&amp;L</small><strong className={stats.realized >= 0 ? "positive" : "negative"}>{signedEth(stats.realized)}</strong><span>Only completed LEVERAGE X perpetual trades.</span></article><article><small>Unrealized perp P&amp;L</small><strong className={stats.unrealized >= 0 ? "positive" : "negative"}>{signedEth(stats.unrealized)}</strong><span>Live mark-price P&amp;L after recorded costs.</span></article><article><small>Creator markets</small><strong>{stats.customTokens.length}</strong><span>Tokens launched from this wallet.</span></article><article><small>Account mode</small><strong>Single wallet</strong><span>No bundling or multiwallet execution.</span></article></div><div className="profile-security-note"><ShieldCheck size={20} /><span><strong>Transparent execution</strong><small>No token-account rent, terminal tips, wallet setup fees, or hidden spread markup. Production services pending.</small></span></div></div>}

        {tab === "perps" && <div className="profile-section"><header><span><Swords size={20} /><strong>Perpetual positions</strong></span><small>Your public leaderboard rank uses only realized and unrealized LEVERAGE X perp P&amp;L.</small></header>{positions.length ? <div className="profile-list">{positions.map((position) => { const token = getToken(position.slug); const pnl = getPositionPnl(position).pnlEth; return <Link href={`/market/${token.slug}`} key={position.id}><TokenAvatar token={token} size="sm" /><span><strong>{token.symbol} · {position.direction.toUpperCase()} {position.leverage}×</strong><small>Entry {formatCap(position.entryCap)} · Mark {formatCap(token.markCap ?? token.cap)}</small></span><b className={pnl >= 0 ? "positive" : "negative"}>{signedEth(pnl)}</b></Link>; })}</div> : <Empty icon={Swords} title="No open perps" copy="Open a long or short from any LEVERAGE X market." />}</div>}

        {tab === "spot" && <div className="profile-section"><header><span><Coins size={20} /><strong>Spot portfolio</strong></span><small>Token holdings are visible here but never affect the perps leaderboard.</small></header>{holdings.length ? <div className="profile-list">{holdings.map((holding) => { const token = getToken(holding.slug); const value = getHoldingPnl(holding).executableValueEth; return <Link href={`/market/${token.slug}`} key={holding.id}><TokenAvatar token={token} size="sm" /><span><strong>{token.symbol} · Spot</strong><small>Entry {formatCap(holding.entryCap)} · Current {formatCap(token.cap)}</small></span><b className={value >= holding.investedEth ? "positive" : "negative"}>{formatEth(value)}</b></Link>; })}</div> : <Empty icon={Coins} title="No spot holdings" copy="Spot purchases from LEVERAGE X markets appear here." />}</div>}

        {tab === "orders" && <div className="profile-section"><header><span><BookOpenCheck size={20} /><strong>Open orders</strong></span><small>Limit and trigger orders across your active wallet.</small></header>{pendingOrders.length ? <div className="profile-order-list">{pendingOrders.map((order) => { const token = getToken(order.slug); return <article key={order.id}><TokenAvatar token={token} size="sm" /><span><strong>{token.symbol} · {order.side.toUpperCase()} {order.kind}</strong><small>Trigger {formatCap(order.triggerCap)} · {order.collateral.toFixed(3)} ETH · {order.leverage}×</small></span><button onClick={() => cancelOrder(order.id)}>Cancel</button></article>; })}</div> : <Empty icon={BookOpenCheck} title="No open orders" copy="Orders placed from the chart or trading ticket appear here." />}</div>}

        {tab === "history" && <div className="profile-section"><header><span><History size={20} /><strong>Trade history</strong></span><small>Completed spot and perpetual executions are separated clearly.</small></header>{closedTrades.length ? <div className="profile-history-table"><div><span>Market</span><span>Type</span><span>Entry / Exit</span><span>P&amp;L</span></div>{closedTrades.slice().sort((a,b) => b.closedAt-a.closedAt).slice(0,20).map((trade) => { const token = getToken(trade.slug); return <article key={trade.id}><span><TokenAvatar token={token} size="sm" /><b>{token.symbol}</b></span><span>{trade.direction === "spot" ? "SPOT" : `${trade.direction.toUpperCase()} ${trade.leverage}×`}</span><span>{formatCap(trade.entryCap)} → {formatCap(trade.exitCap)}</span><span className={trade.pnlEth >= 0 ? "positive" : "negative"}>{signedEth(trade.pnlEth)}</span></article>; })}</div> : <Empty icon={History} title="No completed trades" copy="Closed positions and spot sales will build your history." />}</div>}

        {tab === "referrals" && <div className="profile-section"><header><span><Gift size={20} /><strong>Referral program</strong></span><small>Partners earn from settled volume without increasing the trader’s fee.</small></header><div className="profile-referral-hero"><span><small>YOUR CODE</small><strong>Not assigned</strong><em>Connect a verified wallet to create a code</em></span><button onClick={() => undefined}>Copy link</button></div><div className="profile-overview-grid"><article><small>Referred volume</small><strong>$0</strong><span>No settled referred volume.</span></article><article><small>Claimable</small><strong>0 ETH</strong><span>No referral rewards available.</span></article><article><small>Trader discount</small><strong>5%</strong><span>Of LEVERAGE X’s portion for 30 days.</span></article><article><small>Next tier</small><strong>$1M</strong><span>Unlocks a 20% partner share.</span></article></div><div className="profile-security-note"><ShieldCheck size={20} /><span><strong>Anti-abuse protection</strong><small>Self-referrals, likely linked-wallet loops, wash volume, funding, and liquidation penalties earn nothing.</small></span></div></div>}

        {tab === "rewards" && <div className="profile-section"><header><span><CircleDollarSign size={20} /><strong>Rewards</strong></span><small>Reward routing is deliberately disabled while BattlePool solvency is validated.</small></header><div className="profile-overview-grid"><article><small>Holder routing</small><strong>Deferred</strong><span>No BattlePool equity leaves for rewards.</span></article><article><small>Creator routing</small><strong>Disabled</strong><span>Creators receive no fee privilege.</span></article><article><small>Total claimable</small><strong>0 ETH</strong><span>Solvency comes before incentives.</span></article><article><small>Pool policy</small><strong>Retain</strong><span>Fees and liquidation equity remain in the pool.</span></article></div></div>}

        {tab === "creator" && <div className="profile-section"><header><span><Rocket size={20} /><strong>Creator dashboard</strong></span><small>Markets launched by this wallet and their market activity.</small></header>{stats.customTokens.length ? <div className="profile-list">{stats.customTokens.map((token) => <Link href={`/market/${token.slug}`} key={token.slug}><TokenAvatar token={token} size="sm" /><span><strong>{token.symbol} · {token.name}</strong><small>{token.launchState === "auction" ? "Genesis pending" : `${formatCap(token.cap)} market cap`} · ${formatCap(token.volume24h)} volume</small></span><b className="positive">Creator active</b></Link>)}</div> : <Empty icon={Rocket} title="No creator markets" copy="Open the docked Launch workspace from the Terminal to create one." />}<Link className="profile-launch-link" href="/terminal?panel=launch"><Rocket size={15} />Open BattlePool launch</Link></div>}

        {tab === "alerts" && <div className="profile-section"><header><span><Bell size={20} /><strong>Alerts</strong></span><small>Future profile home for market, wallet, funding, liquidation, and order notifications.</small></header><div className="profile-alert-grid"><article><Activity size={20} /><span><strong>Position health</strong><small>Liquidation distance and margin warnings.</small></span><button className="active">On</button></article><article><Bell size={20} /><span><strong>Order fills</strong><small>Limit and trigger execution alerts.</small></span><button className="active">On</button></article><article><WalletCards size={20} /><span><strong>Tracked wallet activity</strong><small>Read-only wallet intelligence; no copy execution.</small></span><button>Off</button></article></div></div>}

        {tab === "settings" && <div className="profile-section"><header><span><Settings2 size={20} /><strong>Profile settings</strong></span><small>Account-level preferences stay separate from each saved terminal layout.</small></header><div className="profile-settings-list"><SettingRow title="Eligible gas sponsorship" copy="LEVERAGE X sponsors normal successful trades when policy permits." active={gasSponsor} setActive={setGasSponsor} /><SettingRow title="Order-fill sounds" copy="Audio confirmation for fills, liquidations, and market moments." active={sounds} setActive={setSounds} /><SettingRow title="Privacy mode" copy="Hide wallet balance and P&amp;L from casual on-screen viewing." active={privateMode} setActive={setPrivateMode} /></div><div className="profile-security-note"><LockKeyhole size={20} /><span><strong>Future security controls</strong><small>Passkeys, session-key permissions, device history, spend policies, and emergency session revocation belong here before mainnet.</small></span></div></div>}
      </section>
    </div>
  </main><MobileDock /></>;
}

function Empty({ icon: Icon, title, copy }: { icon: typeof Swords; title: string; copy: string }) {
  return <div className="profile-empty"><Icon size={26} /><strong>{title}</strong><span>{copy}</span><Link href="/terminal">Open Terminal</Link></div>;
}

function SettingRow({ title, copy, active, setActive }: { title: string; copy: string; active: boolean; setActive: (value: boolean) => void }) {
  return <article><span><strong>{title}</strong><small>{copy}</small></span><button className={active ? "active" : ""} onClick={() => setActive(!active)}><i /></button></article>;
}
