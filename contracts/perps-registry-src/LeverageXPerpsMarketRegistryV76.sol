// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILeverageXLaunchTokenV76 {
    function creator() external view returns (address);
    function launchFactory() external view returns (address);
}

interface IUniswapV3FactoryV76 {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IUniswapV3PoolV76 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function liquidity() external view returns (uint128);
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

/// @title LeverageXPerpsMarketRegistryV76
/// @notice Enforceable on-chain admission registry for Leverage X-launched perpetual markets.
/// @dev Activation proves a canonical token/WETH Uniswap V3 pool has a live first spot price.
///      It does not custody margin or settle positions; execution engines must require isTradable().
contract LeverageXPerpsMarketRegistryV76 {
    uint16 public constant MAX_PROTOCOL_LEVERAGE_X = 20;

    struct Market {
        address token;
        address pool;
        address creator;
        uint24 poolFee;
        uint16 maxLeverageX;
        uint64 activatedAt;
        uint64 activatedBlock;
        bool active;
        bool exists;
    }

    address public owner;
    address public pendingOwner;
    address public immutable launchFactory;
    address public immutable dexFactory;
    address public immutable wrappedNative;

    mapping(address => bool) public activator;
    mapping(address => Market) private _marketByToken;
    mapping(address => address) public tokenByPool;
    mapping(address => mapping(address => bool)) private _permanentlyBlocked;
    address[] private _tokens;

    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ActivatorSet(address indexed account, bool allowed);
    event MarketActivated(
        address indexed token,
        address indexed pool,
        address indexed creator,
        uint24 poolFee,
        uint16 maxLeverageX,
        uint160 initialSqrtPriceX96,
        int24 initialTick,
        uint128 initialLiquidity
    );
    event MarketStatusChanged(address indexed token, bool active);
    event WalletPermanentlyBlocked(address indexed token, address indexed wallet, bytes32 indexed reason);

    error OnlyOwner();
    error OnlyActivator();
    error InvalidAddress();
    error InvalidLeverage();
    error AlreadyActivated();
    error PoolAlreadyRegistered();
    error TokenNotFromLaunchFactory();
    error NonCanonicalPool();
    error InvalidPoolPair();
    error PoolNotReady();
    error MarketMissing();
    error WalletBlocked();

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyActivator() {
        if (msg.sender != owner && !activator[msg.sender]) revert OnlyActivator();
        _;
    }

    constructor(address owner_, address launchFactory_, address dexFactory_, address wrappedNative_) {
        if (owner_ == address(0) || launchFactory_ == address(0) || dexFactory_ == address(0) || wrappedNative_ == address(0)) {
            revert InvalidAddress();
        }
        owner = owner_;
        launchFactory = launchFactory_;
        dexFactory = dexFactory_;
        wrappedNative = wrappedNative_;
        emit OwnershipTransferred(address(0), owner_);
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

    function setActivator(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert InvalidAddress();
        activator[account] = allowed;
        emit ActivatorSet(account, allowed);
    }

    /// @notice Activates one launched token after validating its canonical live spot pool.
    function activateMarket(address token, address pool, uint16 maxLeverageX) external onlyActivator {
        if (token == address(0) || pool == address(0)) revert InvalidAddress();
        if (maxLeverageX == 0 || maxLeverageX > MAX_PROTOCOL_LEVERAGE_X) revert InvalidLeverage();
        if (_marketByToken[token].exists) revert AlreadyActivated();
        if (tokenByPool[pool] != address(0)) revert PoolAlreadyRegistered();

        ILeverageXLaunchTokenV76 launchToken = ILeverageXLaunchTokenV76(token);
        if (launchToken.launchFactory() != launchFactory) revert TokenNotFromLaunchFactory();
        address creator = launchToken.creator();
        if (creator == address(0)) revert InvalidAddress();

        IUniswapV3PoolV76 candidate = IUniswapV3PoolV76(pool);
        address token0 = candidate.token0();
        address token1 = candidate.token1();
        uint24 fee = candidate.fee();
        bool pairMatches =
            (token0 == token && token1 == wrappedNative) ||
            (token1 == token && token0 == wrappedNative);
        if (!pairMatches) revert InvalidPoolPair();
        if (IUniswapV3FactoryV76(dexFactory).getPool(token, wrappedNative, fee) != pool) revert NonCanonicalPool();

        uint128 poolLiquidity = candidate.liquidity();
        (uint160 sqrtPriceX96, int24 tick, , , , , bool unlocked) = candidate.slot0();
        if (poolLiquidity == 0 || sqrtPriceX96 == 0 || !unlocked) revert PoolNotReady();

        _marketByToken[token] = Market({
            token: token,
            pool: pool,
            creator: creator,
            poolFee: fee,
            maxLeverageX: maxLeverageX,
            activatedAt: uint64(block.timestamp),
            activatedBlock: uint64(block.number),
            active: true,
            exists: true
        });
        tokenByPool[pool] = token;
        _tokens.push(token);

        _permanentlyBlocked[token][creator] = true;
        emit WalletPermanentlyBlocked(token, creator, keccak256("CREATOR_WALLET"));
        emit MarketActivated(token, pool, creator, fee, maxLeverageX, sqrtPriceX96, tick, poolLiquidity);
    }

    /// @notice Emergency trading switch. Market identity and creator block can never be deleted.
    function setMarketActive(address token, bool active_) external onlyOwner {
        Market storage market = _marketByToken[token];
        if (!market.exists) revert MarketMissing();
        market.active = active_;
        emit MarketStatusChanged(token, active_);
    }

    /// @notice Adds a block only when the operator has cryptographic/operational proof off-chain.
    /// @dev Blocks are intentionally irreversible to avoid accidentally re-enabling a creator-linked wallet.
    function permanentlyBlockProvenLinkedWallet(address token, address wallet, bytes32 evidenceHash) external onlyOwner {
        if (!_marketByToken[token].exists) revert MarketMissing();
        if (wallet == address(0) || evidenceHash == bytes32(0)) revert InvalidAddress();
        if (!_permanentlyBlocked[token][wallet]) {
            _permanentlyBlocked[token][wallet] = true;
            emit WalletPermanentlyBlocked(token, wallet, evidenceHash);
        }
    }

    function market(address token) external view returns (Market memory) {
        return _marketByToken[token];
    }

    function marketCount() external view returns (uint256) {
        return _tokens.length;
    }

    function tokenAt(uint256 index) external view returns (address) {
        return _tokens[index];
    }

    function isPermanentlyBlocked(address token, address wallet) public view returns (bool) {
        return _permanentlyBlocked[token][wallet];
    }

    function isTradable(address token, address wallet, uint16 requestedLeverageX) external view returns (bool) {
        Market storage m = _marketByToken[token];
        return m.exists && m.active && wallet != address(0) && !_permanentlyBlocked[token][wallet]
            && requestedLeverageX > 0 && requestedLeverageX <= m.maxLeverageX;
    }

    function requireTradable(address token, address wallet, uint16 requestedLeverageX) external view {
        Market storage m = _marketByToken[token];
        if (!m.exists || !m.active) revert MarketMissing();
        if (_permanentlyBlocked[token][wallet]) revert WalletBlocked();
        if (requestedLeverageX == 0 || requestedLeverageX > m.maxLeverageX) revert InvalidLeverage();
    }
}
