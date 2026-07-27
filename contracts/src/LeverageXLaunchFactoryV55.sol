// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "./BattleCurveMathV24.sol";

/// @title LeverageXTokenV55
/// @notice Fixed-supply ERC-20 created by the production launch factory.
/// @dev The complete supply is minted once to the token's launch market. There is no owner mint,
///      creator allocation, transfer tax, blacklist, or privileged token withdrawal path.
contract LeverageXTokenV55 {
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

/// @title LeverageXSpotMarketV55
/// @notice Real native-ETH bonding-curve market used for the first Robinhood Chain minting milestone.
/// @dev This contract intentionally contains spot execution only. The verified V49/V50 leveraged
///      settlement engine remains separate until the real token lifecycle is proven end to end.
contract LeverageXSpotMarketV55 {
    uint256 public constant WAD = 1e18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_ALLOCATION = 800_000_000 ether;
    uint256 public constant OPENING_FDV_WAD = 0.25 ether;
    uint256 public constant OPENING_PRICE_WAD = OPENING_FDV_WAD * WAD / TOTAL_SUPPLY;
    uint256 public constant TRADE_FEE_BPS = 30;
    uint256 public constant MAX_SOLD_BPS = 9_400;

    address public immutable factory;
    address public immutable creator;
    LeverageXTokenV55 public immutable token;
    bytes32 public immutable metadataHash;
    uint256 public immutable migrationTargetUsdWad;
    uint256 public immutable creatorGenesisBuyWei;
    uint256 public immutable creatorGenesisTokensWad;
    uint64 public immutable launchedAt;

    uint256 public curveSoldTokenWad;
    uint256 public cumulativeGrossEthWei;
    uint256 public cumulativeFeesWei;
    uint256 public tradeCount;
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

    error OnlyFactory();
    error InvalidAddress();
    error InvalidAmount();
    error SlippageExceeded();
    error MarketPaused();
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
        uint256 migrationTargetUsdWad_
    ) payable {
        if (creator_ == address(0)) revert InvalidAddress();
        if (msg.value == 0) revert InvalidAmount();
        factory = msg.sender;
        creator = creator_;
        metadataHash = metadataHash_;
        migrationTargetUsdWad = migrationTargetUsdWad_;
        creatorGenesisBuyWei = msg.value;
        launchedAt = uint64(block.timestamp);
        token = new LeverageXTokenV55(
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
        if (paused) revert MarketPaused();
        tokenOutWad = _buy(msg.sender, msg.value, minTokenOutWad);
    }

    function sell(uint256 tokenAmountWad, uint256 minEthOutWei) external nonReentrant returns (uint256 netEthWei) {
        if (paused) revert MarketPaused();
        if (tokenAmountWad == 0) revert InvalidAmount();
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
            bool isPaused
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
    }

    /// @notice Creator/deployer wallets are permanently ineligible for perps on their own token.
    function isPerpsRestricted(address wallet) external view returns (bool) {
        return wallet == creator;
    }

    function setPaused(bool nextPaused) external onlyFactory {
        paused = nextPaused;
        emit Paused(nextPaused);
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

/// @title LeverageXLaunchFactoryV55
/// @notice Permissionless registry and deployment factory for real Robinhood Chain memecoins.
contract LeverageXLaunchFactoryV55 {
    uint256 public constant DEFAULT_MIGRATION_TARGET_USD_WAD = 45_000 ether;
    uint256 public constant TOTAL_CREATOR_LAUNCH_BUDGET_WEI = 0.001 ether;
    uint256 public constant MIN_CREATOR_GENESIS_BUY_WEI = 1_000_000_000_000;

    address public owner;
    LeverageXSpotMarketV55[] public markets;
    mapping(address => address) public marketForToken;
    mapping(address => bool) public isMarket;
    bool private _entered;

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
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);

    error OnlyOwner();
    error InvalidAddress();
    error InvalidMetadata();
    error InvalidIdentity();
    error InvalidGenesisBuy();
    error Reentrancy();

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
        emit OwnershipTransferred(address(0), owner_);
    }

    /// @dev The creator's connected wallet submits the transaction. msg.value is the creator-buy
    ///      remainder after the client reserves gas inside the creator's 0.001 ETH total budget.
    function createMarket(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        bytes32 metadataHash,
        uint256 migrationTargetUsdWad
    ) external payable nonReentrant returns (LeverageXSpotMarketV55 market, LeverageXTokenV55 token) {
        bytes memory nameBytes = bytes(name);
        bytes memory symbolBytes = bytes(symbol);
        bytes memory uriBytes = bytes(metadataURI);
        if (nameBytes.length < 2 || nameBytes.length > 64 || symbolBytes.length < 1 || symbolBytes.length > 12) revert InvalidIdentity();
        if (metadataHash == bytes32(0) || uriBytes.length < 8 || uriBytes.length > 512) revert InvalidMetadata();
        // The wallet client reserves gas from the fixed 0.001 ETH total budget. The contract
        // rejects a zero/dust buy and any creator-buy value that alone consumes the full budget.
        if (msg.value < MIN_CREATOR_GENESIS_BUY_WEI || msg.value >= TOTAL_CREATOR_LAUNCH_BUDGET_WEI) revert InvalidGenesisBuy();
        uint256 target = migrationTargetUsdWad == 0 ? DEFAULT_MIGRATION_TARGET_USD_WAD : migrationTargetUsdWad;
        market = new LeverageXSpotMarketV55{value: msg.value}(
            msg.sender,
            name,
            symbol,
            metadataURI,
            metadataHash,
            target
        );
        token = market.token();
        markets.push(market);
        marketForToken[address(token)] = address(market);
        isMarket[address(market)] = true;
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

    function setMarketPaused(LeverageXSpotMarketV55 market, bool paused) external onlyOwner {
        if (!isMarket[address(market)]) revert InvalidAddress();
        market.setPaused(paused);
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

    function marketAt(uint256 index) external view returns (address) {
        return address(markets[index]);
    }
}
