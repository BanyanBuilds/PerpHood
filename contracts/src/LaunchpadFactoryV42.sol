// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "./BattleCurveMathV24.sol";

/// @notice Fixed-supply token used by the V42 local launchpad sandbox.
/// @dev Reference-only and unaudited. The market contract initially custodies the full supply.
contract BattleTokenV42 {
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

/// @notice Executable native-ETH bonding market for local launchpad testing.
/// @dev This deliberately covers creation, genesis buy, spot buy/sell, creator restriction,
/// lifecycle state and migration gating. V24 remains the separate full BattlePool verifier.
contract LaunchpadMarketV42 {
    using BattleCurveMathV24 for BattleCurveMathV24.Params;

    uint256 public constant WAD = 1e18;
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_ALLOCATION = 800_000_000 ether;
    uint256 public constant OPENING_FDV_WAD = 0.25 ether;
    uint256 public constant OPENING_PRICE_WAD = OPENING_FDV_WAD * WAD / TOTAL_SUPPLY;
    uint256 public constant TRADE_FEE_BPS = 30;
    uint256 public constant MAX_SOLD_BPS = 9_400;

    enum Phase { Bonding, Migrating, Migrated, Paused }

    address public immutable factory;
    address public immutable creator;
    BattleTokenV42 public immutable token;
    bytes32 public immutable metadataHash;
    uint256 public immutable migrationTargetUsdWad;
    uint256 public immutable creatorGenesisBuyWei;

    uint256 public curveSoldTokenWad;
    uint256 public cumulativeGrossWethWei;
    uint256 public cumulativeFeesWei;
    uint256 public tradeCount;
    bytes32 public migrationGateDigest;
    uint64 public migratedAt;
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
    event MigrationStarted(bytes32 indexed gateDigest);
    event MigrationCommitted(bytes32 indexed gateDigest, uint64 migratedAt);
    event PhaseChanged(Phase indexed phase);

    error OnlyFactory();
    error CreatorPerpsForbidden();
    error InvalidPhase();
    error InvalidAmount();
    error TransferFailed();
    error Reentrancy();
    error MigrationGateFailed();

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
        token = new BattleTokenV42(name_, symbol_, address(this));
        _buy(creator_, msg.value);
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

    function curveParams() public pure returns (BattleCurveMathV24.Params memory) {
        return BattleCurveMathV24.Params({
            allocationWad: CURVE_ALLOCATION,
            openingPriceWad: OPENING_PRICE_WAD,
            feeBps: TRADE_FEE_BPS,
            maxSoldBps: MAX_SOLD_BPS
        });
    }

    function buy() external payable nonReentrant returns (uint256 tokenOutWad) {
        if (phase != Phase.Bonding) revert InvalidPhase();
        tokenOutWad = _buy(msg.sender, msg.value);
    }

    function buyFor(address beneficiary) external payable nonReentrant returns (uint256 tokenOutWad) {
        if (phase != Phase.Bonding || beneficiary == address(0)) revert InvalidPhase();
        tokenOutWad = _buy(beneficiary, msg.value);
    }

    function sell(uint256 tokenAmountWad) external nonReentrant returns (uint256 netWethWei) {
        if (phase != Phase.Bonding || tokenAmountWad == 0) revert InvalidAmount();
        BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(curveSoldTokenWad, tokenAmountWad, curveParams());
        if (!token.transferFrom(msg.sender, address(this), tokenAmountWad)) revert TransferFailed();
        curveSoldTokenWad = quote.soldAfterWad;
        cumulativeFeesWei += quote.feeWethWad;
        tradeCount += 1;
        netWethWei = quote.netWethWad;
        if (address(this).balance < netWethWei) revert TransferFailed();
        (bool sent,) = payable(msg.sender).call{value: netWethWei}("");
        if (!sent) revert TransferFailed();
        emit Trade(msg.sender, false, quote.grossCurveWethWad, tokenAmountWad, quote.feeWethWad, quote.soldAfterWad, marketCapEthWad());
    }

    function quoteBuy(uint256 grossWethWei) external view returns (BattleCurveMathV24.BuyQuote memory) {
        return BattleCurveMathV24.quoteBuy(curveSoldTokenWad, grossWethWei, curveParams());
    }

    function quoteSell(uint256 tokenAmountWad) external view returns (BattleCurveMathV24.SellQuote memory) {
        return BattleCurveMathV24.quoteSell(curveSoldTokenWad, tokenAmountWad, curveParams());
    }

    function marginalPriceWad() public view returns (uint256) {
        return BattleCurveMathV24.marginalPriceWad(curveSoldTokenWad, curveParams());
    }

    function marketCapEthWad() public view returns (uint256) {
        return marginalPriceWad() * TOTAL_SUPPLY / WAD;
    }

    function realLiquidityWei() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Every future perps entry route must call this check.
    function assertPerpsAllowed(address trader) external view {
        if (trader == creator) revert CreatorPerpsForbidden();
    }

    function beginMigration(bytes32 gateDigest) external onlyFactory {
        if (phase != Phase.Bonding || gateDigest == bytes32(0)) revert MigrationGateFailed();
        migrationGateDigest = gateDigest;
        phase = Phase.Migrating;
        emit MigrationStarted(gateDigest);
        emit PhaseChanged(phase);
    }

    function commitMigration(bytes32 gateDigest) external onlyFactory {
        if (phase != Phase.Migrating || gateDigest != migrationGateDigest) revert MigrationGateFailed();
        phase = Phase.Migrated;
        migratedAt = uint64(block.timestamp);
        emit MigrationCommitted(gateDigest, migratedAt);
        emit PhaseChanged(phase);
    }

    function setPaused(bool paused) external onlyFactory {
        if (phase == Phase.Migrated && !paused) revert InvalidPhase();
        phase = paused ? Phase.Paused : Phase.Bonding;
        emit PhaseChanged(phase);
    }

    function _buy(address beneficiary, uint256 grossWethWei) internal returns (uint256 tokenOutWad) {
        if (grossWethWei == 0) revert InvalidAmount();
        BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuy(curveSoldTokenWad, grossWethWei, curveParams());
        curveSoldTokenWad = quote.soldAfterWad;
        cumulativeGrossWethWei += grossWethWei;
        cumulativeFeesWei += quote.feeWethWad;
        tradeCount += 1;
        tokenOutWad = quote.tokenOutWad;
        if (!token.marketTransfer(beneficiary, tokenOutWad)) revert TransferFailed();
        emit Trade(beneficiary, true, grossWethWei, tokenOutWad, quote.feeWethWad, quote.soldAfterWad, marketCapEthWad());
    }
}

/// @notice V42 local-chain launch registry and market factory.
/// @dev Native ETH is used only for the local sandbox. Production will use canonical WETH.
contract LaunchpadFactoryV42 {
    uint256 public constant DEFAULT_MIGRATION_TARGET_USD_WAD = 45_000 ether;

    address public owner;
    address public sequencer;
    LaunchpadMarketV42[] public markets;
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
    ) external payable returns (LaunchpadMarketV42 market, BattleTokenV42 token) {
        if (metadataHash == bytes32(0)) revert EmptyMetadata();
        if (msg.value == 0) revert ZeroGenesisBuy();
        uint256 target = migrationTargetUsdWad == 0 ? DEFAULT_MIGRATION_TARGET_USD_WAD : migrationTargetUsdWad;
        market = new LaunchpadMarketV42{value: msg.value}(msg.sender, name, symbol, metadataHash, target);
        token = market.token();
        markets.push(market);
        marketForToken[address(token)] = address(market);
        isMarket[address(market)] = true;
        emit MarketCreated(address(market), address(token), msg.sender, msg.value, target, metadataHash);
    }

    function beginMigration(LaunchpadMarketV42 market, bytes32 gateDigest) external onlyOwner {
        if (!isMarket[address(market)]) revert InvalidAddress();
        market.beginMigration(gateDigest);
    }

    function commitMigration(LaunchpadMarketV42 market, bytes32 gateDigest) external onlyOwner {
        if (!isMarket[address(market)]) revert InvalidAddress();
        market.commitMigration(gateDigest);
    }

    function setPaused(LaunchpadMarketV42 market, bool paused) external onlyOwner {
        if (!isMarket[address(market)]) revert InvalidAddress();
        market.setPaused(paused);
    }

    function setSequencer(address nextSequencer) external onlyOwner {
        if (nextSequencer == address(0)) revert InvalidAddress();
        address previous = sequencer;
        sequencer = nextSequencer;
        emit SequencerChanged(previous, nextSequencer);
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }
}
