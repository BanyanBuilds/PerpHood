"use client";

/* eslint-disable react-hooks/set-state-in-effect -- localStorage layout hydration intentionally runs once after mount. */

import {
  Activity,
  Bell,
  CircleDollarSign,
  Crosshair,
  Filter,
  Heart,
  Info,
  RadioTower,
  Newspaper,
  PanelLeftClose,
  PanelRightClose,
  SlidersHorizontal,
  Plus,
  PlusCircle,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  TrendingUp,
  WalletCards,
  BriefcaseBusiness,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import type { Direction, Token } from "@/lib/types";
import type { XLaunchDraft } from "@/lib/x-launch-feed";
import { DEFAULT_CATEGORY_SETTINGS, getActiveExecutionPreset, getQuickPerpPreset, normalizeCategorySettings, type CategoryTradingSettings, type TerminalCategoryKey, type TerminalCategorySettingsMap } from "@/lib/terminal-settings";
import { MOVERS_WEIGHTS, rankMovers, stabilizeMoversRanking, type MoversScore } from "@/lib/movers-engine";
import { analyzeMarket } from "@/lib/market-intelligence";
import { LaunchPanel } from "./LaunchPanel";
import { BrandMark } from "./icons";
import { KeyButton } from "./KeyButton";
import { useMarkets } from "./MarketProvider";
import { TerminalTokenRow } from "./TerminalTokenRow";
import { TerminalTrackerPanel, type TrackerPanelKind } from "./TerminalTrackerPanel";
import { XLaunchFeedPanel } from "./XLaunchFeedPanel";
import { TerminalSearchOverlay } from "./TerminalSearchOverlay";
import { TerminalPositionWatchStrip, type PositionWatchStripSettings } from "./TerminalPositionWatchStrip";
import { FloatingPnlWidget } from "./FloatingPnlWidget";
import { TerminalCategorySettings } from "./TerminalCategorySettings";
import { TransactionLifecycleTracker } from "./TransactionLifecycleTracker";
import { TerminalSidecar, type SidecarPlacement } from "./TerminalSidecar";
import { ProfileMenu } from "./ProfileMenu";
import { useOutsideDismiss } from "./useOutsideDismiss";
import { useTerminalPerformance, type RenderFpsMode } from "./TerminalPerformanceProvider";
import { useUserState } from "./UserStateProvider";

type DrawerKind = "launch" | "x-launch-feed" | TrackerPanelKind;
type ColumnKind = "new" | "cooking" | "migrated";
type MoverColumnKind = "movers" | "liked" | "market-cap";
type WorkspaceView = "markets" | "movers";
type SortMode = "activity" | "market-cap" | "volume" | "age";

type PersistedTerminalLayout = {
  compactMode?: boolean;
  hideLowConfidence?: boolean;
  showSignals?: boolean;
  sortMode?: Record<ColumnKind, SortMode>;
  categorySettings?: TerminalCategorySettingsMap;
  panelPlacement?: Record<DrawerKind, SidecarPlacement>;
  stripSettings?: PositionWatchStripSettings;
  bottomDockSettings?: { showConnection: boolean; showLaunch: boolean; showEngine: boolean; showLabels: boolean; compact: boolean };
  workspaceView?: WorkspaceView;
  pnlWidgetOpen?: boolean;
  openPanels?: DrawerKind[];
};

const MAX_LEFT_DOCK_PANELS = 3;

const DEFAULT_PANEL_PLACEMENT: Record<DrawerKind, SidecarPlacement> = {
  "x-launch-feed": "left",
  "trade-tracker": "right",
  watchlist: "left",
  wallets: "left",
  alerts: "right",
  news: "right",
  positions: "right",
  referrals: "right",
  launch: "right",
};

const TERMINAL_TOOLS: Array<[DrawerKind, string, ComponentType<{ size?: number }>, "left" | "right"]> = [
  ["launch", "Launch", PlusCircle, "right"],
  ["x-launch-feed", "X Launch Feed", RadioTower, "left"],
  ["trade-tracker", "Trade Tracker", Activity, "right"],
  ["watchlist", "Watchlist", Star, "left"],
  ["wallets", "Wallets", WalletCards, "left"],
  ["alerts", "Alerts", Bell, "right"],
  ["news", "Perp Pulse", Newspaper, "right"],
  ["positions", "Positions", BriefcaseBusiness, "right"],
];

function scoreToken(token: Token) {
  return analyzeMarket(token).composite;
}

function likesFor(token: Token, liked = false) {
  const organic = Math.max(4, Math.round((token.uniqueTraders ?? 12) * 1.75 + Math.abs(token.change24h) * 1.8));
  return organic + (liked ? 1 : 0);
}

function sortTokens(tokens: Token[], mode: SortMode) {
  const list = [...tokens];
  if (mode === "market-cap") return list.sort((a, b) => b.cap - a.cap);
  if (mode === "volume") return list.sort((a, b) => b.volume24h - a.volume24h);
  if (mode === "age") return list.sort((a, b) => a.launchedMinutesAgo - b.launchedMinutesAgo);
  return list.sort((a, b) => scoreToken(b) - scoreToken(a));
}

function ColumnHeader({
  kind,
  title,
  subtitle,
  count,
  query,
  setQuery,
  sortMode,
  setSortMode,
  settings,
  onSettingsChange,
}: {
  kind: ColumnKind;
  title: string;
  subtitle: string;
  count: number;
  query: string;
  setQuery: (value: string) => void;
  sortMode: SortMode;
  setSortMode: (value: SortMode) => void;
  settings: CategoryTradingSettings;
  onSettingsChange: (value: CategoryTradingSettings) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterRootRef = useRef<HTMLElement>(null);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  useOutsideDismiss([filterRootRef], closeFilters, filtersOpen);
  return (
    <header ref={filterRootRef} className="trench-column-head">
      <div className="trench-column-title">
        <span className={`trench-column-icon ${kind}`}><i /></span>
        <span><strong>{title}</strong><small>{subtitle} · {count} markets</small></span>
      </div>
      <div className="trench-column-controls">
        <label className="column-market-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>
        <QuickAmountEditor value={settings.quickBuyEth} onCommit={(quickBuyEth) => onSettingsChange({ ...settings, quickBuyEth })} label={title} />
        <button className={settings.positiveOnly ? "active" : ""} onClick={() => onSettingsChange({ ...settings, positiveOnly: !settings.positiveOnly })} title="Only positive momentum"><TrendingUp size={12} /></button>
        <button className={filtersOpen ? "active" : ""} onClick={() => setFiltersOpen(!filtersOpen)} title="Sort column"><Filter size={12} /></button>
        <TerminalCategorySettings category={kind} label={title} value={settings} onChange={onSettingsChange} />
      </div>
      {filtersOpen && <div className="trench-column-filter-popover">
        <span>Sort markets</span>
        {(["activity", "market-cap", "volume", "age"] as SortMode[]).map((mode) => <button key={mode} className={sortMode === mode ? "active" : ""} onClick={() => { setSortMode(mode); setFiltersOpen(false); }}>{mode.replace("-", " ")}</button>)}
      </div>}
    </header>
  );
}

function RankedColumnHeader({
  kind,
  title,
  subtitle,
  count,
  query,
  setQuery,
  settings,
  onSettingsChange,
}: {
  kind: MoverColumnKind;
  title: string;
  subtitle: string;
  count: number;
  query: string;
  setQuery: (value: string) => void;
  settings: CategoryTradingSettings;
  onSettingsChange: (value: CategoryTradingSettings) => void;
}) {
  const [algorithmOpen, setAlgorithmOpen] = useState(false);
  const algorithmRootRef = useRef<HTMLElement>(null);
  const closeAlgorithm = useCallback(() => setAlgorithmOpen(false), []);
  useOutsideDismiss([algorithmRootRef], closeAlgorithm, algorithmOpen);
  return (
    <header ref={algorithmRootRef} className="trench-column-head movers-column-head">
      <div className="trench-column-title">
        <span className={`trench-column-icon ${kind}`}><i /></span>
        <span><strong>{title}</strong><small>{subtitle} · {count} markets</small></span>
      </div>
      <div className="trench-column-controls">
        <label className="column-market-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label>
        <QuickAmountEditor value={settings.quickBuyEth} onCommit={(quickBuyEth) => onSettingsChange({ ...settings, quickBuyEth })} label={title} />
        {kind === "movers" && <button className={algorithmOpen ? "active movers-algo-button" : "movers-algo-button"} onClick={() => setAlgorithmOpen(!algorithmOpen)} title="How Leverage X Movers is ranked"><Info size={14} /></button>}
        <TerminalCategorySettings category={kind} label={title} value={settings} onChange={onSettingsChange} />
      </div>
      {kind === "movers" && algorithmOpen && <div className="movers-algo-popover">
        <header><strong>Leverage X Movers score</strong><small>Fast participation beats one-wallet volume.</small></header>
        <div className="movers-algo-grid">
          <span><b>{MOVERS_WEIGHTS.transactionVelocity}%</b>Transactions</span>
          <span><b>{MOVERS_WEIGHTS.netWethInflow}%</b>Net WETH</span>
          <span><b>{MOVERS_WEIGHTS.uniqueWalletGrowth}%</b>Wallet growth</span>
          <span><b>{MOVERS_WEIGHTS.marketCapAcceleration}%</b>MC acceleration</span>
          <span><b>{MOVERS_WEIGHTS.battleIntensity}%</b>Battle pressure</span>
          <span><b>{MOVERS_WEIGHTS.liquidityGrowth}%</b>Liquidity growth</span>
          <span><b>{MOVERS_WEIGHTS.likeVelocity}%</b>Like velocity</span>
          <span><b>{MOVERS_WEIGHTS.quality}%</b>Quality</span>
        </div>
        <footer>15s 45% · 1m 35% · 5m 20% · wash activity penalized</footer>
      </div>}
    </header>
  );
}

function QuickAmountEditor({ value, onCommit, label }: { value: number; onCommit: (value: number) => void; label: string }) {
  const [draft, setDraft] = useState(() => value.toString());

  useEffect(() => {
    setDraft(value.toString());
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    const normalized = Number.isFinite(parsed) && parsed > 0 ? Math.min(100, Math.max(0.0001, parsed)) : value;
    const rounded = Number(normalized.toFixed(6));
    setDraft(rounded.toString());
    onCommit(rounded);
  };

  return (
    <label className="column-quick-editor" title={`Set ${label} quick-buy amount`}>
      <Zap size={15} />
      <input
        aria-label={`${label} quick-buy ETH amount`}
        inputMode="decimal"
        min="0.0001"
        max="100"
        step="0.001"
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { setDraft(value.toString()); event.currentTarget.blur(); }
        }}
      />
      <span>ETH</span>
    </label>
  );
}

export function TerminalHub() {
  const params = useSearchParams();
  const { tokens, events, balanceEth, positions, pendingOrders, chainExecution, buySpot, openPosition, closePosition, cancelOrder, connected, toggleWallet } = useMarkets();
  const userState = useUserState();
  const { mode: renderMode, setMode: setRenderMode, effectiveFps, measuredFps, quality, hardwareLabel, manualOverdrive } = useTerminalPerformance();
  const [openPanels, setOpenPanels] = useState<DrawerKind[]>(() => {
    const requested = params.get("panel");
    const panel = requested === "x-tracker" ? "x-launch-feed" : requested;
    return (["launch", "positions", "alerts", "watchlist", "wallets", "referrals", "trade-tracker", "x-launch-feed", "news"] as string[]).includes(panel ?? "") ? [panel as DrawerKind] : [];
  });
  const [compactMode, setCompactMode] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(() => params.get("settings") === "1");
  const [hideLowConfidence, setHideLowConfidence] = useState(false);
  const [showSignals, setShowSignals] = useState(true);
  const [queries, setQueries] = useState<Record<ColumnKind, string>>({ new: "", cooking: "", migrated: "" });
  const [sortMode, setSortMode] = useState<Record<ColumnKind, SortMode>>({ new: "age", cooking: "activity", migrated: "volume" });
  const [categorySettings, setCategorySettings] = useState<TerminalCategorySettingsMap>(() => structuredClone(DEFAULT_CATEGORY_SETTINGS));
  const [layoutReady, setLayoutReady] = useState(false);
  const [likedTokens, setLikedTokens] = useState<string[]>([]);
  const [buyNotice, setBuyNotice] = useState("");
  const [pendingQuickAction, setPendingQuickAction] = useState<{ slug: string; side: Direction } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => params.get("view") === "movers" ? "movers" : "markets");
  const [moverQueries, setMoverQueries] = useState<Record<MoverColumnKind, string>>({ movers: "", liked: "", "market-cap": "" });
  const [launchDraft, setLaunchDraft] = useState<XLaunchDraft | null>(null);
  const [openLaunchAfterWallet, setOpenLaunchAfterWallet] = useState(false);
  const [panelPlacement, setPanelPlacement] = useState<Record<DrawerKind, SidecarPlacement>>(() => ({ ...DEFAULT_PANEL_PLACEMENT }));
  const [stripSettings, setStripSettings] = useState<PositionWatchStripSettings>({ showPositions: true, showWatchlist: true, showPnl: true, showMarketCap: true, maxPositions: 8, maxWatchlist: 10, compact: false });
  const [bottomDockSettings, setBottomDockSettings] = useState({ showConnection: true, showLaunch: true, showEngine: true, showLabels: true, compact: false });
  const [bottomSettingsOpen, setBottomSettingsOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [quickActionsDisabled, setQuickActionsDisabled] = useState(false);
  const [pnlWidgetOpen, setPnlWidgetOpen] = useState(true);
  const [rankingTick, setRankingTick] = useState(0);
  const moverOrderRef = useRef<MoversScore[]>([]);
  const layoutHydratedRef = useRef(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPopoverRef = useRef<HTMLDivElement>(null);
  const bottomSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const bottomSettingsPopoverRef = useRef<HTMLDivElement>(null);
  const emergencyButtonRef = useRef<HTMLButtonElement>(null);
  const emergencyPopoverRef = useRef<HTMLDivElement>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useOutsideDismiss([settingsButtonRef, settingsPopoverRef], closeSettings, settingsOpen);
  const closeBottomSettings = useCallback(() => setBottomSettingsOpen(false), []);
  useOutsideDismiss([bottomSettingsButtonRef, bottomSettingsPopoverRef], closeBottomSettings, bottomSettingsOpen);
  const closeEmergency = useCallback(() => setEmergencyOpen(false), []);
  useOutsideDismiss([emergencyButtonRef, emergencyPopoverRef], closeEmergency, emergencyOpen);

  useEffect(() => {
    const timer = window.setInterval(() => setRankingTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userState.ready || layoutHydratedRef.current) return;
    layoutHydratedRef.current = true;
    try {
      const syncedLayout = userState.getSection<PersistedTerminalLayout | null>("terminal-layout-v1", null);
      const saved = syncedLayout
        ? JSON.stringify(syncedLayout)
        : window.localStorage.getItem("perphood-terminal-layout-v15") ?? window.localStorage.getItem("perphood-terminal-layout-v14") ?? window.localStorage.getItem("perphood-terminal-layout-v13") ?? window.localStorage.getItem("perphood-terminal-layout-v12") ?? window.localStorage.getItem("perphood-terminal-layout-v11");
      if (saved) {
        const layout = JSON.parse(saved) as PersistedTerminalLayout;
        if (typeof layout.compactMode === "boolean") setCompactMode(layout.compactMode);
        if (typeof layout.hideLowConfidence === "boolean") setHideLowConfidence(layout.hideLowConfidence);
        if (typeof layout.showSignals === "boolean") setShowSignals(layout.showSignals);
        if (layout.sortMode) setSortMode(layout.sortMode);
        if (layout.categorySettings) {
          const hydrated = Object.fromEntries((Object.keys(DEFAULT_CATEGORY_SETTINGS) as TerminalCategoryKey[]).map((key) => [
            key,
            normalizeCategorySettings({ ...DEFAULT_CATEGORY_SETTINGS[key], ...(layout.categorySettings?.[key] ?? {}) }),
          ])) as TerminalCategorySettingsMap;
          setCategorySettings(hydrated);
        }
        const hydratedPlacement = { ...DEFAULT_PANEL_PLACEMENT, ...(layout.panelPlacement ?? {}) } as Record<DrawerKind, SidecarPlacement>;
        const legacy = (layout.panelPlacement as Record<string, SidecarPlacement> | undefined)?.["x-tracker"];
        if (legacy) hydratedPlacement["x-launch-feed"] = legacy;
        if (Array.isArray(layout.openPanels)) {
          const allowed = new Set<DrawerKind>(["launch", "positions", "alerts", "watchlist", "wallets", "referrals", "trade-tracker", "x-launch-feed", "news"]);
          const restored = [...new Set(layout.openPanels.filter((panel): panel is DrawerKind => allowed.has(panel)))];
          let leftSlots = 0;
          for (const panel of restored) {
            if (hydratedPlacement[panel] !== "left") continue;
            leftSlots += 1;
            if (leftSlots > MAX_LEFT_DOCK_PANELS) hydratedPlacement[panel] = "floating";
          }
          setOpenPanels(restored);
        }
        setPanelPlacement(hydratedPlacement);
        if (layout.stripSettings) setStripSettings(layout.stripSettings);
        if (layout.bottomDockSettings) setBottomDockSettings(layout.bottomDockSettings);
        if (layout.workspaceView) setWorkspaceView(layout.workspaceView);
        if (typeof layout.pnlWidgetOpen === "boolean") setPnlWidgetOpen(layout.pnlWidgetOpen);
      }
      const syncedLikes = userState.getSection<string[]>("liked-tokens-v1", []);
      if (Array.isArray(syncedLikes)) setLikedTokens([...new Set(syncedLikes.filter((slug) => typeof slug === "string"))].slice(0, 500));
    } catch {}
    setLayoutReady(true);
  }, [userState]);

  useEffect(() => {
    if (!layoutReady) return;
    const layout: PersistedTerminalLayout = { compactMode, hideLowConfidence, showSignals, categorySettings, sortMode, workspaceView, panelPlacement, openPanels, stripSettings, bottomDockSettings, pnlWidgetOpen };
    window.localStorage.setItem("perphood-terminal-layout-v15", JSON.stringify(layout));
    userState.setSection("terminal-layout-v1", layout);
    userState.setSection("liked-tokens-v1", likedTokens);
  }, [bottomDockSettings, categorySettings, compactMode, hideLowConfidence, layoutReady, likedTokens, openPanels, panelPlacement, pnlWidgetOpen, showSignals, sortMode, stripSettings, userState, workspaceView]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const resetTerminalLayout = () => {
    setCompactMode(false);
    setHideLowConfidence(false);
    setShowSignals(true);
    setCategorySettings(structuredClone(DEFAULT_CATEGORY_SETTINGS));
    setSortMode({ new: "age", cooking: "activity", migrated: "volume" });
    setPanelPlacement({ ...DEFAULT_PANEL_PLACEMENT });
    setStripSettings({ showPositions: true, showWatchlist: true, showPnl: true, showMarketCap: true, maxPositions: 8, maxWatchlist: 10, compact: false });
    setBottomDockSettings({ showConnection: true, showLaunch: true, showEngine: true, showLabels: true, compact: false });
    setWorkspaceView("markets");
    setOpenPanels([]);
    setPnlWidgetOpen(true);
    window.localStorage.removeItem("perphood-terminal-layout-v15");
    window.localStorage.removeItem("perphood-terminal-layout-v14");
    window.localStorage.removeItem("perphood-terminal-layout-v13");
    window.localStorage.removeItem("perphood-terminal-layout-v12");
    window.localStorage.removeItem("perphood-terminal-layout-v11");
    userState.setSection("terminal-layout-v1", {
      compactMode: false, hideLowConfidence: false, showSignals: true,
      categorySettings: structuredClone(DEFAULT_CATEGORY_SETTINGS),
      sortMode: { new: "age", cooking: "activity", migrated: "volume" },
      workspaceView: "markets", panelPlacement: { ...DEFAULT_PANEL_PLACEMENT }, openPanels: [],
      stripSettings: { showPositions: true, showWatchlist: true, showPnl: true, showMarketCap: true, maxPositions: 8, maxWatchlist: 10, compact: false },
      bottomDockSettings: { showConnection: true, showLaunch: true, showEngine: true, showLabels: true, compact: false },
      pnlWidgetOpen: true,
    } satisfies PersistedTerminalLayout);
    userState.setSection("liked-tokens-v1", []);
  };

  const filteredTokens = useMemo(() => {
    let result = [...tokens];
    if (hideLowConfidence) result = result.filter((token) => (token.oracleConfidence ?? 0) >= 55 || token.launchState === "auction");
    return result;
  }, [hideLowConfidence, tokens]);

  const columnTokens = useMemo<Record<ColumnKind, Token[]>>(() => {
    const auction = filteredTokens.filter((token) => token.launchState === "auction");
    const live = filteredTokens.filter((token) => token.launchState === "live");
    const migrated = filteredTokens.filter((token) => token.launchState === "graduated" || token.graduation >= 100);
    const newPairs = [...auction, ...live.filter((token) => token.launchedMinutesAgo <= 30)]
      .filter((token, index, list) => list.findIndex((item) => item.slug === token.slug) === index)
      .slice(0, 18);
    const cooking = live
      .filter((token) => token.launchedMinutesAgo > 5 && token.graduation < 100)
      .sort((a, b) => b.graduation - a.graduation || b.volume24h - a.volume24h)
      .slice(0, 18);
    const migratedMarkets = [...migrated]
      .sort((a, b) => b.volume24h - a.volume24h || b.openInterest - a.openInterest)
      .slice(0, 18);
    return { new: newPairs, cooking, migrated: migratedMarkets };
  }, [filteredTokens]);

  const likesBySlug = useMemo(() => Object.fromEntries(filteredTokens.map((token) => [token.slug, likesFor(token, likedTokens.includes(token.slug))])), [filteredTokens, likedTokens]);

  const moverScores = useMemo<MoversScore[]>(() => {
    const next = rankMovers({
      tokens: filteredTokens,
      events,
      positions,
      likesBySlug,
      now: Date.now(),
    });
    const stable = stabilizeMoversRanking(moverOrderRef.current, next, 2.5);
    moverOrderRef.current = stable;
    return stable;
  }, [events, filteredTokens, likesBySlug, positions, rankingTick]);

  const moverScoreBySlug = useMemo(() => new Map(moverScores.map((score) => [score.slug, score])), [moverScores]);

  const moverColumns = useMemo<Record<MoverColumnKind, Token[]>>(() => {
    const live = filteredTokens.filter((token) => token.launchState !== "auction" && token.cap > 0);
    const tokenBySlug = new Map(live.map((token) => [token.slug, token]));
    return {
      movers: moverScores.map((score) => tokenBySlug.get(score.slug)).filter((token): token is Token => Boolean(token)),
      liked: [...live].sort((a, b) => likesFor(b, likedTokens.includes(b.slug)) - likesFor(a, likedTokens.includes(a.slug)) || b.volume24h - a.volume24h),
      "market-cap": [...live].sort((a, b) => b.cap - a.cap || b.volume24h - a.volume24h),
    };
  }, [filteredTokens, likedTokens, moverScores]);

  const applyProfileFilters = (list: Token[], profile: CategoryTradingSettings) => list.filter((token) => {
    if (profile.positiveOnly && token.change24h < 0) return false;
    if (profile.ogOnly && token.ogStatus === "copy") return false;
    if (profile.hideHighConcentration && (token.linkedWalletConcentration ?? 0) > 25) return false;
    if (profile.minMarketCap > 0 && token.cap < profile.minMarketCap) return false;
    if (profile.minLiquidityEth > 0 && (token.liquidityEth ?? 0) < profile.minLiquidityEth) return false;
    if (profile.minHolders > 0 && (token.uniqueTraders ?? 0) < profile.minHolders) return false;
    if (profile.maxAgeMinutes > 0 && token.launchedMinutesAgo > profile.maxAgeMinutes) return false;
    return true;
  });

  const updateCategorySettings = (kind: TerminalCategoryKey, next: CategoryTradingSettings) => setCategorySettings((current) => ({ ...current, [kind]: next }));

  const resolveMoverColumn = (kind: MoverColumnKind) => {
    const query = moverQueries[kind].trim().toLowerCase();
    const filtered = applyProfileFilters(moverColumns[kind], categorySettings[kind]);
    return query ? filtered.filter((token) => `${token.symbol} ${token.name} ${token.slug}`.toLowerCase().includes(query)) : filtered;
  };

  const resolveColumn = (kind: ColumnKind) => {
    let list = sortTokens(columnTokens[kind], sortMode[kind]);
    const query = queries[kind].trim().toLowerCase();
    if (query) list = list.filter((token) => `${token.symbol} ${token.name}`.toLowerCase().includes(query));
    list = applyProfileFilters(list, categorySettings[kind]);
    return list;
  };

  const openPanelWithCapacity = useCallback((kind: DrawerKind) => {
    if (openPanels.includes(kind)) return;
    if (panelPlacement[kind] === "left") {
      const occupiedLeftSlots = openPanels.filter((panel) => panelPlacement[panel] === "left").length;
      if (occupiedLeftSlots >= MAX_LEFT_DOCK_PANELS) {
        setPanelPlacement((placements) => ({ ...placements, [kind]: "floating" }));
        const label = kind === "x-launch-feed" ? "X Launch Feed" : kind.replaceAll("-", " ");
        setBuyNotice(`Left dock already has ${MAX_LEFT_DOCK_PANELS} sidecars. ${label} opened as a floating panel.`);
        window.setTimeout(() => setBuyNotice(""), 3200);
      }
    }
    setOpenPanels((current) => current.includes(kind) ? current : [...current, kind]);
  }, [openPanels, panelPlacement]);

  const requestLaunchAccess = useCallback(() => {
    if (connected) return true;
    setOpenLaunchAfterWallet(true);
    toggleWallet();
    setBuyNotice("Connect your wallet to open Launch Token.");
    window.setTimeout(() => setBuyNotice(""), 3200);
    return false;
  }, [connected, toggleWallet]);

  useEffect(() => {
    if (!connected || !openLaunchAfterWallet) return;
    setOpenLaunchAfterWallet(false);
    openPanelWithCapacity("launch");
  }, [connected, openLaunchAfterWallet, openPanelWithCapacity]);

  const openTool = useCallback((kind: DrawerKind) => {
    if (openPanels.includes(kind)) {
      setOpenPanels((current) => current.filter((panel) => panel !== kind));
      return;
    }
    if (kind === "launch" && !requestLaunchAccess()) return;
    openPanelWithCapacity(kind);
  }, [openPanelWithCapacity, openPanels, requestLaunchAccess]);
  const ensurePanelOpen = useCallback((kind: DrawerKind) => {
    if (kind === "launch" && !requestLaunchAccess()) return;
    openPanelWithCapacity(kind);
  }, [openPanelWithCapacity, requestLaunchAccess]);
  const closePanel = useCallback((kind: DrawerKind) => {
    setOpenPanels((current) => current.filter((panel) => panel !== kind));
  }, []);
  const openTrade = async (token: Token, side: Direction, sourceCategory?: TerminalCategoryKey) => {
    const inferredCategory: TerminalCategoryKey = sourceCategory ?? (token.launchState === "graduated" || token.graduation >= 100 ? "migrated" : token.launchedMinutesAgo <= 30 ? "new" : "cooking");
    const executionProfile = categorySettings[inferredCategory];
    const executionPreset = getActiveExecutionPreset(executionProfile);
    const contractExecution = (token.chainDeploymentMode === "anvil-v43" || token.chainDeploymentMode === "anvil-v45" || token.chainDeploymentMode === "robinhood-testnet-v54" || token.chainDeploymentMode === "robinhood-mainnet-v54" || token.chainDeploymentMode === "robinhood-testnet-v55" || token.chainDeploymentMode === "robinhood-mainnet-v55") && Boolean(token.chainMarketAddress);

    if (pendingQuickAction) return;
    if (quickActionsDisabled) {
      setBuyNotice("Quick actions are disabled from Emergency Controls. Re-enable them before submitting a preset trade.");
      window.setTimeout(() => setBuyNotice(""), 3400);
      return;
    }

    const v54SpotOnly = token.chainDeploymentMode === "robinhood-testnet-v54" || token.chainDeploymentMode === "robinhood-mainnet-v54" || token.chainDeploymentMode === "robinhood-testnet-v55" || token.chainDeploymentMode === "robinhood-mainnet-v55";
    if (v54SpotOnly && side !== "buy") {
      setBuyNotice(`${token.symbol} is live for real spot trading. Long and Short unlock only after the audited BattlePool deployment.`);
      window.setTimeout(() => setBuyNotice(""), 3600);
      return;
    }

    if (side !== "buy") {
      const preset = getQuickPerpPreset(executionProfile, side);
      if (!preset.enabled) {
        setBuyNotice(`Set the ${side === "long" ? "Quick Long" : "Quick Short"} preset for ${inferredCategory.replace("-", " ")} before using this button.`);
        window.setTimeout(() => setBuyNotice(""), 3200);
        return;
      }
      const unlockedLeverage = token.maxLeverageUnlocked ?? 20;
      if (preset.leverage > unlockedLeverage) {
        setBuyNotice(`${token.symbol} currently supports up to ${unlockedLeverage}×. Lower the ${side} preset before trading.`);
        window.setTimeout(() => setBuyNotice(""), 3200);
        return;
      }
    }

    if (!connected && !contractExecution) {
      toggleWallet();
      setBuyNotice(`Wallet connected — click Quick ${side === "buy" ? "Buy" : side === "long" ? "Long" : "Short"} again.`);
      window.setTimeout(() => setBuyNotice(""), 3000);
      return;
    }

    setPendingQuickAction({ slug: token.slug, side });
    try {
      if (side === "buy") {
        const amount = executionProfile.quickBuyEth;
        await buySpot(token.slug, amount, executionPreset.profile.executionRoute === "standard" ? "maker" : "market", { slippageBps: Math.round(executionPreset.profile.buySlippagePercent * 100), maxNetworkFeeEth: executionPreset.profile.maxNetworkFeeEth, maxPriceImpactPercent: executionPreset.profile.maxPriceImpactPercent });
        setBuyNotice(`Bought ${amount.toFixed(3)} ETH of ${token.symbol} · ${executionPreset.key} ${executionPreset.profile.executionRoute} · stayed on ${workspaceView === "movers" ? "Movers" : "Markets"}`);
      } else {
        const preset = getQuickPerpPreset(executionProfile, side);
        await openPosition(token.slug, side, preset.leverage, preset.collateralEth, { feeTier: executionPreset.profile.executionRoute === "standard" ? "maker" : "market" });
        setBuyNotice(`Opened ${preset.collateralEth.toFixed(3)} ETH ${preset.leverage}× ${side.toUpperCase()} on ${token.symbol} · ${executionPreset.key} preset sent`);
      }
    } catch (error) {
      setBuyNotice(error instanceof Error ? error.message : `Quick ${side} failed`);
    } finally {
      setPendingQuickAction(null);
      window.setTimeout(() => setBuyNotice(""), 3200);
    }
  };

  const cancelAllOrders = async () => {
    setEmergencyOpen(false);
    try {
      for (const order of pendingOrders) await cancelOrder(order.id);
      setBuyNotice(pendingOrders.length ? `Cancelled ${pendingOrders.length} open order${pendingOrders.length === 1 ? "" : "s"}.` : "No open orders to cancel.");
    } catch (error) {
      setBuyNotice(error instanceof Error ? error.message : "Cancel All failed.");
    } finally {
      window.setTimeout(() => setBuyNotice(""), 3600);
    }
  };

  const closeAllPositions = async () => {
    setEmergencyOpen(false);
    try {
      for (const position of positions) await closePosition(position.id, 1);
      setBuyNotice(positions.length ? `Submitted full closes for ${positions.length} position${positions.length === 1 ? "" : "s"}.` : "No open positions to close.");
    } catch (error) {
      setBuyNotice(error instanceof Error ? error.message : "Close All failed.");
    } finally {
      window.setTimeout(() => setBuyNotice(""), 4200);
    }
  };

  const pasteAddress = async () => {
    try {
      const value = await navigator.clipboard.readText();
      setGlobalQuery(value);
      setSearchOpen(true);
      const normalized = value.toLowerCase();
      const found = tokens.find((token) => normalized.includes(token.slug) || normalized.includes(token.symbol.toLowerCase()));
      if (found) {
        setGlobalQuery(found.symbol);
      }
    } catch {
      setGlobalQuery("");
    }
  };

  const leftPanels = openPanels.filter((panel) => panelPlacement[panel] === "left");
  const rightPanels = openPanels.filter((panel) => panelPlacement[panel] === "right");
  const floatingPanels = openPanels.filter((panel) => panelPlacement[panel] === "floating");

  const panelTitle = (panel: DrawerKind) => panel === "launch"
    ? "Launch Token"
    : panel === "x-launch-feed"
      ? "X Launch Feed"
      : panel.replaceAll("-", " ");

  const renderPanelContent = (panel: DrawerKind) => panel === "launch"
    ? <LaunchPanel compact initialDraft={launchDraft} onClearDraft={() => setLaunchDraft(null)} onComplete={(slug) => { closePanel("launch"); setLaunchDraft(null); setGlobalQuery(slug); }} />
    : panel === "x-launch-feed"
      ? <XLaunchFeedPanel onClose={() => closePanel("x-launch-feed")} onLaunchDraft={(draft) => { setLaunchDraft(draft); ensurePanelOpen("launch"); setPanelPlacement((current) => ({ ...current, launch: "right", "x-launch-feed": current["x-launch-feed"] ?? "left" })); }} />
      : <TerminalTrackerPanel kind={panel as TrackerPanelKind} onClose={() => closePanel(panel)} onTrade={openTrade} />;

  const movePanel = useCallback((panel: DrawerKind, next: SidecarPlacement) => {
    if (next === "left") {
      const occupiedLeftSlots = openPanels.filter((candidate) => candidate !== panel && panelPlacement[candidate] === "left").length;
      if (occupiedLeftSlots >= MAX_LEFT_DOCK_PANELS) {
        setBuyNotice(`The left dock supports ${MAX_LEFT_DOCK_PANELS} visible sidecars. Move or close one before docking another.`);
        window.setTimeout(() => setBuyNotice(""), 3200);
        return;
      }
    }
    setPanelPlacement((current) => ({ ...current, [panel]: next }));
  }, [openPanels, panelPlacement]);

  const renderDockPanel = (panel: DrawerKind, placement: SidecarPlacement, panelIndex = 0) => (
    <TerminalSidecar
      id={panel}
      key={panel}
      title={panelTitle(panel)}
      placement={placement}
      floatingIndex={panelIndex}
      dockSlot={placement === "left" ? panelIndex + 1 : undefined}
      dockCapacity={placement === "left" ? MAX_LEFT_DOCK_PANELS : undefined}
      onPlacement={(next) => movePanel(panel, next)}
      onClose={() => closePanel(panel)}
    >
      {renderPanelContent(panel)}
    </TerminalSidecar>
  );

  const handleWalletButton = () => {
    if (!connected) toggleWallet();
    setProfileOpen(true);
  };

  return (
    <main className={`terminal-hub-page ${leftPanels.length ? "has-left-docks" : ""} ${rightPanels.length ? "has-right-docks" : ""} ${rightPanels.includes("launch") ? "has-launch-right-dock" : ""} ${compactMode ? "compact-mode" : "comfortable-mode"} ${showSignals ? "show-signals" : "hide-signals"}`}>
      <section className="perphood-command-bar">
        <div className="perphood-command-left">
          <Link href="/" className="perphood-command-brand" aria-label="LEVERAGE X home">
            <BrandMark size={38} />
            <strong>LEVERAGE X</strong>
          </Link>
          <nav className="perphood-workspace-tabs" aria-label="Leverage X views">
            <button className={workspaceView === "markets" ? "active" : ""} onClick={() => setWorkspaceView("markets")}>Markets</button>
            <button className={workspaceView === "movers" ? "active" : ""} onClick={() => setWorkspaceView("movers")}><TrendingUp size={15} />Movers</button>
          </nav>
        </div>

        <div className="perphood-command-center">
          <button className="terminal-global-search perphood-compact-search" onClick={() => setSearchOpen(true)} aria-label="Open dual ticker search" title="OG lineage + market-cap leaders">
            <Search size={16} />
            <span>{globalQuery ? globalQuery : "Search ticker, token, or contract"}</span>
            <kbd>/</kbd>
          </button>
          <button className="terminal-paste perphood-paste-button" onClick={pasteAddress} aria-label="Paste contract address" title="Paste contract address"><Crosshair size={16} /><span>Paste CA</span></button>
        </div>

        <div className="perphood-command-right">
          <div className={`terminal-fps-chip ${manualOverdrive ? "is-overdrive" : ""}`} aria-label={`Visual refresh target ${effectiveFps} hertz`}><b>{effectiveFps} Hz</b></div>
          <button ref={settingsButtonRef} className={settingsOpen ? "active terminal-settings-button" : "terminal-settings-button"} onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Open terminal settings"><Settings2 size={17} /></button>
          {connected && <button onClick={() => ensurePanelOpen("positions")} className="header-fund-button perphood-fund-button"><Plus size={15}/><span>Fund</span></button>}
          <KeyButton compact className={connected ? "profile-key perphood-account-button" : "perphood-account-button"} onClick={handleWalletButton}>
            {connected ? <><span className="profile-key-avatar">LX</span><span className="perphood-account-balance"><strong>{balanceEth.toFixed(3)} ETH</strong><small>Account</small></span></> : <><WalletCards size={17} />Connect Wallet</>}
          </KeyButton>
        </div>
        {settingsOpen && <div ref={settingsPopoverRef} className="terminal-settings-popover">
          <div className="terminal-fps-settings"><span><strong>Chart + live PNL update target</strong><small>{hardwareLabel} · measured display {measuredFps.toFixed(0)} FPS · {quality}{manualOverdrive ? " · manual overdrive" : ""}</small></span><div>{(["auto", 60, 120, 144, 240, 360] as RenderFpsMode[]).map((fps) => <button key={fps} className={renderMode === fps ? "active" : ""} onClick={() => setRenderMode(fps)}>{fps === "auto" ? "Auto" : fps}</button>)}</div></div>
          <div><span><strong>Display density</strong><small>Readable pro-terminal typography</small></span><button onClick={() => setCompactMode(!compactMode)}>{compactMode ? "Compact" : "Readable"}</button></div>
          <div><span><strong>Signal row</strong><small>Social, confidence, holders</small></span><button className={showSignals ? "active" : ""} onClick={() => setShowSignals(!showSignals)}>{showSignals ? "Shown" : "Hidden"}</button></div>
          <div><span><strong>Oracle guard</strong><small>Hide low-confidence markets</small></span><button className={hideLowConfidence ? "active" : ""} onClick={() => setHideLowConfidence(!hideLowConfidence)}>{hideLowConfidence ? "On" : "Off"}</button></div>
          <div><span><strong>Floating live PNL</strong><small>Draggable executable PNL box</small></span><button className={pnlWidgetOpen ? "active" : ""} onClick={() => setPnlWidgetOpen(!pnlWidgetOpen)}>{pnlWidgetOpen ? "Shown" : "Hidden"}</button></div>
          <div><span><strong>Saved workspace</strong><small>View, signals, filters, sizes, and FPS</small></span><button onClick={resetTerminalLayout}>Reset</button></div>
        </div>}
      </section>

      <TerminalPositionWatchStrip
        settings={stripSettings}
        onSettingsChange={setStripSettings}
        onOpenPositions={() => ensurePanelOpen("positions")}
        onOpenWatchlist={() => ensurePanelOpen("watchlist")}
        onTrade={(token, side) => { void openTrade(token, side); }}
      />

      <TransactionLifecycleTracker execution={chainExecution} />
      {profileOpen && <ProfileMenu onClose={() => setProfileOpen(false)} onOpenPnl={() => setPnlWidgetOpen(true)} />}
      {buyNotice && <div className="terminal-buy-notice">{buyNotice}</div>}
      {pnlWidgetOpen && <FloatingPnlWidget onClose={() => setPnlWidgetOpen(false)} />}

      <div className="terminal-hub-workspace" data-launch-open={rightPanels.includes("launch") ? "true" : "false"}>
        {leftPanels.length > 0 && <div className="terminal-dock-stack left" data-count={leftPanels.length} aria-label={`Left docked panels · ${leftPanels.length} of ${MAX_LEFT_DOCK_PANELS} slots used`}>{leftPanels.map((panel, index) => renderDockPanel(panel, "left", index))}</div>}

        {workspaceView === "markets" ? (
          <section className="terminal-trenches market-workspace">
            {([
              ["new", "New Pairs", "Fresh BattlePools and newly active pairs"],
              ["cooking", "Cooking", "Markets racing toward permanent liquidity"],
              ["migrated", "Migrated", "Deep-liquidity markets with expanded leverage"],
            ] as Array<[ColumnKind, string, string]>).map(([kind, columnTitle, subtitle]) => {
              const list = resolveColumn(kind);
              return <section className="trench-column" key={kind}>
                <ColumnHeader kind={kind} title={columnTitle} subtitle={subtitle} count={list.length} query={queries[kind]} setQuery={(value) => setQueries((current) => ({ ...current, [kind]: value }))} sortMode={sortMode[kind]} setSortMode={(value) => setSortMode((current) => ({ ...current, [kind]: value }))} settings={categorySettings[kind]} onSettingsChange={(value) => updateCategorySettings(kind, value)} />
                <div className="trench-token-scroll">{list.length ? list.map((token) => <TerminalTokenRow key={`${kind}-${token.slug}`} token={token} compactMode={compactMode} quickBuyEth={categorySettings[kind].quickBuyEth} quickLongPreset={getQuickPerpPreset(categorySettings[kind], "long")} quickShortPreset={getQuickPerpPreset(categorySettings[kind], "short")} pendingSide={pendingQuickAction?.slug === token.slug ? pendingQuickAction.side : null} quickActionsLocked={Boolean(pendingQuickAction)} onTrade={(market, side) => { void openTrade(market, side, kind); }} liked={likedTokens.includes(token.slug)} likes={likesFor(token, likedTokens.includes(token.slug))} onLike={() => setLikedTokens((current) => current.includes(token.slug) ? current.filter((slug) => slug !== token.slug) : [...current, token.slug])} />) : <div className="trench-empty"><Search size={22} /><strong>No live markets yet</strong><span>Connect the Robinhood Chain indexer or launch the first token. LEVERAGE X will never invent market data.</span></div>}</div>
                <footer className="trench-column-footer"><span><i />Awaiting feed</span><b>{list.length} markets</b><em>{categorySettings[kind].activePreset} · BUY {categorySettings[kind].quickBuyEth.toFixed(3)} · L {categorySettings[kind].quickLongEnabled ? `${categorySettings[kind].quickLongCollateralEth.toFixed(3)}@${categorySettings[kind].quickLongLeverage}×` : "OFF"} · S {categorySettings[kind].quickShortEnabled ? `${categorySettings[kind].quickShortCollateralEth.toFixed(3)}@${categorySettings[kind].quickShortLeverage}×` : "OFF"}</em></footer>
              </section>;
            })}
          </section>
        ) : (
          <section className="terminal-trenches movers-workspace">
            {([
              ["movers", "Movers", "Real-time momentum ranked by capital, wallets, battles, and quality"],
              ["liked", "Most Liked", "Community favorites ranked by total likes"],
              ["market-cap", "Highest Market Cap", "Every active coin ranked largest to smallest"],
            ] as Array<[MoverColumnKind, string, string]>).map(([kind, columnTitle, subtitle]) => {
              const list = resolveMoverColumn(kind);
              const profile = categorySettings[kind];
              const quickAmount = profile.quickBuyEth;
              return <section className={`trench-column mover-rank-column ${kind}`} key={kind}>
                <RankedColumnHeader kind={kind} title={columnTitle} subtitle={subtitle} count={list.length} query={moverQueries[kind]} setQuery={(value) => setMoverQueries((current) => ({ ...current, [kind]: value }))} settings={profile} onSettingsChange={(value) => updateCategorySettings(kind, value)} />
                <div className="trench-token-scroll">{list.length ? list.map((token, index) => <div className="mover-ranked-row" key={`${kind}-${token.slug}`}><span className="mover-live-rank">#{index + 1}</span><TerminalTokenRow token={token} compactMode={compactMode} quickBuyEth={quickAmount} quickLongPreset={getQuickPerpPreset(profile, "long")} quickShortPreset={getQuickPerpPreset(profile, "short")} pendingSide={pendingQuickAction?.slug === token.slug ? pendingQuickAction.side : null} quickActionsLocked={Boolean(pendingQuickAction)} onTrade={(market, side) => { void openTrade(market, side, kind); }} liked={likedTokens.includes(token.slug)} likes={likesFor(token, likedTokens.includes(token.slug))} moverScore={moverScoreBySlug.get(token.slug)} onLike={() => setLikedTokens((current) => current.includes(token.slug) ? current.filter((slug) => slug !== token.slug) : [...current, token.slug])} /></div>) : <div className="trench-empty"><TrendingUp size={22} /><strong>No ranked markets yet</strong><span>Rankings appear as soon as the Robinhood Chain indexer publishes live Leverage X markets.</span></div>}</div>
                <footer className="trench-column-footer"><span><i />{kind === "movers" ? "Score refresh · 1s" : "Live ranking"}</span><b>{list.length} markets</b><em>{profile.activePreset} · BUY {quickAmount.toFixed(3)} · L {profile.quickLongEnabled ? `${profile.quickLongCollateralEth.toFixed(3)}@${profile.quickLongLeverage}×` : "OFF"} · S {profile.quickShortEnabled ? `${profile.quickShortCollateralEth.toFixed(3)}@${profile.quickShortLeverage}×` : "OFF"}</em></footer>
              </section>;
            })}
          </section>
        )}

        {rightPanels.length > 0 && <div className="terminal-dock-stack right" data-launch-open={rightPanels.includes("launch") ? "true" : "false"} aria-label="Right docked panels">{rightPanels.map((panel, index) => renderDockPanel(panel, "right", index))}</div>}
        {floatingPanels.map((panel, index) => renderDockPanel(panel, "floating", index))}
      </div>

      <nav className={`terminal-tool-dock ${bottomDockSettings.compact ? "compact" : ""} ${bottomDockSettings.showLabels ? "" : "icons-only"}`} aria-label="Terminal tools">
        <div className="terminal-tool-left">
          {bottomDockSettings.showConnection && <span className="terminal-connection"><i />Data services pending</span>}
          {TERMINAL_TOOLS.filter(([, , , side]) => side === "left").map(([kind, label, Icon]) => <button key={kind} className={openPanels.includes(kind) ? "active" : ""} onClick={() => openTool(kind)} title={label}><Icon size={14} /><b>{label}</b></button>)}
        </div>
        <div className="terminal-tool-center">
          {bottomDockSettings.showLaunch && <button className={openPanels.includes("launch") ? "active launch-tool" : "launch-tool"} onClick={() => openTool("launch")}><PlusCircle size={14} /><b>Launch Token</b></button>}
          {bottomDockSettings.showEngine && <><span><CircleDollarSign size={13} /><b>Shared curve</b></span><span><ShieldCheck size={13} /><b>Engine online</b></span></>}
        </div>
        <div className="terminal-tool-right">
          {TERMINAL_TOOLS.filter(([kind, , , side]) => side === "right" && kind !== "launch").map(([kind, label, Icon]) => <button key={kind} className={openPanels.includes(kind) ? "active" : ""} onClick={() => openTool(kind)} title={label}><Icon size={14} /><b>{label}</b></button>)}
          <button className={pnlWidgetOpen ? "active" : ""} onClick={() => setPnlWidgetOpen((open) => !open)} title="Show floating live PNL"><CircleDollarSign size={14} /><b>Live PNL</b></button>
          <button onClick={() => setOpenPanels([])} title="Close all sidecars"><X size={14} /><b>Close panels</b></button>
          <button ref={emergencyButtonRef} className={emergencyOpen || quickActionsDisabled ? "active" : ""} onClick={() => setEmergencyOpen((open) => !open)} title="Emergency trading controls"><ShieldCheck size={14} /><b>Emergency</b></button>
          {emergencyOpen && <div ref={emergencyPopoverRef} className="v55-emergency-menu">
            <header><strong>Emergency Controls</strong><small>These controls never fabricate a cancellation or close. Each live order or position must confirm through its authoritative execution path.</small></header>
            <button className={quickActionsDisabled ? "active" : ""} onClick={() => setQuickActionsDisabled((disabled) => !disabled)}><span>{quickActionsDisabled ? "Enable quick actions" : "Disable quick actions"}</span><b>{quickActionsDisabled ? "LOCKED" : "LIVE"}</b></button>
            <button className="danger" onClick={() => void cancelAllOrders()}><span>Cancel all orders</span><b>{pendingOrders.length}</b></button>
            <button className="danger" onClick={() => void closeAllPositions()}><span>Close all positions</span><b>{positions.length}</b></button>
            <Link href="/funding"><span>Revoke trading session</span><b>OPEN</b></Link>
          </div>}
          <button ref={bottomSettingsButtonRef} className={bottomSettingsOpen ? "active" : ""} onClick={() => setBottomSettingsOpen((open) => !open)} title="Bottom bar settings"><Settings2 size={14} /></button>
          {bottomSettingsOpen && <div ref={bottomSettingsPopoverRef} className="bottom-dock-settings-popover">
            <header><strong>Bottom utility bar</strong><small>Customize the Padre-style tool dock</small></header>
            {([
              ["showConnection", "Connection status"],
              ["showLaunch", "Launch button"],
              ["showEngine", "Engine status"],
              ["showLabels", "Tool labels"],
              ["compact", "Compact height"],
            ] as Array<[keyof typeof bottomDockSettings, string]>).map(([key, label]) => <button key={key} onClick={() => setBottomDockSettings((current) => ({ ...current, [key]: !current[key] }))}><span>{label}</span><i className={bottomDockSettings[key] ? "on" : ""}><b /></i></button>)}
          </div>}
        </div>
      </nav>
      <TerminalSearchOverlay open={searchOpen} query={globalQuery} setQuery={setGlobalQuery} tokens={tokens} onClose={() => setSearchOpen(false)} />
    </main>
  );
}
