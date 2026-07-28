// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "./BattleCurveMathV24.sol";

interface ILeverageXFactorySafetyV63 {
    function globalTradingPaused() external view returns (bool);
}

/// @title LeverageXTokenV63
/// @notice Fixed-supply ERC-20 used by the Leverage X GMGN-compatible mainnet launch candidate.
/// @dev The entire one-billion-token supply is minted once to its launch market. There is no
///      owner mint, transfer tax, blacklist, creator allocation, or privileged withdrawal path.
contract LeverageXTokenV63 {
    string public name;
    string public symbol;
    string public metadataURI;
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000_000 ether;

    address public immutable creator;
    address public immutable factory;
    address public immutable launchMarket;
    bytes32 public immutable metadataHash;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InvalidAddress();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        bytes32 metadataHash_,
        address creator_,
        address factory_,
        address launchMarket_
    ) {
        if (creator_ == address(0) || factory_ == address(0) || launchMarket_ == address(0)) revert InvalidAddress();
        name = name_;
        symbol = symbol_;
        metadataURI = metadataURI_;
        metadataHash = metadataHash_;
        creator = creator_;
        factory = factory_;
        launchMarket = launchMarket_;
        balanceOf[launchMarket_] = totalSupply;
        emit Transfer(address(0), launchMarket_, totalSupply);
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
            unchecked { allowance[from][msg.sender] = allowed - value; }
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) revert InvalidAddress();
        uint256 balance = balanceOf[from];
        if (balance < value) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = balance - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}

