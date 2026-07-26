// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILocalBattlePoolV23 {
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

    struct AccountBalance {
        uint256 wethWad;
        uint256 tokenAmount;
    }

    struct SessionAuthorization {
        address owner;
        bytes32 publicKeyHash;
        uint64 validUntil;
        uint64 nextNonce;
        uint256 maxNotionalWad;
        uint256 actionBitmap;
        bool active;
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

    function authorizeSession(bytes32 sessionId, bytes32 publicKeyHash, uint64 validUntil, uint256 maxNotionalWad, uint256 actionBitmap) external;
    function revokeSession(bytes32 sessionId) external;
    function sessionState(bytes32 sessionId) external view returns (SessionAuthorization memory);
    function accountBalance(address account) external view returns (AccountBalance memory);
    function deposit() external payable;
    function withdrawWeth(uint256 amountWad) external;
    function withdrawToken(uint256 tokenAmount) external;
    function commitAuthorizedSingleAccountFrame(
        uint64 expectedSequence,
        bytes32 expectedPreviousStateHash,
        bytes32 sessionId,
        uint64 sessionNonce,
        uint256 intentNotionalWad,
        uint64 intentDeadline,
        FrameInput calldata frame,
        address account,
        int256 accountWethDeltaWad,
        int256 accountTokenDelta,
        int256 poolWethDeltaWad,
        int256 poolTokenDelta
    ) external returns (bytes32 nextStateHash);
}
