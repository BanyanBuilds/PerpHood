export type LaunchState = "auction" | "live" | "graduated";
export type BattlePhase = "bonding" | "migrating" | "migrated" | "paused";
export type OgStatus = "og" | "copy";
export type FeeTier = "market" | "maker";

export type Token = {
  slug: string;
  symbol: string;
  name: string;
  emoji: string;
  hue: number;
  cap: number;
  price: number;
  change24h: number;
  graduation: number;
  longs: number;
  volume24h: number;
  openInterest: number;
  funding: number;
  launchedMinutesAgo: number;
  featured?: boolean;
  description: string;
  isCustom?: boolean;
  liquidityEth?: number;
  insuranceEth?: number;
  hedgeUtilization?: number;
  allTimeHighCap?: number;
  launchState?: LaunchState;
  auctionEndsAt?: number;
  auctionCommittedEth?: number;
  auctionParticipants?: number;
  auctionAllocationPercent?: number;
  openingCap?: number;
  battlePhase?: BattlePhase;

  // Unified Spot × Long × Sell × Short BattlePool simulator ledger.
  totalSupply?: number;
  curveAllocation?: number;
  initialPerpAllocation?: number;
  initialSafetyAllocation?: number;
  openingPriceEth?: number;
  curveExponent?: number;
  maxCurveSoldFraction?: number;
  protectedWethRate?: number;
  maxPoolUtilization?: number;
  curveTokenReserve?: number;
  curveRealTokenReserve?: number;
  curveWethReserve?: number;
  virtualWethReserve?: number;
  realWethBalance?: number;
  lockedCollateralEth?: number;
  lockedLongCollateralEth?: number;
  lockedShortCollateralEth?: number;
  lockedShortProceedsEth?: number;
  syntheticLongCreditEth?: number;
  perpTokenReserve?: number;
  safetyTokenReserve?: number;
  lockedLongTokens?: number;
  circulatingSpotTokens?: number;
  borrowedShortTokens?: number;
  poolFeesEth?: number;
  liquidationEquityEth?: number;
  battlePoolVersion?: string;
  adaptiveMinSafetyFraction?: number;
  adaptiveMaxPerpFraction?: number;
  adaptiveReleaseTrigger?: number;
  adaptiveReclaimTrigger?: number;
  adaptiveTargetUtilization?: number;
  adaptiveReleaseStepFraction?: number;
  adaptiveMinDepthEth?: number;
  adaptivePerpReleasedTokens?: number;
  adaptiveRebalanceCount?: number;
  positionObligationsEth?: number;
  freeWethEth?: number;
  shortInventoryUtilization?: number;
  contractAddress?: string;

  // V43 local-chain unified settlement receipt. These fields are optional because browser-only
  // simulator markets remain supported when Anvil is not configured.
  chainDeploymentMode?: "browser-sim" | "anvil-v42" | "anvil-v43" | "anvil-v45" | "robinhood-testnet-v54" | "robinhood-mainnet-v54" | "robinhood-testnet-v55" | "robinhood-mainnet-v55" | "robinhood-mainnet-v65";
  chainId?: number;
  chainFactoryAddress?: string;
  chainMarketAddress?: string;
  chainTokenAddress?: string;
  launchTransactionHash?: string;
  metadataUri?: string;
  metadataHash?: string;
  imageUrl?: string;
  chainExplorerUrl?: string;
  priceEth?: number;
  marketCapEth?: number;
  chainStateSequence?: number;
  chainStateHash?: string;
  chainLastBlock?: number;
  chainLastSyncedAt?: number;
  chainExecutionVersion?: string;
  activeChainPositions?: number;
  chainLongCapacity2xEth?: number;
  chainLongCapacity5xEth?: number;
  chainLongCapacity10xEth?: number;
  chainLongCapacity20xEth?: number;

  // V41 launchpad and migration test lifecycle.
  launchpadVersion?: string;
  launchTotalSpendEth?: number;
  launchGasReserveEth?: number;
  creatorGenesisBuyEth?: number;
  migrationTargetMarketCapUsd?: number;
  migrationRealWethEth?: number;
  migrationGateDigest?: string;
  migratedAt?: number;
  activeLiquidationBatch?: boolean;
  shortCapacityEth?: number;
  website?: string;
  xHandle?: string;
  telegram?: string;

  // Risk Engine V1 state. `cap` remains the live spot market cap.
  indexCap?: number;
  markCap?: number;
  oracleConfidence?: number;
  maxLeverageUnlocked?: number;
  longOpenInterestEth?: number;
  shortOpenInterestEth?: number;
  fundingRateHourly?: number;
  borrowRateHourly?: number;
  badDebtEth?: number;
  linkedWalletConcentration?: number;
  uniqueTraders?: number;
  volatility1m?: number;
  marketAgeSeconds?: number;

  // First-seen token identity registry. OG means the ticker + artwork pairing was first
  // observed by LEVERAGE X. Ticker origin is tracked separately. It is not an endorsement.
  imageDataUrl?: string;
  imageExactHash?: string;
  imagePerceptualHash?: string;
  normalizedName?: string;
  normalizedSymbol?: string;
  metadataFingerprint?: string;
  ogStatus?: OgStatus;
  firstSeenSlug?: string;
  tickerOriginSlug?: string;
  isTickerOrigin?: boolean;
  nearImageSimilarity?: number;
  nameReused?: boolean;
  symbolReused?: boolean;
  imageReused?: boolean;
  creatorWallet?: string;
  launchBlock?: number;
  metadataLockedAt?: number;

};

