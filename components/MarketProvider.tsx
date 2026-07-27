"use client";

/* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration intentionally runs after mount. */

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TOKENS } from "@/lib/data";
import { createDemoMarketEvents, DEMO_ONLY } from "@/lib/demo-market";
import { applyOgRegistry, hammingSimilarity, tokenIdentityParts } from "@/lib/og";
import {
  BATTLE_OPENING_FDV_ETH,
  BATTLE_TOTAL_SUPPLY,
  BATTLE_TRADE_FEE_RATE,
  createBattlePoolState,
  estimatePositionEquity,
  executeCloseLong,
  executeCloseShort,
  executeOpenLong,
  executeOpenShort,
  executeSequencedSpotBuy,
  executeSequencedSpotSell,
  executeSpotBuy,
  executeSpotSell,
  freeWeth,
  longNotionalCapacity,
  maybeReleaseSafetyInventory,
  poolFromToken,
  poolToTokenPatch,
  shortNotionalCapacity,
} from "@/lib/battle-pool";
import {
  publishBattleRealtimeFrame,
  quoteExecutablePositionPnl,
  quoteExecutableSpotPnl,
  type ExecutablePnlSnapshot,
} from "@/lib/realtime-battle";
import {
  LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH,
  LAUNCHPAD_TARGET_MARKET_CAP_USD,
  LAUNCHPAD_VERSION,
  buildMigrationSnapshot,
  migrationPatch,
  quoteLaunchSpend,
  type MigrationSnapshot,
} from "@/lib/launchpad";
import {
  executeV44ClosePosition,
  executeV44OpenPosition,
  executeV44SpotBuy,
  executeV44SpotSell,
  readV44Position,
  readV44PositionEquity,
  readV49MaximumShortPayout,
  readV49PositionSettlement,
  readV44RuntimeState,
  readV44WalletBalance,
  runtimeStateToTokenPatch,
  type V44ExecutionReceipt,
} from "@/lib/chain/v44-market-client";
import { fromWad, toWad } from "@/lib/chain/abi";
import {
  executeV45ClosePosition,
  executeV45DirectClosePosition,
  executeV45DirectOpenPosition,
  executeV45DirectSpotBuy,
  executeV45DirectSpotSell,
  executeV45OpenPosition,
  executeV45SpotBuy,
  executeV45SpotSell,
  hasLocalV45Session,
} from "@/lib/chain/v45-terminal-executor";
import {
  cancelV46Order as cancelDurableV46Order,
  createV46EntryOrder,
  createV46ProtectionOrder,
  listV46Orders,
  runV46KeeperOnce,
} from "@/lib/chain/v46-order-client";
import { loadV45Account } from "@/lib/chain/v45-session-key";
import type { V46StoredOrder } from "@/lib/chain/v46-order";
import { useUserState } from "./UserStateProvider";
import type {
  ClosedTrade,
  LaunchTokenInput,
  MarketAction,
  MarketEvent,
  MarketRisk,
  MarketScenario,
  OpenPositionOptions,
  PendingOrder,
  Position,
  PositionDirection,
  RiskSettings,
  SpotHolding,
  Token,
  TradePreset,
  TradeQuote,
  TraderProgress,
} from "@/lib/types";

