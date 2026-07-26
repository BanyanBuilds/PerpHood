// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILocalBattlePoolV21 {
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
        Withdraw
    }

    struct AccountBalance {
        uint256 wethWad;
        uint256 tokenAmount;
    }

    struct AccountDelta {
        address account;
        int256 wethDeltaWad;
        int256 tokenDelta;
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

    struct RealtimeStateView {
        uint64 sequence;
        uint64 committedAt;
        bytes32 marketId;
        ActionKind action;
        uint256 marginalPriceWad;
        uint256 marketCapWad;
        uint256 poolWethWad;
        uint256 poolTokenAmount;
        uint256 reservedWethWad;
        uint256 openInterestLongWad;
        uint256 openInterestShortWad;
        bytes32 positionsRoot;
        bytes32 balancesRoot;
        bytes32 stateHash;
    }

    event StateFrameCommitted(
        uint64 indexed sequence,
        bytes32 indexed stateHash,
        bytes32 indexed marketId,
        ActionKind action,
        uint256 marginalPriceWad,
        uint256 marketCapWad,
        uint256 poolWethWad,
        uint256 poolTokenAmount,
        uint256 reservedWethWad,
        bytes32 intentHash
    );

    function deposit() external payable;
    function seedPool() external payable;
    function withdrawWeth(uint256 amountWad) external;
    function withdrawToken(uint256 tokenAmount) external;
    function accountBalance(address account) external view returns (AccountBalance memory);
    function realtimeState() external view returns (RealtimeStateView memory);
    function runtimeState() external view returns (RealtimeStateView memory frame, uint256 availableWethWad, bool solvent);
    function custodySolvent() external view returns (bool);
    function availablePoolWethWad() external view returns (uint256);

    function commitFrame(
        uint64 expectedSequence,
        bytes32 expectedPreviousStateHash,
        FrameInput calldata frame,
        AccountDelta[] calldata deltas,
        int256 poolWethDeltaWad,
        int256 poolTokenDelta
    ) external returns (bytes32 nextStateHash);
}
