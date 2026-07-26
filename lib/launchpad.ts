import {
  BATTLE_CURVE_ALLOCATION,
  BATTLE_CURVE_EXPONENT,
  BATTLE_OPENING_FDV_ETH,
  BATTLE_TOTAL_SUPPLY,
  BATTLE_TRADE_FEE_RATE,
  freeWeth,
  poolFromToken,
  shortNotionalCapacity,
} from "./battle-pool.ts";
import type { Position, Token } from "./types.ts";

export const LAUNCHPAD_TEST_MODE = true;
export const LAUNCHPAD_VERSION = "v43-unified-battlepool";
export const LAUNCHPAD_MIN_TOTAL_SPEND_ETH = 0.001;
export const LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH = 0.00018;
export const LAUNCHPAD_MIN_CREATOR_BUY_ETH = 0.0001;
export const LAUNCHPAD_TARGET_MARKET_CAP_USD = 45_000;
export const LAUNCHPAD_TARGET_OPTIONS_USD = [33_000, 40_000, 45_000, 50_000] as const;
export const LAUNCHPAD_MIN_REAL_WETH_ETH = 1.05;
export const LAUNCHPAD_MIN_UNIQUE_TRADERS = 25;
export const LAUNCHPAD_MIN_SHORT_CAPACITY_ETH = 0.08;
export const LAUNCHPAD_MIGRATION_BUFFER_ETH = 0.12;

export type LaunchSpendQuote = {
  totalSpendEth: number;
  gasReserveEth: number;
  creatorBuyEth: number;
  valid: boolean;
  reason?: string;
};

export type MigrationGateKey =
  | "market-cap"
  | "real-weth"
  | "solvency"
  | "short-capacity"
  | "bad-debt"
  | "trader-distribution"
  | "settlement-idle";

export type MigrationGate = {
  key: MigrationGateKey;
  label: string;
  passed: boolean;
  current: number | string;
  required: number | string;
  detail: string;
};

export type MigrationSnapshot = {
  phase: "new" | "cooking" | "migrating" | "migrated" | "blocked";
  targetMarketCapUsd: number;
  marketCapUsd: number;
  marketCapProgress: number;
  realWethEth: number;
  requiredRealWethEth: number;
  liquidityProgress: number;
  freeWethEth: number;
  positionObligationsEth: number;
  shortCapacityEth: number;
  gates: MigrationGate[];
  passedGateCount: number;
  totalGateCount: number;
  ready: boolean;
  blockerCount: number;
};