const ACTORS = ["0x71C…88F", "0xA4D…921", "0xC22…4B0", "0x91F…A73", "0xE80…129", "0x6BA…44D"];
const EMOJIS = ["🧊", "🦎", "🛸", "🥷", "🦉", "🧃", "🐸", "🐕", "🗿", "⚡"];
const ETH_USD_REFERENCE = 3_200;
const ENABLE_LOCAL_MARKET_ENGINE = false;
const DEFAULT_PRESETS: TradePreset[] = [
  { id: "preset-scalp", name: "SCALP", side: "long", leverage: 5, collateral: 0.01, takeProfitPercent: 8, stopLossPercent: 4 },
  { id: "preset-runner", name: "RUNNER", side: "long", leverage: 10, collateral: 0.025, takeProfitPercent: 22, stopLossPercent: 7 },
  { id: "preset-counter", name: "COUNTER", side: "short", leverage: 5, collateral: 0.02, takeProfitPercent: 14, stopLossPercent: 6 },
];
const DEFAULT_RISK: RiskSettings = {
  simulationSpeed: 1,
  ethVaultSize: 250,
  hedgeReservePercent: 30,
  hedgeRatioPercent: 92,
  insurancePercent: 25,
  maxLeverage: 20,
  oracleGuardPercent: 2.5,
  maintenanceBufferPercent: 1.25,
  partialLiquidationPercent: 40,
  paused: false,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function storageValue<T>(primary: string, legacy: string, fallback: T): T {
  const raw = localStorage.getItem(primary) ?? localStorage.getItem(legacy);
  if (!raw) return fallback;
  return JSON.parse(raw) as T;
}

function normalizeToken(token: Token): Token {
  const cap = Math.max(0, token.cap);
  const age = token.marketAgeSeconds ?? token.launchedMinutesAgo * 60;
  const hasBattlePool = Boolean(token.battlePoolVersion);
  const poolPatch = hasBattlePool ? poolToTokenPatch(poolFromToken(token), ETH_USD_REFERENCE) : undefined;
  const normalizedCap = poolPatch?.cap ?? cap;
  const migrationTarget = token.migrationTargetMarketCapUsd ?? LAUNCHPAD_TARGET_MARKET_CAP_USD;
  const launchpadGraduation = token.launchpadVersion && token.battlePhase !== "migrated"
    ? clamp(normalizedCap / Math.max(1, migrationTarget) * 100, 0.1, 99)
    : token.graduation;
  return {
    ...token,
    ...(poolPatch ?? {}),
    graduation: launchpadGraduation,
    battlePhase: token.battlePhase ?? (token.launchState === "graduated" ? "migrated" : "bonding"),
    indexCap: poolPatch?.indexCap ?? token.indexCap ?? cap,
    markCap: poolPatch?.markCap ?? token.markCap ?? cap,
    oracleConfidence: token.oracleConfidence ?? (cap > 0 || hasBattlePool ? 72 : 0),
    maxLeverageUnlocked: token.maxLeverageUnlocked ?? (hasBattlePool ? 20 : cap > 0 ? 5 : 0),
    longOpenInterestEth: token.longOpenInterestEth ?? Math.max(0, token.openInterest / ETH_USD_REFERENCE * token.longs / 100),
    shortOpenInterestEth: token.shortOpenInterestEth ?? Math.max(0, token.openInterest / ETH_USD_REFERENCE * (100 - token.longs) / 100),
    fundingRateHourly: token.fundingRateHourly ?? token.funding,
    borrowRateHourly: token.borrowRateHourly ?? 0.004,
    badDebtEth: token.badDebtEth ?? 0,
    linkedWalletConcentration: token.linkedWalletConcentration ?? 14,
    uniqueTraders: token.uniqueTraders ?? 40,
    volatility1m: token.volatility1m ?? 2,
    marketAgeSeconds: age,
    ...tokenIdentityParts(token),
    ogStatus: token.ogStatus ?? "og",
    metadataLockedAt: token.metadataLockedAt ?? Date.now() - token.launchedMinutesAgo * 60_000,
    creatorWallet: token.creatorWallet ?? "0xPERP…HOOD",
    launchBlock: token.launchBlock ?? 10_000_000 - Math.round(token.launchedMinutesAgo * 4),
  };
}

function unlockedLeverage(token: Token, settings: RiskSettings) {
  if (token.launchState === "auction" || token.cap <= 0) return 0;
  if (token.battlePoolVersion) return settings.maxLeverage;
  const age = token.marketAgeSeconds ?? token.launchedMinutesAgo * 60;
  const liquidity = token.liquidityEth ?? 0;
  const confidence = token.oracleConfidence ?? 0;
  const traders = token.uniqueTraders ?? 0;
  const linked = token.linkedWalletConcentration ?? 100;
  let unlocked = 1;
  if (age >= 15 && liquidity >= 0.03 && confidence >= 42) unlocked = 2;
  if (age >= 45 && liquidity >= 0.10 && confidence >= 56 && traders >= 14) unlocked = 5;
  if (age >= 120 && liquidity >= 0.40 && confidence >= 70 && traders >= 40 && linked < 38) unlocked = 10;
  if (age >= 360 && liquidity >= 2 && confidence >= 82 && traders >= 110 && linked < 24 && token.graduation >= 55) unlocked = 20;
  return Math.min(unlocked, settings.maxLeverage);
}

function maintenanceRate(leverage: number, bufferPercent: number) {
  return clamp(0.0075 + leverage * 0.00055 + bufferPercent / 100, 0.015, 0.045);
}

function liquidationCapFor(
  entryCap: number,
  direction: PositionDirection,
  collateral: number,
  notional: number,
  maintenanceMarginRate: number,
  closeCostRate: number,
  accruedCosts = 0,
) {
  const maintenance = notional * maintenanceMarginRate;
  const closeCosts = notional * closeCostRate;
  const usable = collateral - maintenance - closeCosts - accruedCosts;
  const move = clamp(usable / Math.max(notional, 0.000001), 0.015, 0.92);
  return direction === "short" ? entryCap * (1 + move) : entryCap * (1 - move);
}

function eventDirection(action: MarketAction) {
  return action === "spot-buy" || action === "long" || action === "whale-buy" || action === "short-squeeze" ? 1 : -1;
}

function computeRiskScore(token: Token) {
  if (token.launchState === "auction") return 0;
  const confidence = token.oracleConfidence ?? 0;
  const liquidityScore = clamp((token.liquidityEth ?? 0) / 4 * 100, 0, 100);
  const insuranceScore = clamp((token.insuranceEth ?? 0) / 0.25 * 100, 0, 100);
  const concentrationPenalty = Math.max(0, (token.linkedWalletConcentration ?? 0) - 10) * 1.25;
  const volatilityPenalty = Math.max(0, (token.volatility1m ?? 0) - 2) * 1.6;
  const badDebtPenalty = Math.min(35, (token.badDebtEth ?? 0) * 80);
  return clamp(confidence * 0.52 + liquidityScore * 0.23 + insuranceScore * 0.18 + 12 - concentrationPenalty - volatilityPenalty - badDebtPenalty, 0, 100);
}

export type ChainExecutionState = {
  mode: "browser-sim" | "v43-contract" | "v45-account" | "v45-session";
  phase: "idle" | "wallet" | "pending" | "confirmed" | "error";
  action?: string;
  slug?: string;
  account?: string;
  transactionHash?: string;
  blockNumber?: number;
  message?: string;
  updatedAt: number;
};

function isContractMarket(token: Token) {
  return (token.chainDeploymentMode === "anvil-v43" || token.chainDeploymentMode === "anvil-v45")
    && Boolean(token.chainMarketAddress)
    && /^0x[0-9a-fA-F]{40}$/.test(token.chainMarketAddress ?? "");
}

function shortWallet(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "wallet";
}

function pendingOrderFromV46(order: V46StoredOrder, token: Token): PendingOrder {
  const amountWei = BigInt(order.intent.side === "buy" ? order.intent.amountWei : order.intent.collateralWei);
  return {
    id: order.intent.orderId,
    slug: token.slug,
    side: order.intent.side,
    kind: order.intent.kind,
    leverage: order.intent.leverage,
    collateral: fromWad(amountWei, 18),
    triggerCap: order.intent.displayTriggerCapUsd,
    createdAt: order.intent.createdAt * 1_000,
    executionMode: "v46-keeper",
    status: order.status,
    chainMarketAddress: order.intent.market,
    orderHash: order.orderHash,
    positionId: order.intent.positionId === "0" ? undefined : order.intent.positionId,
    reduceOnly: order.intent.reduceOnly,
    activationCap: order.intent.displayActivationCapUsd,
    expiresAt: order.intent.expiresAt * 1_000,
    attempts: order.attempts,
    transactionHash: order.transactionHash,
    chainBlockNumber: order.blockNumber,
    failureReason: order.failureReason,
  };
}


function fromSignedWad(value: bigint, precision = 8) {
  return value < 0n ? -fromWad(-value, precision) : fromWad(value, precision);
}

type MarketContextValue = {
  tokens: Token[];
  events: MarketEvent[];
  positions: Position[];
  holdings: SpotHolding[];
  closedTrades: ClosedTrade[];
  pendingOrders: PendingOrder[];
  tradePresets: TradePreset[];
  watchlist: string[];
  auctionBids: Record<string, number>;
  connected: boolean;
  balanceEth: number;
  walletAddress?: string;
  walletBalanceEth: number;
  chainExecution: ChainExecutionState;
  riskSettings: RiskSettings;
  traderProgress: TraderProgress;
  getToken: (slug: string) => Token;
  getEvents: (slug?: string) => MarketEvent[];
  getMarketCapacity: (token: Token, leverage: number, direction: PositionDirection) => number;
  getTradeQuote: (token: Token, direction: PositionDirection, leverage: number, collateral: number, feeTier?: "market" | "maker") => TradeQuote;
  getMarketRisk: (token: Token) => MarketRisk;
  getPositionPnl: (position: Position) => ExecutablePnlSnapshot;
  getHoldingPnl: (holding: SpotHolding) => ExecutablePnlSnapshot;
  toggleWallet: () => void;
  fundTradingAccount: (amountEth: number) => void;
  withdrawTradingAccount: (amountEth: number) => boolean;
  syncTradingAccountBalance: (amountEth: number) => void;
  toggleWatchlist: (slug: string) => void;
  commitToAuction: (slug: string, amountEth: number) => number;
  openPosition: (slug: string, direction: PositionDirection, leverage: number, collateral: number, options?: OpenPositionOptions) => Promise<Position>;
  buySpot: (slug: string, amountEth: number, feeTier?: "market" | "maker") => Promise<SpotHolding>;
  placeOrder: (order: Omit<PendingOrder, "id" | "createdAt">) => Promise<PendingOrder>;
  cancelOrder: (id: string) => Promise<void>;
  saveTradePreset: (preset: Omit<TradePreset, "id">) => TradePreset;
  deleteTradePreset: (id: string) => void;
  closePosition: (id: string, fraction?: number) => Promise<void>;
  updatePositionRisk: (id: string, options: OpenPositionOptions) => void;
  addCollateral: (id: string, amountEth: number) => Promise<void>;
  sellHolding: (id: string, fraction?: number) => Promise<void>;
  launchToken: (input: LaunchTokenInput) => Token;
  getMigrationSnapshot: (token: Token) => MigrationSnapshot;
  migrateToken: (slug: string, forceTest?: boolean) => Token;
  advanceLaunchpadMarket: (slug: string) => Token;
  updateRiskSettings: (patch: Partial<RiskSettings>) => void;
  runScenario: (slug: string, scenario: MarketScenario) => void;
  refreshChainMarket: (slug: string) => Promise<void>;
  resetLocalData: () => void;
};

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const userState = useUserState();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [holdings, setHoldings] = useState<SpotHolding[]>([]);
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [tradePresets, setTradePresets] = useState<TradePreset[]>(DEFAULT_PRESETS);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [auctionBids, setAuctionBids] = useState<Record<string, number>>({});
  const [connected, setConnected] = useState(false);
  const [balanceEth, setBalanceEth] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string>();
  const [walletBalanceEth, setWalletBalanceEth] = useState(0);
  const [chainExecution, setChainExecution] = useState<ChainExecutionState>({ mode: "browser-sim", phase: "idle", updatedAt: Date.now() });
  const [riskSettings, setRiskSettings] = useState<RiskSettings>(DEFAULT_RISK);
  const [hydrated, setHydrated] = useState(false);
  const [v53WatchlistReady, setV53WatchlistReady] = useState(false);

  const tokensRef = useRef(tokens);
  const positionsRef = useRef(positions);
  const holdingsRef = useRef(holdings);
  const pendingOrdersRef = useRef(pendingOrders);
  const auctionBidsRef = useRef(auctionBids);
  const settlingRef = useRef(new Set<string>());
  const fillingOrdersRef = useRef(new Set<string>());
  const chainSyncRef = useRef(new Set<string>());
  const v46ReconciledOrdersRef = useRef(new Set<string>());

  useEffect(() => { tokensRef.current = tokens; }, [tokens]);
  useEffect(() => { positionsRef.current = positions; }, [positions]);
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);
  useEffect(() => { pendingOrdersRef.current = pendingOrders; }, [pendingOrders]);
  useEffect(() => { auctionBidsRef.current = auctionBids; }, [auctionBids]);

  useEffect(() => {
    try {
      const custom = storageValue<Token[]>("perphood-v20-custom-tokens", "perphood-v19-custom-tokens", []);
      const savedPositions = storageValue<Position[]>("perphood-v20-positions", "perphood-v19-positions", []);
      const savedHoldings = storageValue<SpotHolding[]>("perphood-v20-holdings", "perphood-v19-holdings", []);
      const savedClosed = storageValue<ClosedTrade[]>("perphood-v20-closed-trades", "perphood-v19-closed-trades", []);
      const savedOrders = storageValue<PendingOrder[]>("perphood-v20-pending-orders", "perphood-v19-pending-orders", []);
      const savedPresets = storageValue<TradePreset[]>("perphood-trade-presets", "rook-trade-presets", DEFAULT_PRESETS);
      const savedWatchlist = storageValue<string[]>("perphood-watchlist", "rook-watchlist", []);
      const savedAuctionBids = storageValue<Record<string, number>>("perphood-v20-auction-bids", "perphood-v19-auction-bids", {});
      const savedRisk = storageValue<RiskSettings | null>("perphood-risk-settings", "rook-risk-settings", null);
      const savedBalance = Number(localStorage.getItem("perphood-balance") ?? localStorage.getItem("rook-balance") ?? "0");
      const savedConnected = (localStorage.getItem("perphood-connected") ?? localStorage.getItem("rook-connected")) === "true";
      const normalizedCustom = custom.map((token) => {
        const pool = token.battlePoolVersion ? poolFromToken(token) : createBattlePoolState();
        return normalizeToken({
          ...token,
          ...poolToTokenPatch(pool, ETH_USD_REFERENCE),
          launchState: token.graduation >= 100 ? "graduated" : "live",
          battlePhase: token.graduation >= 100 ? "migrated" : "bonding",
          auctionEndsAt: undefined,
          auctionCommittedEth: undefined,
          auctionParticipants: undefined,
          auctionAllocationPercent: undefined,
        });
      });
      const reviewTokens = [...TOKENS, ...normalizedCustom];
      setTokens(applyOgRegistry(reviewTokens).map(normalizeToken));
      setEvents(DEMO_ONLY ? createDemoMarketEvents() : []);
      setPositions(savedPositions.filter((position) => position.tokenAmount || position.borrowedTokens).map((position) => ({
        ...position,
        initialCollateral: position.initialCollateral ?? position.collateral,
        accruedFunding: position.accruedFunding ?? 0,
        accruedBorrow: position.accruedBorrow ?? 0,
        maintenanceMarginRate: position.maintenanceMarginRate ?? maintenanceRate(position.leverage, DEFAULT_RISK.maintenanceBufferPercent),
        partialLiquidations: position.partialLiquidations ?? 0,
        lastAccruedAt: position.lastAccruedAt ?? Date.now(),
      })));
      setHoldings(savedHoldings.filter((holding) => Boolean(holding.tokenAmount)));
      setClosedTrades(savedClosed);
      setPendingOrders(savedOrders);
      setTradePresets(savedPresets.length ? savedPresets : DEFAULT_PRESETS);
      setWatchlist(savedWatchlist);
      setAuctionBids(savedAuctionBids);
      setRiskSettings(savedRisk ? { ...DEFAULT_RISK, ...savedRisk } : DEFAULT_RISK);
      setBalanceEth(DEMO_ONLY ? 2.35 : Number.isFinite(savedBalance) ? savedBalance : 0);
      setConnected(DEMO_ONLY ? true : savedConnected);
    } catch {
      // Corrupt local storage should never prevent PERPHOOD from loading.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || !userState.ready || v53WatchlistReady) return;
    const synced = userState.getSection<string[] | null>("watchlist-v1", null);
    if (Array.isArray(synced)) setWatchlist([...new Set(synced.filter((slug) => typeof slug === "string"))].slice(0, 500));
    setV53WatchlistReady(true);
  }, [hydrated, userState, v53WatchlistReady]);

  useEffect(() => {
    if (!hydrated || !userState.ready || !v53WatchlistReady) return;
    userState.setSection("watchlist-v1", watchlist);
  }, [hydrated, userState, v53WatchlistReady, watchlist]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("perphood-v20-custom-tokens", JSON.stringify(tokens.filter((token) => token.isCustom)));
    localStorage.setItem("perphood-v20-positions", JSON.stringify(positions));
    localStorage.setItem("perphood-v20-holdings", JSON.stringify(holdings));
    localStorage.setItem("perphood-v20-closed-trades", JSON.stringify(closedTrades.slice(0, 10000)));
    localStorage.setItem("perphood-v20-pending-orders", JSON.stringify(pendingOrders));
    localStorage.setItem("perphood-trade-presets", JSON.stringify(tradePresets));
    localStorage.setItem("perphood-watchlist", JSON.stringify(watchlist));
    localStorage.setItem("perphood-v20-auction-bids", JSON.stringify(auctionBids));
    localStorage.setItem("perphood-risk-settings", JSON.stringify(riskSettings));
    localStorage.setItem("perphood-balance", String(balanceEth));
    localStorage.setItem("perphood-connected", String(connected));
  }, [auctionBids, balanceEth, closedTrades, connected, holdings, hydrated, pendingOrders, positions, riskSettings, tokens, tradePresets, watchlist]);

  const pushEvent = useCallback((event: Omit<MarketEvent, "id" | "createdAt">) => {
    const next: MarketEvent = { ...event, id: randomId(), createdAt: Date.now() };
    setEvents((current) => [next, ...current].slice(0, 260));
  }, []);

  const applyChainState = useCallback((slug: string, state: Awaited<ReturnType<typeof readV44RuntimeState>>) => {
    const patch = runtimeStateToTokenPatch(state, ETH_USD_REFERENCE);
    tokensRef.current = tokensRef.current.map((item) => item.slug === slug ? normalizeToken({ ...item, ...patch }) : item);
    setTokens(tokensRef.current);
    return normalizeToken(tokensRef.current.find((item) => item.slug === slug) ?? TOKENS[0]);
  }, []);

  const refreshWalletBalance = useCallback(async (account?: string) => {
    const target = account ?? walletAddress;
    if (!target) return;
    try {
      const balance = await readV44WalletBalance(target);
      setWalletAddress(target);
      setWalletBalanceEth(fromWad(balance, 8));
      setConnected(true);
    } catch {
      // A disconnected local RPC should not take down the terminal.
    }
  }, [walletAddress]);

  const refreshChainMarket = useCallback(async (slug: string) => {
    const token = tokensRef.current.find((item) => item.slug === slug);
    if (!token || !isContractMarket(token) || !token.chainMarketAddress) return;
    if (chainSyncRef.current.has(slug)) return;
    chainSyncRef.current.add(slug);
    try {
      const state = await readV44RuntimeState(token.chainMarketAddress);
      applyChainState(slug, state);
      const tracked = positionsRef.current.filter((position) => position.slug === slug && (position.executionMode === "v43-contract" || position.executionMode === "v45-account" || position.executionMode === "v45-session") && position.chainPositionId);
      if (tracked.length) {
        const snapshots = await Promise.all(tracked.map(async (position) => {
          const positionId = BigInt(position.chainPositionId!);
          const contractPosition = await readV44Position(token.chainMarketAddress!, positionId);
          if (position.executionMode === "v43-contract") {
            const equityWei = await readV44PositionEquity(token.chainMarketAddress!, positionId);
            return {
              position,
              contractPosition,
              equityEth: fromWad(equityWei, 18),
              payableNow: true,
              maximumPayoutEth: undefined as number | undefined,
              postCloseObligationsEth: undefined as number | undefined,
            };
          }
          const [settlement, maximumShortPayoutWei] = await Promise.all([
            readV49PositionSettlement(token.chainMarketAddress!, positionId),
            contractPosition.direction === "short" ? readV49MaximumShortPayout(token.chainMarketAddress!, positionId) : Promise.resolve(0n),
          ]);
          return {
            position,
            contractPosition,
            equityEth: fromWad(settlement.payoutWei, 18),
            payableNow: settlement.payableNow,
            maximumPayoutEth: contractPosition.direction === "short" ? fromWad(maximumShortPayoutWei, 18) : undefined,
            postCloseObligationsEth: fromWad(settlement.postCloseObligationsWei, 18),
          };
        }));
        const inactive = new Set(snapshots.filter((snapshot) => !snapshot.contractPosition.active).map((snapshot) => snapshot.position.id));
        positionsRef.current = positionsRef.current
          .filter((position) => !inactive.has(position.id))
          .map((position) => {
            const snapshot = snapshots.find((item) => item.position.id === position.id);
            if (!snapshot || !snapshot.contractPosition.active) return position;
            return {
              ...position,
              currentCap: fromWad(state.marketCapEthWad, 18) * ETH_USD_REFERENCE,
              collateral: fromWad(snapshot.contractPosition.collateralWei, 18),
              notional: fromWad(snapshot.contractPosition.notionalWei, 18),
              chainExecutableEquityEth: snapshot.equityEth,
              chainExecutablePnlEth: snapshot.equityEth - fromWad(snapshot.contractPosition.collateralWei, 18),
              chainSettlementPayable: snapshot.payableNow,
              chainMaximumPayoutEth: snapshot.maximumPayoutEth,
              chainPostCloseObligationsEth: snapshot.postCloseObligationsEth,
              chainLastSyncedAt: Date.now(),
            };
          });
        setPositions(positionsRef.current);
      }
      await refreshWalletBalance();
    } finally {
      chainSyncRef.current.delete(slug);
    }
  }, [applyChainState, refreshWalletBalance]);

  const confirmChainExecution = useCallback(async (
    slug: string,
    action: string,
    receipt: V44ExecutionReceipt,
    mode: ChainExecutionState["mode"] = "v43-contract",
    internalBalanceEth?: number,
  ) => {
    if (receipt.state) applyChainState(slug, receipt.state);
    setWalletAddress(receipt.account);
    if (internalBalanceEth !== undefined) setBalanceEth(internalBalanceEth);
    await refreshWalletBalance(receipt.account);
    setChainExecution({
      mode,
      phase: "confirmed",
      action,
      slug,
      account: receipt.account,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      message: mode === "v45-session"
        ? `${action} settled from the authorized account in block ${receipt.blockNumber}.`
        : mode === "v45-account"
          ? `${action} settled from the V45 account after wallet confirmation in block ${receipt.blockNumber}.`
          : `${action} confirmed in block ${receipt.blockNumber}.`,
      updatedAt: Date.now(),
    });
  }, [applyChainState, refreshWalletBalance]);

  const beginChainExecution = useCallback((slug: string, action: string, mode: ChainExecutionState["mode"] = "v43-contract") => {
    setChainExecution({
      mode,
      phase: mode === "v45-session" ? "pending" : "wallet",
      action,
      slug,
      message: mode === "v45-session" ? "Signing the local session intent and sending it to the sponsored sequencer." : mode === "v45-account" ? "Confirm the bounded V45 account action in your wallet." : "Confirm the local-chain transaction in your wallet.",
      updatedAt: Date.now(),
    });
  }, []);

  const failChainExecution = useCallback((slug: string, action: string, error: unknown, mode: ChainExecutionState["mode"] = "v43-contract") => {
    const message = error instanceof Error ? error.message : "Contract execution failed.";
    setChainExecution({ mode, phase: "error", action, slug, message, updatedAt: Date.now() });
    return new Error(message);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const attachLocalDeployment = async () => {
      type Manifest = { version?: string; chainId?: number; factoryAddress?: string; accountRouterAddress?: string; demoMarketAddress?: string; demoTokenAddress?: string; creator?: string; demoTransactionHash?: string };
      let manifest: Manifest = {};
      let deploymentMode: "anvil-v43" | "anvil-v45" = "anvil-v45";
      try {
        const v45 = await fetch("/local-chain/v45-deployment.json", { cache: "no-store" });
        if (v45.ok) manifest = await v45.json() as Manifest;
        else {
          deploymentMode = "anvil-v43";
          const v43 = await fetch("/local-chain/v43-deployment.json", { cache: "no-store" });
          if (v43.ok) manifest = await v43.json() as Manifest;
        }
      } catch {
        // Environment variables can still attach a market when no public manifest exists.
      }
      if (cancelled) return;
      const v45Router = process.env.NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS ?? manifest.accountRouterAddress ?? manifest.factoryAddress;
      const marketAddress = process.env.NEXT_PUBLIC_V45_DEMO_MARKET_ADDRESS ?? process.env.NEXT_PUBLIC_V43_DEMO_MARKET_ADDRESS ?? manifest.demoMarketAddress;
      const tokenAddress = process.env.NEXT_PUBLIC_V45_DEMO_TOKEN_ADDRESS ?? process.env.NEXT_PUBLIC_V43_DEMO_TOKEN_ADDRESS ?? manifest.demoTokenAddress;
      const factoryAddress = process.env.NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS ?? process.env.NEXT_PUBLIC_V43_LAUNCHPAD_FACTORY_ADDRESS ?? manifest.factoryAddress;
      if (v45Router && /^0x[0-9a-fA-F]{40}$/.test(v45Router)) deploymentMode = "anvil-v45";
      if (!marketAddress || !/^0x[0-9a-fA-F]{40}$/.test(marketAddress)) return;
      tokensRef.current = tokensRef.current.map((item, index) => index === 0 ? normalizeToken({
        ...item,
        chainDeploymentMode: deploymentMode,
        chainId: manifest.chainId ?? 31_337,
        chainFactoryAddress: factoryAddress,
        chainMarketAddress: marketAddress,
        chainTokenAddress: tokenAddress,
        contractAddress: tokenAddress ?? item.contractAddress,
        creatorWallet: manifest.creator ?? item.creatorWallet,
        launchTransactionHash: manifest.demoTransactionHash ?? item.launchTransactionHash,
        chainExecutionVersion: deploymentMode === "anvil-v45" ? "v45-authorized-account-execution" : "v44-terminal-contract-execution",
      }) : item);
      setTokens(tokensRef.current);
      await refreshChainMarket(tokensRef.current[0]?.slug ?? "");
    };
    void attachLocalDeployment();
    return () => { cancelled = true; };
  }, [hydrated, refreshChainMarket]);

  useEffect(() => {
    if (!hydrated) return;
    const poll = () => tokensRef.current.filter(isContractMarket).forEach((token) => { void refreshChainMarket(token.slug); });
    poll();
    const interval = window.setInterval(poll, process.env.NEXT_PUBLIC_V48_STREAM_ENABLED === "false" ? 1_000 : 5_000);
    return () => window.clearInterval(interval);
  }, [hydrated, refreshChainMarket]);

  useEffect(() => {
    if (!hydrated || process.env.NEXT_PUBLIC_V48_STREAM_ENABLED === "false" || typeof EventSource === "undefined") return;
    const source = new EventSource("/api/v48/stream");
    const refreshMarketFromEvent = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as { marketAddress?: string };
        if (!payload.marketAddress) return;
        const token = tokensRef.current.find((item) => item.chainMarketAddress?.toLowerCase() === payload.marketAddress?.toLowerCase());
        if (token) void refreshChainMarket(token.slug);
      } catch { /* malformed stream events never interrupt terminal fallback polling */ }
    };
    source.addEventListener("market.updated", refreshMarketFromEvent);
    source.addEventListener("trade.confirmed", refreshMarketFromEvent);
    source.addEventListener("position.updated", refreshMarketFromEvent);
    return () => source.close();
  }, [hydrated, refreshChainMarket]);


  const getMarketCapacity = useCallback((rawToken: Token, leverage: number, direction: PositionDirection) => {
    const token = normalizeToken(rawToken);
    if (token.launchState === "auction" || token.cap <= 0) return 0;
    if (isContractMarket(token)) {
      if (direction === "short") return Math.max(0, token.shortCapacityEth ?? 0);
      if (leverage <= 2) return Math.max(0, token.chainLongCapacity2xEth ?? 0);
      if (leverage <= 5) return Math.max(0, token.chainLongCapacity5xEth ?? token.chainLongCapacity2xEth ?? 0);
      if (leverage <= 10) return Math.max(0, token.chainLongCapacity10xEth ?? token.chainLongCapacity5xEth ?? 0);
      return Math.max(0, token.chainLongCapacity20xEth ?? token.chainLongCapacity10xEth ?? 0);
    }
    if (token.battlePoolVersion) {
      const pool = poolFromToken(token);
      return direction === "long" ? longNotionalCapacity(pool, Math.max(1, leverage)) : shortNotionalCapacity(pool);
    }
    const liquidity = Math.max(0.01, token.liquidityEth ?? 0);
    const insurance = Math.max(0.005, token.insuranceEth ?? 0);
    const confidence = clamp((token.oracleConfidence ?? 0) / 100, 0, 1);
    const leveragePenalty = clamp(2.1 / Math.sqrt(Math.max(1, leverage)), 0.38, 1.35);
    return clamp(Math.min(liquidity * 0.55, insurance * 8.5, liquidity * Math.pow(confidence, 3) * 2.1) * leveragePenalty, 0.002, 75);
  }, []);

  const getTradeQuote = useCallback((rawToken: Token, direction: PositionDirection, leverage: number, collateral: number, feeTier: "market" | "maker" = "market"): TradeQuote => {
    const token = normalizeToken(rawToken);
    const maxLeverage = unlockedLeverage(token, riskSettings);
    const safeLeverage = clamp(leverage, 1, Math.max(1, maxLeverage || 1));
    const notionalEth = Math.max(0, collateral) * safeLeverage;
    const capacityEth = getMarketCapacity(token, safeLeverage, direction);
    const protocolFeeRate = BATTLE_TRADE_FEE_RATE;
    const feeRate = protocolFeeRate;
    const feeEth = notionalEth * feeRate;
    const mmr = maintenanceRate(safeLeverage, riskSettings.maintenanceBufferPercent);
    let priceImpactPercent = 0;
    let markCap = token.markCap ?? token.cap;
    let reason: string | undefined;

    if (token.battlePoolVersion && collateral > 0 && safeLeverage > 0) {
      try {
        const pool = poolFromToken(token);
        const trade = direction === "long"
          ? executeOpenLong(pool, collateral, safeLeverage, feeRate)
          : executeOpenShort(pool, collateral, safeLeverage, feeRate);
        priceImpactPercent = trade.priceImpactPercent;
        markCap = poolToTokenPatch(trade.next, ETH_USD_REFERENCE).cap;
      } catch (error) {
        reason = error instanceof Error ? error.message : "BattlePool capacity is unavailable.";
      }
    } else {
      const liquidity = Math.max(0.02, token.liquidityEth ?? 0.02);
      priceImpactPercent = clamp((notionalEth / liquidity) * 0.4, 0.01, 6.5);
    }

    const liquidationCap = liquidationCapFor(markCap, direction, collateral, notionalEth, mmr, feeRate + 0.0015);
    const liquidationDistancePercent = markCap ? Math.abs(liquidationCap - markCap) / markCap * 100 : 0;
    if (token.launchState === "auction") reason = "This legacy opening auction must be reset into a BattlePool market.";
    else if (leverage > maxLeverage) reason = `${maxLeverage}× is the current leverage ceiling.`;
    else if (notionalEth > capacityEth + 1e-12) reason = `Available ${direction} capacity is ${capacityEth.toFixed(4)} ETH.`;
    else if (collateral <= 0) reason = "Enter collateral.";
    else if (collateral + feeEth > balanceEth) reason = "Insufficient trading balance for collateral and fees.";

    return {
      allowed: !reason,
      reason,
      leverage: safeLeverage,
      maxLeverage,
      notionalEth,
      capacityEth,
      feeRate,
      feeEth,
      priceImpactPercent,
      fundingRateHourly: token.fundingRateHourly ?? token.funding,
      borrowRateHourly: token.borrowRateHourly ?? 0.004,
      liquidationCap,
      liquidationDistancePercent,
      maintenanceMarginEth: notionalEth * mmr,
      oracleConfidence: token.oracleConfidence ?? 0,
      markCap,
      indexCap: token.indexCap ?? token.cap,
      balancingRebate: false,
      feeTier,
      protocolFeeRate,
      dynamicRiskFeeRate: 0,
    };
  }, [balanceEth, getMarketCapacity, riskSettings]);

  const getMarketRisk = useCallback((rawToken: Token): MarketRisk => {
    const token = normalizeToken(rawToken);
    const score = computeRiskScore(token);
    const maxLeverage = unlockedLeverage(token, riskSettings);
    const reasons: string[] = [];
    if ((token.oracleConfidence ?? 0) < 70) reasons.push("Oracle still maturing");
    if ((token.linkedWalletConcentration ?? 0) > 24) reasons.push("Linked-wallet concentration elevated");
    if ((token.hedgeUtilization ?? 0) > 75) reasons.push("Hedge inventory heavily used");
    if ((token.volatility1m ?? 0) > 8) reasons.push("One-minute volatility elevated");
    if ((token.insuranceEth ?? 0) < 0.04) reasons.push("Insurance fund is still small");
    if (!reasons.length) reasons.push("Oracle, liquidity, and insurance are aligned");
    const label: MarketRisk["label"] = score >= 78 ? "Protected" : score >= 58 ? "Watch" : score >= 34 ? "High risk" : "Close only";
    const longCapacityEth = getMarketCapacity(token, Math.max(2, maxLeverage), "long");
    const shortCapacityEth = getMarketCapacity(token, Math.max(2, maxLeverage), "short");
    const totalOi = Math.max(0.01, (token.longOpenInterestEth ?? 0) + (token.shortOpenInterestEth ?? 0));
    return {
      score,
      label,
      maxLeverage,
      oracleConfidence: token.oracleConfidence ?? 0,
      spotCap: token.cap,
      indexCap: token.indexCap ?? token.cap,
      markCap: token.markCap ?? token.cap,
      longCapacityEth,
      shortCapacityEth,
      insuranceCoveragePercent: clamp((token.insuranceEth ?? 0) / totalOi * 100, 0, 999),
      reasons,
    };
  }, [getMarketCapacity, riskSettings]);

  useLayoutEffect(() => {
    if (!hydrated) return;
    for (const token of tokens) {
      if (!token.battlePoolVersion || token.cap <= 0) continue;
      publishBattleRealtimeFrame(normalizeToken(token), positions, holdings, "battlepool-local");
    }
  }, [holdings, hydrated, positions, tokens]);

  useEffect(() => {
    if (!ENABLE_LOCAL_MARKET_ENGINE || riskSettings.paused) return;
    const delay = Math.max(220, 880 / Math.max(0.25, riskSettings.simulationSpeed));
    const interval = window.setInterval(() => {
      const liveTokens = tokensRef.current.filter((item) => item.launchState !== "auction" && item.cap > 0);
      if (!liveTokens.length) return;
      const selected = liveTokens[Math.floor(Math.random() * Math.min(liveTokens.length, 14))];
      const roll = Math.random();
      const action: MarketAction = roll < 0.31 ? "spot-buy" : roll < 0.58 ? "spot-sell" : roll < 0.80 ? "long" : "short";
      const amountEth = Number((0.004 + Math.pow(Math.random(), 2) * 1.75).toFixed(3));
      const direction = eventDirection(action);
      let eventCap = selected.cap;
      let graduated = false;
      let unlockedEvent = false;

      setTokens((current) => current.map((raw) => {
        if (raw.launchState === "auction" || raw.cap <= 0) return raw;
        const item = normalizeToken(raw);
        const isSelected = item.slug === selected.slug;
        const depth = Math.max(0.035, (item.liquidityEth ?? 0.2) + item.graduation / 54);
        const background = (Math.random() - 0.497) * 0.0012;
        const impact = isSelected ? clamp((amountEth / depth) * 0.0047, 0.0002, 0.027) * direction : background;
        const oldCap = item.cap;
        const cap = Math.max(80, oldCap * (1 + impact));
        const observedMove = Math.abs((cap - oldCap) / oldCap) * 100;
        const previousIndex = item.indexCap ?? oldCap;
        const indexFollow = clamp((cap - previousIndex) * 0.13, -previousIndex * 0.012, previousIndex * 0.012);
        const indexCap = Math.max(80, previousIndex + indexFollow);
        const longOi = Math.max(0, (item.longOpenInterestEth ?? 0) + (isSelected && action === "long" ? amountEth * 0.65 : 0));
        const shortOi = Math.max(0, (item.shortOpenInterestEth ?? 0) + (isSelected && action === "short" ? amountEth * 0.65 : 0));
        const totalOi = Math.max(0.001, longOi + shortOi);
        const oiLongShare = longOi + shortOi > 0.001 ? longOi / totalOi * 100 : item.longs;
        const newLongs = clamp(item.longs * 0.93 + oiLongShare * 0.07 + (isSelected ? (Math.random() - 0.5) * 0.5 : 0), 4, 96);
        const funding = clamp((newLongs - 50) / 50 * 0.042, -0.055, 0.055);
        const premium = clamp((newLongs - 50) / 50 * 0.0065, -riskSettings.oracleGuardPercent / 100, riskSettings.oracleGuardPercent / 100);
        const targetMark = indexCap * (1 + premium);
        const previousMark = item.markCap ?? indexCap;
        const guard = riskSettings.oracleGuardPercent / 100;
        const markCap = clamp(previousMark + (targetMark - previousMark) * 0.38, indexCap * (1 - guard), indexCap * (1 + guard));
        const marketAgeSeconds = (item.marketAgeSeconds ?? 0) + delay / 1000;
        const liquidityDelta = isSelected && (action === "spot-buy" || action === "spot-sell") ? amountEth * 0.003 : amountEth * 0.00005;
        const liquidityEth = Math.max(0.035, (item.liquidityEth ?? 0.2) + liquidityDelta);
        const volume24h = item.volume24h + (isSelected ? amountEth * ETH_USD_REFERENCE : Math.random() * 30);
        const uniqueTraders = Math.min(25_000, (item.uniqueTraders ?? 0) + (isSelected && Math.random() > 0.45 ? 1 : 0));
        const linked = clamp((item.linkedWalletConcentration ?? 15) + (isSelected ? (Math.random() - 0.53) * 0.12 : -0.005), 3, 58);
        const volatility1m = clamp((item.volatility1m ?? 2) * 0.91 + observedMove * 9, 0.25, 32);
        const confidenceTarget = clamp(30 + Math.log10(1 + liquidityEth * 100) * 18 + Math.log10(1 + uniqueTraders) * 12 + Math.min(16, marketAgeSeconds / 90) - volatility1m * 1.2 - Math.max(0, linked - 15) * 0.35, 18, 99);
        const oracleConfidence = clamp((item.oracleConfidence ?? confidenceTarget) * 0.93 + confidenceTarget * 0.07, 10, 99);
        const oldGraduation = item.graduation;
        const graduation = clamp(item.graduation + (isSelected ? Math.max(-0.07, impact * 13) : 0.003), 0.1, 100);
        if (isSelected) graduated = oldGraduation < 100 && graduation >= 100;
        const beforeUnlock = item.maxLeverageUnlocked ?? 1;
        const draft = normalizeToken({
          ...item,
          cap,
          price: item.price * (cap / oldCap),
          indexCap,
          markCap,
          change24h: clamp(item.change24h + impact * 100 * 0.19, -99, 999),
          graduation,
          launchState: graduation >= 100 ? "graduated" : "live",
          longs: newLongs,
          volume24h,
          openInterest: totalOi * ETH_USD_REFERENCE,
          longOpenInterestEth: longOi,
          shortOpenInterestEth: shortOi,
          funding,
          fundingRateHourly: funding,
          borrowRateHourly: clamp(0.002 + (item.hedgeUtilization ?? 0) * 0.00006, 0.002, 0.018),
          launchedMinutesAgo: item.launchedMinutesAgo + delay / 60_000,
          marketAgeSeconds,
          liquidityEth,
          insuranceEth: Math.max(0.015, (item.insuranceEth ?? 0.03) + amountEth * 0.00016 * riskSettings.insurancePercent / 25),
          hedgeUtilization: clamp(Math.abs(newLongs - 50) * 1.55 + totalOi / Math.max(liquidityEth, 0.01) * 2.4, 2, 98),
          allTimeHighCap: Math.max(item.allTimeHighCap ?? oldCap, cap),
          linkedWalletConcentration: linked,
          uniqueTraders,
          volatility1m,
          oracleConfidence,
        });
        draft.maxLeverageUnlocked = unlockedLeverage(draft, riskSettings);
        if (isSelected && (draft.maxLeverageUnlocked ?? 1) > beforeUnlock) unlockedEvent = true;
        if (isSelected) eventCap = cap;
        return draft;
      }));

      pushEvent({
        slug: selected.slug,
        action,
        amountEth,
        marketCap: eventCap,
        leverage: action === "long" || action === "short" ? [2, 5, 10, 20][Math.floor(Math.random() * 4)] : undefined,
        actor: ACTORS[Math.floor(Math.random() * ACTORS.length)],
      });
      if (graduated) pushEvent({ slug: selected.slug, action: "graduation", amountEth: 0, marketCap: eventCap, actor: "PERPHOOD", note: "Permanent liquidity and risk limits expanded" });
      if (unlockedEvent) pushEvent({ slug: selected.slug, action: "oracle-guard", amountEth: 0, marketCap: eventCap, actor: "Risk engine", note: "Higher leverage tier unlocked" });
    }, delay);
    return () => window.clearInterval(interval);
  }, [pushEvent, riskSettings]);

  const getToken = useCallback((slug: string) => normalizeToken(tokens.find((token) => token.slug === slug) ?? tokens[0] ?? TOKENS[0]), [tokens]);
  const getEvents = useCallback((slug?: string) => slug ? events.filter((event) => event.slug === slug) : events, [events]);
  const getPositionPnl = useCallback((position: Position) => {
    if ((position.executionMode === "v43-contract" || position.executionMode === "v45-account" || position.executionMode === "v45-session") && position.chainExecutableEquityEth !== undefined) {
      const pnlEth = position.chainExecutablePnlEth ?? position.chainExecutableEquityEth - position.collateral;
      return {
        id: position.id,
        kind: "perp" as const,
        slug: position.slug,
        executableValueEth: position.chainExecutableEquityEth,
        pnlEth,
        roiPercent: position.collateral > 0 ? pnlEth / position.collateral * 100 : 0,
        priceImpactPercent: 0,
        feeEth: 0,
        updatedAt: position.chainLastSyncedAt ?? Date.now(),
        executable: position.chainSettlementPayable !== false,
        reason: position.chainSettlementPayable === false
          ? "Exact close quote exists, but the post-close guaranteed-liability test is not currently payable."
          : position.executionMode === "v43-contract"
            ? "Exact V43 quotePositionEquityWei contract read"
            : "Exact V49 settlement quote passed the post-close solvency test",
      };
    }
    const token = normalizeToken(tokensRef.current.find((item) => item.slug === position.slug) ?? TOKENS[0]);
    return quoteExecutablePositionPnl(token, position);
  }, []);
  const getHoldingPnl = useCallback((holding: SpotHolding) => {
    const token = normalizeToken(tokensRef.current.find((item) => item.slug === holding.slug) ?? TOKENS[0]);
    return quoteExecutableSpotPnl(token, holding);
  }, []);
  const toggleWallet = useCallback(() => setConnected((value) => !value), []);
  const toggleWatchlist = useCallback((slug: string) => setWatchlist((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [slug, ...current]), []);

  const commitToAuction = useCallback((slug: string, amountEth: number) => {
    const token = tokensRef.current.find((item) => item.slug === slug);
    if (!token || token.launchState !== "auction") throw new Error("The opening auction is no longer active.");
    const safeAmount = clamp(amountEth, 0.001, Math.max(0.001, balanceEth));
    setBalanceEth((value) => Math.max(0, value - safeAmount));
    setAuctionBids((current) => ({ ...current, [slug]: (current[slug] ?? 0) + safeAmount }));
    setTokens((current) => current.map((item) => item.slug === slug ? {
      ...item,
      auctionCommittedEth: (item.auctionCommittedEth ?? 0) + safeAmount,
      auctionParticipants: (item.auctionParticipants ?? 0) + 1,
    } : item));
    pushEvent({ slug, action: "auction-bid", amountEth: safeAmount, marketCap: 0, actor: "You", note: "Uniform-price opening commitment" });
    return safeAmount;
  }, [balanceEth, pushEvent]);

  const recordClosedTrade = useCallback((position: Position, exitCap: number, pnlEth: number, collateral: number, reason: ClosedTrade["reason"]) => {
    const closed: ClosedTrade = {
      id: randomId(),
      slug: position.slug,
      direction: position.direction,
      leverage: position.leverage,
      entryCap: position.entryCap,
      exitCap,
      collateral,
      pnlEth,
      roiPercent: collateral > 0 ? pnlEth / collateral * 100 : 0,
      openedAt: position.openedAt,
      closedAt: Date.now(),
      reason,
    };
    setClosedTrades((current) => [closed, ...current].slice(0, 10000));
  }, []);

  const openPosition = useCallback(async (slug: string, direction: PositionDirection, leverage: number, collateral: number, options: OpenPositionOptions = {}) => {
    const token = normalizeToken(tokensRef.current.find((item) => item.slug === slug) ?? TOKENS[0]);
    if (isContractMarket(token)) {
      if (!token.chainMarketAddress) throw new Error("The V43 market address is missing.");
      const action = `Open ${leverage}× ${direction}`;
      const v45Market = token.chainDeploymentMode === "anvil-v45";
      const sessionExecution = v45Market && hasLocalV45Session();
      const executionMode = sessionExecution ? "v45-session" as const : v45Market ? "v45-account" as const : "v43-contract" as const;
      beginChainExecution(slug, action, executionMode);
      try {
        const maintenanceMarginBps = Math.round(maintenanceRate(leverage, riskSettings.maintenanceBufferPercent) * 10_000);
        const v45Execution = sessionExecution
          ? await executeV45OpenPosition(token.chainMarketAddress, direction, leverage, collateral, maintenanceMarginBps)
          : v45Market
            ? await executeV45DirectOpenPosition(token.chainMarketAddress, direction, leverage, collateral, maintenanceMarginBps)
            : null;
        const receipt = v45Execution?.receipt ?? await executeV44OpenPosition(token.chainMarketAddress, direction, leverage, collateral, maintenanceMarginBps);
        if (!receipt.opened) throw new Error("The confirmed transaction emitted no PositionOpened event.");
        const contractPosition = await readV44Position(token.chainMarketAddress, receipt.opened.positionId);
        const settlement = v45Market
          ? await readV49PositionSettlement(token.chainMarketAddress, receipt.opened.positionId)
          : null;
        const contractEquityWei = settlement?.payoutWei
          ?? await readV44PositionEquity(token.chainMarketAddress, receipt.opened.positionId);
        const maximumShortPayoutWei = v45Market && contractPosition.direction === "short"
          ? await readV49MaximumShortPayout(token.chainMarketAddress, receipt.opened.positionId)
          : 0n;
        const entryPriceEth = fromWad(receipt.opened.entryPriceWad, 18);
        const liquidationPriceEth = fromWad(receipt.opened.liquidationPriceWad, 18);
        const openedPosition: Position = {
          id: `chain:${token.chainMarketAddress.toLowerCase()}:${receipt.opened.positionId.toString()}`,
          slug,
          direction,
          leverage: receipt.opened.leverage,
          collateral: fromWad(receipt.opened.collateralWei, 18),
          initialCollateral: fromWad(receipt.opened.collateralWei, 18),
          notional: fromWad(receipt.opened.notionalWei, 18),
          entryCap: entryPriceEth * BATTLE_TOTAL_SUPPLY * ETH_USD_REFERENCE,
          currentCap: fromWad(receipt.state?.marketCapEthWad ?? receipt.opened.entryPriceWad * BigInt(BATTLE_TOTAL_SUPPLY), 18) * ETH_USD_REFERENCE,
          liquidationCap: liquidationPriceEth * BATTLE_TOTAL_SUPPLY * ETH_USD_REFERENCE,
          openedAt: contractPosition.openedAt,
          entryFee: fromWad(receipt.trade?.feeWethWei ?? 0n, 18),
          takeProfitCap: sessionExecution ? options.takeProfitCap : undefined,
          stopLossCap: sessionExecution ? options.stopLossCap : undefined,
          breakevenCap: sessionExecution ? options.breakevenCap : undefined,
          breakevenActivationCap: sessionExecution ? options.breakevenActivationCap : undefined,
          accruedFunding: 0,
          accruedBorrow: 0,
          maintenanceMarginRate: contractPosition.maintenanceMarginBps / 10_000,
          partialLiquidations: 0,
          lastAccruedAt: Date.now(),
          tokenAmount: direction === "long" ? fromWad(contractPosition.tokenAmountWad, 18) : undefined,
          debtEth: direction === "long" ? fromWad(contractPosition.debtWei, 18) : undefined,
          borrowedTokens: direction === "short" ? fromWad(contractPosition.borrowedTokensWad, 18) : undefined,
          lockedProceedsEth: direction === "short" ? fromWad(contractPosition.lockedProceedsWei, 18) : undefined,
          entryPriceEth,
          owner: receipt.account,
          executionMode,
          chainPositionId: receipt.opened.positionId.toString(),
          chainMarketAddress: token.chainMarketAddress,
          chainTransactionHash: receipt.transactionHash,
          chainBlockNumber: receipt.blockNumber,
          chainExecutableEquityEth: fromWad(contractEquityWei, 18),
          chainExecutablePnlEth: fromWad(contractEquityWei, 18) - fromWad(contractPosition.collateralWei, 18),
          chainSettlementPayable: settlement?.payableNow ?? true,
          chainMaximumPayoutEth: contractPosition.direction === "short" && v45Market ? fromWad(maximumShortPayoutWei, 18) : undefined,
          chainPostCloseObligationsEth: settlement ? fromWad(settlement.postCloseObligationsWei, 18) : undefined,
          chainLastSyncedAt: Date.now(),
        };
        positionsRef.current = [openedPosition, ...positionsRef.current.filter((item) => item.id !== openedPosition.id)];
        setPositions(positionsRef.current);
        await confirmChainExecution(slug, action, receipt, executionMode, v45Execution ? fromWad(v45Execution.accountState.accountWethWei, 18) : undefined);
        const nextToken = normalizeToken(tokensRef.current.find((item) => item.slug === slug) ?? token);
        publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, executionMode);
        pushEvent({
          slug,
          action: direction,
          amountEth: openedPosition.notional,
          marketCap: nextToken.cap,
          leverage: openedPosition.leverage,
          actor: shortWallet(receipt.account),
          note: `${sessionExecution ? "V45 sponsored" : "V43 wallet"} position #${receipt.opened.positionId.toString()} · block ${receipt.blockNumber}`,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          executionMode,
        });
        if (sessionExecution) {
          const protectionInputs = [
            options.takeProfitCap ? { kind: "take-profit" as const, triggerCapUsd: options.takeProfitCap } : null,
            options.stopLossCap ? { kind: "stop-loss" as const, triggerCapUsd: options.stopLossCap } : null,
            options.breakevenCap && options.breakevenActivationCap ? { kind: "breakeven" as const, triggerCapUsd: options.breakevenCap, activationCapUsd: options.breakevenActivationCap } : null,
          ].filter(Boolean) as Array<{ kind: "take-profit" | "stop-loss" | "breakeven"; triggerCapUsd: number; activationCapUsd?: number }>;
          if (protectionInputs.length) {
            try {
              const durableOrders: PendingOrder[] = [];
              for (const protection of protectionInputs) {
                const created = await createV46ProtectionOrder({
                  market: token.chainMarketAddress as `0x${string}`,
                  direction,
                  kind: protection.kind,
                  positionId: receipt.opened.positionId,
                  triggerCapUsd: protection.triggerCapUsd,
                  activationCapUsd: protection.activationCapUsd,
                });
                durableOrders.push(pendingOrderFromV46(created, token));
              }
              setPendingOrders((current) => [...durableOrders, ...current.filter((item) => !durableOrders.some((order) => order.id === item.id))].slice(0, 200));
              pushEvent({ slug, action: "trigger-order", amountEth: openedPosition.notional, marketCap: nextToken.cap, leverage: openedPosition.leverage, actor: "V46 protection keeper", note: `${durableOrders.length} reduce-only protection order${durableOrders.length === 1 ? "" : "s"} armed` });
            } catch (protectionError) {
              pushEvent({ slug, action: "order-cancel", amountEth: openedPosition.notional, marketCap: nextToken.cap, leverage: openedPosition.leverage, actor: "V46 protection keeper", note: protectionError instanceof Error ? protectionError.message : "Protection orders could not be armed" });
            }
          }
        }
        return openedPosition;
      } catch (error) {
        throw failChainExecution(slug, action, error, executionMode);
      }
    }
    if (!token?.battlePoolVersion) throw new Error("This market has not been migrated to the unified BattlePool engine.");
    if (token.creatorWallet === "0x71C…88F") throw new Error("The creator wallet can trade spot but cannot long or short its own coin.");
    const quote = getTradeQuote(token, direction, leverage, collateral, options.feeTier ?? "market");
    if (!quote.allowed) throw new Error(quote.reason ?? "This trade is outside the current BattlePool limit.");
    const safeCollateral = clamp(collateral, 0.001, Math.max(0.001, balanceEth));
    const trade = direction === "long"
      ? executeOpenLong(poolFromToken(token), safeCollateral, quote.leverage, quote.feeRate)
      : executeOpenShort(poolFromToken(token), safeCollateral, quote.leverage, quote.feeRate);
    if (safeCollateral + trade.feeEth > balanceEth) throw new Error("Insufficient trading balance for collateral and fees.");
    const nextPool = maybeReleaseSafetyInventory(trade.next);
    const poolPatch = poolToTokenPatch(nextPool, ETH_USD_REFERENCE);
    const nextLongOi = direction === "long" ? (token.longOpenInterestEth ?? 0) + trade.notionalEth : token.longOpenInterestEth ?? 0;
    const nextShortOi = direction === "short" ? (token.shortOpenInterestEth ?? 0) + trade.notionalEth : token.shortOpenInterestEth ?? 0;
    const totalOi = nextLongOi + nextShortOi;
    const nextToken = normalizeToken({
      ...token,
      ...poolPatch,
      longOpenInterestEth: nextLongOi,
      shortOpenInterestEth: nextShortOi,
      openInterest: totalOi * ETH_USD_REFERENCE,
      longs: totalOi > 0 ? nextLongOi / totalOi * 100 : 50,
      volume24h: token.volume24h + trade.notionalEth * ETH_USD_REFERENCE,
      uniqueTraders: (token.uniqueTraders ?? 0) + 1,
      allTimeHighCap: Math.max(token.allTimeHighCap ?? token.cap, poolPatch.cap),
    });
    const mmr = maintenanceRate(quote.leverage, riskSettings.maintenanceBufferPercent);
    const now = Date.now();
    const position: Position = {
      id: randomId(),
      slug,
      direction,
      leverage: quote.leverage,
      collateral: safeCollateral,
      initialCollateral: safeCollateral,
      notional: trade.notionalEth,
      entryCap: poolPatch.cap,
      currentCap: poolPatch.cap,
      liquidationCap: liquidationCapFor(poolPatch.cap, direction, safeCollateral, trade.notionalEth, mmr, quote.feeRate + 0.0015),
      openedAt: now,
      entryFee: trade.feeEth,
      takeProfitCap: options.takeProfitCap,
      stopLossCap: options.stopLossCap,
      accruedFunding: 0,
      accruedBorrow: 0,
      maintenanceMarginRate: mmr,
      partialLiquidations: 0,
      lastAccruedAt: now,
      tokenAmount: direction === "long" ? trade.tokens : undefined,
      debtEth: "debtEth" in trade ? trade.debtEth : undefined,
      borrowedTokens: "borrowedTokens" in trade ? trade.borrowedTokens : undefined,
      lockedProceedsEth: "lockedProceedsEth" in trade ? trade.lockedProceedsEth : undefined,
      entryPriceEth: trade.priceAfter,
    };
    tokensRef.current = tokensRef.current.map((item) => item.slug === slug ? nextToken : item);
    setTokens(tokensRef.current);
    positionsRef.current = [position, ...positionsRef.current];
    setPositions(positionsRef.current);
    publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, "battlepool-local");
    setBalanceEth((value) => Math.max(0, value - safeCollateral - trade.feeEth));
    pushEvent({ slug, action: direction, amountEth: trade.notionalEth, marketCap: poolPatch.cap, leverage: quote.leverage, actor: "You", note: `${trade.priceImpactPercent.toFixed(2)}% real BattlePool impact` });
    return position;
  }, [balanceEth, beginChainExecution, confirmChainExecution, failChainExecution, getTradeQuote, pushEvent, riskSettings.maintenanceBufferPercent]);

  const buySpot = useCallback(async (slug: string, amountEth: number, feeTier: "market" | "maker" = "market") => {
    void feeTier;
    const token = normalizeToken(tokensRef.current.find((item) => item.slug === slug) ?? TOKENS[0]);
    if (isContractMarket(token)) {
      if (!token.chainMarketAddress) throw new Error("The V43 market address is missing.");
      const action = `Buy ${token.symbol}`;
      const v45Market = token.chainDeploymentMode === "anvil-v45";
      const sessionExecution = v45Market && hasLocalV45Session();
      const executionMode = sessionExecution ? "v45-session" as const : v45Market ? "v45-account" as const : "v43-contract" as const;
      beginChainExecution(slug, action, executionMode);
      try {
        const v45Execution = sessionExecution ? await executeV45SpotBuy(token.chainMarketAddress, amountEth) : v45Market ? await executeV45DirectSpotBuy(token.chainMarketAddress, amountEth) : null;
        const receipt = v45Execution?.receipt ?? await executeV44SpotBuy(token.chainMarketAddress, amountEth);
        if (!receipt.trade) throw new Error("The confirmed transaction emitted no Trade event.");
        const marketCap = fromWad(receipt.trade.marketCapEthWad, 18) * ETH_USD_REFERENCE;
        const holding: SpotHolding = {
          id: `chain:${receipt.transactionHash}:spot`,
          slug,
          investedEth: amountEth,
          entryCap: marketCap,
          openedAt: Date.now(),
          tokenAmount: fromWad(receipt.trade.tokenAmountWad, 18),
          entryPriceEth: receipt.state ? fromWad(receipt.state.marginalPriceWad, 18) : undefined,
          executionMode,
          chainMarketAddress: token.chainMarketAddress,
          chainTokenAddress: token.chainTokenAddress,
          chainTransactionHash: receipt.transactionHash,
          chainBlockNumber: receipt.blockNumber,
        };
        holdingsRef.current = [holding, ...holdingsRef.current];
        setHoldings(holdingsRef.current);
        await confirmChainExecution(slug, action, receipt, executionMode, v45Execution ? fromWad(v45Execution.accountState.accountWethWei, 18) : undefined);
        const nextToken = normalizeToken(tokensRef.current.find((item) => item.slug === slug) ?? token);
        publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, executionMode);
        pushEvent({
          slug,
          action: "spot-buy",
          amountEth,
          marketCap: nextToken.cap,
          actor: shortWallet(receipt.account),
          note: `${holding.tokenAmount?.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens settled through ${sessionExecution ? "V45 sponsored execution" : "V43 wallet execution"} · block ${receipt.blockNumber}`,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          executionMode,
        });
        return holding;
      } catch (error) {
        throw failChainExecution(slug, action, error, executionMode);
      }
    }
    if (!token?.battlePoolVersion) throw new Error("This market has not been migrated to the unified BattlePool engine.");
    const safeAmount = clamp(amountEth, 0.001, Math.max(0.001, balanceEth));
    if (safeAmount > balanceEth) throw new Error("Insufficient trading balance for this spot buy.");
    const marketPositions = positionsRef.current.filter((position) => position.slug === slug);
    const trade = executeSequencedSpotBuy(poolFromToken(token), safeAmount, marketPositions);
    const liquidatedIds = new Set(trade.liquidationEvents.map((event) => event.positionId));
    const liquidatedPositions = marketPositions.filter((position) => liquidatedIds.has(position.id));
    for (const position of liquidatedPositions) {
      recordClosedTrade(position, trade.endPriceEth * BATTLE_TOTAL_SUPPLY * ETH_USD_REFERENCE, -position.collateral - (position.entryFee ?? 0), position.collateral, "liquidation");
      pushEvent({ slug, action: "liquidation", amountEth: position.notional, marketCap: trade.endPriceEth * BATTLE_TOTAL_SUPPLY * ETH_USD_REFERENCE, leverage: position.leverage, actor: "BattlePool", note: `${position.leverage}× ${position.direction} liquidated inside the atomic buy sequence` });
    }
    if (liquidatedIds.size) {
      positionsRef.current = positionsRef.current.filter((position) => !liquidatedIds.has(position.id));
      setPositions(positionsRef.current);
    }
    const poolPatch = poolToTokenPatch(trade.next, ETH_USD_REFERENCE);
    const liquidatedLongOi = liquidatedPositions.filter((position) => position.direction === "long").reduce((sum, position) => sum + position.notional, 0);
    const liquidatedShortOi = liquidatedPositions.filter((position) => position.direction === "short").reduce((sum, position) => sum + position.notional, 0);
    const nextLongOi = Math.max(0, (token.longOpenInterestEth ?? 0) - liquidatedLongOi);
    const nextShortOi = Math.max(0, (token.shortOpenInterestEth ?? 0) - liquidatedShortOi);
    const nextOi = nextLongOi + nextShortOi;
    const nextToken = normalizeToken({
      ...token,
      ...poolPatch,
      longOpenInterestEth: nextLongOi,
      shortOpenInterestEth: nextShortOi,
      openInterest: nextOi * ETH_USD_REFERENCE,
      longs: nextOi > 0 ? nextLongOi / nextOi * 100 : 50,
      volume24h: token.volume24h + safeAmount * ETH_USD_REFERENCE,
      uniqueTraders: (token.uniqueTraders ?? 0) + 1,
      allTimeHighCap: Math.max(token.allTimeHighCap ?? token.cap, poolPatch.cap),
    });
    const holding: SpotHolding = {
      id: randomId(),
      slug,
      investedEth: safeAmount,
      entryCap: poolPatch.cap,
      openedAt: Date.now(),
      tokenAmount: trade.tokens,
      entryPriceEth: trade.endPriceEth,
    };
    tokensRef.current = tokensRef.current.map((item) => item.slug === slug ? nextToken : item);
    setTokens(tokensRef.current);
    holdingsRef.current = [holding, ...holdingsRef.current];
    setHoldings(holdingsRef.current);
    publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, "battlepool-local");
    setBalanceEth((value) => Math.max(0, value - safeAmount));
    pushEvent({ slug, action: "spot-buy", amountEth: safeAmount, marketCap: poolPatch.cap, actor: "You", note: `${trade.tokens.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens · ${trade.steps} internal steps · ${trade.liquidationEvents.length} liquidations` });
    return holding;
  }, [balanceEth, beginChainExecution, confirmChainExecution, failChainExecution, pushEvent, recordClosedTrade]);

  const placeOrder = useCallback(async (input: Omit<PendingOrder, "id" | "createdAt">) => {
    const token = normalizeToken(tokensRef.current.find((item) => item.slug === input.slug) ?? TOKENS[0]);
    if (token.launchState === "auction" || token.cap <= 0) throw new Error("Orders activate after the opening auction.");
    if (!Number.isFinite(input.triggerCap) || input.triggerCap <= 0) throw new Error("Enter a valid trigger market cap.");
    if (!Number.isFinite(input.collateral) || input.collateral < 0.001) throw new Error("Minimum order size is 0.001 ETH.");
    if (input.side !== "buy") {
      const quote = getTradeQuote(token, input.side, input.leverage, input.collateral);
      if (input.leverage > quote.maxLeverage) throw new Error(`${quote.maxLeverage}× is the current leverage ceiling.`);
    }

    if (isContractMarket(token)) {
      if (token.chainDeploymentMode !== "anvil-v45" || !token.chainMarketAddress) throw new Error("V46 durable orders require a V45 account-routed market.");
      if (!hasLocalV45Session()) throw new Error("Authorize a V45 trading session before placing a durable V46 order.");
      if (input.kind !== "limit" && input.kind !== "trigger") throw new Error("Entry tickets support limit and trigger orders only.");
      const durable = await createV46EntryOrder({
        market: token.chainMarketAddress as `0x${string}`,
        side: input.side,
        kind: input.kind,
        triggerCapUsd: input.triggerCap,
        amountEth: input.collateral,
        leverage: input.side === "buy" ? 1 : input.leverage,
        maintenanceMarginBps: input.side === "buy" ? 0 : Math.round(maintenanceRate(input.leverage, riskSettings.maintenanceBufferPercent) * 10_000),
      });
      const order = pendingOrderFromV46(durable, token);
      setPendingOrders((current) => [order, ...current.filter((item) => item.id !== order.id)].slice(0, 200));
      pushEvent({
        slug: order.slug,
        action: order.kind === "limit" ? "limit-order" : "trigger-order",
        amountEth: order.collateral * (order.side === "buy" ? 1 : order.leverage),
        marketCap: order.triggerCap,
        leverage: order.side === "buy" ? undefined : order.leverage,
        actor: "V46 order router",
        note: `${order.side.toUpperCase()} ${order.kind} durably armed · keeper execution`,
        executionMode: "v45-session",
      });
      if (process.env.NEXT_PUBLIC_V46_LOCAL_KEEPER_AUTORUN === "true") void runV46KeeperOnce(order.id).catch(() => undefined);
      return order;
    }

    if (input.kind !== "limit" && input.kind !== "trigger") throw new Error("Browser orders support limit and trigger entries only.");
    const order: PendingOrder = { ...input, id: randomId(), createdAt: Date.now(), executionMode: "browser-sim", status: "armed" };
    setPendingOrders((current) => [order, ...current].slice(0, 80));
    pushEvent({ slug: order.slug, action: order.kind === "limit" ? "limit-order" : "trigger-order", amountEth: order.collateral * (order.side === "buy" ? 1 : order.leverage), marketCap: order.triggerCap, leverage: order.side === "buy" ? undefined : order.leverage, actor: "You", note: `${order.side.toUpperCase()} queued at ${Math.round(order.triggerCap).toLocaleString()} MC` });
    return order;
  }, [getTradeQuote, pushEvent, riskSettings.maintenanceBufferPercent]);

  const cancelOrder = useCallback(async (id: string) => {
    const order = pendingOrdersRef.current.find((item) => item.id === id);
    if (!order) return;
    if (order.executionMode === "v46-keeper") await cancelDurableV46Order(order.id);
    setPendingOrders((current) => current.filter((item) => item.id !== id));
    pushEvent({ slug: order.slug, action: "order-cancel", amountEth: order.collateral, marketCap: order.triggerCap, leverage: order.side === "buy" ? undefined : order.leverage, actor: order.executionMode === "v46-keeper" ? "V46 order router" : "You", note: `${order.kind} ${order.side} cancelled` });
  }, [pushEvent]);

  const saveTradePreset = useCallback((input: Omit<TradePreset, "id">) => {
    const preset: TradePreset = { ...input, id: randomId(), name: input.name.trim().toUpperCase().slice(0, 12) || "CUSTOM" };
    setTradePresets((current) => [...current.filter((item) => !item.id.startsWith("custom-")), { ...preset, id: `custom-${preset.id}` }].slice(0, 6));
    return preset;
  }, []);

  const deleteTradePreset = useCallback((id: string) => {
    if (!id.startsWith("custom-")) return;
    setTradePresets((current) => current.filter((item) => item.id !== id));
  }, []);

  const closePosition = useCallback(async (id: string, fraction = 1) => {
    const position = positionsRef.current.find((item) => item.id === id);
    if (!position) return;
    const token = normalizeToken(tokensRef.current.find((item) => item.slug === position.slug) ?? TOKENS[0]);
    if ((position.executionMode === "v43-contract" || position.executionMode === "v45-account" || position.executionMode === "v45-session") || isContractMarket(token) && position.chainPositionId) {
      if (fraction < 0.999) throw new Error("V43 contract positions currently close in full. Fractional contract closes are scheduled for the custody upgrade.");
      if (!position.chainMarketAddress || !position.chainPositionId) throw new Error("The contract position receipt is incomplete.");
      const action = `Close ${position.leverage}× ${position.direction}`;
      const v45Market = token.chainDeploymentMode === "anvil-v45" || position.executionMode === "v45-account" || position.executionMode === "v45-session";
      const sessionExecution = v45Market && hasLocalV45Session();
      const executionMode = sessionExecution ? "v45-session" as const : v45Market ? "v45-account" as const : "v43-contract" as const;
      beginChainExecution(position.slug, action, executionMode);
      try {
        const v45Execution = sessionExecution
          ? await executeV45ClosePosition(position.chainMarketAddress, position.direction, BigInt(position.chainPositionId))
          : v45Market
            ? await executeV45DirectClosePosition(position.chainMarketAddress, BigInt(position.chainPositionId))
            : null;
        const receipt = v45Execution?.receipt ?? await executeV44ClosePosition(position.chainMarketAddress, BigInt(position.chainPositionId));
        if (!receipt.closed) throw new Error("The confirmed transaction emitted no PositionClosed event.");
        positionsRef.current = positionsRef.current.filter((item) => item.id !== id);
        setPositions(positionsRef.current);
        await confirmChainExecution(position.slug, action, receipt, executionMode, v45Execution ? fromWad(v45Execution.accountState.accountWethWei, 18) : undefined);
        const nextToken = normalizeToken(tokensRef.current.find((item) => item.slug === position.slug) ?? token);
        const pnlEth = fromSignedWad(receipt.closed.pnlWei, 18);
        recordClosedTrade(position, nextToken.cap, pnlEth, position.collateral, receipt.closed.liquidated ? "liquidation" : "manual");
        publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, executionMode);
        pushEvent({
          slug: position.slug,
          action: receipt.closed.liquidated ? "liquidation" : position.direction,
          amountEth: position.notional,
          marketCap: nextToken.cap,
          leverage: position.leverage,
          actor: shortWallet(receipt.account),
          note: `Contract position #${position.chainPositionId} closed · payout ${fromWad(receipt.closed.payoutWei, 18).toFixed(5)} ETH`,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          executionMode,
        });
        return;
      } catch (error) {
        throw failChainExecution(position.slug, action, error, executionMode);
      }
    }
    if (!token?.battlePoolVersion) throw new Error("This position is not attached to a unified BattlePool.");
    const safeFraction = clamp(fraction, 0.01, 1);
    const accruedCosts = ((position.accruedFunding ?? 0) + (position.accruedBorrow ?? 0)) * safeFraction;
    const trade = position.direction === "long"
      ? executeCloseLong(poolFromToken(token), position, safeFraction, false, accruedCosts)
      : executeCloseShort(poolFromToken(token), position, safeFraction, false, accruedCosts);
    const closedNotional = position.notional * safeFraction;
    const closedCollateral = position.collateral * safeFraction;
    const poolPatch = poolToTokenPatch(trade.next, ETH_USD_REFERENCE);
    const nextLongOi = position.direction === "long" ? Math.max(0, (token.longOpenInterestEth ?? 0) - closedNotional) : token.longOpenInterestEth ?? 0;
    const nextShortOi = position.direction === "short" ? Math.max(0, (token.shortOpenInterestEth ?? 0) - closedNotional) : token.shortOpenInterestEth ?? 0;
    const totalOi = nextLongOi + nextShortOi;
    const nextToken = normalizeToken({
      ...token,
      ...poolPatch,
      longOpenInterestEth: nextLongOi,
      shortOpenInterestEth: nextShortOi,
      openInterest: totalOi * ETH_USD_REFERENCE,
      longs: totalOi > 0 ? nextLongOi / totalOi * 100 : 50,
      volume24h: token.volume24h + trade.grossEth * ETH_USD_REFERENCE,
    });
    const actualPnl = trade.payoutEth - closedCollateral - (position.entryFee ?? 0) * safeFraction;
    setBalanceEth((value) => value + trade.payoutEth);
    recordClosedTrade(position, poolPatch.cap, actualPnl, closedCollateral, "manual");
    if (safeFraction >= 0.999) {
      positionsRef.current = positionsRef.current.filter((item) => item.id !== id);
    } else {
      positionsRef.current = positionsRef.current.map((item) => item.id === id ? {
        ...item,
        collateral: item.collateral * (1 - safeFraction),
        notional: item.notional * (1 - safeFraction),
        tokenAmount: (item.tokenAmount ?? 0) * (1 - safeFraction),
        debtEth: (item.debtEth ?? 0) * (1 - safeFraction),
        borrowedTokens: (item.borrowedTokens ?? 0) * (1 - safeFraction),
        lockedProceedsEth: (item.lockedProceedsEth ?? 0) * (1 - safeFraction),
        accruedFunding: (item.accruedFunding ?? 0) * (1 - safeFraction),
        accruedBorrow: (item.accruedBorrow ?? 0) * (1 - safeFraction),
      } : item);
    }
    setPositions(positionsRef.current);
    tokensRef.current = tokensRef.current.map((item) => item.slug === position.slug ? nextToken : item);
    setTokens(tokensRef.current);
    publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, "battlepool-local");
    pushEvent({ slug: position.slug, action: position.direction, amountEth: closedNotional, marketCap: poolPatch.cap, leverage: position.leverage, actor: "You", note: `${safeFraction < 1 ? `Closed ${(safeFraction * 100).toFixed(0)}%` : "Position closed"} through the shared pool · ${trade.priceImpactPercent.toFixed(2)}% impact` });
  }, [beginChainExecution, confirmChainExecution, failChainExecution, pushEvent, recordClosedTrade]);

  const updatePositionRisk = useCallback((id: string, options: OpenPositionOptions) => setPositions((current) => current.map((position) => position.id === id ? { ...position, ...options } : position)), []);

  const addCollateral = useCallback(async (id: string, amountEth: number) => {
    const position = positionsRef.current.find((item) => item.id === id);
    if (!position) return;
    if (position.executionMode === "v43-contract" || position.executionMode === "v45-account" || position.executionMode === "v45-session") throw new Error("Adding margin to an open contract position is not available yet. Close and reopen at the desired collateral while V45 keeps settlement explicit and fully reconciled.");
    const safeAmount = clamp(amountEth, 0.001, Math.max(0.001, balanceEth));
    const token = normalizeToken(tokensRef.current.find((item) => item.slug === position.slug) ?? TOKENS[0]);
    if (!token.battlePoolVersion) throw new Error("This position predates the unified BattlePool and must be reset.");
    const pool = poolFromToken(token);
    const nextPool = {
      ...pool,
      realWethBalance: pool.realWethBalance + safeAmount,
      lockedCollateralEth: pool.lockedCollateralEth + safeAmount,
      lockedLongCollateralEth: pool.lockedLongCollateralEth + (position.direction === "long" ? safeAmount : 0),
      lockedShortCollateralEth: pool.lockedShortCollateralEth + (position.direction === "short" ? safeAmount : 0),
    };
    const poolPatch = poolToTokenPatch(nextPool, ETH_USD_REFERENCE);
    const nextToken = normalizeToken({ ...token, ...poolPatch });
    positionsRef.current = positionsRef.current.map((item) => {
      if (item.id !== id) return item;
      const collateral = item.collateral + safeAmount;
      return {
        ...item,
        collateral,
        liquidationCap: liquidationCapFor(item.entryCap, item.direction, collateral, item.notional, item.maintenanceMarginRate ?? 0.02, 0.0018, (item.accruedFunding ?? 0) + (item.accruedBorrow ?? 0)),
      };
    });
    tokensRef.current = tokensRef.current.map((item) => item.slug === position.slug ? nextToken : item);
    setPositions(positionsRef.current);
    setTokens(tokensRef.current);
    publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, "battlepool-local");
    setBalanceEth((value) => Math.max(0, value - safeAmount));
    pushEvent({ slug: position.slug, action: position.direction, amountEth: safeAmount, marketCap: poolPatch.cap, leverage: position.leverage, actor: "You", note: "Collateral added to the shared BattlePool ledger" });
  }, [balanceEth, pushEvent]);

  const sellHolding = useCallback(async (id: string, fraction = 1) => {
    const holding = holdingsRef.current.find((item) => item.id === id);
    if (!holding) return;
    const token = normalizeToken(tokensRef.current.find((item) => item.slug === holding.slug) ?? TOKENS[0]);
    if ((holding.executionMode === "v43-contract" || holding.executionMode === "v45-account" || holding.executionMode === "v45-session") || isContractMarket(token) && holding.chainTransactionHash) {
      if (!holding.tokenAmount) throw new Error("The contract holding has no indexed token amount.");
      if (!token.chainMarketAddress || !token.chainTokenAddress) throw new Error("The V43 market or token address is missing.");
      const safeFraction = clamp(fraction, 0.01, 1);
      const tokenAmount = holding.tokenAmount * safeFraction;
      const investedClosed = holding.investedEth * safeFraction;
      const action = `Sell ${token.symbol}`;
      const v45Market = token.chainDeploymentMode === "anvil-v45" || holding.executionMode === "v45-account" || holding.executionMode === "v45-session";
      const sessionExecution = v45Market && hasLocalV45Session();
      const executionMode = sessionExecution ? "v45-session" as const : v45Market ? "v45-account" as const : "v43-contract" as const;
      beginChainExecution(holding.slug, action, executionMode);
      try {
        const tokenAmountWad = toWad(tokenAmount.toFixed(18));
        const v45Execution = sessionExecution ? await executeV45SpotSell(token.chainMarketAddress, tokenAmountWad) : v45Market ? await executeV45DirectSpotSell(token.chainMarketAddress, tokenAmountWad) : null;
        const receipt = v45Execution?.receipt ?? await executeV44SpotSell(token.chainMarketAddress, token.chainTokenAddress, tokenAmountWad);
        if (!receipt.trade) throw new Error("The confirmed transaction emitted no Trade event.");
        const payout = fromWad(receipt.trade.grossWethWei - receipt.trade.feeWethWei, 18);
        const pnl = payout - investedClosed;
        if (safeFraction >= 0.999) holdingsRef.current = holdingsRef.current.filter((item) => item.id !== id);
        else holdingsRef.current = holdingsRef.current.map((item) => item.id === id ? {
          ...item,
          investedEth: item.investedEth * (1 - safeFraction),
          tokenAmount: (item.tokenAmount ?? 0) * (1 - safeFraction),
        } : item);
        setHoldings(holdingsRef.current);
        await confirmChainExecution(holding.slug, action, receipt, executionMode, v45Execution ? fromWad(v45Execution.accountState.accountWethWei, 18) : undefined);
        const nextToken = normalizeToken(tokensRef.current.find((item) => item.slug === holding.slug) ?? token);
        const closedSpot: ClosedTrade = {
          id: randomId(),
          slug: holding.slug,
          direction: "spot",
          leverage: 1,
          entryCap: holding.entryCap,
          exitCap: nextToken.cap,
          collateral: investedClosed,
          pnlEth: pnl,
          roiPercent: investedClosed > 0 ? pnl / investedClosed * 100 : 0,
          openedAt: holding.openedAt,
          closedAt: Date.now(),
          reason: "spot-sale",
        };
        setClosedTrades((current) => [closedSpot, ...current].slice(0, 10000));
        publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, executionMode);
        pushEvent({
          slug: holding.slug,
          action: "spot-sell",
          amountEth: payout,
          marketCap: nextToken.cap,
          actor: shortWallet(receipt.account),
          note: `${tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens sold through ${sessionExecution ? "V45 sponsored execution" : "V43 wallet execution"} · payout ${payout.toFixed(5)} ETH`,
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          executionMode,
        });
        return;
      } catch (error) {
        throw failChainExecution(holding.slug, action, error, executionMode);
      }
    }
    if (!token?.battlePoolVersion || !holding.tokenAmount) throw new Error("This holding predates the unified BattlePool and must be reset.");
    const safeFraction = clamp(fraction, 0.01, 1);
    const tokenAmount = holding.tokenAmount * safeFraction;
    const investedClosed = holding.investedEth * safeFraction;
    const marketPositions = positionsRef.current.filter((position) => position.slug === holding.slug);
    const trade = executeSequencedSpotSell(poolFromToken(token), tokenAmount, marketPositions);
    const liquidatedIds = new Set(trade.liquidationEvents.map((event) => event.positionId));
    const liquidatedPositions = marketPositions.filter((position) => liquidatedIds.has(position.id));
    for (const position of liquidatedPositions) {
      recordClosedTrade(position, trade.endPriceEth * BATTLE_TOTAL_SUPPLY * ETH_USD_REFERENCE, -position.collateral - (position.entryFee ?? 0), position.collateral, "liquidation");
      pushEvent({ slug: holding.slug, action: "liquidation", amountEth: position.notional, marketCap: trade.endPriceEth * BATTLE_TOTAL_SUPPLY * ETH_USD_REFERENCE, leverage: position.leverage, actor: "BattlePool", note: `${position.leverage}× ${position.direction} liquidated inside the atomic sell sequence` });
    }
    if (liquidatedIds.size) {
      positionsRef.current = positionsRef.current.filter((position) => !liquidatedIds.has(position.id));
      setPositions(positionsRef.current);
    }
    const poolPatch = poolToTokenPatch(trade.next, ETH_USD_REFERENCE);
    const payout = trade.netEth;
    const pnl = payout - investedClosed;
    const liquidatedLongOi = liquidatedPositions.filter((position) => position.direction === "long").reduce((sum, position) => sum + position.notional, 0);
    const liquidatedShortOi = liquidatedPositions.filter((position) => position.direction === "short").reduce((sum, position) => sum + position.notional, 0);
    const nextLongOi = Math.max(0, (token.longOpenInterestEth ?? 0) - liquidatedLongOi);
    const nextShortOi = Math.max(0, (token.shortOpenInterestEth ?? 0) - liquidatedShortOi);
    const nextOi = nextLongOi + nextShortOi;
    const nextToken = normalizeToken({
      ...token,
      ...poolPatch,
      longOpenInterestEth: nextLongOi,
      shortOpenInterestEth: nextShortOi,
      openInterest: nextOi * ETH_USD_REFERENCE,
      longs: nextOi > 0 ? nextLongOi / nextOi * 100 : 50,
      volume24h: token.volume24h + trade.grossEth * ETH_USD_REFERENCE,
    });
    setBalanceEth((value) => value + payout);
    const closedSpot: ClosedTrade = {
      id: randomId(),
      slug: holding.slug,
      direction: "spot",
      leverage: 1,
      entryCap: holding.entryCap,
      exitCap: poolPatch.cap,
      collateral: investedClosed,
      pnlEth: pnl,
      roiPercent: investedClosed > 0 ? pnl / investedClosed * 100 : 0,
      openedAt: holding.openedAt,
      closedAt: Date.now(),
      reason: "spot-sale",
    };
    setClosedTrades((current) => [closedSpot, ...current].slice(0, 10000));
    tokensRef.current = tokensRef.current.map((item) => item.slug === holding.slug ? nextToken : item);
    setTokens(tokensRef.current);
    if (safeFraction >= 0.999) holdingsRef.current = holdingsRef.current.filter((item) => item.id !== id);
    else holdingsRef.current = holdingsRef.current.map((item) => item.id === id ? {
      ...item,
      investedEth: item.investedEth * (1 - safeFraction),
      tokenAmount: (item.tokenAmount ?? 0) * (1 - safeFraction),
    } : item);
    setHoldings(holdingsRef.current);
    publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, "battlepool-local");
    pushEvent({ slug: holding.slug, action: "spot-sell", amountEth: payout, marketCap: poolPatch.cap, actor: "You", note: `${trade.steps} internal steps · ${trade.liquidationEvents.length} liquidations · ${trade.priceImpactPercent.toFixed(2)}% final move` });
  }, [beginChainExecution, confirmChainExecution, failChainExecution, pushEvent, recordClosedTrade]);

  useEffect(() => {
    if (!hydrated || !hasLocalV45Session()) return;
    let stopped = false;
    let syncing = false;
    const syncOrders = async () => {
      if (syncing || stopped) return;
      syncing = true;
      try {
        const owner = loadV45Account();
        if (!owner) return;
        if (process.env.NEXT_PUBLIC_V46_LOCAL_KEEPER_AUTORUN === "true") await runV46KeeperOnce().catch(() => undefined);
        const durable = await listV46Orders({ owner });
        if (stopped) return;
        const mapped = durable.flatMap((order) => {
          const token = tokensRef.current.find((item) => item.chainMarketAddress?.toLowerCase() === order.intent.market.toLowerCase());
          if (!token || !["armed", "watching", "filling", "failed"].includes(order.status)) return [];
          return [pendingOrderFromV46(order, token)];
        });
        setPendingOrders((current) => {
          const browserOrders = current.filter((order) => order.executionMode !== "v46-keeper");
          return [...mapped, ...browserOrders].slice(0, 220);
        });

        for (const order of durable) {
          if (order.status !== "filled" || v46ReconciledOrdersRef.current.has(order.intent.orderId)) continue;
          const token = normalizeToken(tokensRef.current.find((item) => item.chainMarketAddress?.toLowerCase() === order.intent.market.toLowerCase()) ?? TOKENS[0]);
          if (!token || !token.chainMarketAddress) continue;
          try {
            if (order.intent.action === 1 && order.filledTokenAmountWad) {
              const holdingId = `v46:${order.intent.orderId}:spot`;
              if (!holdingsRef.current.some((holding) => holding.id === holdingId)) {
                const holding: SpotHolding = {
                  id: holdingId,
                  slug: token.slug,
                  investedEth: fromWad(BigInt(order.intent.amountWei), 18),
                  entryCap: order.filledMarketCapEthWad ? fromWad(BigInt(order.filledMarketCapEthWad), 18) * ETH_USD_REFERENCE : token.cap,
                  openedAt: order.filledAt ?? Date.now(),
                  tokenAmount: fromWad(BigInt(order.filledTokenAmountWad), 18),
                  executionMode: "v45-session",
                  chainMarketAddress: order.intent.market,
                  chainTokenAddress: token.chainTokenAddress,
                  chainTransactionHash: order.transactionHash,
                  chainBlockNumber: order.blockNumber,
                };
                holdingsRef.current = [holding, ...holdingsRef.current];
                setHoldings(holdingsRef.current);
              }
            } else if ((order.intent.action === 3 || order.intent.action === 4) && order.filledPositionId) {
              const chainId = `chain:${order.intent.market.toLowerCase()}:${order.filledPositionId}`;
              if (!positionsRef.current.some((position) => position.id === chainId)) {
                const positionId = BigInt(order.filledPositionId);
                const [contractPosition, settlement, runtime] = await Promise.all([
                  readV44Position(order.intent.market, positionId),
                  readV49PositionSettlement(order.intent.market, positionId),
                  readV44RuntimeState(order.intent.market),
                ]);
                const equityWei = settlement.payoutWei;
                const maximumShortPayoutWei = contractPosition.direction === "short"
                  ? await readV49MaximumShortPayout(order.intent.market, positionId)
                  : 0n;
                if (contractPosition.active) {
                  const direction: PositionDirection = order.intent.action === 3 ? "long" : "short";
                  const collateralEth = fromWad(contractPosition.collateralWei, 18);
                  const entryPriceEth = order.filledEntryPriceWad ? fromWad(BigInt(order.filledEntryPriceWad), 18) : fromWad(runtime.marginalPriceWad, 18);
                  const liquidationPriceEth = order.filledLiquidationPriceWad ? fromWad(BigInt(order.filledLiquidationPriceWad), 18) : entryPriceEth;
                  const position: Position = {
                    id: chainId,
                    slug: token.slug,
                    direction,
                    leverage: contractPosition.leverage,
                    collateral: collateralEth,
                    initialCollateral: collateralEth,
                    notional: fromWad(contractPosition.notionalWei, 18),
                    entryCap: entryPriceEth * BATTLE_TOTAL_SUPPLY * ETH_USD_REFERENCE,
                    currentCap: fromWad(runtime.marketCapEthWad, 18) * ETH_USD_REFERENCE,
                    liquidationCap: liquidationPriceEth * BATTLE_TOTAL_SUPPLY * ETH_USD_REFERENCE,
                    openedAt: contractPosition.openedAt,
                    entryFee: 0,
                    accruedFunding: 0,
                    accruedBorrow: 0,
                    maintenanceMarginRate: contractPosition.maintenanceMarginBps / 10_000,
                    partialLiquidations: 0,
                    lastAccruedAt: Date.now(),
                    tokenAmount: direction === "long" ? fromWad(contractPosition.tokenAmountWad, 18) : undefined,
                    debtEth: direction === "long" ? fromWad(contractPosition.debtWei, 18) : undefined,
                    borrowedTokens: direction === "short" ? fromWad(contractPosition.borrowedTokensWad, 18) : undefined,
                    lockedProceedsEth: direction === "short" ? fromWad(contractPosition.lockedProceedsWei, 18) : undefined,
                    entryPriceEth,
                    owner: order.intent.owner,
                    executionMode: "v45-session",
                    chainPositionId: order.filledPositionId,
                    chainMarketAddress: order.intent.market,
                    chainTransactionHash: order.transactionHash,
                    chainBlockNumber: order.blockNumber,
                    chainExecutableEquityEth: fromWad(equityWei, 18),
                    chainExecutablePnlEth: fromWad(equityWei, 18) - collateralEth,
                    chainSettlementPayable: settlement.payableNow,
                    chainMaximumPayoutEth: contractPosition.direction === "short" ? fromWad(maximumShortPayoutWei, 18) : undefined,
                    chainPostCloseObligationsEth: fromWad(settlement.postCloseObligationsWei, 18),
                    chainLastSyncedAt: Date.now(),
                  };
                  positionsRef.current = [position, ...positionsRef.current];
                  setPositions(positionsRef.current);
                }
              }
            } else if ((order.intent.action === 5 || order.intent.action === 6) && order.filledPositionId) {
              const closing = positionsRef.current.find((position) => position.chainMarketAddress?.toLowerCase() === order.intent.market.toLowerCase() && position.chainPositionId === order.filledPositionId);
              if (closing) {
                const pnl = order.filledPnlWei ? fromSignedWad(BigInt(order.filledPnlWei), 18) : 0;
                positionsRef.current = positionsRef.current.filter((position) => position.id !== closing.id);
                setPositions(positionsRef.current);
                recordClosedTrade(closing, token.cap, pnl, closing.collateral, order.intent.kind === "take-profit" ? "take-profit" : order.intent.kind === "stop-loss" || order.intent.kind === "breakeven" ? "stop-loss" : "manual");
              }
            }
            await refreshChainMarket(token.slug);
            pushEvent({
              slug: token.slug,
              action: order.intent.action === 1 ? "order-fill" : order.intent.action === 3 ? "long" : order.intent.action === 4 ? "short" : "order-fill",
              amountEth: fromWad(BigInt(order.intent.amountWei !== "0" ? order.intent.amountWei : order.intent.collateralWei), 18),
              marketCap: token.cap,
              leverage: order.intent.side === "buy" ? undefined : order.intent.leverage,
              actor: "V46 keeper",
              note: `${order.intent.kind.toUpperCase()} ${order.intent.side.toUpperCase()} settled${order.blockNumber ? ` in block ${order.blockNumber}` : ""}`,
              transactionHash: order.transactionHash,
              blockNumber: order.blockNumber,
              executionMode: "v45-session",
            });
            v46ReconciledOrdersRef.current.add(order.intent.orderId);
          } catch {
            // The durable order remains filled on the server and will reconcile again on the next poll.
          }
        }
      } catch {
        // Local V46 services may be offline while the terminal remains usable in browser-simulation mode.
      } finally {
        syncing = false;
      }
    };
    void syncOrders();
    const interval = window.setInterval(() => void syncOrders(), 1_500);
    return () => { stopped = true; window.clearInterval(interval); };
  }, [hydrated, pushEvent, recordClosedTrade, refreshChainMarket]);

  useEffect(() => {
    if (riskSettings.paused) return;
    const interval = window.setInterval(() => {
      for (const order of pendingOrdersRef.current) {
        if (fillingOrdersRef.current.has(order.id)) continue;
        const token = normalizeToken(tokensRef.current.find((item) => item.slug === order.slug) ?? TOKENS[0]);
        if (!token || token.launchState === "auction" || token.cap <= 0) continue;
        if (isContractMarket(token)) continue;
        const liveCap = token.markCap ?? token.cap;
        const buySide = order.side === "buy" || order.side === "long";
        const shouldFill = order.kind === "limit"
          ? (buySide ? liveCap <= order.triggerCap : liveCap >= order.triggerCap)
          : (buySide ? liveCap >= order.triggerCap : liveCap <= order.triggerCap);
        if (!shouldFill) continue;
        fillingOrdersRef.current.add(order.id);
        void (async () => {
          try {
            if (order.side === "buy") await buySpot(order.slug, order.collateral, order.kind === "limit" ? "maker" : "market");
            else await openPosition(order.slug, order.side, order.leverage, order.collateral, { takeProfitCap: order.takeProfitCap, stopLossCap: order.stopLossCap, feeTier: order.kind === "limit" ? "maker" : "market" });
            setPendingOrders((current) => current.filter((item) => item.id !== order.id));
            pushEvent({ slug: order.slug, action: "order-fill", amountEth: order.collateral * (order.side === "buy" ? 1 : order.leverage), marketCap: liveCap, leverage: order.side === "buy" ? undefined : order.leverage, actor: "Order engine", note: `${order.kind.toUpperCase()} ${order.side.toUpperCase()} filled` });
          } catch (error) {
            setPendingOrders((current) => current.filter((item) => item.id !== order.id));
            pushEvent({ slug: order.slug, action: "order-cancel", amountEth: order.collateral, marketCap: liveCap, leverage: order.side === "buy" ? undefined : order.leverage, actor: "Order engine", note: error instanceof Error ? error.message : "Order could not fill" });
          } finally {
            window.setTimeout(() => fillingOrdersRef.current.delete(order.id), 700);
          }
        })();
      }
    }, 300);
    return () => window.clearInterval(interval);
  }, [buySpot, openPosition, pushEvent, riskSettings.paused]);

  useEffect(() => {
    if (riskSettings.paused) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      for (const currentPosition of [...positionsRef.current]) {
        if (settlingRef.current.has(currentPosition.id)) continue;
        if (currentPosition.executionMode === "v43-contract" || currentPosition.executionMode === "v45-account" || currentPosition.executionMode === "v45-session") continue;
        const token = normalizeToken(tokensRef.current.find((item) => item.slug === currentPosition.slug) ?? TOKENS[0]);
        if (!token?.battlePoolVersion || token.cap <= 0) continue;
        const dtHours = clamp((now - (currentPosition.lastAccruedAt ?? now)) / 3_600_000, 0, 0.01);
        const fundingRate = (token.fundingRateHourly ?? token.funding) / 100;
        const fundingDelta = currentPosition.notional * fundingRate * dtHours * (currentPosition.direction === "long" ? 1 : -1);
        const borrowDelta = currentPosition.notional * ((token.borrowRateHourly ?? 0.004) / 100) * dtHours;
        const position: Position = {
          ...currentPosition,
          currentCap: token.markCap ?? token.cap,
          accruedFunding: (currentPosition.accruedFunding ?? 0) + fundingDelta,
          accruedBorrow: (currentPosition.accruedBorrow ?? 0) + borrowDelta,
          lastAccruedAt: now,
        };
        const markCap = token.markCap ?? token.cap;
        const equity = estimatePositionEquity(poolFromToken(token), position);
        const maintenance = position.notional * (position.maintenanceMarginRate ?? 0.02);
        const takeProfit = position.takeProfitCap ? (position.direction === "long" ? markCap >= position.takeProfitCap : markCap <= position.takeProfitCap) : false;
        const stopLoss = position.stopLossCap ? (position.direction === "long" ? markCap <= position.stopLossCap : markCap >= position.stopLossCap) : false;
        const marginFailed = equity <= maintenance;

        if (!takeProfit && !stopLoss && !marginFailed) {
          positionsRef.current = positionsRef.current.map((item) => item.id === position.id ? {
            ...position,
            liquidationCap: liquidationCapFor(position.entryCap, position.direction, position.collateral, position.notional, position.maintenanceMarginRate ?? 0.02, BATTLE_TRADE_FEE_RATE, (position.accruedFunding ?? 0) + (position.accruedBorrow ?? 0)),
          } : item);
          setPositions(positionsRef.current);
          continue;
        }

        settlingRef.current.add(position.id);
        const liquidated = marginFailed && !takeProfit && !stopLoss;
        const closeReason: ClosedTrade["reason"] = liquidated ? "liquidation" : takeProfit ? "take-profit" : "stop-loss";
        try {
          const accruedCosts = (position.accruedFunding ?? 0) + (position.accruedBorrow ?? 0);
          const trade = position.direction === "long"
            ? executeCloseLong(poolFromToken(token), position, 1, liquidated, accruedCosts)
            : executeCloseShort(poolFromToken(token), position, 1, liquidated, accruedCosts);
          const poolPatch = poolToTokenPatch(trade.next, ETH_USD_REFERENCE);
          const nextLongOi = position.direction === "long" ? Math.max(0, (token.longOpenInterestEth ?? 0) - position.notional) : token.longOpenInterestEth ?? 0;
          const nextShortOi = position.direction === "short" ? Math.max(0, (token.shortOpenInterestEth ?? 0) - position.notional) : token.shortOpenInterestEth ?? 0;
          const totalOi = nextLongOi + nextShortOi;
          const nextToken = normalizeToken({
            ...token,
            ...poolPatch,
            longOpenInterestEth: nextLongOi,
            shortOpenInterestEth: nextShortOi,
            openInterest: totalOi * ETH_USD_REFERENCE,
            longs: totalOi > 0 ? nextLongOi / totalOi * 100 : 50,
            volume24h: token.volume24h + trade.grossEth * ETH_USD_REFERENCE,
          });
          positionsRef.current = positionsRef.current.filter((item) => item.id !== position.id);
          tokensRef.current = tokensRef.current.map((item) => item.slug === position.slug ? nextToken : item);
          setPositions(positionsRef.current);
          setTokens(tokensRef.current);
          publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, "battlepool-local");
          if (!liquidated) setBalanceEth((value) => value + trade.payoutEth);
          const pnl = liquidated ? -position.collateral - (position.entryFee ?? 0) : trade.payoutEth - position.collateral - (position.entryFee ?? 0);
          recordClosedTrade(position, poolPatch.cap, pnl, position.collateral, closeReason);
          pushEvent({
            slug: position.slug,
            action: liquidated ? "liquidation" : position.direction,
            amountEth: position.notional,
            marketCap: poolPatch.cap,
            leverage: position.leverage,
            actor: liquidated ? "BattlePool liquidation" : takeProfit ? "Take profit" : "Stop loss",
            note: liquidated
              ? `${position.direction.toUpperCase()} forced through spot · ${trade.priceImpactPercent.toFixed(2)}% impact · ${position.collateral.toFixed(4)} ETH retained by pool${trade.badDebtEth > 0 ? ` · ${trade.badDebtEth.toFixed(4)} bad debt` : ""}`
              : `Instant shared-pool payout ${trade.payoutEth.toFixed(4)} ETH`,
          });
        } catch (error) {
          pushEvent({ slug: position.slug, action: "oracle-guard", amountEth: position.notional, marketCap: markCap, leverage: position.leverage, actor: "BattlePool guard", note: error instanceof Error ? error.message : "Position settlement paused" });
        } finally {
          window.setTimeout(() => settlingRef.current.delete(position.id), 350);
        }
      }
    }, 120);
    return () => window.clearInterval(interval);
  }, [pushEvent, recordClosedTrade, riskSettings.paused]);


  const launchToken = useCallback((input: LaunchTokenInput) => {
    const baseSlug = input.symbol.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `coin-${Date.now()}`;
    let slug = baseSlug;
    let suffix = 2;
    while (tokensRef.current.some((token) => token.slug === slug)) slug = `${baseSlug}-${suffix++}`;

    const totalLaunchSpendEth = input.totalLaunchSpendEth ?? input.developerBuyEth ?? 0.001;
    const launchQuote = quoteLaunchSpend(totalLaunchSpendEth, input.gasReserveEth ?? LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH);
    if (!launchQuote.valid) throw new Error(launchQuote.reason ?? "The launch spend is invalid.");
    if (input.chainDeploymentMode !== "anvil-v42" && input.chainDeploymentMode !== "anvil-v43" && input.chainDeploymentMode !== "anvil-v45" && launchQuote.totalSpendEth > balanceEth) throw new Error(`Fund at least ${launchQuote.totalSpendEth.toFixed(4)} ETH to cover the creator buy and estimated gas.`);

    const identity = tokenIdentityParts({
      name: input.name,
      symbol: input.symbol,
      emoji: input.emoji || "🧊",
      imageExactHash: input.imageExactHash,
      imagePerceptualHash: input.imagePerceptualHash,
    });
    const priorTokens = tokensRef.current.map(normalizeToken);
    const exactCombo = priorTokens.find((existing) => {
      const prior = tokenIdentityParts(existing);
      return prior.normalizedName === identity.normalizedName
        && prior.normalizedSymbol === identity.normalizedSymbol
        && (prior.imageExactHash === identity.imageExactHash || hammingSimilarity(prior.imagePerceptualHash, identity.imagePerceptualHash) >= 87.5);
    });
    const sameName = priorTokens.some((existing) => tokenIdentityParts(existing).normalizedName === identity.normalizedName);
    const sameSymbol = priorTokens.some((existing) => tokenIdentityParts(existing).normalizedSymbol === identity.normalizedSymbol);
    const closestImage = priorTokens
      .map((existing) => ({ existing, similarity: hammingSimilarity(tokenIdentityParts(existing).imagePerceptualHash, identity.imagePerceptualHash) }))
      .filter((entry) => entry.similarity >= 87.5)
      .sort((a, b) => b.similarity - a.similarity)[0];

    const genesisTrade = executeSpotBuy(createBattlePoolState(), launchQuote.creatorBuyEth);
    const poolPatch = poolToTokenPatch(genesisTrade.next, ETH_USD_REFERENCE);
    const migrationTargetMarketCapUsd = input.migrationTargetMarketCapUsd ?? LAUNCHPAD_TARGET_MARKET_CAP_USD;
    const token = normalizeToken({
      slug,
      symbol: input.symbol.toUpperCase().slice(0, 10),
      name: input.name,
      emoji: input.emoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      imageDataUrl: input.imageDataUrl,
      ...identity,
      ...poolPatch,
      ogStatus: exactCombo ? "copy" : "og",
      firstSeenSlug: exactCombo?.slug,
      nearImageSimilarity: closestImage?.similarity,
      nameReused: sameName,
      symbolReused: sameSymbol,
      imageReused: Boolean(closestImage),
      creatorWallet: input.creatorWallet ?? "0x71C…88F",
      launchBlock: input.launchBlock ?? 10_000_000 + priorTokens.length + 1,
      chainDeploymentMode: input.chainDeploymentMode ?? "browser-sim",
      chainId: input.chainId,
      chainFactoryAddress: input.chainFactoryAddress,
      chainMarketAddress: input.chainMarketAddress,
      chainTokenAddress: input.chainTokenAddress,
      launchTransactionHash: input.launchTransactionHash,
      contractAddress: input.chainTokenAddress,
      metadataLockedAt: Date.now(),
      hue: Math.floor(Math.random() * 360),
      change24h: 0,
      graduation: clamp(poolPatch.cap / migrationTargetMarketCapUsd * 100, 0.1, 99),
      longs: 50,
      volume24h: launchQuote.creatorBuyEth * ETH_USD_REFERENCE,
      openInterest: 0,
      funding: 0,
      launchedMinutesAgo: 0,
      description: input.description,
      isCustom: true,
      allTimeHighCap: poolPatch.cap,
      launchState: "live",
      battlePhase: "bonding",
      openingCap: BATTLE_OPENING_FDV_ETH * ETH_USD_REFERENCE,
      oracleConfidence: 72,
      maxLeverageUnlocked: riskSettings.maxLeverage,
      longOpenInterestEth: 0,
      shortOpenInterestEth: 0,
      fundingRateHourly: 0,
      borrowRateHourly: 0.004,
      linkedWalletConcentration: 100,
      uniqueTraders: 1,
      volatility1m: 0,
      marketAgeSeconds: 0,
      launchpadVersion: LAUNCHPAD_VERSION,
      launchTotalSpendEth: launchQuote.totalSpendEth,
      launchGasReserveEth: launchQuote.gasReserveEth,
      creatorGenesisBuyEth: launchQuote.creatorBuyEth,
      migrationTargetMarketCapUsd,
      website: input.website,
      xHandle: input.xHandle,
      telegram: input.telegram,
      activeLiquidationBatch: false,
    });
    const creatorHolding: SpotHolding = {
      id: randomId(),
      slug,
      investedEth: launchQuote.creatorBuyEth,
      entryCap: poolPatch.cap,
      openedAt: Date.now(),
      tokenAmount: genesisTrade.tokens,
      entryPriceEth: genesisTrade.priceAfter,
    };
    tokensRef.current = [token, ...tokensRef.current];
    holdingsRef.current = [creatorHolding, ...holdingsRef.current];
    setTokens(tokensRef.current);
    setHoldings(holdingsRef.current);
    publishBattleRealtimeFrame(token, positionsRef.current, holdingsRef.current, "launchpad-local");
    if (input.chainDeploymentMode !== "anvil-v42" && input.chainDeploymentMode !== "anvil-v43" && input.chainDeploymentMode !== "anvil-v45") setBalanceEth((value) => Math.max(0, value - launchQuote.totalSpendEth));
    pushEvent({
      slug,
      action: "market-open",
      amountEth: launchQuote.totalSpendEth,
      marketCap: poolPatch.cap,
      actor: "Creator",
      note: `${launchQuote.gasReserveEth.toFixed(5)} ETH gas reserved · ${launchQuote.creatorBuyEth.toFixed(5)} ETH creator buy · no free allocation`,
    });
    return token;
  }, [balanceEth, pushEvent, riskSettings.maxLeverage]);

  const getMigrationSnapshot = useCallback((token: Token) => {
    return buildMigrationSnapshot(normalizeToken(token), positionsRef.current, ETH_USD_REFERENCE);
  }, []);

  const advanceLaunchpadMarket = useCallback((slug: string) => {
    const selected = normalizeToken(tokensRef.current.find((token) => token.slug === slug) ?? TOKENS[0]);
    if (!selected?.battlePoolVersion) throw new Error("This market is not attached to the BattlePool engine.");
    const target = selected.migrationTargetMarketCapUsd ?? LAUNCHPAD_TARGET_MARKET_CAP_USD;
    let pool = poolFromToken(selected);
    let grossBuyEth = 0;
    if (selected.cap < target) {
      let low = 0;
      let high = 0.25;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const quote = executeSpotBuy(pool, high);
        if (poolToTokenPatch(quote.next, ETH_USD_REFERENCE).cap >= target) break;
        high *= 2;
      }
      for (let iteration = 0; iteration < 56; iteration += 1) {
        const midpoint = (low + high) / 2;
        const quote = executeSpotBuy(pool, midpoint);
        if (poolToTokenPatch(quote.next, ETH_USD_REFERENCE).cap >= target) high = midpoint;
        else low = midpoint;
      }
      grossBuyEth = high;
      pool = executeSpotBuy(pool, grossBuyEth).next;
    }
    const poolPatch = poolToTokenPatch(pool, ETH_USD_REFERENCE);
    const nextToken = normalizeToken({
      ...selected,
      ...poolPatch,
      uniqueTraders: Math.max(36, selected.uniqueTraders ?? 0),
      linkedWalletConcentration: Math.min(18, selected.linkedWalletConcentration ?? 100),
      oracleConfidence: Math.max(92, selected.oracleConfidence ?? 0),
      marketAgeSeconds: Math.max(900, selected.marketAgeSeconds ?? 0),
      launchedMinutesAgo: Math.max(15, selected.launchedMinutesAgo),
      allTimeHighCap: Math.max(selected.allTimeHighCap ?? 0, poolPatch.cap),
      activeLiquidationBatch: false,
      battlePhase: "bonding",
    });
    tokensRef.current = tokensRef.current.map((token) => token.slug === slug ? nextToken : token);
    setTokens(tokensRef.current);
    publishBattleRealtimeFrame(nextToken, positionsRef.current, holdingsRef.current, "launchpad-test-seed");
    pushEvent({
      slug,
      action: "whale-buy",
      amountEth: grossBuyEth,
      marketCap: nextToken.cap,
      actor: "Launchpad test harness",
      note: `Seeded ${Math.max(0, grossBuyEth).toFixed(4)} ETH of distributed test flow across 35 simulated wallets`,
    });
    return nextToken;
  }, [pushEvent]);

  const migrateToken = useCallback((slug: string, forceTest = false) => {
    const selected = normalizeToken(tokensRef.current.find((token) => token.slug === slug) ?? TOKENS[0]);
    const snapshot = buildMigrationSnapshot(selected, positionsRef.current, ETH_USD_REFERENCE);
    if (!snapshot.ready && !forceTest) {
      const blockers = snapshot.gates.filter((gate) => !gate.passed).map((gate) => gate.label).join(", ");
      throw new Error(`Migration blocked: ${blockers}.`);
    }
    if (!snapshot.ready && forceTest) throw new Error("Test mode never bypasses solvency gates. Advance the market and resolve every blocker first.");
    const migrating = normalizeToken({ ...selected, battlePhase: "migrating", activeLiquidationBatch: false });
    tokensRef.current = tokensRef.current.map((token) => token.slug === slug ? migrating : token);
    setTokens(tokensRef.current);
    pushEvent({ slug, action: "graduation", amountEth: snapshot.realWethEth, marketCap: snapshot.marketCapUsd, actor: "Migration coordinator", note: "Migration checkpoint locked; orders remain readable while the pool handoff is committed." });
    window.setTimeout(() => {
      const migrated = normalizeToken({ ...migrating, ...migrationPatch(migrating, snapshot) });
      tokensRef.current = tokensRef.current.map((token) => token.slug === slug ? migrated : token);
      setTokens(tokensRef.current);
      publishBattleRealtimeFrame(migrated, positionsRef.current, holdingsRef.current, "launchpad-migrated");
      pushEvent({ slug, action: "graduation", amountEth: snapshot.realWethEth, marketCap: snapshot.marketCapUsd, actor: "Migration coordinator", note: "Migration committed without changing token balances or open positions." });
    }, 650);
    return migrating;
  }, [pushEvent]);

  const updateRiskSettings = useCallback((patch: Partial<RiskSettings>) => setRiskSettings((current) => ({ ...current, ...patch })), []);

  const runScenario = useCallback((slug: string, scenario: MarketScenario) => {
    const selected = normalizeToken(tokensRef.current.find((token) => token.slug === slug) ?? TOKENS[0]);
    if (!selected || selected.launchState === "auction") return;
    if (scenario === "reset") {
      const base = TOKENS.find((token) => token.slug === slug);
      if (base) setTokens((current) => current.map((token) => token.slug === slug ? normalizeToken({ ...base }) : token));
      return;
    }
    if (scenario === "graduate") {
      setTokens((current) => current.map((token) => token.slug === slug ? normalizeToken({ ...token, graduation: 100, launchState: "graduated", liquidityEth: Math.max(4.2, token.liquidityEth ?? 0), insuranceEth: Math.max(0.18, token.insuranceEth ?? 0), oracleConfidence: Math.max(88, token.oracleConfidence ?? 0), uniqueTraders: Math.max(180, token.uniqueTraders ?? 0), marketAgeSeconds: Math.max(600, token.marketAgeSeconds ?? 0) }) : token));
      pushEvent({ slug, action: "graduation", amountEth: 0, marketCap: selected.cap, actor: "Risk Lab", note: "Permanent liquidity and higher capacity unlocked" });
      return;
    }
    if (scenario === "oracle-wick") {
      setTokens((current) => current.map((token) => token.slug === slug ? normalizeToken({ ...token, cap: token.cap * 1.42, price: token.price * 1.42, volatility1m: 24, oracleConfidence: Math.max(28, (token.oracleConfidence ?? 70) - 25) }) : token));
      pushEvent({ slug, action: "oracle-guard", amountEth: 4.2, marketCap: selected.cap * 1.42, actor: "Risk Lab", note: "Spot wick rejected by bounded mark price" });
      return;
    }
    if (scenario === "coordinated-pump-long" || scenario === "coordinated-dump-short") {
      const up = scenario === "coordinated-pump-long";
      setTokens((current) => current.map((token) => token.slug === slug ? normalizeToken({
        ...token,
        cap: token.cap * (up ? 1.28 : 0.72),
        price: token.price * (up ? 1.28 : 0.72),
        linkedWalletConcentration: clamp((token.linkedWalletConcentration ?? 12) + 24, 0, 62),
        oracleConfidence: Math.max(24, (token.oracleConfidence ?? 70) - 30),
        longs: up ? 88 : 12,
        volatility1m: 20,
      }) : token));
      pushEvent({ slug, action: "oracle-guard", amountEth: 18, marketCap: selected.cap * (up ? 1.28 : 0.72), actor: "Cluster monitor", note: "Coordinated wallets detected · leverage reduced" });
      return;
    }
    if (scenario === "liquidation-cascade") {
      const up = selected.longs < 50;
      const multiplier = up ? 1.6 : 0.48;
      for (let step = 1; step <= 10; step += 1) {
        window.setTimeout(() => setTokens((current) => current.map((token) => token.slug === slug ? normalizeToken({ ...token, cap: Math.max(80, token.cap * Math.pow(multiplier, 0.1)), price: token.price * Math.pow(multiplier, 0.1), volatility1m: 28, oracleConfidence: Math.max(32, (token.oracleConfidence ?? 70) - 2) }) : token)), step * 160);
      }
      pushEvent({ slug, action: "adl", amountEth: 22, marketCap: selected.cap * multiplier, actor: "Risk Lab", note: "Cascade test started · partial liquidations first" });
      return;
    }

    const multiplier = scenario === "pump" ? 1.35 : scenario === "crash" ? 0.62 : scenario === "whale-buy" ? 1.16 : scenario === "whale-sell" ? 0.84 : scenario === "short-squeeze" ? 1.58 : 0.52;
    const action: MarketAction = scenario === "pump" || scenario === "whale-buy" ? "whale-buy" : scenario === "crash" || scenario === "whale-sell" ? "whale-sell" : scenario;
    const steps = 7;
    for (let step = 1; step <= steps; step += 1) {
      window.setTimeout(() => {
        setTokens((current) => current.map((raw) => {
          if (raw.slug !== slug || raw.cap <= 0) return raw;
          const token = normalizeToken(raw);
          const stepMultiplier = Math.pow(multiplier, 1 / steps);
          const cap = Math.max(80, token.cap * stepMultiplier);
          const indexCap = Math.max(80, (token.indexCap ?? token.cap) + (cap - (token.indexCap ?? token.cap)) * 0.18);
          const guard = riskSettings.oracleGuardPercent / 100;
          const markCap = clamp((token.markCap ?? indexCap) + (indexCap - (token.markCap ?? indexCap)) * 0.42, indexCap * (1 - guard), indexCap * (1 + guard));
          const up = stepMultiplier > 1;
          const longShift = scenario === "short-squeeze" ? 2.4 : scenario === "long-squeeze" ? -2.4 : up ? 0.45 : -0.45;
          const newLongs = clamp(token.longs + longShift, 4, 96);
          return normalizeToken({
            ...token,
            cap,
            price: token.price * stepMultiplier,
            indexCap,
            markCap,
            change24h: clamp(token.change24h + (stepMultiplier - 1) * 100, -99, 999),
            longs: newLongs,
            funding: clamp((newLongs - 50) / 50 * 0.042, -0.055, 0.055),
            fundingRateHourly: clamp((newLongs - 50) / 50 * 0.042, -0.055, 0.055),
            volume24h: token.volume24h + Math.abs(stepMultiplier - 1) * 450_000,
            volatility1m: clamp((token.volatility1m ?? 2) + 1.8, 0, 30),
            oracleConfidence: Math.max(38, (token.oracleConfidence ?? 75) - 1.4),
            hedgeUtilization: clamp(Math.abs(newLongs - 50) * 1.7, 2, 98),
            allTimeHighCap: Math.max(token.allTimeHighCap ?? token.cap, cap),
          });
        }));
      }, step * 220);
    }
    pushEvent({ slug, action, amountEth: scenario.includes("squeeze") ? 12.5 : 6.4, marketCap: selected.cap * multiplier, actor: "Risk Lab", note: scenario.replaceAll("-", " ") });
  }, [pushEvent, riskSettings.oracleGuardPercent]);


  const fundTradingAccount = useCallback((amountEth: number) => {
    if (!Number.isFinite(amountEth) || amountEth <= 0) return;
    setBalanceEth((value) => value + amountEth);
  }, []);

  const withdrawTradingAccount = useCallback((amountEth: number) => {
    if (!Number.isFinite(amountEth) || amountEth <= 0 || amountEth > balanceEth) return false;
    setBalanceEth((value) => Math.max(0, value - amountEth));
    return true;
  }, [balanceEth]);

  const syncTradingAccountBalance = useCallback((amountEth: number) => {
    setBalanceEth(Math.max(0, Number.isFinite(amountEth) ? amountEth : 0));
  }, []);

  const resetLocalData = useCallback(() => {
    setTokens(TOKENS.map(normalizeToken));
    setEvents(DEMO_ONLY ? createDemoMarketEvents() : []);
    setPositions([]);
    setHoldings([]);
    setClosedTrades([]);
    setPendingOrders([]);
    setTradePresets(DEFAULT_PRESETS);
    setWatchlist([]);
    setAuctionBids({});
    setBalanceEth(DEMO_ONLY ? 2.35 : 0);
    setWalletAddress(undefined);
    setWalletBalanceEth(0);
    setChainExecution({ mode: "browser-sim", phase: "idle", updatedAt: Date.now() });
    setConnected(DEMO_ONLY);
    setRiskSettings(DEFAULT_RISK);
    if (typeof localStorage !== "undefined") {
      [
        "perphood-v20-custom-tokens", "perphood-v20-positions", "perphood-v20-holdings", "perphood-v20-closed-trades",
        "perphood-v20-pending-orders", "perphood-v20-auction-bids",
        "perphood-v19-custom-tokens", "perphood-v19-positions", "perphood-v19-holdings", "perphood-v19-closed-trades",
        "perphood-v19-pending-orders", "perphood-v19-auction-bids",
        "perphood-v18-custom-tokens", "perphood-v18-positions", "perphood-v18-holdings", "perphood-v18-closed-trades",
        "perphood-v18-pending-orders", "perphood-v18-auction-bids", "perphood-trade-presets", "perphood-watchlist", "perphood-risk-settings", "perphood-balance", "perphood-connected",
        "rook-custom-tokens", "rook-positions", "rook-holdings", "rook-closed-trades", "rook-watchlist", "rook-risk-settings", "rook-balance", "rook-connected",
      ].forEach((key) => localStorage.removeItem(key));
    }
  }, []);

  const traderProgress = useMemo<TraderProgress>(() => {
    const wins = closedTrades.filter((trade) => trade.pnlEth > 0).length;
    let streak = 0;
    for (const trade of closedTrades) {
      if (trade.pnlEth > 0) streak += 1;
      else break;
    }
    const trades = closedTrades.length + positions.length + holdings.length;
    const xp = Math.round(trades * 85 + wins * 120 + Math.max(0, closedTrades.reduce((sum, trade) => sum + trade.roiPercent, 0)) * 2);
    const level = Math.max(1, Math.floor(Math.sqrt(xp / 180)) + 1);
    const title = level >= 10 ? "Hood Legend" : level >= 7 ? "Liquidation Hunter" : level >= 4 ? "Market Runner" : level >= 2 ? "Chart Scout" : "Fresh Wallet";
    return { xp, level, title, trades, wins, streak };
  }, [closedTrades, holdings.length, positions.length]);

  const value = useMemo<MarketContextValue>(() => ({
    tokens,
    events,
    positions,
    holdings,
    closedTrades,
    pendingOrders,
    tradePresets,
    watchlist,
    auctionBids,
    connected,
    balanceEth,
    walletAddress,
    walletBalanceEth,
    chainExecution,
    riskSettings,
    traderProgress,
    getToken,
    getEvents,
    getMarketCapacity,
    getTradeQuote,
    getMarketRisk,
    getPositionPnl,
    getHoldingPnl,
    toggleWallet,
    fundTradingAccount,
    withdrawTradingAccount,
    syncTradingAccountBalance,
    toggleWatchlist,
    commitToAuction,
    openPosition,
    buySpot,
    placeOrder,
    cancelOrder,
    saveTradePreset,
    deleteTradePreset,
    closePosition,
    updatePositionRisk,
    addCollateral,
    sellHolding,
    launchToken,
    getMigrationSnapshot,
    migrateToken,
    advanceLaunchpadMarket,
    updateRiskSettings,
    runScenario,
    refreshChainMarket,
    resetLocalData,
  }), [addCollateral, auctionBids, balanceEth, buySpot, cancelOrder, chainExecution, closePosition, closedTrades, commitToAuction, connected, deleteTradePreset, events, getEvents, getHoldingPnl, getMarketCapacity, getMarketRisk, getPositionPnl, getToken, getTradeQuote, holdings, launchToken, getMigrationSnapshot, migrateToken, advanceLaunchpadMarket, openPosition, pendingOrders, placeOrder, positions, refreshChainMarket, resetLocalData, riskSettings, runScenario, saveTradePreset, sellHolding, toggleWallet, fundTradingAccount, withdrawTradingAccount, syncTradingAccountBalance, toggleWatchlist, tokens, tradePresets, traderProgress, updatePositionRisk, updateRiskSettings, walletAddress, walletBalanceEth, watchlist]);

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarkets() {
  const context = useContext(MarketContext);
  if (!context) throw new Error("useMarkets must be used inside MarketProvider");
  return context;
}
