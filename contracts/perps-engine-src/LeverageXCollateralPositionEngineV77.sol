// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILeverageXPerpsRegistryV77 {
    function requireTradable(address token, address wallet, uint16 requestedLeverageX) external view;
    function market(address token) external view returns (
        address tokenAddress,
        address pool,
        address creator,
        uint24 poolFee,
        uint16 maxLeverageX,
        uint64 activatedAt,
        uint64 activatedBlock,
        bool active,
        bool exists
    );
}

interface ILeverageXMarkPriceOracleV77 {
    /// @notice Returns token price in wei of wrapped native per whole token, scaled to 1e18.
    function markPriceWad(address token) external view returns (uint256 priceWad, uint64 updatedAt);
}

/// @title LeverageXCollateralPositionEngineV77
/// @notice ETH-collateralized isolated-margin position engine for V76-approved markets.
/// @dev V77 is deliberately narrow: one position per wallet per market, no funding, no cross-margin,
///      no socialized losses, and no user balance may become negative. A production deployment still
///      requires independent audit, hardened oracle infrastructure, insurance capital, and keeper redundancy.
contract LeverageXCollateralPositionEngineV77 {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint16 public constant MAX_PROTOCOL_LEVERAGE_X = 20;

    enum Side { NONE, LONG, SHORT }

    struct Position {
        Side side;
        uint16 leverageX;
        uint64 openedAt;
        uint256 collateralWei;
        uint256 notionalWei;
        uint256 entryPriceWad;
    }

    struct RiskConfig {
        uint16 maintenanceMarginBps;
        uint16 openFeeBps;
        uint16 closeFeeBps;
        uint32 maxOracleAgeSeconds;
        uint256 maxPositionNotionalWei;
        bool enabled;
    }

    address public owner;
    address public pendingOwner;
    address public feeRecipient;
    ILeverageXPerpsRegistryV77 public immutable registry;
    ILeverageXMarkPriceOracleV77 public oracle;

    uint256 private _entered;
    uint256 public protocolFeesWei;
    uint256 public totalUserCollateralWei;

    mapping(address => uint256) public freeCollateralWei;
    mapping(address => mapping(address => Position)) private _positions;
    mapping(address => RiskConfig) public riskConfig;
    mapping(address => uint256) public longOpenInterestWei;
    mapping(address => uint256) public shortOpenInterestWei;
    mapping(address => bool) public liquidator;

    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OracleSet(address indexed oracle);
    event FeeRecipientSet(address indexed recipient);
    event LiquidatorSet(address indexed account, bool allowed);
    event RiskConfigSet(address indexed token, RiskConfig config);
    event CollateralDeposited(address indexed account, uint256 amountWei, uint256 newFreeCollateralWei);
    event CollateralWithdrawn(address indexed account, uint256 amountWei, uint256 newFreeCollateralWei);
    event PositionOpened(address indexed account, address indexed token, Side side, uint16 leverageX, uint256 collateralWei, uint256 notionalWei, uint256 entryPriceWad, uint256 feeWei);
    event PositionClosed(address indexed account, address indexed token, uint256 exitPriceWad, int256 pnlWei, uint256 payoutWei, uint256 feeWei);
    event PositionLiquidated(address indexed account, address indexed token, address indexed liquidator, uint256 markPriceWad, int256 pnlWei, uint256 remainingCollateralWei);
    event ProtocolFeesClaimed(address indexed recipient, uint256 amountWei);

    error OnlyOwner();
    error OnlyLiquidator();
    error Reentrancy();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidRiskConfig();
    error MarketDisabled();
    error PositionExists();
    error PositionMissing();
    error InsufficientCollateral();
    error OracleStale();
    error OraclePriceInvalid();
    error PositionNotLiquidatable();
    error TransferFailed();
    error Insolvent();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier nonReentrant() {
        if (_entered != 0) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(address owner_, address registry_, address oracle_, address feeRecipient_) {
        if (owner_ == address(0) || registry_ == address(0) || oracle_ == address(0) || feeRecipient_ == address(0)) revert InvalidAddress();
        owner = owner_;
        registry = ILeverageXPerpsRegistryV77(registry_);
        oracle = ILeverageXMarkPriceOracleV77(oracle_);
        feeRecipient = feeRecipient_;
        emit OwnershipTransferred(address(0), owner_);
        emit OracleSet(oracle_);
        emit FeeRecipientSet(feeRecipient_);
    }

    receive() external payable {
        revert InvalidAmount();
    }

    function beginOwnershipTransfer(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        pendingOwner = nextOwner;
        emit OwnershipTransferStarted(owner, nextOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyOwner();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    function setOracle(address oracle_) external onlyOwner {
        if (oracle_ == address(0)) revert InvalidAddress();
        oracle = ILeverageXMarkPriceOracleV77(oracle_);
        emit OracleSet(oracle_);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        feeRecipient = recipient;
        emit FeeRecipientSet(recipient);
    }

    function setLiquidator(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert InvalidAddress();
        liquidator[account] = allowed;
        emit LiquidatorSet(account, allowed);
    }

    function setRiskConfig(address token, RiskConfig calldata config) external onlyOwner {
        if (token == address(0) || config.maintenanceMarginBps == 0 || config.maintenanceMarginBps >= BPS) revert InvalidRiskConfig();
        if (config.openFeeBps > 500 || config.closeFeeBps > 500 || config.maxOracleAgeSeconds == 0 || config.maxPositionNotionalWei == 0) revert InvalidRiskConfig();
        riskConfig[token] = config;
        emit RiskConfigSet(token, config);
    }

    function depositCollateral() external payable nonReentrant {
        if (msg.value == 0) revert InvalidAmount();
        freeCollateralWei[msg.sender] += msg.value;
        totalUserCollateralWei += msg.value;
        emit CollateralDeposited(msg.sender, msg.value, freeCollateralWei[msg.sender]);
    }

    function withdrawCollateral(uint256 amountWei) external nonReentrant {
        if (amountWei == 0) revert InvalidAmount();
        uint256 free = freeCollateralWei[msg.sender];
        if (free < amountWei) revert InsufficientCollateral();
        freeCollateralWei[msg.sender] = free - amountWei;
        totalUserCollateralWei -= amountWei;
        _sendValue(msg.sender, amountWei);
        emit CollateralWithdrawn(msg.sender, amountWei, freeCollateralWei[msg.sender]);
    }

    function openPosition(address token, Side side, uint16 leverageX, uint256 collateralWei) external nonReentrant {
        if (side != Side.LONG && side != Side.SHORT) revert InvalidAmount();
        if (collateralWei == 0 || leverageX == 0 || leverageX > MAX_PROTOCOL_LEVERAGE_X) revert InvalidAmount();
        if (_positions[msg.sender][token].side != Side.NONE) revert PositionExists();

        registry.requireTradable(token, msg.sender, leverageX);
        RiskConfig memory config = riskConfig[token];
        if (!config.enabled) revert MarketDisabled();

        uint256 notionalWei = collateralWei * leverageX;
        if (notionalWei > config.maxPositionNotionalWei) revert InvalidAmount();
        uint256 openFeeWei = _mulDiv(notionalWei, config.openFeeBps, BPS);
        uint256 requiredWei = collateralWei + openFeeWei;
        uint256 free = freeCollateralWei[msg.sender];
        if (free < requiredWei) revert InsufficientCollateral();

        (uint256 markPriceWad,) = _freshPrice(token, config.maxOracleAgeSeconds);
        freeCollateralWei[msg.sender] = free - requiredWei;
        protocolFeesWei += openFeeWei;

        _positions[msg.sender][token] = Position({
            side: side,
            leverageX: leverageX,
            openedAt: uint64(block.timestamp),
            collateralWei: collateralWei,
            notionalWei: notionalWei,
            entryPriceWad: markPriceWad
        });

        if (side == Side.LONG) longOpenInterestWei[token] += notionalWei;
        else shortOpenInterestWei[token] += notionalWei;

        emit PositionOpened(msg.sender, token, side, leverageX, collateralWei, notionalWei, markPriceWad, openFeeWei);
    }

    function closePosition(address token) external nonReentrant {
        Position memory position = _positions[msg.sender][token];
        if (position.side == Side.NONE) revert PositionMissing();
        RiskConfig memory config = riskConfig[token];
        (uint256 markPriceWad,) = _freshPrice(token, config.maxOracleAgeSeconds);
        _settleClose(msg.sender, token, position, markPriceWad, config.closeFeeBps);
    }

    function liquidate(address account, address token) external nonReentrant {
        if (msg.sender != owner && !liquidator[msg.sender]) revert OnlyLiquidator();
        Position memory position = _positions[account][token];
        if (position.side == Side.NONE) revert PositionMissing();
        RiskConfig memory config = riskConfig[token];
        (uint256 markPriceWad,) = _freshPrice(token, config.maxOracleAgeSeconds);
        (int256 pnlWei, uint256 equityWei) = _equity(position, markPriceWad);
        uint256 maintenanceWei = _mulDiv(position.notionalWei, config.maintenanceMarginBps, BPS);
        if (equityWei > maintenanceWei) revert PositionNotLiquidatable();

        _removePosition(account, token, position);
        freeCollateralWei[account] += equityWei;
        emit PositionLiquidated(account, token, msg.sender, markPriceWad, pnlWei, equityWei);
    }

    function claimProtocolFees(uint256 amountWei) external onlyOwner nonReentrant {
        if (amountWei == 0 || amountWei > protocolFeesWei) revert InvalidAmount();
        protocolFeesWei -= amountWei;
        _assertSolvent(amountWei);
        _sendValue(feeRecipient, amountWei);
        emit ProtocolFeesClaimed(feeRecipient, amountWei);
    }

    function position(address account, address token) external view returns (Position memory) {
        return _positions[account][token];
    }

    function unrealizedPnlWei(address account, address token) external view returns (int256 pnlWei, uint256 equityWei, uint256 markPriceWad) {
        Position memory p = _positions[account][token];
        if (p.side == Side.NONE) revert PositionMissing();
        RiskConfig memory config = riskConfig[token];
        (markPriceWad,) = _freshPrice(token, config.maxOracleAgeSeconds);
        (pnlWei, equityWei) = _equity(p, markPriceWad);
    }

    function isLiquidatable(address account, address token) external view returns (bool) {
        Position memory p = _positions[account][token];
        if (p.side == Side.NONE) return false;
        RiskConfig memory config = riskConfig[token];
        (uint256 markPriceWad,) = _freshPrice(token, config.maxOracleAgeSeconds);
        (, uint256 equityWei) = _equity(p, markPriceWad);
        return equityWei <= _mulDiv(p.notionalWei, config.maintenanceMarginBps, BPS);
    }

    function vaultAssetsWei() external view returns (uint256) { return address(this).balance; }

    function _settleClose(address account, address token, Position memory p, uint256 markPriceWad, uint16 closeFeeBps) internal {
        (int256 pnlWei, uint256 equityWei) = _equity(p, markPriceWad);
        uint256 closeFeeWei = _mulDiv(p.notionalWei, closeFeeBps, BPS);
        if (closeFeeWei > equityWei) closeFeeWei = equityWei;
        uint256 payoutWei = equityWei - closeFeeWei;
        protocolFeesWei += closeFeeWei;
        _removePosition(account, token, p);
        freeCollateralWei[account] += payoutWei;
        emit PositionClosed(account, token, markPriceWad, pnlWei, payoutWei, closeFeeWei);
    }

    function _removePosition(address account, address token, Position memory p) internal {
        delete _positions[account][token];
        if (p.side == Side.LONG) longOpenInterestWei[token] -= p.notionalWei;
        else shortOpenInterestWei[token] -= p.notionalWei;
    }

    function _equity(Position memory p, uint256 markPriceWad) internal pure returns (int256 pnlWei, uint256 equityWei) {
        if (markPriceWad == 0 || p.entryPriceWad == 0) revert OraclePriceInvalid();
        int256 priceDelta = int256(markPriceWad) - int256(p.entryPriceWad);
        if (p.side == Side.SHORT) priceDelta = -priceDelta;
        pnlWei = (int256(p.notionalWei) * priceDelta) / int256(p.entryPriceWad);
        int256 rawEquity = int256(p.collateralWei) + pnlWei;
        equityWei = rawEquity <= 0 ? 0 : uint256(rawEquity);
    }

    function _freshPrice(address token, uint32 maxAge) internal view returns (uint256 priceWad, uint64 updatedAt) {
        (priceWad, updatedAt) = oracle.markPriceWad(token);
        if (priceWad == 0) revert OraclePriceInvalid();
        if (updatedAt > block.timestamp || block.timestamp - updatedAt > maxAge) revert OracleStale();
    }

    function _assertSolvent(uint256 outgoingWei) internal view {
        if (address(this).balance < outgoingWei || address(this).balance - outgoingWei < totalUserCollateralWei - protocolFeesWei) revert Insolvent();
    }

    function _sendValue(address to, uint256 amountWei) internal {
        (bool ok,) = payable(to).call{value: amountWei}("");
        if (!ok) revert TransferFailed();
    }

    function _mulDiv(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256) {
        return (x * y) / denominator;
    }
}
