// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "./BattleCurveMathV24.sol";

/// @notice Fixed-supply token used by the V45 unified local BattlePool.
/// @dev Reference-only and unaudited. The market initially custodies the full supply.
contract BattleTokenV45 {
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

    /// @notice Lets the market pull tokens held by the trusted V45 account router.
    /// @dev The market is the only caller; account ownership is enforced by the router ledger.
    function marketPull(address from, uint256 value) external returns (bool) {
        if (msg.sender != market) revert Unauthorized();
        _transfer(from, market, value);
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
contract LaunchpadMarketV45 {
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

    /// @notice Exact immediate-close quote plus the post-close solvency result.
    /// @dev `payoutWei` is the amount the owner receives before considering the
    ///      entry fee already paid. `payableNow` is true only when the same
    ///      transition can preserve every remaining guaranteed liability.
    struct SettlementQuote {
        Direction direction;
        uint256 grossCurveWei;
        uint256 closeFeeWei;
        uint256 payoutWei;
        int256 pnlWei;
        uint256 badDebtWei;
        uint256 postCloseObligationsWei;
        uint256 projectedBalanceWei;
        bool payableNow;
        bool liquidatable;
    }

    /// @notice Machine-readable V50 invariant diagnostics for monitoring and formal harnesses.
    struct InvariantSnapshot {
        uint256 accountedTokensWad;
        uint256 marketTokenCustodyWad;
        uint256 realWethBalanceWei;
        uint256 guaranteedObligationsWei;
        uint256 protectedWethWei;
        uint256 lockedCollateralWei;
        uint256 collateralSubledgerWei;
        uint256 shortInventoryWad;
        uint256 expectedShortInventoryWad;
        bool logicalTokenConservation;
        bool tokenCustodyMatches;
        bool collateralLedgerMatches;
        bool shortInventoryMatches;
        bool solvent;
    }

    address public immutable factory;
    address public immutable creator;
    BattleTokenV45 public immutable token;
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
    error SlippageExceeded();
    error DeadlineExpired();

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
        token = new BattleTokenV45(name_, symbol_, address(this));
        perpsRestricted[creator_] = true;
        emit PerpsRestrictionUpdated(creator_, true);
        _buy(creator_, creator_, msg.value, ActionKind.Genesis, false);
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

    function positionOwner(uint256 positionId) external view returns (address) {
        return _positions[positionId].owner;
    }

    function positionDirection(uint256 positionId) external view returns (Direction) {
        return _positions[positionId].direction;
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

    /// @notice Current aggregate equity if all longs and all shorts were quoted independently now.
    /// @dev Useful for monitoring only. Solvency uses `positionObligationsWei`, which
    ///      also reserves the short floor-profit and the long-after-short-repayment extremes.
    function currentPositionObligationsWei() public view returns (uint256) {
        return _currentObligationsAt(
            curveSoldTokenWad,
            lockedLongTokensWad,
            syntheticLongCreditWei,
            borrowedShortTokensWad,
            lockedShortCollateralWei,
            lockedShortProceedsWei
        );
    }

    /// @notice Maximum aggregate short payout if the curve falls to its minimum sold state.
    /// @dev This is the exact shared-curve buyback, not `notional × percentage move`.
    function maximumShortFloorLiabilityWei() public view returns (uint256) {
        return _shortPayoutAt(
            0,
            borrowedShortTokensWad,
            lockedShortCollateralWei,
            lockedShortProceedsWei
        );
    }

    /// @notice Guaranteed liabilities reserved across the economically extreme close paths.
    /// @dev The reserve is intentionally conservative: shorts are protected at the curve floor,
    ///      and longs are protected after every currently open short has repaid first.
    function positionObligationsWei() public view returns (uint256) {
        return _guaranteedObligationsAt(
            curveSoldTokenWad,
            lockedLongTokensWad,
            syntheticLongCreditWei,
            borrowedShortTokensWad,
            lockedShortCollateralWei,
            lockedShortProceedsWei
        );
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
        BattleCurveMathV24.BuyQuote memory longOpen = BattleCurveMathV24.quoteBuy(
            curveSoldTokenWad,
            notionalWei,
            curveParams(0)
        );
        tokenAmountWad = longOpen.tokenOutWad;
        uint256 postObligations = _guaranteedObligationsAt(
            longOpen.soldAfterWad,
            lockedLongTokensWad + tokenAmountWad,
            syntheticLongCreditWei + notionalWei - collateralWei,
            borrowedShortTokensWad,
            lockedShortCollateralWei,
            lockedShortProceedsWei
        );
        uint256 postBalance = address(this).balance + totalRequiredWei;
        uint256 protectedAfter = postBalance * PROTECTED_WETH_BPS / BPS;
        if (postObligations == type(uint256).max || postObligations + protectedAfter > postBalance) {
            revert CapacityExceeded();
        }
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
        uint256 postObligations = _guaranteedObligationsAt(
            curveSoldTokenWad - borrowedTokensWad,
            lockedLongTokensWad,
            syntheticLongCreditWei,
            borrowedShortTokensWad + borrowedTokensWad,
            lockedShortCollateralWei + collateralWei,
            lockedShortProceedsWei + lockedProceedsWei
        );
        uint256 postBalance = address(this).balance + totalRequiredWei;
        uint256 protectedAfter = postBalance * PROTECTED_WETH_BPS / BPS;
        if (postObligations == type(uint256).max || postObligations + protectedAfter > postBalance) {
            revert CapacityExceeded();
        }
    }

    /// @notice Maximum payout for one short if the shared curve reaches its minimum sold state.
    function quoteMaximumShortPayoutWei(uint256 positionId) public view returns (uint256 payoutWei) {
        Position memory current = _positions[positionId];
        if (!current.active || current.direction != Direction.Short) return 0;
        return _shortPayoutAt(0, current.borrowedTokensWad, current.collateralWei, current.lockedProceedsWei);
    }

    /// @notice Exact immediate settlement quote and post-close solvency check.
    function quotePositionSettlement(uint256 positionId) public view returns (SettlementQuote memory result) {
        Position memory current = _positions[positionId];
        if (!current.active) return result;

        result.direction = current.direction;
        uint256 postSoldWad;
        uint256 postLongTokensWad = lockedLongTokensWad;
        uint256 postLongDebtWei = syntheticLongCreditWei;
        uint256 postBorrowedShortTokensWad = borrowedShortTokensWad;
        uint256 postShortCollateralWei = lockedShortCollateralWei;
        uint256 postShortProceedsWei = lockedShortProceedsWei;

        if (current.direction == Direction.Long) {
            BattleCurveMathV24.SellQuote memory longClose = BattleCurveMathV24.quoteSell(
                curveSoldTokenWad,
                current.tokenAmountWad,
                curveParams(0)
            );
            result.grossCurveWei = longClose.grossCurveWethWad;
            uint256 surplus = result.grossCurveWei > current.debtWei
                ? result.grossCurveWei - current.debtWei
                : 0;
            result.badDebtWei = current.debtWei > result.grossCurveWei
                ? current.debtWei - result.grossCurveWei
                : 0;
            result.closeFeeWei = _min(_feeUp(result.grossCurveWei), surplus);
            result.payoutWei = surplus - result.closeFeeWei;
            postSoldWad = longClose.soldAfterWad;
            postLongTokensWad -= current.tokenAmountWad;
            postLongDebtWei -= current.debtWei;
        } else {
            BattleCurveMathV24.BuyQuote memory shortClose = BattleCurveMathV24.quoteBuyExactTokens(
                curveSoldTokenWad,
                current.borrowedTokensWad,
                curveParams(0)
            );
            result.grossCurveWei = shortClose.grossWethWad;
            uint256 funds = current.collateralWei + current.lockedProceedsWei;
            result.badDebtWei = result.grossCurveWei > funds ? result.grossCurveWei - funds : 0;
            uint256 surplus = funds > result.grossCurveWei ? funds - result.grossCurveWei : 0;
            result.closeFeeWei = _min(_feeUp(result.grossCurveWei), surplus);
            result.payoutWei = surplus - result.closeFeeWei;
            postSoldWad = shortClose.soldAfterWad;
            postBorrowedShortTokensWad -= current.borrowedTokensWad;
            postShortCollateralWei -= current.collateralWei;
            postShortProceedsWei -= current.lockedProceedsWei;
        }

        result.pnlWei = int256(result.payoutWei) - int256(current.collateralWei);
        result.liquidatable = result.payoutWei <= current.notionalWei * current.maintenanceMarginBps / BPS;
        if (result.payoutWei <= address(this).balance) {
            result.projectedBalanceWei = address(this).balance - result.payoutWei;
            result.postCloseObligationsWei = _guaranteedObligationsAt(
                postSoldWad,
                postLongTokensWad,
                postLongDebtWei,
                postBorrowedShortTokensWad,
                postShortCollateralWei,
                postShortProceedsWei
            );
            uint256 protectedAfter = result.projectedBalanceWei * PROTECTED_WETH_BPS / BPS;
            result.payableNow = result.postCloseObligationsWei != type(uint256).max
                && result.postCloseObligationsWei + protectedAfter <= result.projectedBalanceWei;
        }
    }

    function quotePositionEquityWei(uint256 positionId) public view returns (uint256 equityWei) {
        return quotePositionSettlement(positionId).payoutWei;
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
        tokenOutWad = _buy(msg.sender, msg.sender, msg.value, ActionKind.SpotBuy, true);
    }

    /// @notice V51 direct-wallet buy with an explicit deadline and minimum output.
    function buyWithLimits(uint256 minTokenOutWad, uint64 deadline) external payable nonReentrant returns (uint256 tokenOutWad) {
        _requireDeadline(deadline);
        _requireTrading();
        tokenOutWad = _buy(msg.sender, msg.sender, msg.value, ActionKind.SpotBuy, true);
        if (tokenOutWad < minTokenOutWad) revert SlippageExceeded();
    }

    function buyFor(address beneficiary) external payable nonReentrant returns (uint256 tokenOutWad) {
        _requireTrading();
        if (beneficiary == address(0)) revert InvalidAmount();
        tokenOutWad = _buy(beneficiary, beneficiary, msg.value, ActionKind.SpotBuy, true);
    }

    /// @notice Account-router spot buy. Tokens are custodied by tokenRecipient while public events
    ///         and state attribution remain attached to the actual trading account.
    function buyForAccount(address account, address tokenRecipient)
        external
        payable
        onlyFactory
        nonReentrant
        returns (uint256 tokenOutWad)
    {
        _requireTrading();
        if (account == address(0) || tokenRecipient == address(0)) revert InvalidAmount();
        tokenOutWad = _buy(tokenRecipient, account, msg.value, ActionKind.SpotBuy, true);
    }

    function sell(uint256 tokenAmountWad) external nonReentrant returns (uint256 netWethWei) {
        _requireTrading();
        netWethWei = _sell(msg.sender, msg.sender, msg.sender, tokenAmountWad, false);
    }

    /// @notice V51 direct-wallet sell with an explicit deadline and minimum payout.
    function sellWithLimits(uint256 tokenAmountWad, uint256 minWethOutWei, uint64 deadline) external nonReentrant returns (uint256 netWethWei) {
        _requireDeadline(deadline);
        _requireTrading();
        netWethWei = _sell(msg.sender, msg.sender, msg.sender, tokenAmountWad, false);
        if (netWethWei < minWethOutWei) revert SlippageExceeded();
    }

    function sellForAccount(address account, address tokenOwner, address payoutReceiver, uint256 tokenAmountWad)
        external
        onlyFactory
        nonReentrant
        returns (uint256 netWethWei)
    {
        _requireTrading();
        if (account == address(0) || tokenOwner == address(0) || payoutReceiver == address(0)) revert InvalidAmount();
        netWethWei = _sell(tokenOwner, account, payoutReceiver, tokenAmountWad, true);
    }

    function _sell(address tokenOwner, address trader, address payoutReceiver, uint256 tokenAmountWad, bool routerPull)
        internal
        returns (uint256 netWethWei)
    {
        if (tokenAmountWad == 0 || tokenAmountWad > maxSpotSellTokensWad()) revert CapacityExceeded();
        BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(
            curveSoldTokenWad,
            tokenAmountWad,
            curveParams(TRADE_FEE_BPS)
        );
        bool pulled = routerPull
            ? token.marketPull(tokenOwner, tokenAmountWad)
            : token.transferFrom(tokenOwner, address(this), tokenAmountWad);
        if (!pulled) revert TransferFailed();
        curveSoldTokenWad = quote.soldAfterWad;
        circulatingSpotTokensWad -= tokenAmountWad;
        cumulativeFeesWei += quote.feeWethWad;
        cumulativeGrossWethWei += quote.grossCurveWethWad;
        tradeCount += 1;
        netWethWei = quote.netWethWad;
        emit Trade(trader, false, quote.grossCurveWethWad, tokenAmountWad, quote.feeWethWad, quote.soldAfterWad, marketCapEthWad());
        _commitState(ActionKind.SpotSell, trader);
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertCanPay(netWethWei);
        _assertInvariants();
        (bool sent,) = payable(payoutReceiver).call{value: netWethWei}("");
        if (!sent) revert TransferFailed();
    }

    function openLong(uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei)
        external payable nonReentrant returns (uint256 positionId)
    {
        positionId = _openLong(msg.sender, leverage, maintenanceMarginBps, collateralWei, msg.value);
    }

    /// @notice V51 direct-wallet long protected against stale entry quotes.
    function openLongWithLimits(
        uint16 leverage,
        uint16 maintenanceMarginBps,
        uint256 collateralWei,
        uint256 minTokenAmountWad,
        uint64 deadline
    ) external payable nonReentrant returns (uint256 positionId) {
        _requireDeadline(deadline);
        positionId = _openLong(msg.sender, leverage, maintenanceMarginBps, collateralWei, msg.value);
        if (_positions[positionId].tokenAmountWad < minTokenAmountWad) revert SlippageExceeded();
    }

    function openLongFor(address account, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei)
        external payable onlyFactory nonReentrant returns (uint256 positionId)
    {
        if (account == address(0)) revert InvalidAmount();
        positionId = _openLong(account, leverage, maintenanceMarginBps, collateralWei, msg.value);
    }

    function _openLong(address account, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei, uint256 suppliedWei)
        internal returns (uint256 positionId)
    {
        _requireTrading();
        _assertPerpsAllowed(account);
        _validateMaintenance(maintenanceMarginBps);
        (uint256 notionalWei, uint256 feeWei, uint256 totalRequiredWei, uint256 tokenAmountWad) = quoteOpenLong(collateralWei, leverage);
        if (suppliedWei != totalRequiredWei) revert InvalidAmount();
        BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuy(curveSoldTokenWad, notionalWei, curveParams(0));
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
            id: 0, owner: account, direction: Direction.Long, leverage: leverage,
            maintenanceMarginBps: maintenanceMarginBps, openedAt: uint64(block.timestamp),
            collateralWei: collateralWei, notionalWei: notionalWei, tokenAmountWad: tokenAmountWad,
            debtWei: debtWei, borrowedTokensWad: 0, lockedProceedsWei: 0, active: true
        }));
        uint256 entryPrice = quote.marginalPriceAfterWad;
        emit Trade(account, true, notionalWei, tokenAmountWad, feeWei, quote.soldAfterWad, marketCapEthWad());
        emit PositionOpened(positionId, account, Direction.Long, leverage, collateralWei, notionalWei, tokenAmountWad, entryPrice, estimatedLiquidationPriceWad(Direction.Long, entryPrice, leverage, maintenanceMarginBps));
        _commitState(ActionKind.OpenLong, account);
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertInvariants();
    }

    function openShort(uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei)
        external payable nonReentrant returns (uint256 positionId)
    {
        positionId = _openShort(msg.sender, leverage, maintenanceMarginBps, collateralWei, msg.value);
    }

    /// @notice V51 direct-wallet short protected against stale entry quotes.
    function openShortWithLimits(
        uint16 leverage,
        uint16 maintenanceMarginBps,
        uint256 collateralWei,
        uint256 maxBorrowedTokensWad,
        uint256 minLockedProceedsWei,
        uint64 deadline
    ) external payable nonReentrant returns (uint256 positionId) {
        _requireDeadline(deadline);
        positionId = _openShort(msg.sender, leverage, maintenanceMarginBps, collateralWei, msg.value);
        Position storage opened = _positions[positionId];
        if (opened.borrowedTokensWad > maxBorrowedTokensWad || opened.lockedProceedsWei < minLockedProceedsWei) revert SlippageExceeded();
    }

    function openShortFor(address account, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei)
        external payable onlyFactory nonReentrant returns (uint256 positionId)
    {
        if (account == address(0)) revert InvalidAmount();
        positionId = _openShort(account, leverage, maintenanceMarginBps, collateralWei, msg.value);
    }

    function _openShort(address account, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei, uint256 suppliedWei)
        internal returns (uint256 positionId)
    {
        _requireTrading();
        _assertPerpsAllowed(account);
        _validateMaintenance(maintenanceMarginBps);
        (uint256 notionalWei, uint256 feeWei, uint256 totalRequiredWei, uint256 borrowedTokensWad, uint256 lockedProceedsWei) = quoteOpenShort(collateralWei, leverage);
        if (suppliedWei != totalRequiredWei) revert InvalidAmount();
        if (borrowedTokensWad > perpTokenReserveWad) revert CapacityExceeded();
        uint256 soldAfter = curveSoldTokenWad - borrowedTokensWad;
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
            id: 0, owner: account, direction: Direction.Short, leverage: leverage,
            maintenanceMarginBps: maintenanceMarginBps, openedAt: uint64(block.timestamp),
            collateralWei: collateralWei, notionalWei: notionalWei, tokenAmountWad: 0,
            debtWei: 0, borrowedTokensWad: borrowedTokensWad, lockedProceedsWei: lockedProceedsWei, active: true
        }));
        uint256 entryPrice = marginalPriceWad();
        emit Trade(account, false, lockedProceedsWei, borrowedTokensWad, feeWei, soldAfter, marketCapEthWad());
        emit PositionOpened(positionId, account, Direction.Short, leverage, collateralWei, notionalWei, borrowedTokensWad, entryPrice, estimatedLiquidationPriceWad(Direction.Short, entryPrice, leverage, maintenanceMarginBps));
        _commitState(ActionKind.OpenShort, account);
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertInvariants();
    }

    function closePosition(uint256 positionId) external nonReentrant returns (uint256 payoutWei) {
        _requireTrading();
        Position storage current = _positions[positionId];
        if (!current.active) revert InvalidPosition();
        if (current.owner != msg.sender) revert NotPositionOwner();
        payoutWei = _closePosition(positionId, msg.sender, msg.sender);
    }

    /// @notice V51 direct-wallet close protected against a stale payout quote.
    function closePositionWithLimits(uint256 positionId, uint256 minPayoutWei, uint64 deadline) external nonReentrant returns (uint256 payoutWei) {
        _requireDeadline(deadline);
        _requireTrading();
        Position storage current = _positions[positionId];
        if (!current.active) revert InvalidPosition();
        if (current.owner != msg.sender) revert NotPositionOwner();
        payoutWei = _closePosition(positionId, msg.sender, msg.sender);
        if (payoutWei < minPayoutWei) revert SlippageExceeded();
    }

    function closePositionFor(uint256 positionId, address account, address payoutReceiver)
        external onlyFactory nonReentrant returns (uint256 payoutWei)
    {
        _requireTrading();
        Position storage current = _positions[positionId];
        if (!current.active) revert InvalidPosition();
        if (current.owner != account || payoutReceiver == address(0)) revert NotPositionOwner();
        payoutWei = _closePosition(positionId, account, payoutReceiver);
    }

    function _closePosition(uint256 positionId, address account, address payoutReceiver) internal returns (uint256 payoutWei) {
        payoutWei = _settlePosition(positionId, false, account);
        _sweepLiquidations(MAX_AUTO_LIQUIDATIONS);
        _assertCanPay(payoutWei);
        _assertInvariants();
        if (payoutWei > 0) {
            (bool sent,) = payable(payoutReceiver).call{value: payoutWei}("");
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

    function invariantSnapshot() external view returns (InvariantSnapshot memory snapshot) {
        uint256 accountedTokens = curveTokenReserveWad()
            + perpTokenReserveWad
            + safetyTokenReserveWad
            + lockedLongTokensWad
            + circulatingSpotTokensWad;
        uint256 custody = token.balanceOf(address(this));
        uint256 obligations = positionObligationsWei();
        uint256 protectedAmount = protectedWethWei();
        uint256 collateralSubledger = lockedLongCollateralWei + lockedShortCollateralWei;
        uint256 shortInventory = perpTokenReserveWad + borrowedShortTokensWad;
        snapshot = InvariantSnapshot({
            accountedTokensWad: accountedTokens,
            marketTokenCustodyWad: custody,
            realWethBalanceWei: address(this).balance,
            guaranteedObligationsWei: obligations,
            protectedWethWei: protectedAmount,
            lockedCollateralWei: lockedCollateralWei,
            collateralSubledgerWei: collateralSubledger,
            shortInventoryWad: shortInventory,
            expectedShortInventoryWad: INITIAL_PERP_ALLOCATION,
            logicalTokenConservation: accountedTokens == TOTAL_SUPPLY,
            tokenCustodyMatches: custody == accountedTokens - circulatingSpotTokensWad,
            collateralLedgerMatches: lockedCollateralWei == collateralSubledger,
            shortInventoryMatches: shortInventory == INITIAL_PERP_ALLOCATION,
            solvent: obligations != type(uint256).max && obligations + protectedAmount <= address(this).balance
        });
    }

    function _buy(address tokenRecipient, address trader, uint256 grossWethWei, ActionKind action, bool sweep)
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
        if (!token.marketTransfer(tokenRecipient, tokenOutWad)) revert TransferFailed();
        emit Trade(trader, true, grossWethWei, tokenOutWad, quote.feeWethWad, quote.soldAfterWad, marketCapEthWad());
        _commitState(action, trader);
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

    function _longPayoutAt(
        uint256 soldWad,
        uint256 longTokensWad,
        uint256 longDebtWei
    ) internal pure returns (uint256 payoutWei) {
        if (longTokensWad == 0) return 0;
        if (longTokensWad > soldWad) return type(uint256).max;
        BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(
            soldWad,
            longTokensWad,
            curveParams(0)
        );
        uint256 surplus = quote.grossCurveWethWad > longDebtWei
            ? quote.grossCurveWethWad - longDebtWei
            : 0;
        uint256 feeWei = _min(_feeUp(quote.grossCurveWethWad), surplus);
        return surplus - feeWei;
    }

    function _shortPayoutAt(
        uint256 soldWad,
        uint256 borrowedTokensWad,
        uint256 shortCollateralWei,
        uint256 shortProceedsWei
    ) internal pure returns (uint256 payoutWei) {
        if (borrowedTokensWad == 0) return 0;
        uint256 maximumSold = BattleCurveMathV24.maxSoldWad(curveParams(0));
        if (soldWad + borrowedTokensWad > maximumSold) return type(uint256).max;
        BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuyExactTokens(
            soldWad,
            borrowedTokensWad,
            curveParams(0)
        );
        uint256 funds = shortCollateralWei + shortProceedsWei;
        if (quote.grossWethWad >= funds) return 0;
        uint256 surplus = funds - quote.grossWethWad;
        uint256 feeWei = _min(_feeUp(quote.grossWethWad), surplus);
        return surplus - feeWei;
    }

    function _currentObligationsAt(
        uint256 soldWad,
        uint256 longTokensWad,
        uint256 longDebtWei,
        uint256 borrowedTokensWad,
        uint256 shortCollateralWei,
        uint256 shortProceedsWei
    ) internal pure returns (uint256 obligationsWei) {
        uint256 longPayout = _longPayoutAt(soldWad, longTokensWad, longDebtWei);
        uint256 shortPayout = _shortPayoutAt(soldWad, borrowedTokensWad, shortCollateralWei, shortProceedsWei);
        if (longPayout == type(uint256).max || shortPayout == type(uint256).max) return type(uint256).max;
        return longPayout + shortPayout;
    }

    function _guaranteedObligationsAt(
        uint256 soldWad,
        uint256 longTokensWad,
        uint256,
        uint256 borrowedTokensWad,
        uint256 shortCollateralWei,
        uint256 shortProceedsWei
    ) internal pure returns (uint256 obligationsWei) {
        uint256 maximumSold = BattleCurveMathV24.maxSoldWad(curveParams(0));
        if (soldWad > maximumSold || soldWad + borrowedTokensWad > maximumSold) return type(uint256).max;

        // Individual positions may have different debt/fund profiles. Netting those profiles
        // in one aggregate quote can under-reserve profitable positions when another position
        // is underwater. The guaranteed reserve therefore never nets position liabilities:
        // every short keeps all collateral + locked proceeds reserved, and every long keeps
        // the full gross curve exit reserved at the highest state reachable by existing
        // short repayments. Fees and debt can only make the eventual payout smaller.
        uint256 longGrossExtreme;
        if (longTokensWad > 0) {
            uint256 longExtremeSold = soldWad + borrowedTokensWad;
            if (longTokensWad > longExtremeSold) return type(uint256).max;
            BattleCurveMathV24.SellQuote memory longExit = BattleCurveMathV24.quoteSell(
                longExtremeSold,
                longTokensWad,
                curveParams(0)
            );
            longGrossExtreme = longExit.grossCurveWethWad;
        }
        return longGrossExtreme + shortCollateralWei + shortProceedsWei;
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

    function _requireDeadline(uint64 deadline) internal view {
        if (deadline < block.timestamp) revert DeadlineExpired();
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

/// @notice V45 account router + launchpad factory for authorized, gas-sponsored BattlePool execution.
/// @dev The account ledger is fully on-chain in this local reference build. A production deployment
///      still requires canonical WETH, audited upgrade/recovery controls, hardened relayers, and external review.
contract LaunchpadFactoryV45 {
    uint256 public constant DEFAULT_MIGRATION_TARGET_USD_WAD = 45_000 ether;

    enum ExecutionMode { Normal, CloseOnly, Paused }
    enum SessionAction { Invalid, SpotBuy, SpotSell, OpenLong, OpenShort, CloseLong, CloseShort }

    struct SessionAuthorization {
        address owner;
        bytes32 publicKeyHash;
        uint64 validUntil;
        uint64 nextNonce;
        uint256 maxNotionalWei;
        uint256 maxCumulativeNotionalWei;
        uint256 spentNotionalWei;
        uint256 actionBitmap;
        bool active;
    }

    address public owner;
    address public sequencer;
    ExecutionMode public executionMode;
    LaunchpadMarketV45[] public markets;
    mapping(address => address) public marketForToken;
    mapping(address => bool) public isMarket;

    mapping(address => uint256) public wethBalanceWei;
    mapping(address => mapping(address => uint256)) public tokenBalanceWad;
    uint256 public totalWethLiabilityWei;
    mapping(address => uint256) public totalTokenLiabilityWad;

    mapping(bytes32 => SessionAuthorization) private _sessions;
    mapping(bytes32 => bool) public consumedIntent;
    bool private _entered;

    event MarketCreated(address indexed market, address indexed token, address indexed creator, uint256 creatorGenesisBuyWei, uint256 migrationTargetUsdWad, bytes32 metadataHash);
    event Deposited(address indexed account, uint256 amountWei, uint256 balanceAfterWei);
    event Withdrawn(address indexed account, uint256 amountWei, uint256 balanceAfterWei);
    event TokenDeposited(address indexed account, address indexed market, uint256 amountWad, uint256 balanceAfterWad);
    event TokenWithdrawn(address indexed account, address indexed market, uint256 amountWad, uint256 balanceAfterWad);
    event SessionAuthorized(bytes32 indexed sessionId, address indexed account, bytes32 publicKeyHash, uint64 validUntil, uint256 maxNotionalWei, uint256 maxCumulativeNotionalWei, uint256 actionBitmap);
    event SessionRevoked(bytes32 indexed sessionId, address indexed account);
    event SessionNonceConsumed(bytes32 indexed sessionId, uint64 indexed nonce, bytes32 indexed intentHash, uint256 notionalWei, uint256 spentAfterWei);
    event AccountExecution(address indexed account, address indexed market, SessionAction indexed action, uint256 inputAmount, uint256 outputAmount, uint256 positionId, bytes32 intentHash);
    event ExecutionModeChanged(ExecutionMode indexed previousMode, ExecutionMode indexed nextMode);
    event SequencerChanged(address indexed previousSequencer, address indexed nextSequencer);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);

    error OnlyOwner();
    error OnlySequencer();
    error InvalidAddress();
    error EmptyMetadata();
    error ZeroGenesisBuy();
    error InvalidAmount();
    error InsufficientAccountBalance();
    error InvalidSession();
    error SessionInactive();
    error SessionExpired();
    error SessionNonceMismatch();
    error SessionActionNotAllowed();
    error SessionLimitExceeded();
    error IntentAlreadyConsumed();
    error SlippageExceeded();
    error OpeningDisabled();
    error MarketActionsPaused();
    error CustodyInsolvent();
    error Reentrancy();
    error DeadlineExpired();

    constructor(address owner_, address sequencer_) {
        owner = owner_ == address(0) ? msg.sender : owner_;
        if (sequencer_ == address(0)) revert InvalidAddress();
        sequencer = sequencer_;
        executionMode = ExecutionMode.Normal;
    }

    /// @dev Market payouts return custody to the router and are credited exactly once by the calling settlement path.
    ///      Plain wallet transfers still behave as deposits for local convenience.
    receive() external payable {
        if (isMarket[msg.sender]) return;
        _deposit(msg.sender, msg.value);
    }

    modifier onlyOwner() { if (msg.sender != owner) revert OnlyOwner(); _; }
    modifier onlySequencer() { if (msg.sender != sequencer) revert OnlySequencer(); _; }
    modifier nonReentrant() { if (_entered) revert Reentrancy(); _entered = true; _; _entered = false; }

    function sessionState(bytes32 sessionId) external view returns (SessionAuthorization memory) { return _sessions[sessionId]; }

    function accountState(address account, LaunchpadMarketV45 market)
        external view
        returns (uint256 accountWethWei, uint256 accountTokenWad, uint256 routerEthWei, uint256 routerTokenWad, uint256 wethLiabilityWei, uint256 tokenLiabilityWad, bool solvent)
    {
        _requireMarket(market);
        BattleTokenV45 token = market.token();
        accountWethWei = wethBalanceWei[account];
        accountTokenWad = tokenBalanceWad[account][address(market)];
        routerEthWei = address(this).balance;
        routerTokenWad = token.balanceOf(address(this));
        wethLiabilityWei = totalWethLiabilityWei;
        tokenLiabilityWad = totalTokenLiabilityWad[address(market)];
        solvent = routerEthWei >= wethLiabilityWei && routerTokenWad >= tokenLiabilityWad;
    }

    function deposit() external payable nonReentrant { _deposit(msg.sender, msg.value); }

    function withdraw(uint256 amountWei) external nonReentrant {
        _debitWeth(msg.sender, amountWei);
        (bool sent,) = payable(msg.sender).call{value: amountWei}("");
        if (!sent) revert CustodyInsolvent();
        _assertWethCustody();
        emit Withdrawn(msg.sender, amountWei, wethBalanceWei[msg.sender]);
    }

    function depositToken(LaunchpadMarketV45 market, uint256 amountWad) external nonReentrant {
        _requireMarket(market);
        if (amountWad == 0) revert InvalidAmount();
        BattleTokenV45 token = market.token();
        if (!token.transferFrom(msg.sender, address(this), amountWad)) revert CustodyInsolvent();
        tokenBalanceWad[msg.sender][address(market)] += amountWad;
        totalTokenLiabilityWad[address(market)] += amountWad;
        _assertTokenCustody(market);
        emit TokenDeposited(msg.sender, address(market), amountWad, tokenBalanceWad[msg.sender][address(market)]);
    }

    function withdrawToken(LaunchpadMarketV45 market, uint256 amountWad) external nonReentrant {
        _requireMarket(market);
        _debitToken(msg.sender, market, amountWad);
        if (!market.token().transfer(msg.sender, amountWad)) revert CustodyInsolvent();
        _assertTokenCustody(market);
        emit TokenWithdrawn(msg.sender, address(market), amountWad, tokenBalanceWad[msg.sender][address(market)]);
    }

    function authorizeSession(bytes32 sessionId, bytes32 publicKeyHash, uint64 validUntil, uint256 maxNotionalWei, uint256 maxCumulativeNotionalWei, uint256 actionBitmap) external {
        if (sessionId == bytes32(0) || publicKeyHash == bytes32(0) || validUntil <= block.timestamp || maxNotionalWei == 0 || maxCumulativeNotionalWei < maxNotionalWei || actionBitmap == 0) revert InvalidSession();
        SessionAuthorization storage current = _sessions[sessionId];
        if (current.owner != address(0) && current.owner != msg.sender) revert InvalidSession();
        uint64 preservedNonce = current.nextNonce;
        uint256 preservedSpend = current.spentNotionalWei;
        _sessions[sessionId] = SessionAuthorization(msg.sender, publicKeyHash, validUntil, preservedNonce, maxNotionalWei, maxCumulativeNotionalWei, preservedSpend, actionBitmap, true);
        emit SessionAuthorized(sessionId, msg.sender, publicKeyHash, validUntil, maxNotionalWei, maxCumulativeNotionalWei, actionBitmap);
    }

    function revokeSession(bytes32 sessionId) external {
        SessionAuthorization storage session = _sessions[sessionId];
        if (session.owner != msg.sender) revert InvalidSession();
        session.active = false;
        emit SessionRevoked(sessionId, msg.sender);
    }

    function spotBuyFromBalance(LaunchpadMarketV45 market, uint256 grossWethWei, uint256 minTokenOutWad) external nonReentrant returns (uint256 tokenOutWad) {
        _requireOpeningAllowed();
        tokenOutWad = _spotBuy(msg.sender, market, grossWethWei, minTokenOutWad, bytes32(0));
    }

    function spotSellFromBalance(LaunchpadMarketV45 market, uint256 tokenAmountWad, uint256 minWethOutWei) external nonReentrant returns (uint256 netWethWei) {
        _requireCloseAllowed();
        netWethWei = _spotSell(msg.sender, market, tokenAmountWad, minWethOutWei, bytes32(0));
    }

    function spotBuyFromBalanceWithLimits(
        LaunchpadMarketV45 market, uint256 grossWethWei, uint256 minTokenOutWad, uint64 deadline
    ) external nonReentrant returns (uint256 tokenOutWad) {
        _requireDeadline(deadline);
        _requireOpeningAllowed();
        tokenOutWad = _spotBuy(msg.sender, market, grossWethWei, minTokenOutWad, bytes32(0));
    }

    function spotSellFromBalanceWithLimits(
        LaunchpadMarketV45 market, uint256 tokenAmountWad, uint256 minWethOutWei, uint64 deadline
    ) external nonReentrant returns (uint256 netWethWei) {
        _requireDeadline(deadline);
        _requireCloseAllowed();
        netWethWei = _spotSell(msg.sender, market, tokenAmountWad, minWethOutWei, bytes32(0));
    }

    function openLongFromBalance(LaunchpadMarketV45 market, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei) external nonReentrant returns (uint256 positionId) {
        _requireOpeningAllowed();
        positionId = _openPosition(msg.sender, market, false, leverage, maintenanceMarginBps, collateralWei, bytes32(0));
    }

    function openShortFromBalance(LaunchpadMarketV45 market, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei) external nonReentrant returns (uint256 positionId) {
        _requireOpeningAllowed();
        positionId = _openPosition(msg.sender, market, true, leverage, maintenanceMarginBps, collateralWei, bytes32(0));
    }

    function closePositionFromBalance(LaunchpadMarketV45 market, uint256 positionId) external nonReentrant returns (uint256 payoutWei) {
        _requireCloseAllowed();
        payoutWei = _closePosition(msg.sender, market, positionId, bytes32(0));
    }

    function openLongFromBalanceWithLimits(
        LaunchpadMarketV45 market, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei,
        uint256 minTokenAmountWad, uint64 deadline
    ) external nonReentrant returns (uint256 positionId) {
        _requireDeadline(deadline);
        _requireOpeningAllowed();
        positionId = _openPosition(msg.sender, market, false, leverage, maintenanceMarginBps, collateralWei, bytes32(0));
        LaunchpadMarketV45.Position memory opened = market.position(positionId);
        if (opened.tokenAmountWad < minTokenAmountWad) revert SlippageExceeded();
    }

    function openShortFromBalanceWithLimits(
        LaunchpadMarketV45 market, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei,
        uint256 maxBorrowedTokensWad, uint256 minLockedProceedsWei, uint64 deadline
    ) external nonReentrant returns (uint256 positionId) {
        _requireDeadline(deadline);
        _requireOpeningAllowed();
        positionId = _openPosition(msg.sender, market, true, leverage, maintenanceMarginBps, collateralWei, bytes32(0));
        LaunchpadMarketV45.Position memory opened = market.position(positionId);
        if (opened.borrowedTokensWad > maxBorrowedTokensWad || opened.lockedProceedsWei < minLockedProceedsWei) revert SlippageExceeded();
    }

    function closePositionFromBalanceWithLimits(
        LaunchpadMarketV45 market, uint256 positionId, uint256 minPayoutWei, uint64 deadline
    ) external nonReentrant returns (uint256 payoutWei) {
        _requireDeadline(deadline);
        _requireCloseAllowed();
        payoutWei = _closePosition(msg.sender, market, positionId, bytes32(0));
        if (payoutWei < minPayoutWei) revert SlippageExceeded();
    }

    function executeAuthorizedSpotBuy(bytes32 sessionId, uint64 nonce, address account, LaunchpadMarketV45 market, uint256 grossWethWei, uint256 minTokenOutWad, uint64 deadline, bytes32 intentHash) external onlySequencer nonReentrant returns (uint256 tokenOutWad) {
        _requireOpeningAllowed();
        _consumeSession(sessionId, nonce, account, SessionAction.SpotBuy, grossWethWei, true, deadline, intentHash);
        tokenOutWad = _spotBuy(account, market, grossWethWei, minTokenOutWad, intentHash);
    }

    function executeAuthorizedSpotSell(bytes32 sessionId, uint64 nonce, address account, LaunchpadMarketV45 market, uint256 tokenAmountWad, uint256 minWethOutWei, uint64 deadline, bytes32 intentHash) external onlySequencer nonReentrant returns (uint256 netWethWei) {
        _requireCloseAllowed();
        _consumeSession(sessionId, nonce, account, SessionAction.SpotSell, 0, false, deadline, intentHash);
        netWethWei = _spotSell(account, market, tokenAmountWad, minWethOutWei, intentHash);
    }

    function executeAuthorizedOpenLong(bytes32 sessionId, uint64 nonce, address account, LaunchpadMarketV45 market, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei, uint64 deadline, bytes32 intentHash) external onlySequencer nonReentrant returns (uint256 positionId) {
        _requireOpeningAllowed();
        (uint256 notionalWei,,,) = market.quoteOpenLong(collateralWei, leverage);
        _consumeSession(sessionId, nonce, account, SessionAction.OpenLong, notionalWei, true, deadline, intentHash);
        positionId = _openPosition(account, market, false, leverage, maintenanceMarginBps, collateralWei, intentHash);
    }

    function executeAuthorizedOpenShort(bytes32 sessionId, uint64 nonce, address account, LaunchpadMarketV45 market, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei, uint64 deadline, bytes32 intentHash) external onlySequencer nonReentrant returns (uint256 positionId) {
        _requireOpeningAllowed();
        (uint256 notionalWei,,,,) = market.quoteOpenShort(collateralWei, leverage);
        _consumeSession(sessionId, nonce, account, SessionAction.OpenShort, notionalWei, true, deadline, intentHash);
        positionId = _openPosition(account, market, true, leverage, maintenanceMarginBps, collateralWei, intentHash);
    }

    function executeAuthorizedClosePosition(bytes32 sessionId, uint64 nonce, address account, LaunchpadMarketV45 market, uint256 positionId, SessionAction closeAction, uint64 deadline, bytes32 intentHash) external onlySequencer nonReentrant returns (uint256 payoutWei) {
        _requireCloseAllowed();
        if (closeAction != SessionAction.CloseLong && closeAction != SessionAction.CloseShort) revert SessionActionNotAllowed();
        LaunchpadMarketV45.Direction direction = market.positionDirection(positionId);
        if ((direction == LaunchpadMarketV45.Direction.Long && closeAction != SessionAction.CloseLong) || (direction == LaunchpadMarketV45.Direction.Short && closeAction != SessionAction.CloseShort)) revert SessionActionNotAllowed();
        _consumeSession(sessionId, nonce, account, closeAction, 0, false, deadline, intentHash);
        payoutWei = _closePosition(account, market, positionId, intentHash);
    }

    function executeAuthorizedOpenLongWithLimits(
        bytes32 sessionId, uint64 nonce, address account, LaunchpadMarketV45 market, uint16 leverage,
        uint16 maintenanceMarginBps, uint256 collateralWei, uint256 minTokenAmountWad, uint64 deadline, bytes32 intentHash
    ) external onlySequencer nonReentrant returns (uint256 positionId) {
        _requireOpeningAllowed();
        (uint256 notionalWei,,,) = market.quoteOpenLong(collateralWei, leverage);
        _consumeSession(sessionId, nonce, account, SessionAction.OpenLong, notionalWei, true, deadline, intentHash);
        positionId = _openPosition(account, market, false, leverage, maintenanceMarginBps, collateralWei, intentHash);
        LaunchpadMarketV45.Position memory opened = market.position(positionId);
        if (opened.tokenAmountWad < minTokenAmountWad) revert SlippageExceeded();
    }

    function executeAuthorizedOpenShortWithLimits(
        bytes32 sessionId, uint64 nonce, address account, LaunchpadMarketV45 market, uint16 leverage,
        uint16 maintenanceMarginBps, uint256 collateralWei, uint256 maxBorrowedTokensWad,
        uint256 minLockedProceedsWei, uint64 deadline, bytes32 intentHash
    ) external onlySequencer nonReentrant returns (uint256 positionId) {
        _requireOpeningAllowed();
        (uint256 notionalWei,,,,) = market.quoteOpenShort(collateralWei, leverage);
        _consumeSession(sessionId, nonce, account, SessionAction.OpenShort, notionalWei, true, deadline, intentHash);
        positionId = _openPosition(account, market, true, leverage, maintenanceMarginBps, collateralWei, intentHash);
        LaunchpadMarketV45.Position memory opened = market.position(positionId);
        if (opened.borrowedTokensWad > maxBorrowedTokensWad || opened.lockedProceedsWei < minLockedProceedsWei) revert SlippageExceeded();
    }

    function executeAuthorizedClosePositionWithLimits(
        bytes32 sessionId, uint64 nonce, address account, LaunchpadMarketV45 market, uint256 positionId,
        uint256 minPayoutWei, SessionAction closeAction, uint64 deadline, bytes32 intentHash
    ) external onlySequencer nonReentrant returns (uint256 payoutWei) {
        _requireCloseAllowed();
        if (closeAction != SessionAction.CloseLong && closeAction != SessionAction.CloseShort) revert SessionActionNotAllowed();
        LaunchpadMarketV45.Direction direction = market.positionDirection(positionId);
        if ((direction == LaunchpadMarketV45.Direction.Long && closeAction != SessionAction.CloseLong) || (direction == LaunchpadMarketV45.Direction.Short && closeAction != SessionAction.CloseShort)) revert SessionActionNotAllowed();
        _consumeSession(sessionId, nonce, account, closeAction, 0, false, deadline, intentHash);
        payoutWei = _closePosition(account, market, positionId, intentHash);
        if (payoutWei < minPayoutWei) revert SlippageExceeded();
    }

    function _spotBuy(address account, LaunchpadMarketV45 market, uint256 grossWethWei, uint256 minTokenOutWad, bytes32 intentHash) internal returns (uint256 tokenOutWad) {
        _requireMarket(market);
        _debitWeth(account, grossWethWei);
        tokenOutWad = market.buyForAccount{value: grossWethWei}(account, address(this));
        if (tokenOutWad < minTokenOutWad) revert SlippageExceeded();
        tokenBalanceWad[account][address(market)] += tokenOutWad;
        totalTokenLiabilityWad[address(market)] += tokenOutWad;
        _assertCustody(market);
        emit AccountExecution(account, address(market), SessionAction.SpotBuy, grossWethWei, tokenOutWad, 0, intentHash);
    }

    function _spotSell(address account, LaunchpadMarketV45 market, uint256 tokenAmountWad, uint256 minWethOutWei, bytes32 intentHash) internal returns (uint256 netWethWei) {
        _requireMarket(market);
        _debitToken(account, market, tokenAmountWad);
        netWethWei = market.sellForAccount(account, address(this), address(this), tokenAmountWad);
        if (netWethWei < minWethOutWei) revert SlippageExceeded();
        _creditWeth(account, netWethWei);
        _assertCustody(market);
        emit AccountExecution(account, address(market), SessionAction.SpotSell, tokenAmountWad, netWethWei, 0, intentHash);
    }

    function _openPosition(address account, LaunchpadMarketV45 market, bool isShort, uint16 leverage, uint16 maintenanceMarginBps, uint256 collateralWei, bytes32 intentHash) internal returns (uint256 positionId) {
        _requireMarket(market);
        uint256 notionalWei;
        uint256 totalRequiredWei;
        if (isShort) (notionalWei,, totalRequiredWei,,) = market.quoteOpenShort(collateralWei, leverage);
        else (notionalWei,, totalRequiredWei,) = market.quoteOpenLong(collateralWei, leverage);
        _debitWeth(account, totalRequiredWei);
        positionId = isShort
            ? market.openShortFor{value: totalRequiredWei}(account, leverage, maintenanceMarginBps, collateralWei)
            : market.openLongFor{value: totalRequiredWei}(account, leverage, maintenanceMarginBps, collateralWei);
        _assertWethCustody();
        emit AccountExecution(account, address(market), isShort ? SessionAction.OpenShort : SessionAction.OpenLong, totalRequiredWei, notionalWei, positionId, intentHash);
    }

    function _closePosition(address account, LaunchpadMarketV45 market, uint256 positionId, bytes32 intentHash) internal returns (uint256 payoutWei) {
        _requireMarket(market);
        if (market.positionOwner(positionId) != account) revert InvalidSession();
        LaunchpadMarketV45.Direction direction = market.positionDirection(positionId);
        payoutWei = market.closePositionFor(positionId, account, address(this));
        _creditWeth(account, payoutWei);
        _assertWethCustody();
        emit AccountExecution(account, address(market), direction == LaunchpadMarketV45.Direction.Long ? SessionAction.CloseLong : SessionAction.CloseShort, positionId, payoutWei, positionId, intentHash);
    }

    function _consumeSession(bytes32 sessionId, uint64 nonce, address account, SessionAction action, uint256 notionalWei, bool countsTowardLimit, uint64 deadline, bytes32 intentHash) internal {
        SessionAuthorization storage session = _sessions[sessionId];
        if (session.owner == address(0) || session.owner != account) revert InvalidSession();
        if (!session.active) revert SessionInactive();
        if (block.timestamp > session.validUntil || block.timestamp > deadline) revert SessionExpired();
        if (session.nextNonce != nonce) revert SessionNonceMismatch();
        if ((session.actionBitmap & (uint256(1) << uint8(action))) == 0) revert SessionActionNotAllowed();
        if (intentHash == bytes32(0) || consumedIntent[intentHash]) revert IntentAlreadyConsumed();
        if (countsTowardLimit) {
            if (notionalWei == 0 || notionalWei > session.maxNotionalWei) revert SessionLimitExceeded();
            uint256 spentAfter = session.spentNotionalWei + notionalWei;
            if (spentAfter > session.maxCumulativeNotionalWei) revert SessionLimitExceeded();
            session.spentNotionalWei = spentAfter;
        }
        session.nextNonce = nonce + 1;
        consumedIntent[intentHash] = true;
        emit SessionNonceConsumed(sessionId, nonce, intentHash, notionalWei, session.spentNotionalWei);
    }

    function _deposit(address account, uint256 amountWei) internal {
        if (account == address(0) || amountWei == 0) revert InvalidAmount();
        _creditWeth(account, amountWei);
        _assertWethCustody();
        emit Deposited(account, amountWei, wethBalanceWei[account]);
    }

    function _creditWeth(address account, uint256 amountWei) internal {
        wethBalanceWei[account] += amountWei;
        totalWethLiabilityWei += amountWei;
    }

    function _debitWeth(address account, uint256 amountWei) internal {
        if (amountWei == 0 || wethBalanceWei[account] < amountWei) revert InsufficientAccountBalance();
        unchecked { wethBalanceWei[account] -= amountWei; totalWethLiabilityWei -= amountWei; }
    }

    function _debitToken(address account, LaunchpadMarketV45 market, uint256 amountWad) internal {
        if (amountWad == 0 || tokenBalanceWad[account][address(market)] < amountWad) revert InsufficientAccountBalance();
        unchecked { tokenBalanceWad[account][address(market)] -= amountWad; totalTokenLiabilityWad[address(market)] -= amountWad; }
    }

    function _assertWethCustody() internal view { if (address(this).balance < totalWethLiabilityWei) revert CustodyInsolvent(); }
    function _assertTokenCustody(LaunchpadMarketV45 market) internal view { if (market.token().balanceOf(address(this)) < totalTokenLiabilityWad[address(market)]) revert CustodyInsolvent(); }
    function _assertCustody(LaunchpadMarketV45 market) internal view { _assertWethCustody(); _assertTokenCustody(market); }

    function _requireDeadline(uint64 deadline) internal view {
        if (deadline < block.timestamp) revert DeadlineExpired();
    }

    function _requireOpeningAllowed() internal view { if (executionMode != ExecutionMode.Normal) revert OpeningDisabled(); }
    function _requireCloseAllowed() internal view { if (executionMode == ExecutionMode.Paused) revert MarketActionsPaused(); }

    /// @dev msg.value is only the creator's curve-buy remainder. The UI reserves launch gas separately inside the creator's 0.001 ETH total budget.
    function createSandboxMarket(string calldata name, string calldata symbol, bytes32 metadataHash, uint256 migrationTargetUsdWad) external payable returns (LaunchpadMarketV45 market, BattleTokenV45 token) {
        if (metadataHash == bytes32(0)) revert EmptyMetadata();
        if (msg.value == 0) revert ZeroGenesisBuy();
        uint256 target = migrationTargetUsdWad == 0 ? DEFAULT_MIGRATION_TARGET_USD_WAD : migrationTargetUsdWad;
        market = new LaunchpadMarketV45{value: msg.value}(msg.sender, name, symbol, metadataHash, target);
        token = market.token();
        markets.push(market);
        marketForToken[address(token)] = address(market);
        isMarket[address(market)] = true;
        emit MarketCreated(address(market), address(token), msg.sender, msg.value, target, metadataHash);
    }

    function seedRiskReserve(LaunchpadMarketV45 market) external payable onlyOwner { _requireMarket(market); market.seedRiskReserve{value: msg.value}(); }
    function setPerpsRestricted(LaunchpadMarketV45 market, address wallet, bool restricted) external onlyOwner { _requireMarket(market); market.setPerpsRestricted(wallet, restricted); }
    function beginMigration(LaunchpadMarketV45 market, bytes32 gateDigest) external onlyOwner { _requireMarket(market); market.beginMigration(gateDigest); }
    function commitMigration(LaunchpadMarketV45 market, bytes32 gateDigest) external onlyOwner { _requireMarket(market); market.commitMigration(gateDigest); }
    function setPaused(LaunchpadMarketV45 market, bool paused) external onlyOwner { _requireMarket(market); market.setPaused(paused); }

    function setExecutionMode(ExecutionMode nextMode) external onlyOwner {
        ExecutionMode previous = executionMode;
        executionMode = nextMode;
        emit ExecutionModeChanged(previous, nextMode);
    }

    function setSequencer(address nextSequencer) external onlyOwner { if (nextSequencer == address(0)) revert InvalidAddress(); address previous = sequencer; sequencer = nextSequencer; emit SequencerChanged(previous, nextSequencer); }
    function transferOwnership(address nextOwner) external onlyOwner { if (nextOwner == address(0)) revert InvalidAddress(); address previous = owner; owner = nextOwner; emit OwnershipTransferred(previous, nextOwner); }
    function marketCount() external view returns (uint256) { return markets.length; }
    function _requireMarket(LaunchpadMarketV45 market) internal view { if (!isMarket[address(market)]) revert InvalidAddress(); }
}
