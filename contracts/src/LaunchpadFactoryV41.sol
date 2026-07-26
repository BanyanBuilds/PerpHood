// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Reference-only V41 launch lifecycle contracts.
/// @dev These contracts are intentionally unaudited and do not implement the
/// production BattlePool trade engine. They exist so the local launchpad UI,
/// registry, creator restriction, and migration state machine have a concrete
/// contract-shaped target for testing and independent review.

contract BattleTokenV41 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000_000 ether;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, address initialOwner) {
        name = name_;
        symbol = symbol_;
        balanceOf[initialOwner] = totalSupply;
        emit Transfer(address(0), initialOwner, totalSupply);
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
        require(allowed >= value, "ALLOWANCE");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - value;
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "ZERO_TO");
        require(balanceOf[from] >= value, "BALANCE");
        unchecked {
            balanceOf[from] -= value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}

contract LaunchpadMarketV41 {
    enum Phase { Bonding, Migrating, Migrated, Paused }

    address public immutable factory;
    address public immutable creator;
    BattleTokenV41 public immutable token;
    bytes32 public immutable metadataHash;
    uint256 public immutable migrationTargetUsdWad;
    uint256 public immutable creatorGenesisBuyWei;
    Phase public phase;
    bytes32 public migrationGateDigest;
    uint64 public migratedAt;

    error OnlyFactory();
    error CreatorPerpsForbidden();
    error InvalidPhase();
    error MigrationGateFailed();

    event MigrationStarted(bytes32 indexed gateDigest);
    event MigrationCommitted(bytes32 indexed gateDigest, uint64 migratedAt);
    event PhaseChanged(Phase indexed phase);

    constructor(
        address creator_,
        BattleTokenV41 token_,
        bytes32 metadataHash_,
        uint256 migrationTargetUsdWad_
    ) payable {
        factory = msg.sender;
        creator = creator_;
        token = token_;
        metadataHash = metadataHash_;
        migrationTargetUsdWad = migrationTargetUsdWad_;
        creatorGenesisBuyWei = msg.value;
        phase = Phase.Bonding;
    }

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    /// @notice Must be called by every future perps entry path.
    function assertPerpsAllowed(address trader) external view {
        if (trader == creator) revert CreatorPerpsForbidden();
    }

    function beginMigration(
        uint256 marketCapUsdWad,
        uint256 realLiquidityWei,
        uint256 minimumRealLiquidityWei,
        uint256 freeWethWei,
        uint256 requiredFreeWethWei,
        uint256 shortCapacityWei,
        uint256 minimumShortCapacityWei,
        uint256 badDebtWei,
        uint256 independentTraders,
        uint256 minimumIndependentTraders,
        bool activeLiquidation,
        bytes32 gateDigest
    ) external onlyFactory {
        if (phase != Phase.Bonding) revert InvalidPhase();
        if (
            marketCapUsdWad < migrationTargetUsdWad
                || realLiquidityWei < minimumRealLiquidityWei
                || freeWethWei < requiredFreeWethWei
                || shortCapacityWei < minimumShortCapacityWei
                || badDebtWei != 0
                || independentTraders < minimumIndependentTraders
                || activeLiquidation
                || gateDigest == bytes32(0)
        ) revert MigrationGateFailed();
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
}

contract LaunchpadFactoryV41 {
    uint256 public constant ONE_BILLION_TOKENS = 1_000_000_000 ether;
    uint256 public constant DEFAULT_MIGRATION_TARGET_USD_WAD = 45_000 ether;

    address public owner;
    LaunchpadMarketV41[] public markets;
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

    error OnlyOwner();
    error EmptyMetadata();
    error ZeroGenesisBuy();

    constructor(address owner_) {
        owner = owner_ == address(0) ? msg.sender : owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    /// @dev msg.value is the creator's actual curve-buy value. The user-facing
    /// 0.001 ETH minimum is TOTAL spend inclusive of gas, so gas reservation is
    /// enforced by the relayer/session layer before this call—not fabricated as
    /// additional on-chain value.
    function createTestMarket(
        string calldata name,
        string calldata symbol,
        bytes32 metadataHash,
        uint256 migrationTargetUsdWad
    ) external payable returns (LaunchpadMarketV41 market, BattleTokenV41 token) {
        if (metadataHash == bytes32(0)) revert EmptyMetadata();
        if (msg.value == 0) revert ZeroGenesisBuy();
        token = new BattleTokenV41(name, symbol, address(this));
        uint256 target = migrationTargetUsdWad == 0 ? DEFAULT_MIGRATION_TARGET_USD_WAD : migrationTargetUsdWad;
        market = new LaunchpadMarketV41{value: msg.value}(msg.sender, token, metadataHash, target);
        require(token.transfer(address(market), ONE_BILLION_TOKENS), "TOKEN_SEED");
        markets.push(market);
        marketForToken[address(token)] = address(market);
        isMarket[address(market)] = true;
        emit MarketCreated(address(market), address(token), msg.sender, msg.value, target, metadataHash);
    }

    function beginMigration(
        LaunchpadMarketV41 market,
        uint256 marketCapUsdWad,
        uint256 realLiquidityWei,
        uint256 minimumRealLiquidityWei,
        uint256 freeWethWei,
        uint256 requiredFreeWethWei,
        uint256 shortCapacityWei,
        uint256 minimumShortCapacityWei,
        uint256 badDebtWei,
        uint256 independentTraders,
        uint256 minimumIndependentTraders,
        bool activeLiquidation,
        bytes32 gateDigest
    ) external onlyOwner {
        require(isMarket[address(market)], "UNKNOWN_MARKET");
        market.beginMigration(
            marketCapUsdWad,
            realLiquidityWei,
            minimumRealLiquidityWei,
            freeWethWei,
            requiredFreeWethWei,
            shortCapacityWei,
            minimumShortCapacityWei,
            badDebtWei,
            independentTraders,
            minimumIndependentTraders,
            activeLiquidation,
            gateDigest
        );
    }

    function commitMigration(LaunchpadMarketV41 market, bytes32 gateDigest) external onlyOwner {
        require(isMarket[address(market)], "UNKNOWN_MARKET");
        market.commitMigration(gateDigest);
    }

    function marketCount() external view returns (uint256) {
        return markets.length;
    }
}
