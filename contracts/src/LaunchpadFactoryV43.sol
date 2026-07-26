// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "./BattleCurveMathV24.sol";

/// @notice Fixed-supply token used by the V43 unified local BattlePool.
/// @dev Reference-only and unaudited. The market initially custodies the full supply.
contract BattleTokenV43 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000_000 ether;
    address public immutable market;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error Unauthorized();
    error InvalidReceiver();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(string memory name_, string memory symbol_, address market_) {
        if (market_ == address(0)) revert InvalidReceiver();
        name = name_;
        symbol = symbol_;
        market = market_;
        balanceOf[market_] = totalSupply;
        emit Transfer(address(0), market_, totalSupply);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function marketTransfer(address to, uint256 value) external returns (bool) {
        if (msg.sender != market) revert Unauthorized();
        _transfer(market, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) revert InvalidReceiver();
        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = balance - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}

/// @notice Executable local Spot × Long × Sell × Short BattlePool.
/// @dev Native ETH is used only for the Anvil sandbox. Production must use canonical WETH,
///      audited custody, production oracles, redundant keepers, and explicit recovery controls.
contract LaunchpadMarketV43 {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_ALLOCATION = 800_000_000 ether;
    uint256 public constant INITIAL_PERP_ALLOCATION = 100_000_000 ether;
    uint256 public constant INITIAL_SAFETY_ALLOCATION = 100_000_000 ether;
    uint256 public constant OPENING_FDV_WAD = 0.25 ether;
    uint256 public constant OPENING_PRICE_WAD = OPENING_FDV_WAD * WAD / TOTAL_SUPPLY;
    uint256 public constant TRADE_FEE_BPS = 30;
    uint256 public constant PROTECTED_WETH_BPS = 100;
    uint256 public constant MAX_POOL_UTILIZATION_BPS = 7_200;
    uint256 public constant MAX_SOLD_BPS = 9_400;
    uint16 public constant MIN_LEVERAGE = 2;
    uint16 public constant MAX_LEVERAGE = 20;
    uint16 public constant MIN_MAINTENANCE_MARGIN_BPS = 150;
    uint16 public constant MAX_MAINTENANCE_MARGIN_BPS = 500;
    uint256 public constant MAX_AUTO_LIQUIDATIONS = 12;

    enum Phase { Bonding, Migrating, Migrated, Paused }
    enum Direction { Long, Short }
    enum ActionKind {
        Genesis,
        SpotBuy,
        SpotSell,
        OpenLong,
        OpenShort,
        CloseLong,
        CloseShort,
        LiquidateLong,
        LiquidateShort,
        RiskReserveSeed,
        RestrictionUpdate,
        MigrationBegin,
        MigrationCommit,
        Pause
    }

    struct Position {
        uint256 id;
        address owner;
        Direction direction;
        uint16 leverage;
        uint16 maintenanceMarginBps;
        uint64 openedAt;
        uint256 collateralWei;
        uint256 notionalWei;
        uint256 tokenAmountWad;
        uint256 debtWei;
        uint256 borrowedTokensWad;
        uint256 lockedProceedsWei;
        bool active;
    }

    struct RuntimeState {
        uint64 sequence;
        uint64 timestamp;
        Phase phase;
        uint256 marginalPriceWad;
        uint256 marketCapEthWad;
        uint256 realWethBalanceWei;
        uint256 freeWethWei;
        uint256 curveSoldTokenWad;
        uint256 curveTokenReserveWad;
        uint256 perpTokenReserveWad;
        uint256 safetyTokenReserveWad;
        uint256 lockedLongTokensWad;
        uint256 circulatingSpotTokensWad;
        uint256 borrowedShortTokensWad;
        uint256 openInterestLongWei;
        uint256 openInterestShortWei;
        uint256 activePositions;
        uint256 badDebtWei;
        bytes32 stateHash;
    }

    address public immutable factory;
    address public immutable creator;
    BattleTokenV43 public immutable token;
    bytes32 public immutable metadataHash;
    uint256 public immutable migrationTargetUsdWad;
    uint256 public immutable creatorGenesisBuyWei;

    uint256 public curveSoldTokenWad;
    uint256 public perpTokenReserveWad = INITIAL_PERP_ALLOCATION;
    uint256 public safetyTokenReserveWad = INITIAL_SAFETY_ALLOCATION;
    uint256 public lockedLongTokensWad;
    uint256 public circulatingSpotTokensWad;
    uint256 public borrowedShortTokensWad;

    uint256 public lockedCollateralWei;
    uint256 public lockedLongCollateralWei;
    uint256 public lockedShortCollateralWei;
    uint256 public lockedShortProceedsWei;
    uint256 public syntheticLongCreditWei;
    uint256 public cumulativeGrossWethWei;
    uint256 public cumulativeFeesWei;
    uint256 public liquidationEquityWei;
    uint256 public badDebtWei;
    uint256 public openInterestLongWei;
    uint256 public openInterestShortWei;
    uint256 public tradeCount;

    uint256 public nextPositionId = 1;
    uint256 public activePositionCount;
    mapping(uint256 => Position) private _positions;
    uint256[] private _activePositionIds;
    mapping(uint256 => uint256) private _activePositionIndexPlusOne;
    mapping(address => bool) public perpsRestricted;

    bytes32 public migrationGateDigest;
    uint64 public migratedAt;
    uint64 public stateSequence;
    bytes32 public stateHash;
    Phase public phase;
    bool private _entered;

    event Trade(
        address indexed trader,
        bool indexed isBuy,
        uint256 grossWethWei,
        uint256 tokenAmountWad,
        uint256 feeWethWei,
        uint256 soldAfterWad,
        uint256 marketCapEthWad
    );
    event PositionOpened(
        uint256 indexed positionId,
        address indexed owner,
        Direction indexed direction,
        uint16 leverage,
        uint256 collateralWei,
        uint256 notionalWei,
        uint256 tokenAmountWad,
        uint256 entryPriceWad,
        uint256 liquidationPriceWad
    );
    event PositionClosed(
        uint256 indexed positionId,
        address indexed owner,
        Direction indexed direction,
        bool liquidated,
        uint256 payoutWei,
        int256 pnlWei,
        uint256 feeWei,
        uint256 badDebtWei
    );
    event PerpsRestrictionUpdated(address indexed wallet, bool restricted);
    event RiskReserveSeeded(uint256 amountWei);
    event StateCommitted(
        uint64 indexed sequence,
        bytes32 indexed stateHash,
        ActionKind indexed action,
        address actor,
        uint256 marginalPriceWad,
        uint256 marketCapEthWad,
        uint256 realWethBalanceWei,
        uint256 freeWethWei,
        uint256 curveSoldTokenWad,
        uint256 openInterestLongWei,
        uint256 openInterestShortWei,
        uint256 activePositions
    );
    event MigrationStarted(bytes32 indexed gateDigest);
    event MigrationCommitted(bytes32 indexed gateDigest, uint64 migratedAt);
    event PhaseChanged(Phase indexed phase);

    error OnlyFactory();
    error PerpsForbidden();
    error InvalidPhase();
    error InvalidAmount();
    error InvalidLeverage();
    error InvalidMaintenanceMargin();
    error InvalidPosition();
    error NotPositionOwner();
    error PositionHealthy();
    error CapacityExceeded();
    error InsufficientLiquidity();
    error TransferFailed();
    error Reentrancy();
    error MigrationGateFailed();
    error LogicalTokenConservationFailed();
    error CollateralLedgerMismatch();
    error ShortInventoryMismatch();
    error InsolventPool();

    constructor(
        address creator_,
        string memory name_,
        string memory symbol_,
        bytes32 metadataHash_,
        uint256 migrationTargetUsdWad_
    ) payable {
        if (creator_ == address(0) || metadataHash_ == bytes32(0) || msg.value == 0) revert InvalidAmount();
        factory = msg.sender;
        creator = creator_;
        metadataHash = metadataHash_;
        migrationTargetUsdWad = migrationTargetUsdWad_;
        creatorGenesisBuyWei = msg.value;
        phase = Phase.Bonding;
        token = new BattleTokenV43(name_, symbol_, address(this));
        perpsRestricted[creator_] = true;
        emit PerpsRestrictionUpdated(creator_, true);
        _buy(creator_, msg.value, ActionKind.Genesis, false);
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    function curveParams(uint256 feeBps) public pure returns (BattleCurveMathV24.Params memory) {
        return BattleCurveMathV24.Params({
            allocationWad: CURVE_ALLOCATION,
            openingPriceWad: OPENING_PRICE_WAD,
            feeBps: feeBps,
            maxSoldBps: MAX_SOLD_BPS
        });
    }

    function position(uint256 positionId) external view returns (Position memory) {
        return _positions[positionId];
    }

    function activePositionIds() external view returns (uint256[] memory) {
        return _activePositionIds;
    }

    function curveTokenReserveWad() public view returns (uint256) {
        return CURVE_ALLOCATION - curveSoldTokenWad;
    }

    function marginalPriceWad() public view returns (uint256) {
        return BattleCurveMathV24.marginalPriceWad(curveSoldTokenWad, curveParams(0));
    }

    function marketCapEthWad() public view returns (uint256) {
        return marginalPriceWad() * TOTAL_SUPPLY / WAD;
    }

    function realWethBalanceWei() public view returns (uint256) {
        return address(this).balance;
    }

    function protectedWethWei() public view returns (uint256) {
        return address(this).balance * PROTECTED_WETH_BPS / BPS;
    }

    function positionObligationsWei() public view returns (uint256 obligations) {
        if (lockedLongTokensWad > 0) {
            BattleCurveMathV24.SellQuote memory longExit = BattleCurveMathV24.quoteSell(
                curveSoldTokenWad,
                lockedLongTokensWad,
                curveParams(0)
            );
            uint256 closeFee = _feeUp(longExit.grossCurveWethWad);
            if (longExit.grossCurveWethWad > syntheticLongCreditWei + closeFee) {
                obligations += longExit.grossCurveWethWad - syntheticLongCreditWei - closeFee;
            }
        }

        if (borrowedShortTokensWad > 0) {
            (uint256 virtualSold, bool closeable) = _virtualSoldWithSafety(borrowedShortTokensWad);
            uint256 maximumSold = BattleCurveMathV24.maxSoldWad(curveParams(0));
            if (!closeable || virtualSold + borrowedShortTokensWad > maximumSold) return type(uint256).max;
            BattleCurveMathV24.BuyQuote memory shortExit = BattleCurveMathV24.quoteBuyExactTokens(
                virtualSold,
                borrowedShortTokensWad,
                curveParams(0)
            );
            uint256 closeFee = _feeUp(shortExit.grossWethWad);
            uint256 funds = lockedShortCollateralWei + lockedShortProceedsWei;
            uint256 required = shortExit.grossWethWad + closeFee;
            if (funds > required) obligations += funds - required;
        }
    }

    function freeWethWei() public view returns (uint256) {
        uint256 obligations = positionObligationsWei();
        uint256 protectedAmount = protectedWethWei();
        if (obligations == type(uint256).max || obligations + protectedAmount >= address(this).balance) return 0;
        return address(this).balance - obligations - protectedAmount;
    }

    function maxCurveSoldWithShortReservationWad() public view returns (uint256) {
        uint256 maximumSold = BattleCurveMathV24.maxSoldWad(curveParams(0));
        return borrowedShortTokensWad >= maximumSold ? 0 : maximumSold - borrowedShortTokensWad;
    }

    function longNotionalCapacityWei(uint16 leverage) public view returns (uint256) {
        if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) return 0;
        uint256 maximumSafeSold = maxCurveSoldWithShortReservationWad();
        if (curveSoldTokenWad >= maximumSafeSold) return 0;
        uint256 currentCost = BattleCurveMathV24.cumulativeCostWad(curveSoldTokenWad, curveParams(0));
        uint256 maximumCost = BattleCurveMathV24.cumulativeCostWad(maximumSafeSold, curveParams(0));
        uint256 byCurve = maximumCost > currentCost ? maximumCost - currentCost : 0;
        uint256 riskWeth = freeWethWei() * MAX_POOL_UTILIZATION_BPS / BPS;
        uint256 byDebt = riskWeth * leverage / (leverage - 1);
        return _min(byCurve, byDebt);
    }

    function shortNotionalCapacityWei() public view returns (uint256) {
        uint256 closeabilityBuffer = curveSoldTokenWad > lockedLongTokensWad ? curveSoldTokenWad - lockedLongTokensWad : 0;
        uint256 sellableTokens = _min(perpTokenReserveWad, closeabilityBuffer);
        if (sellableTokens == 0) return 0;
        BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(
            curveSoldTokenWad,
            sellableTokens,
            curveParams(0)
        );
        uint256 riskWeth = freeWethWei() * MAX_POOL_UTILIZATION_BPS / BPS;
        return _min(quote.grossCurveWethWad, riskWeth);
    }

    function maxSpotSellTokensWad() public view returns (uint256) {
        uint256 curveCloseabilityBuffer = curveSoldTokenWad > lockedLongTokensWad
            ? curveSoldTokenWad - lockedLongTokensWad
            : 0;
        return _min(circulatingSpotTokensWad, curveCloseabilityBuffer);
    }

    function quoteOpenLong(uint256 collateralWei, uint16 leverage)
        public
        view
        returns (uint256 notionalWei, uint256 entryFeeWei, uint256 totalRequiredWei, uint256 tokenAmountWad)
    {
        _validateLeverage(leverage);
        if (collateralWei == 0) revert InvalidAmount();
        notionalWei = collateralWei * leverage;
        if (notionalWei > longNotionalCapacityWei(leverage)) revert CapacityExceeded();
        entryFeeWei = _feeUp(notionalWei);
        totalRequiredWei = collateralWei + entryFeeWei;
        tokenAmountWad = BattleCurveMathV24.quoteBuy(curveSoldTokenWad, notionalWei, curveParams(0)).tokenOutWad;
    }

    function quoteOpenShort(uint256 collateralWei, uint16 leverage)
        public
        view
        returns (
            uint256 notionalWei,
            uint256 entryFeeWei,
            uint256 totalRequiredWei,
            uint256 borrowedTokensWad,
            uint256 lockedProceedsWei
        )
    {
        _validateLeverage(leverage);
        if (collateralWei == 0) revert InvalidAmount();
        notionalWei = collateralWei * leverage;
        if (notionalWei > shortNotionalCapacityWei()) revert CapacityExceeded();
        (borrowedTokensWad, lockedProceedsWei) = _quoteShortTokensForTarget(notionalWei);
        if (borrowedTokensWad > perpTokenReserveWad) revert CapacityExceeded();
        entryFeeWei = _feeUp(notionalWei);
        totalRequiredWei = collateralWei + entryFeeWei;
    }

    function quotePositionEquityWei(uint256 positionId) public view returns (uint256 equityWei) {
        Position memory current = _positions[positionId];
        if (!current.active) return 0;
        if (current.direction == Direction.Long) {
            BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(
                curveSoldTokenWad,
                current.tokenAmountWad,
                curveParams(0)
            );
            uint256 closeFee = _feeUp(quote.grossCurveWethWad);
            uint256 required = current.debtWei + closeFee;
            return quote.grossCurveWethWad > required ? quote.grossCurveWethWad - required : 0;
        }
        (uint256 virtualSold, bool closeable) = _virtualSoldWithSafety(current.borrowedTokensWad);
        uint256 maximumSold = BattleCurveMathV24.maxSoldWad(curveParams(0));
        if (!closeable || virtualSold + current.borrowedTokensWad > maximumSold) return 0;
        BattleCurveMathV24.BuyQuote memory shortClose = BattleCurveMathV24.quoteBuyExactTokens(
            virtualSold,
            current.borrowedTokensWad,
            curveParams(0)
        );
        uint256 shortFee = _feeUp(shortClose.grossWethWad);
        uint256 funds = current.collateralWei + current.lockedProceedsWei;
        uint256 requiredFunds = shortClose.grossWethWad + shortFee;
        return funds > requiredFunds ? funds - requiredFunds : 0;
    }

    function maintenanceMarginWei(uint256 positionId) public view returns (uint256) {
        Position memory current = _positions[positionId];
        if (!current.active) return 0;
        return current.notionalWei * current.maintenanceMarginBps / BPS;
    }

    function isLiquidatable(uint256 positionId) public view returns (bool) {
        Position memory current = _positions[positionId];
        return current.active && quotePositionEquityWei(positionId) <= maintenanceMarginWei(positionId);
    }

    function estimatedLiquidationPriceWad(
        Direction direction,
        uint256 entryPriceWad,
        uint16 leverage,
        uint16 maintenanceMarginBps
    ) public pure returns (uint256) {
        uint256 usableMoveBps = BPS / leverage;
        usableMoveBps = usableMoveBps > maintenanceMarginBps + TRADE_FEE_BPS
            ? usableMoveBps - maintenanceMarginBps - TRADE_FEE_BPS
            : 100;
        if (direction == Direction.Long) return entryPriceWad * (BPS - usableMoveBps) / BPS;
        return entryPriceWad * (BPS + usableMoveBps) / BPS;
    }

    function runtimeState() external view returns (RuntimeState memory state) {
        state = RuntimeState({
            sequence: stateSequence,
            timestamp: uint64(block.timestamp),
            phase: phase,
            marginalPriceWad: marginalPriceWad(),
            marketCapEthWad: marketCapEthWad(),
            realWethBalanceWei: address(this).balance,
            freeWethWei: freeWethWei(),
            curveSoldTokenWad: curveSoldTokenWad,
            curveTokenReserveWad: curveTokenReserveWad(),
            perpTokenReserveWad: perpTokenReserveWad,
            safetyTokenReserveWad: safetyTokenReserveWad,
            lockedLongTokensWad: lockedLongTokensWad,
            circulatingSpotTokensWad: circulatingSpotTokensWad,
            borrowedShortTokensWad: borrowedShortTokensWad,
            openInterestLongWei: openInterestLongWei,
            openInterestShortWei: openInterestShortWei,
            activePositions: activePositionCount,
            badDebtWei: badDebtWei,
            stateHash: stateHash
        });
    }

    function buy() external payable nonReentrant returns (uint256 tokenOutWad) {
        _requireTrading();
        tokenOutWad = _buy(msg.sender, msg.value, ActionKind.SpotBuy, true);
    }

    function buyFor(address beneficiary) external payable nonReentrant returns (uint256 tokenOutWad) {
        _requireTrading();
        if (beneficiary == address(0)) revert InvalidAmount();
        tokenOutWad = _buy(beneficiary, msg.value, ActionKind.SpotBuy, true);
    }

    function sell(uint256 tokenAmountWad) external nonReentrant returns (uint256 netWethWei) {
        _requireTrading();
        if (tokenAmountWad == 0 || tokenAmountWad > maxSpotSellTokensWad()) revert CapacityExceeded();
        BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(
            curveSoldTokenWad,
            tokenAmountWad,
            curveParams(TRADE_FEE_BPS)
        );
        if (!token.transferFrom(msg.sender, address(this), tokenAmountWad)) revert TransferFailed();
        curveSoldTokenWad = quote.soldAfterWad;
        circulatingSpotTokensWad -= tokenAmountWad;
        cumulativeFeesWei += quote.feeWethWad;
        cumulativeGrossWethWei += quote.grossCurveWethWad;
        tradeCount += 1;
        netWethWei = quote.netWethWad;
        emit Trade(msg.sender, false, quote.grossCurveWethWad, tokenAmountWad, quote.feeWethWad, quote.soldAfterWad, marketCapEthWad());
        _commitState(ActionKind.SpotSell, msg.sender);
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertCanPay(netWethWei);
        _assertInvariants();
        (bool sent,) = payable(msg.sender).call{value: netWethWei}("");
        if (!sent) revert TransferFailed();
    }

    function openLong(uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei)
        external
        payable
        nonReentrant
        returns (uint256 positionId)
    {
        _requireTrading();
        _assertPerpsAllowed(msg.sender);
        _validateMaintenance(maintenanceMarginBps);
        (uint256 notionalWei, uint256 feeWei, uint256 totalRequiredWei, uint256 tokenAmountWad) = quoteOpenLong(collateralWei, leverage);
        if (msg.value != totalRequiredWei) revert InvalidAmount();
        BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuy(
            curveSoldTokenWad,
            notionalWei,
            curveParams(0)
        );
        if (quote.soldAfterWad > maxCurveSoldWithShortReservationWad()) revert CapacityExceeded();
        curveSoldTokenWad = quote.soldAfterWad;
        lockedLongTokensWad += tokenAmountWad;
        lockedCollateralWei += collateralWei;
        lockedLongCollateralWei += collateralWei;
        uint256 debtWei = notionalWei - collateralWei;
        syntheticLongCreditWei += debtWei;
        cumulativeFeesWei += feeWei;
        cumulativeGrossWethWei += notionalWei;
        openInterestLongWei += notionalWei;
        tradeCount += 1;
        positionId = _storePosition(Position({
            id: 0,
            owner: msg.sender,
            direction: Direction.Long,
            leverage: leverage,
            maintenanceMarginBps: maintenanceMarginBps,
            openedAt: uint64(block.timestamp),
            collateralWei: collateralWei,
            notionalWei: notionalWei,
            tokenAmountWad: tokenAmountWad,
            debtWei: debtWei,
            borrowedTokensWad: 0,
            lockedProceedsWei: 0,
            active: true
        }));
        uint256 entryPrice = quote.marginalPriceAfterWad;
        emit Trade(msg.sender, true, notionalWei, tokenAmountWad, feeWei, quote.soldAfterWad, marketCapEthWad());
        emit PositionOpened(positionId, msg.sender, Direction.Long, leverage, collateralWei, notionalWei, tokenAmountWad, entryPrice, estimatedLiquidationPriceWad(Direction.Long, entryPrice, leverage, maintenanceMarginBps));
        _commitState(ActionKind.OpenLong, msg.sender);
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertInvariants();
    }

    function openShort(uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei)
        external
        payable
        nonReentrant
        returns (uint256 positionId)
    {
        _requireTrading();
        _assertPerpsAllowed(msg.sender);
        _validateMaintenance(maintenanceMarginBps);
        (
            uint256 notionalWei,
            uint256 feeWei,
            uint256 totalRequiredWei,
            uint256 borrowedTokensWad,
            uint256 lockedProceedsWei
        ) = quoteOpenShort(collateralWei, leverage);
        if (msg.value != totalRequiredWei) revert InvalidAmount();
        if (borrowedTokensWad > perpTokenReserveWad) revert CapacityExceeded();
        uint256 soldBefore = curveSoldTokenWad;
        uint256 soldAfter = soldBefore - borrowedTokensWad;
        curveSoldTokenWad = soldAfter;
        perpTokenReserveWad -= borrowedTokensWad;
        borrowedShortTokensWad += borrowedTokensWad;
        lockedCollateralWei += collateralWei;
        lockedShortCollateralWei += collateralWei;
        lockedShortProceedsWei += lockedProceedsWei;
        cumulativeFeesWei += feeWei;
        cumulativeGrossWethWei += lockedProceedsWei;
        openInterestShortWei += notionalWei;
        tradeCount += 1;
        positionId = _storePosition(Position({
            id: 0,
            owner: msg.sender,
            direction: Direction.Short,
            leverage: leverage,
            maintenanceMarginBps: maintenanceMarginBps,
            openedAt: uint64(block.timestamp),
            collateralWei: collateralWei,
            notionalWei: notionalWei,
            tokenAmountWad: 0,
            debtWei: 0,
            borrowedTokensWad: borrowedTokensWad,
            lockedProceedsWei: lockedProceedsWei,
            active: true
        }));
        uint256 entryPrice = marginalPriceWad();
        emit Trade(msg.sender, false, lockedProceedsWei, borrowedTokensWad, feeWei, soldAfter, marketCapEthWad());
        emit PositionOpened(positionId, msg.sender, Direction.Short, leverage, collateralWei, notionalWei, borrowedTokensWad, entryPrice, estimatedLiquidationPriceWad(Direction.Short, entryPrice, leverage, maintenanceMarginBps));
        _commitState(ActionKind.OpenShort, msg.sender);
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertInvariants();
    }

    function closePosition(uint256 positionId) external nonReentrant returns (uint256 payoutWei) {
        _requireTrading();
        Position storage current = _positions[positionId];
        if (!current.active) revert InvalidPosition();
        if (current.owner != msg.sender) revert NotPositionOwner();
        payoutWei = _settlePosition(positionId, false, msg.sender);
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertCanPay(payoutWei);
        _assertInvariants();
        if (payoutWei > 0) {
            (bool sent,) = payable(msg.sender).call{value: payoutWei}("");
            if (!sent) revert TransferFailed();
        }
    }

    function liquidate(uint256 positionId) external nonReentrant returns (bool liquidated) {
        _requireTrading();
        if (!isLiquidatable(positionId)) revert PositionHealthy();
        _settlePosition(positionId, true, address(0));
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertInvariants();
        return true;
    }

    function liquidatePositions(uint256[] calldata positionIds) external nonReentrant returns (uint256 liquidatedCount) {
        _requireTrading();
        uint256 length = positionIds.length;
        if (length > 32) revert InvalidAmount();
        for (uint256 index; index < length; index++) {
            uint256 id = positionIds[index];
            if (_positions[id].active && isLiquidatable(id)) {
                _settlePosition(id, true, address(0));
                liquidatedCount += 1;
            }
        }
        _assertInvariants();
    }

    function seedRiskReserve() external payable onlyFactory {
        if (msg.value == 0) revert InvalidAmount();
        emit RiskReserveSeeded(msg.value);
        _commitState(ActionKind.RiskReserveSeed, msg.sender);
        _assertInvariants();
    }

    function setPerpsRestricted(address wallet, bool restricted) external onlyFactory {
        if (wallet == address(0) || wallet == creator && !restricted) revert PerpsForbidden();
        perpsRestricted[wallet] = restricted;
        emit PerpsRestrictionUpdated(wallet, restricted);
        _commitState(ActionKind.RestrictionUpdate, wallet);
    }

    function assertPerpsAllowed(address trader) external view {
        _assertPerpsAllowed(trader);
    }

    function beginMigration(bytes32 gateDigest) external onlyFactory {
        if (phase != Phase.Bonding || gateDigest == bytes32(0)) revert MigrationGateFailed();
        if (activePositionCount != 0 || badDebtWei != 0) revert MigrationGateFailed();
        migrationGateDigest = gateDigest;
        phase = Phase.Migrating;
        emit MigrationStarted(gateDigest);
        emit PhaseChanged(phase);
        _commitState(ActionKind.MigrationBegin, msg.sender);
    }

    function commitMigration(bytes32 gateDigest) external onlyFactory {
        if (phase != Phase.Migrating || gateDigest != migrationGateDigest) revert MigrationGateFailed();
        phase = Phase.Migrated;
        migratedAt = uint64(block.timestamp);
        emit MigrationCommitted(gateDigest, migratedAt);
        emit PhaseChanged(phase);
        _commitState(ActionKind.MigrationCommit, msg.sender);
    }

    function setPaused(bool paused) external onlyFactory {
        if (phase == Phase.Migrated && !paused) revert InvalidPhase();
        phase = paused ? Phase.Paused : Phase.Bonding;
        emit PhaseChanged(phase);
        _commitState(ActionKind.Pause, msg.sender);
    }

    function assertInvariants() external view returns (bool) {
        _assertInvariants();
        return true;
    }

    function _buy(address beneficiary, uint256 grossWethWei, ActionKind action, bool sweep)
        internal
        returns (uint256 tokenOutWad)
    {
        if (grossWethWei == 0) revert InvalidAmount();
        BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuy(
            curveSoldTokenWad,
            grossWethWei,
            curveParams(TRADE_FEE_BPS)
        );
        if (quote.soldAfterWad > maxCurveSoldWithShortReservationWad()) revert CapacityExceeded();
        curveSoldTokenWad = quote.soldAfterWad;
        circulatingSpotTokensWad += quote.tokenOutWad;
        cumulativeGrossWethWei += grossWethWei;
        cumulativeFeesWei += quote.feeWethWad;
        tradeCount += 1;
        tokenOutWad = quote.tokenOutWad;
        if (!token.marketTransfer(beneficiary, tokenOutWad)) revert TransferFailed();
        emit Trade(beneficiary, true, grossWethWei, tokenOutWad, quote.feeWethWad, quote.soldAfterWad, marketCapEthWad());
        _commitState(action, beneficiary);
        if (sweep) _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertInvariants();
    }

    function _settlePosition(uint256 positionId, bool liquidated, address payoutReceiver)
        internal
        returns (uint256 payoutWei)
    {
        Position storage current = _positions[positionId];
        if (!current.active) revert InvalidPosition();
        address owner = current.owner;
        Direction direction = current.direction;
        uint256 collateral = current.collateralWei;
        uint256 notional = current.notionalWei;
        uint256 closeFeeWei;
        uint256 localBadDebtWei;
        uint256 curveAmountWei;
        uint256 tokenAmountWad;

        if (direction == Direction.Long) {
            BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(
                curveSoldTokenWad,
                current.tokenAmountWad,
                curveParams(0)
            );
            curveSoldTokenWad = quote.soldAfterWad;
            curveAmountWei = quote.grossCurveWethWad;
            tokenAmountWad = current.tokenAmountWad;
            uint256 requiredDebt = current.debtWei;
            localBadDebtWei = requiredDebt > curveAmountWei ? requiredDebt - curveAmountWei : 0;
            uint256 surplus = curveAmountWei > requiredDebt ? curveAmountWei - requiredDebt : 0;
            closeFeeWei = _min(_feeUp(curveAmountWei), surplus);
            uint256 residual = surplus - closeFeeWei;
            payoutWei = liquidated ? 0 : residual;
            if (liquidated) liquidationEquityWei += residual;

            lockedLongTokensWad -= current.tokenAmountWad;
            lockedCollateralWei -= collateral;
            lockedLongCollateralWei -= collateral;
            syntheticLongCreditWei -= current.debtWei;
            openInterestLongWei -= notional;
            emit Trade(owner, false, curveAmountWei, tokenAmountWad, closeFeeWei, quote.soldAfterWad, marketCapEthWad());
        } else {
            uint256 safetyRelease = _releaseSafetyForShortRepayment(current.borrowedTokensWad);
            BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuyExactTokens(
                curveSoldTokenWad,
                current.borrowedTokensWad,
                curveParams(0)
            );
            curveSoldTokenWad = quote.soldAfterWad;
            curveAmountWei = quote.grossWethWad;
            tokenAmountWad = current.borrowedTokensWad;
            uint256 funds = collateral + current.lockedProceedsWei;
            localBadDebtWei = curveAmountWei > funds ? curveAmountWei - funds : 0;
            uint256 surplus = funds > curveAmountWei ? funds - curveAmountWei : 0;
            closeFeeWei = _min(_feeUp(curveAmountWei), surplus);
            uint256 residual = surplus - closeFeeWei;
            payoutWei = liquidated ? 0 : residual;
            if (liquidated) liquidationEquityWei += residual;

            lockedCollateralWei -= collateral;
            lockedShortCollateralWei -= collateral;
            lockedShortProceedsWei -= current.lockedProceedsWei;
            borrowedShortTokensWad -= current.borrowedTokensWad;
            perpTokenReserveWad += current.borrowedTokensWad;
            openInterestShortWei -= notional;
            safetyRelease;
            emit Trade(owner, true, curveAmountWei, tokenAmountWad, closeFeeWei, quote.soldAfterWad, marketCapEthWad());
        }

        cumulativeFeesWei += closeFeeWei;
        badDebtWei += localBadDebtWei;
        current.active = false;
        _removeActivePosition(positionId);
        int256 pnlWei = int256(payoutWei) - int256(collateral);
        emit PositionClosed(positionId, owner, direction, liquidated, payoutWei, pnlWei, closeFeeWei, localBadDebtWei);
        _commitState(
            liquidated
                ? (direction == Direction.Long ? ActionKind.LiquidateLong : ActionKind.LiquidateShort)
                : (direction == Direction.Long ? ActionKind.CloseLong : ActionKind.CloseShort),
            liquidated ? msg.sender : payoutReceiver
        );
    }

    function _sweepLiquidations(uint256 maximum) internal returns (uint256 processed) {
        uint256 index;
        while (index < _activePositionIds.length && processed < maximum) {
            uint256 positionId = _activePositionIds[index];
            if (isLiquidatable(positionId)) {
                _settlePosition(positionId, true, address(0));
                processed += 1;
            } else {
                index += 1;
            }
        }
    }

    function _storePosition(Position memory input) internal returns (uint256 positionId) {
        positionId = nextPositionId++;
        input.id = positionId;
        _positions[positionId] = input;
        _activePositionIds.push(positionId);
        _activePositionIndexPlusOne[positionId] = _activePositionIds.length;
        activePositionCount += 1;
    }

    function _removeActivePosition(uint256 positionId) internal {
        uint256 indexPlusOne = _activePositionIndexPlusOne[positionId];
        if (indexPlusOne == 0) return;
        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = _activePositionIds.length - 1;
        if (index != lastIndex) {
            uint256 replacement = _activePositionIds[lastIndex];
            _activePositionIds[index] = replacement;
            _activePositionIndexPlusOne[replacement] = index + 1;
        }
        _activePositionIds.pop();
        delete _activePositionIndexPlusOne[positionId];
        activePositionCount -= 1;
    }

    function _quoteShortTokensForTarget(uint256 targetProceedsWei)
        internal
        view
        returns (uint256 borrowedTokensWad, uint256 actualProceedsWei)
    {
        uint256 costBefore = BattleCurveMathV24.cumulativeCostWad(curveSoldTokenWad, curveParams(0));
        if (targetProceedsWei == 0 || targetProceedsWei > costBefore) revert CapacityExceeded();
        uint256 targetCostAfter = costBefore - targetProceedsWei;
        uint256 soldAfter = BattleCurveMathV24.soldAtCumulativeCostWad(targetCostAfter, curveParams(0));
        if (soldAfter >= curveSoldTokenWad || soldAfter < lockedLongTokensWad) revert CapacityExceeded();
        borrowedTokensWad = curveSoldTokenWad - soldAfter;
        actualProceedsWei = costBefore - BattleCurveMathV24.cumulativeCostWad(soldAfter, curveParams(0));
    }

    function _virtualSoldWithSafety(uint256 borrowedTokensWad)
        internal
        view
        returns (uint256 virtualSoldWad, bool closeable)
    {
        uint256 curveReserve = curveTokenReserveWad();
        if (borrowedTokensWad <= curveReserve) return (curveSoldTokenWad, true);
        uint256 shortage = borrowedTokensWad - curveReserve;
        if (shortage > safetyTokenReserveWad || shortage > curveSoldTokenWad) return (0, false);
        return (curveSoldTokenWad - shortage, true);
    }

    function _releaseSafetyForShortRepayment(uint256 borrowedTokensWad) internal returns (uint256 safetyRelease) {
        uint256 curveReserve = curveTokenReserveWad();
        if (borrowedTokensWad <= curveReserve) return 0;
        safetyRelease = borrowedTokensWad - curveReserve;
        if (safetyRelease > safetyTokenReserveWad || safetyRelease > curveSoldTokenWad) revert InsufficientLiquidity();
        safetyTokenReserveWad -= safetyRelease;
        curveSoldTokenWad -= safetyRelease;
    }

    function _commitState(ActionKind action, address actor) internal {
        unchecked { stateSequence += 1; }
        uint256 price = marginalPriceWad();
        uint256 cap = price * TOTAL_SUPPLY / WAD;
        bytes32 nextHash = keccak256(abi.encode(
            stateSequence,
            stateHash,
            uint8(action),
            actor,
            uint8(phase),
            price,
            cap,
            address(this).balance,
            curveSoldTokenWad,
            perpTokenReserveWad,
            safetyTokenReserveWad,
            lockedLongTokensWad,
            circulatingSpotTokensWad,
            borrowedShortTokensWad,
            openInterestLongWei,
            openInterestShortWei,
            activePositionCount,
            cumulativeFeesWei,
            badDebtWei
        ));
        stateHash = nextHash;
        emit StateCommitted(
            stateSequence,
            nextHash,
            action,
            actor,
            price,
            cap,
            address(this).balance,
            freeWethWei(),
            curveSoldTokenWad,
            openInterestLongWei,
            openInterestShortWei,
            activePositionCount
        );
    }

    function _assertCanPay(uint256 payoutWei) internal view {
        if (payoutWei > address(this).balance) revert InsufficientLiquidity();
        uint256 projectedBalance = address(this).balance - payoutWei;
        uint256 obligations = positionObligationsWei();
        uint256 projectedProtected = projectedBalance * PROTECTED_WETH_BPS / BPS;
        if (obligations == type(uint256).max || obligations + projectedProtected > projectedBalance) revert InsolventPool();
    }

    function _assertInvariants() internal view {
        uint256 accountedTokens = curveTokenReserveWad()
            + perpTokenReserveWad
            + safetyTokenReserveWad
            + lockedLongTokensWad
            + circulatingSpotTokensWad;
        if (accountedTokens != TOTAL_SUPPLY) revert LogicalTokenConservationFailed();
        if (lockedCollateralWei != lockedLongCollateralWei + lockedShortCollateralWei) revert CollateralLedgerMismatch();
        if (perpTokenReserveWad + borrowedShortTokensWad != INITIAL_PERP_ALLOCATION) {
            revert ShortInventoryMismatch();
        }
        uint256 obligations = positionObligationsWei();
        if (obligations == type(uint256).max || obligations + protectedWethWei() > address(this).balance) revert InsolventPool();
        if (token.balanceOf(address(this)) != accountedTokens - circulatingSpotTokensWad) revert LogicalTokenConservationFailed();
    }

    function _assertPerpsAllowed(address trader) internal view {
        if (trader == address(0) || perpsRestricted[trader]) revert PerpsForbidden();
    }

    function _requireTrading() internal view {
        if (phase != Phase.Bonding) revert InvalidPhase();
    }

    function _validateLeverage(uint16 leverage) internal pure {
        if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) revert InvalidLeverage();
    }

    function _validateMaintenance(uint16 maintenanceMarginBps) internal pure {
        if (maintenanceMarginBps < MIN_MAINTENANCE_MARGIN_BPS || maintenanceMarginBps > MAX_MAINTENANCE_MARGIN_BPS) {
            revert InvalidMaintenanceMargin();
        }
    }

    function _feeUp(uint256 amountWei) internal pure returns (uint256) {
        if (amountWei == 0) return 0;
        return (amountWei * TRADE_FEE_BPS + BPS - 1) / BPS;
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

/// @notice V43 local-chain factory for executable unified Spot × Perps markets.
contract LaunchpadFactoryV43 {
    uint256 public constant DEFAULT_MIGRATION_TARGET_USD_WAD = 45_000 ether;

    address public owner;
    address public sequencer;
    LaunchpadMarketV43[] public markets;
    mapping(address => address) public marketForToken;
    mapping(address => bool) public isMarket;

    event MarketCreated(
        address indexed market,
        address indexed token,
        address indexed creator,
        uint256 creatorGenesisBuyWei,
        uint256 migrationTargetUsdWad,
        bytes32 metadataHash
    );
    event SequencerChanged(address indexed previousSequencer, address indexed nextSequencer);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);

    error OnlyOwner();
    error InvalidAddress();
    error EmptyMetadata();
    error ZeroGenesisBuy();

    constructor(address owner_, address sequencer_) {
        owner = owner_ == address(0) ? msg.sender : owner_;
        if (sequencer_ == address(0)) revert InvalidAddress();
        sequencer = sequencer_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /// @dev msg.value is only the creator's curve-buy remainder. The UI/relayer reserves
    /// gas from the user's 0.001 ETH total launch budget before this transaction is formed.
    function createSandboxMarket(
        string calldata name,
        string calldata symbol,
        bytes32 metadataHash,
        uint256 migrationTargetUsdWad
    ) external payable returns (LaunchpadMarketV43 market, BattleTokenV43 token) {
        if (metadataHash == bytes32(0)) revert EmptyMetadata();
        if (msg.value == 0) revert ZeroGenesisBuy();
        uint256 target = migrationTargetUsdWad == 0 ? DEFAULT_MIGRATION_TARGET_USD_WAD : migrationTargetUsdWad;
        market = new LaunchpadMarketV43{value: msg.value}(msg.sender, name, symbol, metadataHash, target);
        token = market.token();
        markets.push(market);
        marketForToken[address(token)] = address(market);
        isMarket[address(market)] = true;
        emit MarketCreated(address(market), address(token), msg.sender, msg.value, target, metadataHash);
    }

    function seedRiskReserve(LaunchpadMarketV43 market) external payable onlyOwner {
        _requireMarket(market);
        market.seedRiskReserve{value: msg.value}();
    }

    function setPerpsRestricted(LaunchpadMarketV43 market, address wallet, bool restricted) external onlyOwner {
        _requireMarket(market);
        market.setPerpsRestricted(wallet, restricted);
    }

    function beginMigration(LaunchpadMarketV43 market, bytes32 gateDigest) external onlyOwner {
        _requireMarket(market);
        market.beginMigration(gateDigest);
    }

    function commitMigration(LaunchpadMarketV43 market, bytes32 gateDigest) external onlyOwner {
        _requireMarket(market);
        market.commitMigration(gateDigest);
    }

    function setPaused(LaunchpadMarketV43 market, bool paused) external onlyOwner {
        _requireMarket(market);
        market.setPaused(paused);
    }

    function setSequencer(address nextSequencer) external onlyOwner {
        if (nextSequencer == address(0)) revert InvalidAddress();
        address previous = sequencer;
        sequencer = nextSequencer;
        emit SequencerChanged(previous, nextSequencer);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        address previous = owner;
        owner = nextOwner;
        emit OwnershipTransferred(previous, nextOwner);
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function _requireMarket(LaunchpadMarketV43 market) internal view {
        if (!isMarket[address(market)]) revert InvalidAddress();
    }
}