export type Direction = "buy" | "long" | "short";
export type PositionDirection = "long" | "short";
export type MarketAction =
  | "spot-buy"
  | "spot-sell"
  | "long"
  | "short"
  | "partial-liquidation"
  | "liquidation"
  | "graduation"
  | "whale-buy"
  | "whale-sell"
  | "short-squeeze"
  | "long-squeeze"
  | "auction-bid"
  | "market-open"
  | "funding"
  | "oracle-guard"
  | "adl"
  | "limit-order"
  | "trigger-order"
  | "order-fill"
  | "order-cancel";

export type Position = {
  id: string;
  slug: string;
  direction: PositionDirection;
  leverage: number;
  collateral: number;
  initialCollateral?: number;
  notional: number;
  entryCap: number;
  currentCap: number;
  liquidationCap: number;
  openedAt: number;
  entryFee?: number;
  takeProfitCap?: number;
  stopLossCap?: number;
  breakevenCap?: number;
  breakevenActivationCap?: number;
  accruedFunding?: number;
  accruedBorrow?: number;
  maintenanceMarginRate?: number;
  partialLiquidations?: number;
  lastAccruedAt?: number;
  lastLiquidatedAt?: number;

  // Real underlying inventory/debt used by the unified BattlePool.
  tokenAmount?: number;
  debtEth?: number;
  borrowedTokens?: number;
  lockedProceedsEth?: number;
  entryPriceEth?: number;
  owner?: string;
  clientOrderId?: string;
  executionMode?: "browser-sim" | "v43-contract" | "v45-account" | "v45-session" | "v54-spot" | "v55-spot" | "v65-spot";
  chainPositionId?: string;
  chainMarketAddress?: string;
  chainTransactionHash?: string;
  chainBlockNumber?: number;
  chainExecutableEquityEth?: number;
  chainExecutablePnlEth?: number;
  chainSettlementPayable?: boolean;
  chainMaximumPayoutEth?: number;
  chainPostCloseObligationsEth?: number;
  chainLastSyncedAt?: number;
};

export type SpotHolding = {
  id: string;
  slug: string;
  investedEth: number;
  entryCap: number;
  openedAt: number;
  tokenAmount?: number;
  entryPriceEth?: number;
  executionMode?: "browser-sim" | "v43-contract" | "v45-account" | "v45-session" | "v54-spot" | "v55-spot" | "v65-spot";
  chainMarketAddress?: string;
  chainTokenAddress?: string;
  chainTransactionHash?: string;
  chainBlockNumber?: number;
};

export type MarketEvent = {
  id: string;
  slug: string;
  action: MarketAction;
  amountEth: number;
  marketCap: number;
  createdAt: number;
  leverage?: number;
  actor?: string;
  note?: string;
  transactionHash?: string;
  blockNumber?: number;
  executionMode?: "browser-sim" | "v43-contract" | "v45-account" | "v45-session" | "v54-spot" | "v55-spot" | "v65-spot";
};

export type ClosedTrade = {
  id: string;
  slug: string;
  direction: PositionDirection | "spot";
  leverage: number;
  entryCap: number;
  exitCap: number;
  collateral: number;
  pnlEth: number;
  roiPercent: number;
  openedAt: number;
  closedAt: number;
  reason: "manual" | "liquidation" | "partial-liquidation" | "take-profit" | "stop-loss" | "spot-sale" | "adl";
};

