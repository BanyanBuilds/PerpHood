// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILocalBattlePoolV24 {
    enum ActionKind {
        Genesis,
        SpotBuy,
        SpotSell,
        OpenLong,
        CloseLong,
        OpenShort,
        CloseShort,
        LiquidateLong,
        LiquidateShort,
        Deposit,
        Withdraw,
        LiquidationBatch
    }

    struct FrameInput {
        bytes32 marketId;
        ActionKind action;
        uint256 marginalPriceWad;
        uint256 marketCapWad;
        uint256 reservedWethWad;
        uint256 openInterestLongWad;
        uint256 openInterestShortWad;
        bytes32 positionsRoot;
        bytes32 balancesRoot;
        bytes32 intentHash;
    }

    struct CurveActionProof {
        uint256 grossCurveWethWad;
        uint256 curveTokenAmountWad;
        uint256 curveFeeWad;
        uint256 externalWethAmountWad;
        uint256 nextLockedLongTokensWad;
        uint256 nextBorrowedShortTokensWad;
        uint256 nextPerpInventoryWad;
        uint256 nextSafetyInventoryWad;
        uint256 nextCirculatingSpotTokensWad;
    }

    function commitVerifiedAuthorizedFrame(
        uint64 expectedSequence,
        bytes32 expectedPreviousStateHash,
        bytes32 sessionId,
        uint64 sessionNonce,
        uint256 intentNotionalWad,
        uint64 intentDeadline,
        FrameInput calldata frame,
        CurveActionProof calldata proof,
        address account,
        int256 accountWethDeltaWad,
        int256 accountTokenDelta,
        int256 poolWethDeltaWad,
        int256 poolTokenDelta
    ) external returns (bytes32 nextStateHash);

    function depositToken(uint256 tokenAmount) external;
    function beginLiquidationBatch(bytes32 batchId, uint32 totalPositions, bytes32 positionsRoot) external;
    function commitVerifiedLiquidationChunk(bytes32 batchId, uint32 expectedCursor, FrameInput calldata frame, CurveActionProof[] calldata proofs) external returns (bytes32 nextStateHash);
    function expireLiquidationBatch() external;
    function curveMarginalPriceWad() external view returns (uint256);
    function curveCumulativeCostWad() external view returns (uint256);
    function custodySolvent() external view returns (bool);
}
