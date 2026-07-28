// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPerpsRegistryV88 {
    function activateMarket(address token, address pool, uint16 maxLeverageX) external;
    function isTradable(address token, address wallet, uint16 requestedLeverageX) external view returns (bool);
}

interface IImmediatePerpsEngineV88 {
    struct RiskConfig {
        uint16 maintenanceMarginBps;
        uint16 openFeeBps;
        uint16 closeFeeBps;
        uint32 maxOracleAgeSeconds;
        uint256 maxPositionNotionalWei;
        bool enabled;
    }
    function bootstrapMintedMarket(address token, RiskConfig calldata config) external;
}

/// @title LeverageXImmediatePerpsHookV88
/// @notice Atomic mint hook: registers the canonical pool and enables perps risk in the same transaction.
contract LeverageXImmediatePerpsHookV88 {
    uint16 public constant MAX_LEVERAGE_X = 20;

    address public immutable launchFactory;
    IPerpsRegistryV88 public immutable registry;
    IImmediatePerpsEngineV88 public immutable engine;

    uint16 public immutable maintenanceMarginBps;
    uint16 public immutable openFeeBps;
    uint16 public immutable closeFeeBps;
    uint32 public immutable maxOracleAgeSeconds;
    uint256 public immutable bootstrapMaxPositionNotionalWei;

    event SpotAndPerpsBorn(
        address indexed token,
        address indexed pool,
        address indexed creator,
        uint16 maxLeverageX,
        uint256 maxPositionNotionalWei
    );

    error OnlyLaunchFactory();
    error InvalidAddress();
    error InvalidBootstrapRisk();
    error InvalidLeverage();

    constructor(
        address launchFactory_,
        address registry_,
        address engine_,
        uint16 maintenanceMarginBps_,
        uint16 openFeeBps_,
        uint16 closeFeeBps_,
        uint32 maxOracleAgeSeconds_,
        uint256 bootstrapMaxPositionNotionalWei_
    ) {
        if (launchFactory_ == address(0) || registry_ == address(0) || engine_ == address(0)) revert InvalidAddress();
        if (maintenanceMarginBps_ == 0 || maintenanceMarginBps_ >= 10_000 || openFeeBps_ > 500 || closeFeeBps_ > 500 || maxOracleAgeSeconds_ == 0 || bootstrapMaxPositionNotionalWei_ == 0) revert InvalidBootstrapRisk();
        launchFactory = launchFactory_;
        registry = IPerpsRegistryV88(registry_);
        engine = IImmediatePerpsEngineV88(engine_);
        maintenanceMarginBps = maintenanceMarginBps_;
        openFeeBps = openFeeBps_;
        closeFeeBps = closeFeeBps_;
        maxOracleAgeSeconds = maxOracleAgeSeconds_;
        bootstrapMaxPositionNotionalWei = bootstrapMaxPositionNotionalWei_;
    }

    function onMarketMinted(address token, address pool, address creator, uint24, uint16 maxLeverageX) external {
        if (msg.sender != launchFactory) revert OnlyLaunchFactory();
        if (token == address(0) || pool == address(0) || creator == address(0)) revert InvalidAddress();
        if (maxLeverageX == 0 || maxLeverageX > MAX_LEVERAGE_X) revert InvalidLeverage();

        registry.activateMarket(token, pool, maxLeverageX);
        engine.bootstrapMintedMarket(token, IImmediatePerpsEngineV88.RiskConfig({
            maintenanceMarginBps: maintenanceMarginBps,
            openFeeBps: openFeeBps,
            closeFeeBps: closeFeeBps,
            maxOracleAgeSeconds: maxOracleAgeSeconds,
            maxPositionNotionalWei: bootstrapMaxPositionNotionalWei,
            enabled: true
        }));

        emit SpotAndPerpsBorn(token, pool, creator, maxLeverageX, bootstrapMaxPositionNotionalWei);
    }
}