export type LaunchTokenInput = {
  name: string;
  symbol: string;
  description: string;
  emoji?: string;
  imageDataUrl?: string;
  imageExactHash?: string;
  imagePerceptualHash?: string;
  website?: string;
  xHandle?: string;
  /** Total launch spend inclusive of estimated network gas. */
  totalLaunchSpendEth?: number;
  /** Estimated gas reserved before the creator buy is routed through the curve. */
  gasReserveEth?: number;
  /** Backward-compatible direct creator-buy field used by older local records. */
  developerBuyEth?: number;
  telegram?: string;
  migrationTargetMarketCapUsd?: number;
  creatorWallet?: string;
  chainDeploymentMode?: "browser-sim" | "anvil-v42" | "anvil-v43" | "anvil-v45" | "robinhood-testnet-v54" | "robinhood-mainnet-v54" | "robinhood-testnet-v55" | "robinhood-mainnet-v55" | "robinhood-mainnet-v65";
  chainId?: number;
  chainFactoryAddress?: string;
  chainMarketAddress?: string;
  chainTokenAddress?: string;
  launchTransactionHash?: string;
  chainStateSequence?: number;
  chainStateHash?: string;
  chainLastBlock?: number;
  chainLastSyncedAt?: number;
  chainExecutionVersion?: string;
  activeChainPositions?: number;
  launchBlock?: number;
};

export type RiskSettings = {
  simulationSpeed: number;
  ethVaultSize: number;
  hedgeReservePercent: number;
  hedgeRatioPercent: number;
  insurancePercent: number;
  maxLeverage: number;
  oracleGuardPercent: number;
  maintenanceBufferPercent: number;
  partialLiquidationPercent: number;
  paused: boolean;
};

export type MarketScenario =
  | "pump"
  | "crash"
  | "whale-buy"
  | "whale-sell"
  | "short-squeeze"
  | "long-squeeze"
  | "coordinated-pump-long"
  | "coordinated-dump-short"
  | "oracle-wick"
  | "liquidation-cascade"
  | "graduate"
  | "reset";


export type OrderKind = "limit" | "trigger" | "take-profit" | "stop-loss" | "breakeven";

export type PendingOrder = {
  id: string;
  slug: string;
  side: Direction;
  kind: OrderKind;
  leverage: number;
  collateral: number;
  triggerCap: number;
  createdAt: number;
  takeProfitCap?: number;
  stopLossCap?: number;
  executionMode?: "browser-sim" | "v46-keeper";
  status?: "armed" | "watching" | "filling" | "filled" | "cancelled" | "expired" | "failed";
  chainMarketAddress?: string;
  orderHash?: string;
  positionId?: string;
  reduceOnly?: boolean;
  activationCap?: number;
  expiresAt?: number;
  attempts?: number;
  transactionHash?: string;
  chainBlockNumber?: number;
  failureReason?: string;
};

export type TradePreset = {
  id: string;
  name: string;
  side: Direction;
  leverage: number;
  collateral: number;
  takeProfitPercent: number;
  stopLossPercent: number;
};

export type OpenPositionOptions = {
  takeProfitCap?: number;
  stopLossCap?: number;
  breakevenCap?: number;
  breakevenActivationCap?: number;
  feeTier?: FeeTier;
};

export type TradeQuote = {
  allowed: boolean;
  reason?: string;
  leverage: number;
  maxLeverage: number;
  notionalEth: number;
  capacityEth: number;
  feeRate: number;
  feeEth: number;
  priceImpactPercent: number;
  fundingRateHourly: number;
  borrowRateHourly: number;
  liquidationCap: number;
  liquidationDistancePercent: number;
  maintenanceMarginEth: number;
  oracleConfidence: number;
  markCap: number;
  indexCap: number;
  balancingRebate: boolean;
  feeTier: FeeTier;
  protocolFeeRate: number;
  dynamicRiskFeeRate: number;
};

export type MarketRisk = {
  score: number;
  label: "Protected" | "Watch" | "High risk" | "Close only";
  maxLeverage: number;
  oracleConfidence: number;
  spotCap: number;
  indexCap: number;
  markCap: number;
  longCapacityEth: number;
  shortCapacityEth: number;
  insuranceCoveragePercent: number;
  reasons: string[];
};

export type TraderProgress = {
  xp: number;
  level: number;
  title: string;
  trades: number;
  wins: number;
  streak: number;
};
