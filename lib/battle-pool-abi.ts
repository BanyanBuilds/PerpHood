/**
 * Minimal frontend ABI for the V20 ordered-state contract boundary. The deployed address is
 * intentionally unset until audited Robinhood Chain contracts exist.
 */
export const BATTLE_POOL_V20_ABI = [
  "function stateSequence() view returns (uint64)",
  "function realtimeState() view returns ((uint64 sequence,uint64 committedAt,uint256 marginalPriceWad,uint256 marketCapWad,uint256 freeWethWad,uint256 reservedPositionEquityWad,bytes32 stateHash))",
  "function previewExecutablePnl(uint256 positionId) view returns ((uint256 positionId,bool executable,uint256 payoutWad,int256 pnlWad,uint256 closeFeeWad,uint256 priceImpactBps,bytes32 stateHash))",
  "function poolState() view returns ((uint256 curveTokenReserve,uint256 realWethBalanceWad,uint256 freeWethWad,uint256 reservedPositionEquityWad,uint256 shortInventoryReserve,uint256 safetyInventoryReserve,uint256 adaptiveShortInventoryReleased,uint256 lockedLongTokens,uint256 circulatingSpotTokens,uint256 borrowedShortTokens,uint256 accumulatedFeesWad,uint256 retainedLiquidationEquityWad,uint256 badDebtWad,uint256 marginalPriceWad))",
  "function spotBuy(uint256 grossWethWad,uint256 minTokenOut,uint256 deadline) returns ((bytes32 batchId,uint256 grossWethWad,uint256 netWethWad,uint256 tokenAmount,uint256 feeWad,uint256 startPriceWad,uint256 endPriceWad,uint32 internalSegmentCount,uint32 liquidationCount,uint256 retainedLiquidationEquityWad,uint256 realizedBadDebtWad))",
  "function spotSell(uint256 tokenIn,uint256 minWethOutWad,uint256 deadline) returns ((bytes32 batchId,uint256 grossWethWad,uint256 netWethWad,uint256 tokenAmount,uint256 feeWad,uint256 startPriceWad,uint256 endPriceWad,uint32 internalSegmentCount,uint32 liquidationCount,uint256 retainedLiquidationEquityWad,uint256 realizedBadDebtWad))",
  "function openLong(uint256 collateralWad,uint16 leverageBps,uint256 minTokenOut,uint256 deadline) returns (uint256 positionId,(bytes32 batchId,uint256 grossWethWad,uint256 netWethWad,uint256 tokenAmount,uint256 feeWad,uint256 startPriceWad,uint256 endPriceWad,uint32 internalSegmentCount,uint32 liquidationCount,uint256 retainedLiquidationEquityWad,uint256 realizedBadDebtWad))",
  "function openShort(uint256 collateralWad,uint16 leverageBps,uint256 minWethProceedsWad,uint256 deadline) returns (uint256 positionId,(bytes32 batchId,uint256 grossWethWad,uint256 netWethWad,uint256 tokenAmount,uint256 feeWad,uint256 startPriceWad,uint256 endPriceWad,uint32 internalSegmentCount,uint32 liquidationCount,uint256 retainedLiquidationEquityWad,uint256 realizedBadDebtWad))",
  "function closePosition(uint256 positionId,uint16 fractionBps,uint256 minPayoutWad,uint256 deadline) returns ((bytes32 batchId,uint256 grossWethWad,uint256 netWethWad,uint256 tokenAmount,uint256 feeWad,uint256 startPriceWad,uint256 endPriceWad,uint32 internalSegmentCount,uint32 liquidationCount,uint256 retainedLiquidationEquityWad,uint256 realizedBadDebtWad))",
  "function liquidate(uint256 positionId) returns ((bytes32 batchId,uint256 grossWethWad,uint256 netWethWad,uint256 tokenAmount,uint256 feeWad,uint256 startPriceWad,uint256 endPriceWad,uint32 internalSegmentCount,uint32 liquidationCount,uint256 retainedLiquidationEquityWad,uint256 realizedBadDebtWad))",
  "event StateFrameCommitted(uint64 indexed sequence,bytes32 indexed stateHash,uint256 marginalPriceWad,uint256 freeWethWad,uint256 reservedPositionEquityWad)",
  "event ExecutionBatchSettled(bytes32 indexed batchId,address indexed trader,uint32 internalSegmentCount,uint32 liquidationCount,uint256 retainedLiquidationEquityWad,uint256 realizedBadDebtWad)",
  "event Liquidation(uint256 indexed positionId,uint8 side,uint256 residualEquityWad,uint256 badDebtWad,uint256 priceBeforeWad,uint256 priceAfterWad)",
] as const;

export const BATTLE_POOL_V20_ADDRESS: `0x${string}` | null = null;