export type MigrationTargetEstimate = {
  targetMarketCapUsd: number;
  targetFdvEth: number;
  tokensSold: number;
  circulatingPercent: number;
  estimatedGrossWethEth: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

export function quoteLaunchSpend(
  totalSpendEth: number,
  gasReserveEth = LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH,
): LaunchSpendQuote {
  const total = finite(totalSpendEth);
  const gas = clamp(finite(gasReserveEth, LAUNCHPAD_DEFAULT_GAS_RESERVE_ETH), 0, Math.max(0, total));
  const creatorBuyEth = Math.max(0, total - gas);
  if (total < LAUNCHPAD_MIN_TOTAL_SPEND_ETH) {
    return {
      totalSpendEth: total,
      gasReserveEth: gas,
      creatorBuyEth,
      valid: false,
      reason: `Total launch spend must be at least ${LAUNCHPAD_MIN_TOTAL_SPEND_ETH.toFixed(3)} ETH, including gas.`,
    };
  }
  if (creatorBuyEth < LAUNCHPAD_MIN_CREATOR_BUY_ETH) {
    return {
      totalSpendEth: total,
      gasReserveEth: gas,
      creatorBuyEth,
      valid: false,
      reason: `Gas leaves less than ${LAUNCHPAD_MIN_CREATOR_BUY_ETH.toFixed(4)} ETH for the required creator buy.`,
    };
  }
  return { totalSpendEth: total, gasReserveEth: gas, creatorBuyEth, valid: true };
}

/**
 * Solves the exponent-5 curve at a desired marginal FDV. This is an estimate
 * used by the launchpad test console. The authoritative deployment must read
 * live chain state and the configured ETH/USD source before migration.
 */
export function estimateMigrationTarget(
  targetMarketCapUsd = LAUNCHPAD_TARGET_MARKET_CAP_USD,
  ethUsd = 3_200,
): MigrationTargetEstimate {
  const safeEthUsd = Math.max(1, ethUsd);
  const targetFdvEth = Math.max(BATTLE_OPENING_FDV_ETH, targetMarketCapUsd / safeEthUsd);
  const remainingFraction = Math.pow(BATTLE_OPENING_FDV_ETH / targetFdvEth, 1 / BATTLE_CURVE_EXPONENT);
  const soldFraction = clamp(1 - remainingFraction, 0, 0.94);
  const tokensSold = BATTLE_CURVE_ALLOCATION * soldFraction;
  const openingPriceEth = BATTLE_OPENING_FDV_ETH / BATTLE_TOTAL_SUPPLY;
  const cumulativeNetWeth = openingPriceEth * BATTLE_CURVE_ALLOCATION / (BATTLE_CURVE_EXPONENT - 1)
    * (Math.pow(Math.max(1e-12, 1 - soldFraction), 1 - BATTLE_CURVE_EXPONENT) - 1);
  const estimatedGrossWethEth = cumulativeNetWeth / (1 - BATTLE_TRADE_FEE_RATE);
  return {
    targetMarketCapUsd,
    targetFdvEth,
    tokensSold,
    circulatingPercent: tokensSold / BATTLE_TOTAL_SUPPLY * 100,
    estimatedGrossWethEth,
  };
}

export function migrationTargetForToken(token: Token) {
  return token.migrationTargetMarketCapUsd ?? LAUNCHPAD_TARGET_MARKET_CAP_USD;
}

export function buildMigrationSnapshot(
  token: Token,
  positions: Position[] = [],
  ethUsd = 3_200,
): MigrationSnapshot {
  const targetMarketCapUsd = migrationTargetForToken(token);
  const marketCapUsd = Math.max(0, token.cap);
  const tokenPositions = positions.filter((position) => position.slug === token.slug);
  const positionObligationsEth = token.positionObligationsEth
    ?? tokenPositions.reduce((sum, position) => sum + Math.max(0, position.notional), 0);
  const realWethEth = Math.max(0, token.realWethBalance ?? token.liquidityEth ?? 0);
  let availableWeth = Math.max(0, token.freeWethEth ?? realWethEth - positionObligationsEth);
  let shortCapacityEth = Math.max(0, token.shortCapacityEth ?? 0);
  if (token.battlePoolVersion) {
    try {
      const pool = poolFromToken(token);
      availableWeth = Math.max(0, freeWeth(pool));
      shortCapacityEth = Math.max(0, shortNotionalCapacity(pool));
    } catch {
      // Keep normalized token fields as the honest fallback for partially indexed markets.
    }
  }
  const requiredFreeWeth = positionObligationsEth * 1.1 + LAUNCHPAD_MIGRATION_BUFFER_ETH;
  const activeSettlement = Boolean(token.activeLiquidationBatch || token.battlePhase === "migrating");
  const traders = Math.max(0, token.uniqueTraders ?? 0);
  const badDebtEth = Math.max(0, token.badDebtEth ?? 0);
  const minRealWeth = Math.max(
    LAUNCHPAD_MIN_REAL_WETH_ETH,
    estimateMigrationTarget(targetMarketCapUsd, ethUsd).estimatedGrossWethEth * 0.72,
  );

  const gates: MigrationGate[] = [
    {
      key: "market-cap",
      label: "Market-cap target",
      passed: marketCapUsd >= targetMarketCapUsd,
      current: marketCapUsd,
      required: targetMarketCapUsd,
      detail: "The marginal BattleCurve price must reach the configured USD graduation target.",
    },
    {
      key: "real-weth",
      label: "Real WETH depth",
      passed: realWethEth >= minRealWeth,
      current: realWethEth,
      required: minRealWeth,
      detail: "Virtual opening liquidity never counts as migration liquidity.",
    },
    {
      key: "solvency",
      label: "Closeability reserve",
      passed: availableWeth >= requiredFreeWeth,
      current: availableWeth,
      required: requiredFreeWeth,
      detail: "Open positions remain closeable with a reserve buffer through migration.",
    },
    {
      key: "short-capacity",
      label: "Short inventory",
      passed: shortCapacityEth >= LAUNCHPAD_MIN_SHORT_CAPACITY_ETH,
      current: shortCapacityEth,
      required: LAUNCHPAD_MIN_SHORT_CAPACITY_ETH,
      detail: "Migration cannot strand the short side or remove immediate two-way trading.",
    },
    {
      key: "bad-debt",
      label: "Zero bad debt",
      passed: badDebtEth <= 1e-12,
      current: badDebtEth,
      required: 0,
      detail: "Any unresolved bad debt blocks graduation.",
    },
    {
      key: "trader-distribution",
      label: "Independent participation",
      passed: traders >= LAUNCHPAD_MIN_UNIQUE_TRADERS,
      current: traders,
      required: LAUNCHPAD_MIN_UNIQUE_TRADERS,
      detail: "A minimum participant count reduces one-wallet graduation and thin migrations.",
    },
    {
      key: "settlement-idle",
      label: "Settlement idle",
      passed: !activeSettlement,
      current: activeSettlement ? "busy" : "idle",
      required: "idle",
      detail: "No liquidation continuation or prior migration operation may be active.",
    },
  ];

  const passedGateCount = gates.filter((gate) => gate.passed).length;
  const ready = passedGateCount === gates.length;
  const migrated = token.launchState === "graduated" || token.battlePhase === "migrated";
  const marketCapProgress = clamp(marketCapUsd / Math.max(1, targetMarketCapUsd) * 100, 0, 100);
  const liquidityProgress = clamp(realWethEth / Math.max(1e-9, minRealWeth) * 100, 0, 100);
  let phase: MigrationSnapshot["phase"] = "new";
  if (migrated) phase = "migrated";
  else if (token.battlePhase === "migrating") phase = "migrating";
  else if (marketCapProgress >= 100 && !ready) phase = "blocked";
  else if (marketCapProgress >= 15 || realWethEth >= 0.15) phase = "cooking";

  return {
    phase,
    targetMarketCapUsd,
    marketCapUsd,
    marketCapProgress,
    realWethEth,
    requiredRealWethEth: minRealWeth,
    liquidityProgress,
    freeWethEth: availableWeth,
    positionObligationsEth,
    shortCapacityEth,
    gates,
    passedGateCount,
    totalGateCount: gates.length,
    ready: migrated || ready,
    blockerCount: gates.length - passedGateCount,
  };
}

export function migrationPatch(token: Token, snapshot: MigrationSnapshot): Partial<Token> {
  if (!snapshot.ready) throw new Error("Migration safety gates are not all satisfied.");
  return {
    launchState: "graduated",
    battlePhase: "migrated",
    graduation: 100,
    migratedAt: Date.now(),
    migrationTargetMarketCapUsd: snapshot.targetMarketCapUsd,
    migrationRealWethEth: snapshot.realWethEth,
    migrationGateDigest: snapshot.gates.map((gate) => `${gate.key}:${gate.passed ? 1 : 0}`).join("|"),
  };
}