/// @title LeverageXSpotMarketV63
/// @notice Native-ETH bonding-curve market with mainnet canary controls and an indexer-stable public surface.
/// @dev V63 remains Spot-only. Long/Short stays disabled until the BattlePool receives a separate
///      audited deployment and explicit activation transaction.
contract LeverageXSpotMarketV63 {
    uint256 public constant WAD = 1e18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_ALLOCATION = 800_000_000 ether;
    uint256 public constant OPENING_FDV_WAD = 0.25 ether;
    uint256 public constant OPENING_PRICE_WAD = OPENING_FDV_WAD * WAD / TOTAL_SUPPLY;
    uint256 public constant TRADE_FEE_BPS = 30;
    uint256 public constant MAX_SOLD_BPS = 9_400;

    address public immutable factory;
    address public immutable creator;
    LeverageXTokenV63 public immutable token;
    bytes32 public immutable metadataHash;
    uint256 public immutable migrationTargetUsdWad;
    uint256 public immutable creatorGenesisBuyWei;
    uint256 public immutable creatorGenesisTokensWad;
    uint64 public immutable launchedAt;

    uint256 public curveSoldTokenWad;
    uint256 public cumulativeGrossEthWei;
    uint256 public cumulativeFeesWei;
    uint256 public tradeCount;
    uint256 public maxBuyWei;
    uint256 public maxSellTokenWad;
    bool public paused;
    bool private _entered;

    event Trade(
        address indexed trader,
        bool indexed isBuy,
        uint256 grossEthWei,
        uint256 tokenAmountWad,
        uint256 feeEthWei,
        uint256 soldAfterWad,
        uint256 marginalPriceWad,
        uint256 marketCapEthWad
    );
    event Paused(bool paused);
    event TradeCapsUpdated(uint256 maxBuyWei, uint256 maxSellTokenWad);

    error OnlyFactory();
    error InvalidAddress();
    error InvalidAmount();
    error SlippageExceeded();
    error MarketPaused();
    error BuyCapExceeded();
    error SellCapExceeded();
    error Reentrancy();
    error TransferFailed();

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

    constructor(
        address creator_,
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        bytes32 metadataHash_,
        uint256 migrationTargetUsdWad_,
        bool initialPaused_,
        uint256 maxBuyWei_,
        uint256 maxSellTokenWad_
    ) payable {
        if (creator_ == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();
        factory = msg.sender;
        creator = creator_;
        metadataHash = metadataHash_;
        migrationTargetUsdWad = migrationTargetUsdWad_;
        creatorGenesisBuyWei = msg.value;
        launchedAt = uint64(block.timestamp);
        paused = initialPaused_;
        maxBuyWei = maxBuyWei_;
        maxSellTokenWad = maxSellTokenWad_;
        token = new LeverageXTokenV63(
            name_,
            symbol_,
            metadataURI_,
            metadataHash_,
            creator_,
            msg.sender,
            address(this)
        );
        creatorGenesisTokensWad = _buy(creator_, msg.value, 0);
    }

    function curveParams() public pure returns (BattleCurveMathV24.Params memory) {
        return BattleCurveMathV24.Params({
            allocationWad: CURVE_ALLOCATION,
            openingPriceWad: OPENING_PRICE_WAD,
            feeBps: TRADE_FEE_BPS,
            maxSoldBps: MAX_SOLD_BPS
        });
    }

    function marginalPriceWad() public view returns (uint256) {
        return BattleCurveMathV24.marginalPriceWad(curveSoldTokenWad, curveParams());
    }

    function marketCapEthWad() public view returns (uint256) {
        return BattleCurveMathV24.mulDivDown(marginalPriceWad(), TOTAL_SUPPLY, WAD);
    }

    function quoteBuy(uint256 grossEthWei) external view returns (BattleCurveMathV24.BuyQuote memory) {
        return BattleCurveMathV24.quoteBuy(curveSoldTokenWad, grossEthWei, curveParams());
    }

    function quoteSell(uint256 tokenAmountWad) external view returns (BattleCurveMathV24.SellQuote memory) {
        return BattleCurveMathV24.quoteSell(curveSoldTokenWad, tokenAmountWad, curveParams());
    }

    function buy(uint256 minTokenOutWad) external payable nonReentrant returns (uint256 tokenOutWad) {
        _requireTradingEnabled();
        if (maxBuyWei != 0 && msg.value > maxBuyWei) revert BuyCapExceeded();
        tokenOutWad = _buy(msg.sender, msg.value, minTokenOutWad);
    }

    function sell(uint256 tokenAmountWad, uint256 minEthOutWei) external nonReentrant returns (uint256 netEthWei) {
        _requireTradingEnabled();
        if (tokenAmountWad == 0) revert InvalidAmount();
        if (maxSellTokenWad != 0 && tokenAmountWad > maxSellTokenWad) revert SellCapExceeded();
        BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(
            curveSoldTokenWad,
            tokenAmountWad,
            curveParams()
        );
        if (quote.netWethWad < minEthOutWei) revert SlippageExceeded();
        if (!token.transferFrom(msg.sender, address(this), tokenAmountWad)) revert TransferFailed();
        curveSoldTokenWad = quote.soldAfterWad;
        cumulativeFeesWei += quote.feeWethWad;
        tradeCount += 1;
        (bool sent,) = payable(msg.sender).call{value: quote.netWethWad}("");
        if (!sent) revert TransferFailed();
        emit Trade(
            msg.sender,
            false,
            quote.grossCurveWethWad,
            tokenAmountWad,
            quote.feeWethWad,
            quote.soldAfterWad,
            quote.marginalPriceAfterWad,
            BattleCurveMathV24.mulDivDown(quote.marginalPriceAfterWad, TOTAL_SUPPLY, WAD)
        );
        return quote.netWethWad;
    }

    function runtimeState()
        external
        view
        returns (
            uint256 priceWad,
            uint256 marketCapWad,
            uint256 soldTokenWad,
            uint256 marketTokenBalanceWad,
            uint256 realEthBalanceWei,
            uint256 feesWei,
            uint256 trades,
            bool isPaused,
            bool isGloballyPaused,
            uint256 buyCapWei,
            uint256 sellCapTokenWad
        )
    {
        priceWad = marginalPriceWad();
        marketCapWad = BattleCurveMathV24.mulDivDown(priceWad, TOTAL_SUPPLY, WAD);
        soldTokenWad = curveSoldTokenWad;
        marketTokenBalanceWad = token.balanceOf(address(this));
        realEthBalanceWei = address(this).balance;
        feesWei = cumulativeFeesWei;
        trades = tradeCount;
        isPaused = paused;
        isGloballyPaused = ILeverageXFactorySafetyV63(factory).globalTradingPaused();
        buyCapWei = maxBuyWei;
        sellCapTokenWad = maxSellTokenWad;
    }

    /// @notice Creator/deployer wallets are permanently ineligible for perps on their own token.
    function isPerpsRestricted(address wallet) external view returns (bool) {
        return wallet == creator;
    }

    function setPaused(bool nextPaused) external onlyFactory {
        paused = nextPaused;
        emit Paused(nextPaused);
    }

    function setTradeCaps(uint256 nextMaxBuyWei, uint256 nextMaxSellTokenWad) external onlyFactory {
        maxBuyWei = nextMaxBuyWei;
        maxSellTokenWad = nextMaxSellTokenWad;
        emit TradeCapsUpdated(nextMaxBuyWei, nextMaxSellTokenWad);
    }

    function _requireTradingEnabled() internal view {
        if (paused || ILeverageXFactorySafetyV63(factory).globalTradingPaused()) revert MarketPaused();
    }

    function _buy(address receiver, uint256 grossEthWei, uint256 minTokenOutWad) internal returns (uint256 tokenOutWad) {
        if (receiver == address(0) || grossEthWei == 0) revert InvalidAmount();
        BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuy(
            curveSoldTokenWad,
            grossEthWei,
            curveParams()
        );
        if (quote.tokenOutWad < minTokenOutWad) revert SlippageExceeded();
        curveSoldTokenWad = quote.soldAfterWad;
        cumulativeGrossEthWei += grossEthWei;
        cumulativeFeesWei += quote.feeWethWad;
        tradeCount += 1;
        if (!token.transfer(receiver, quote.tokenOutWad)) revert TransferFailed();
        emit Trade(
            receiver,
            true,
            grossEthWei,
            quote.tokenOutWad,
            quote.feeWethWad,
            quote.soldAfterWad,
            quote.marginalPriceAfterWad,
            BattleCurveMathV24.mulDivDown(quote.marginalPriceAfterWad, TOTAL_SUPPLY, WAD)
        );
        return quote.tokenOutWad;
    }
}

/// @title LeverageXLaunchFactoryV63
/// @notice Mainnet-first launch factory that deploys closed, globally paused, and canary-capped.
contract LeverageXLaunchFactoryV63 {
    enum LaunchMode { Closed, Allowlist, Public }

    uint256 public constant DEFAULT_MIGRATION_TARGET_USD_WAD = 45_000 ether;
    uint256 public constant MIN_TOTAL_CREATOR_LAUNCH_BUDGET_WEI = 0.001 ether;
    uint256 public constant TOTAL_CREATOR_LAUNCH_BUDGET_WEI = MIN_TOTAL_CREATOR_LAUNCH_BUDGET_WEI; // compatibility alias
    uint256 public constant MIN_CREATOR_GENESIS_BUY_WEI = 1_000_000_000_000;
    uint256 public constant DEFAULT_CANARY_MAX_BUY_WEI = 0.01 ether;
    uint256 public constant DEFAULT_CANARY_MAX_SELL_TOKEN_WAD = 5_000_000 ether;
    address public constant CANONICAL_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    uint256 public constant GRADUATION_SOLD_TOKEN_WAD = 752_000_000 ether;

    struct LaunchRecord {
        address token;
        address creator;
        address bondingMarket;
        address canonicalPool;
        address pairToken;
        address dexFactory;
        uint24 poolFee;
        uint64 launchedAt;
        uint256 initialBuyAmount;
        uint256 supply;
        bytes32 metadataHash;
        bool exists;
        bool graduated;
    }

    address public owner;
    address public pendingOwner;
    LaunchMode public launchMode;
    bool public globalTradingPaused = true;
    bool public newMarketsPaused = true;
    uint256 public defaultMaxBuyWei = DEFAULT_CANARY_MAX_BUY_WEI;
    uint256 public defaultMaxSellTokenWad = DEFAULT_CANARY_MAX_SELL_TOKEN_WAD;

    LeverageXSpotMarketV63[] public markets;
    address[] public allTokens;
    mapping(address => LaunchRecord) private _launchByToken;
    mapping(address => address) public marketForToken;
    mapping(address => bool) public isMarket;
    mapping(address => bool) public canaryCreator;
    address public activeCanaryCreator;
    bool private _entered;

    /// @notice Stable launch event intended for third-party launchpad indexers.
    event TokenLaunched(
        address indexed token,
        address indexed deployer,
        address indexed pool,
        address pairToken,
        uint256 initialBuyAmount,
        uint256 supply,
        bytes32 metadataHash
    );
    event TokenGraduated(
        address indexed token,
        address indexed bondingMarket,
        address indexed canonicalPool,
        address dexFactory,
        address pairToken,
        uint24 poolFee
    );
    event MarketCreated(
        address indexed market,
        address indexed token,
        address indexed creator,
        uint256 creatorGenesisBuyWei,
        uint256 creatorTokensOutWad,
        uint256 marketCapEthWad,
        uint256 migrationTargetUsdWad,
        bytes32 metadataHash
    );
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event LaunchModeChanged(LaunchMode previousMode, LaunchMode nextMode);
    event CanaryCreatorChanged(address indexed creator, bool allowed);
    event GlobalTradingPauseChanged(bool paused);
    event NewMarketSafetyChanged(bool paused, uint256 maxBuyWei, uint256 maxSellTokenWad);
    event MarketSafetyChanged(address indexed market, bool paused, uint256 maxBuyWei, uint256 maxSellTokenWad);
    event FirstCanaryConfigured(address indexed creator, uint256 maxBuyWei, uint256 maxSellTokenWad);
    event FirstCanaryMarketOpened(address indexed market, address indexed token, address indexed creator);
    event EmergencyLockdown(address indexed market, address indexed revokedCreator);

    error OnlyOwner();
    error OnlyPendingOwner();
    error InvalidAddress();
    error InvalidMetadata();
    error InvalidIdentity();
    error InvalidGenesisBuy();
    error LaunchClosed();
    error CreatorNotAllowed();
    error Reentrancy();
    error UnsafeCanaryState();
    error InvalidCanaryMarket();
    error InvalidMigrationTarget();
    error UnknownToken();
    error InvalidPool();
    error AlreadyGraduated();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(address owner_) {
        if (owner_ == address(0)) revert InvalidAddress();
        owner = owner_;
        launchMode = LaunchMode.Closed;
        emit OwnershipTransferred(address(0), owner_);
        emit GlobalTradingPauseChanged(true);
        emit NewMarketSafetyChanged(true, defaultMaxBuyWei, defaultMaxSellTokenWad);
    }

    /// @dev The connected creator wallet submits this transaction. msg.value is the actual creator
    ///      curve buy after the client reserves gas from the creator-selected total launch spend.
    ///      The client enforces a 0.001 ETH minimum total spend, inclusive of gas.
    function createMarket(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        bytes32 metadataHash,
        uint256 migrationTargetUsdWad
    ) external payable nonReentrant returns (LeverageXSpotMarketV63 market, LeverageXTokenV63 token) {
        if (launchMode == LaunchMode.Closed) revert LaunchClosed();
        if (launchMode == LaunchMode.Allowlist) {
            if (msg.sender != activeCanaryCreator || !canaryCreator[msg.sender]) revert CreatorNotAllowed();
            if (markets.length != 0) revert UnsafeCanaryState();
        }

        bytes memory nameBytes = bytes(name);
        bytes memory symbolBytes = bytes(symbol);
        bytes memory uriBytes = bytes(metadataURI);
        if (nameBytes.length < 2 || nameBytes.length > 64 || symbolBytes.length < 1 || symbolBytes.length > 12) revert InvalidIdentity();
        if (metadataHash == bytes32(0) || uriBytes.length < 8 || uriBytes.length > 512) revert InvalidMetadata();
        if (msg.value < MIN_CREATOR_GENESIS_BUY_WEI) revert InvalidGenesisBuy();
        if (defaultMaxBuyWei != 0 && msg.value > defaultMaxBuyWei) revert InvalidGenesisBuy();

        if (migrationTargetUsdWad != 0 && migrationTargetUsdWad != DEFAULT_MIGRATION_TARGET_USD_WAD) revert InvalidMigrationTarget();
        uint256 target = DEFAULT_MIGRATION_TARGET_USD_WAD;
        market = new LeverageXSpotMarketV63{value: msg.value}(
            msg.sender,
            name,
            symbol,
            metadataURI,
            metadataHash,
            target,
            newMarketsPaused,
            defaultMaxBuyWei,
            defaultMaxSellTokenWad
        );
        token = market.token();
        markets.push(market);
        allTokens.push(address(token));
        marketForToken[address(token)] = address(market);
        isMarket[address(market)] = true;
        _launchByToken[address(token)] = LaunchRecord({
            token: address(token),
            creator: msg.sender,
            bondingMarket: address(market),
            canonicalPool: address(market),
            pairToken: CANONICAL_WETH,
            dexFactory: address(this),
            poolFee: uint24(TRADE_FEE_BPS_COMPAT()),
            launchedAt: uint64(block.timestamp),
            initialBuyAmount: msg.value,
            supply: token.totalSupply(),
            metadataHash: metadataHash,
            exists: true,
            graduated: false
        });
        emit TokenLaunched(
            address(token),
            msg.sender,
            address(market),
            CANONICAL_WETH,
            msg.value,
            token.totalSupply(),
            metadataHash
        );
        emit MarketCreated(
            address(market),
            address(token),
            msg.sender,
            msg.value,
            market.creatorGenesisTokensWad(),
            market.marketCapEthWad(),
            target,
            metadataHash
        );
    }

    /// @notice Atomically configures the only creator permitted to launch the first mainnet canary.
    /// @dev This is intentionally callable only from the pristine CLOSED + globally paused + zero-market state.
    function configureFirstCanary(address creator, uint256 maxBuyWei, uint256 maxSellTokenWad) external onlyOwner {
        if (creator == address(0) || maxBuyWei == 0 || maxSellTokenWad == 0) revert InvalidAddress();
        if (launchMode != LaunchMode.Closed || !globalTradingPaused || !newMarketsPaused || markets.length != 0) {
            revert UnsafeCanaryState();
        }
        address previousCreator = activeCanaryCreator;
        if (previousCreator != address(0)) {
            canaryCreator[previousCreator] = false;
            emit CanaryCreatorChanged(previousCreator, false);
        }
        activeCanaryCreator = creator;
        canaryCreator[creator] = true;
        defaultMaxBuyWei = maxBuyWei;
        defaultMaxSellTokenWad = maxSellTokenWad;
        launchMode = LaunchMode.Allowlist;
        emit CanaryCreatorChanged(creator, true);
        emit NewMarketSafetyChanged(true, maxBuyWei, maxSellTokenWad);
        emit LaunchModeChanged(LaunchMode.Closed, LaunchMode.Allowlist);
        emit FirstCanaryConfigured(creator, maxBuyWei, maxSellTokenWad);
    }

    /// @notice Atomically opens Spot trading for the first and only canary market.
    /// @dev Future markets remain paused and public launching remains disabled.
    function openFirstCanaryMarket(LeverageXSpotMarketV63 market) external onlyOwner {
        if (
            launchMode != LaunchMode.Allowlist
                || !globalTradingPaused
                || !newMarketsPaused
                || markets.length != 1
                || address(markets[0]) != address(market)
                || !isMarket[address(market)]
                || address(market.creator()) != activeCanaryCreator
                || !market.paused()
                || market.tradeCount() != 1
        ) revert InvalidCanaryMarket();
        market.setTradeCaps(defaultMaxBuyWei, defaultMaxSellTokenWad);
        market.setPaused(false);
        globalTradingPaused = false;
        emit MarketSafetyChanged(address(market), false, defaultMaxBuyWei, defaultMaxSellTokenWad);
        emit GlobalTradingPauseChanged(false);
        emit FirstCanaryMarketOpened(address(market), address(market.token()), activeCanaryCreator);
    }

    /// @notice One-call owner lockdown: closes launching, globally pauses trading, revokes the canary creator, and optionally pauses the canary market.
    function emergencyLockdown(LeverageXSpotMarketV63 market) external onlyOwner {
        if (address(market) != address(0) && !isMarket[address(market)]) revert InvalidAddress();
        LaunchMode previousMode = launchMode;
        launchMode = LaunchMode.Closed;
        globalTradingPaused = true;
        newMarketsPaused = true;
        address revokedCreator = activeCanaryCreator;
        if (revokedCreator != address(0)) {
            canaryCreator[revokedCreator] = false;
            activeCanaryCreator = address(0);
            emit CanaryCreatorChanged(revokedCreator, false);
        }
        if (address(market) != address(0)) {
            market.setPaused(true);
            emit MarketSafetyChanged(address(market), true, market.maxBuyWei(), market.maxSellTokenWad());
        }
        emit LaunchModeChanged(previousMode, LaunchMode.Closed);
        emit GlobalTradingPauseChanged(true);
        emit NewMarketSafetyChanged(true, defaultMaxBuyWei, defaultMaxSellTokenWad);
        emit EmergencyLockdown(address(market), revokedCreator);
    }

    function setLaunchMode(LaunchMode nextMode) external onlyOwner {
        LaunchMode previous = launchMode;
        launchMode = nextMode;
        emit LaunchModeChanged(previous, nextMode);
    }

    function setCanaryCreator(address creator, bool allowed) external onlyOwner {
        if (creator == address(0)) revert InvalidAddress();
        canaryCreator[creator] = allowed;
        emit CanaryCreatorChanged(creator, allowed);
    }

    function setGlobalTradingPaused(bool paused) external onlyOwner {
        globalTradingPaused = paused;
        emit GlobalTradingPauseChanged(paused);
    }

    function setNewMarketSafety(bool paused, uint256 maxBuyWei, uint256 maxSellTokenWad) external onlyOwner {
        newMarketsPaused = paused;
        defaultMaxBuyWei = maxBuyWei;
        defaultMaxSellTokenWad = maxSellTokenWad;
        emit NewMarketSafetyChanged(paused, maxBuyWei, maxSellTokenWad);
    }

    function setMarketSafety(
        LeverageXSpotMarketV63 market,
        bool paused,
        uint256 maxBuyWei,
        uint256 maxSellTokenWad
    ) external onlyOwner {
        if (!isMarket[address(market)]) revert InvalidAddress();
        market.setTradeCaps(maxBuyWei, maxSellTokenWad);
        market.setPaused(paused);
        emit MarketSafetyChanged(address(market), paused, maxBuyWei, maxSellTokenWad);
    }

    function beginOwnershipTransfer(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        pendingOwner = nextOwner;
        emit OwnershipTransferStarted(owner, nextOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert OnlyPendingOwner();
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    /// @notice Returns the launchpad attribution and current canonical market for a token.
    /// @dev Before graduation, canonicalPool is the Leverage X bonding market. After graduation it is the external DEX pool.
    function getLaunchedToken(address tokenAddress)
        external
        view
        returns (
            address token,
            address deployer,
            address pairedToken,
            address pool,
            address bondingMarket,
            address dexFactory,
            uint24 poolFee,
            uint256 supply,
            bool exists,
            bool graduated,
            uint256 initialBuyAmount,
            bytes32 metadataHash
        )
    {
        LaunchRecord storage record = _launchByToken[tokenAddress];
        return (
            record.token,
            record.creator,
            record.pairToken,
            record.canonicalPool,
            record.bondingMarket,
            record.dexFactory,
            record.poolFee,
            record.supply,
            record.exists,
            record.graduated,
            record.initialBuyAmount,
            record.metadataHash
        );
    }

    /// @notice Human-readable launch metadata for launchpad directories and third-party indexers.
    function getTokenInfo(address tokenAddress)
        external
        view
        returns (
            string memory name,
            string memory symbol,
            string memory metadataURI,
            address deployer,
            address pool,
            address pairedToken,
            uint256 initialBuyAmount,
            uint64 launchedAt,
            bool graduated
        )
    {
        LaunchRecord storage record = _launchByToken[tokenAddress];
        if (!record.exists) revert UnknownToken();
        LeverageXTokenV63 tokenContract = LeverageXTokenV63(tokenAddress);
        return (
            tokenContract.name(),
            tokenContract.symbol(),
            tokenContract.metadataURI(),
            record.creator,
            record.canonicalPool,
            record.pairToken,
            record.initialBuyAmount,
            record.launchedAt,
            record.graduated
        );
    }

    function isLeverageXToken(address tokenAddress) external view returns (bool) {
        return _launchByToken[tokenAddress].exists;
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function graduationStatus(address tokenAddress) external view returns (uint256 current, uint256 threshold, bool graduated) {
        LaunchRecord storage record = _launchByToken[tokenAddress];
        if (!record.exists) revert UnknownToken();
        current = LeverageXSpotMarketV63(payable(record.bondingMarket)).curveSoldTokenWad();
        threshold = GRADUATION_SOLD_TOKEN_WAD;
        graduated = record.graduated;
    }

    /// @notice Binds a graduated Leverage X token to a standard external DEX pool for GMGN and other indexers.
    /// @dev The pool must already exist and contain bytecode. Pool creation/migration is performed by a separately audited adapter.
    function recordGraduation(
        address tokenAddress,
        address canonicalPool,
        address dexFactory,
        address pairToken,
        uint24 poolFee
    ) external onlyOwner {
        LaunchRecord storage record = _launchByToken[tokenAddress];
        if (!record.exists) revert UnknownToken();
        if (record.graduated) revert AlreadyGraduated();
        if (canonicalPool == address(0) || canonicalPool.code.length == 0 || dexFactory == address(0) || pairToken == address(0)) {
            revert InvalidPool();
        }
        record.canonicalPool = canonicalPool;
        record.dexFactory = dexFactory;
        record.pairToken = pairToken;
        record.poolFee = poolFee;
        record.graduated = true;
        emit TokenGraduated(tokenAddress, record.bondingMarket, canonicalPool, dexFactory, pairToken, poolFee);
    }

    function launchpadVersion() external pure returns (string memory) {
        return "LEVERAGE_X_V63";
    }

    /// @dev Compatibility value only; the bonding market itself charges 30 bps.
    function TRADE_FEE_BPS_COMPAT() public pure returns (uint256) {
        return 30;
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }

    function marketAt(uint256 index) external view returns (address) {
        return address(markets[index]);
    }
}
