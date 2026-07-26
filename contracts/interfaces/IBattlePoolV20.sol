// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Contract-facing specification for the PERPHOOD V20 BattlePool.
/// @dev This interface is not an audited implementation. The TypeScript engine
///      remains the current deterministic reference oracle.
interface IBattlePoolV20 {
    enum Side {
        Long,
        Short
    }

    enum BatchStatus {
        None,
        Executing,
        Settled,
        Reverted
    }

    struct Config {
        uint256 totalSupply;
        uint256 curveAllocation;
        uint256 initialShortInventory;
        uint256 initialSafetyInventory;
        uint256 openingFdvWad;
        uint256 curveExponentWad;
        uint16 maxCurveSoldBps;
        uint16 protectedWethBps;
        uint16 maxPoolUtilizationBps;
        uint16 executionFeeBps;
        uint16 adaptiveMinSafetyBps;
        uint16 adaptiveMaxShortInventoryBps;
        uint16 adaptiveReleaseTriggerBps;
        uint16 adaptiveReclaimTriggerBps;
        uint16 adaptiveTargetUtilizationBps;
        uint16 adaptiveReleaseStepBps;
        uint256 adaptiveMinDepthWad;
    }

    struct PositionView {
        uint256 id;
        address owner;
        Side side;
        uint16 leverageBps;
        uint16 maintenanceMarginBps;
        uint256 collateralWad;
        uint256 notionalWad;
        uint256 lockedTokenAmount;
        uint256 longDebtWad;
        uint256 borrowedTokenAmount;
        uint256 lockedShortProceedsWad;
        uint256 entryPriceWad;
        uint256 openedAt;
    }

    struct PoolView {
        uint256 curveTokenReserve;
        uint256 realWethBalanceWad;
        uint256 freeWethWad;
        uint256 reservedPositionEquityWad;
        uint256 shortInventoryReserve;
        uint256 safetyInventoryReserve;
        uint256 adaptiveShortInventoryReleased;
        uint256 lockedLongTokens;
        uint256 circulatingSpotTokens;
        uint256 borrowedShortTokens;
        uint256 accumulatedFeesWad;
        uint256 retainedLiquidationEquityWad;
        uint256 badDebtWad;
        uint256 marginalPriceWad;
    }


    struct RealtimeStateView {
        uint64 sequence;
        uint64 committedAt;
        uint256 marginalPriceWad;
        uint256 marketCapWad;
        uint256 freeWethWad;
        uint256 reservedPositionEquityWad;
        bytes32 stateHash;
    }

    struct ExecutablePnlView {
        uint256 positionId;
        bool executable;
        uint256 payoutWad;
        int256 pnlWad;
        uint256 closeFeeWad;
        uint256 priceImpactBps;
        bytes32 stateHash;
    }

    struct ExecutionReceipt {
        bytes32 batchId;
        uint256 grossWethWad;
        uint256 netWethWad;
        uint256 tokenAmount;
        uint256 feeWad;
        uint256 startPriceWad;
        uint256 endPriceWad;
        uint32 internalSegmentCount;
        uint32 liquidationCount;
        uint256 retainedLiquidationEquityWad;
        uint256 realizedBadDebtWad;
    }


    event StateFrameCommitted(
        uint64 indexed sequence,
        bytes32 indexed stateHash,
        uint256 marginalPriceWad,
        uint256 freeWethWad,
        uint256 reservedPositionEquityWad
    );

    event SpotBuy(
        address indexed trader,
        uint256 grossWethWad,
        uint256 tokenOut,
        uint256 feeWad,
        bytes32 indexed batchId
    );

    event SpotSell(
        address indexed trader,
        uint256 tokenIn,
        uint256 netWethWad,
        uint256 feeWad,
        bytes32 indexed batchId
    );

    event PositionOpened(
        uint256 indexed positionId,
        address indexed trader,
        Side side,
        uint16 leverageBps,
        uint256 collateralWad,
        uint256 notionalWad
    );

    event PositionClosed(
        uint256 indexed positionId,
        address indexed trader,
        uint256 payoutWad,
        int256 realizedPnlWad,
        bool liquidated
    );

    event Liquidation(
        uint256 indexed positionId,
        Side side,
        uint256 residualEquityWad,
        uint256 badDebtWad,
        uint256 priceBeforeWad,
        uint256 priceAfterWad
    );

    event AdaptiveInventoryRebalanced(
        int256 tokenDeltaToShortInventory,
        uint256 shortInventoryAfter,
        uint256 safetyInventoryAfter,
        uint256 utilizationBps
    );

    event ExecutionBatchSettled(
        bytes32 indexed batchId,
        address indexed trader,
        uint32 internalSegmentCount,
        uint32 liquidationCount,
        uint256 retainedLiquidationEquityWad,
        uint256 realizedBadDebtWad
    );

    function config() external view returns (Config memory);
    function stateSequence() external view returns (uint64);
    function realtimeState() external view returns (RealtimeStateView memory);
    function previewExecutablePnl(uint256 positionId) external view returns (ExecutablePnlView memory);

    function poolState() external view returns (PoolView memory);
    function position(uint256 positionId) external view returns (PositionView memory);
    function batchStatus(bytes32 batchId) external view returns (BatchStatus);

    function previewSpotBuy(uint256 grossWethWad, uint256 minTokenOut)
        external
        view
        returns (ExecutionReceipt memory);

    function previewSpotSell(uint256 tokenIn, uint256 minWethOutWad)
        external
        view
        returns (ExecutionReceipt memory);

    function spotBuy(uint256 grossWethWad, uint256 minTokenOut, uint256 deadline)
        external
        returns (ExecutionReceipt memory);

    function spotSell(uint256 tokenIn, uint256 minWethOutWad, uint256 deadline)
        external
        returns (ExecutionReceipt memory);

    function openLong(
        uint256 collateralWad,
        uint16 leverageBps,
        uint256 minTokenOut,
        uint256 deadline
    ) external returns (uint256 positionId, ExecutionReceipt memory receipt);

    function openShort(
        uint256 collateralWad,
        uint16 leverageBps,
        uint256 minWethProceedsWad,
        uint256 deadline
    ) external returns (uint256 positionId, ExecutionReceipt memory receipt);

    function closePosition(
        uint256 positionId,
        uint16 fractionBps,
        uint256 minPayoutWad,
        uint256 deadline
    ) external returns (ExecutionReceipt memory);

    function liquidate(uint256 positionId) external returns (ExecutionReceipt memory);

    /// @notice Advances a gas-bounded deterministic continuation batch.
    function continueExecution(bytes32 batchId, uint32 maxSegments)
        external
        returns (ExecutionReceipt memory);
}
