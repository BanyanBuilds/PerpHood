// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "./BattleCurveMathV24.sol";

interface IERC20V65 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
}

interface IWrappedNativeV65 is IERC20V65 {
    function deposit() external payable;
}

interface IUniswapV3FactoryV65 {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
    function feeAmountTickSpacing(uint24 fee) external view returns (int24 tickSpacing);
}

interface IUniswapV3PoolV65 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
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

    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}

interface INonfungiblePositionManagerV65 {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1);
    function burn(uint256 tokenId) external payable;
    function ownerOf(uint256 tokenId) external view returns (address owner);
}

interface ISwapRouter02V65 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// @title LeverageXTokenV65
/// @notice Tax-free, blacklist-free, immutable-supply launch token designed for standard DEX indexers.
contract LeverageXTokenV65 {
    string public name;
    string public symbol;
    string public metadataURI;
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000_000 ether;

    address public immutable creator;
    address public immutable launchFactory;
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
        address launchFactory_
    ) {
        if (creator_ == address(0) || launchFactory_ == address(0)) revert InvalidAddress();
        name = name_;
        symbol = symbol_;
        metadataURI = metadataURI_;
        metadataHash = metadataHash_;
        creator = creator_;
        launchFactory = launchFactory_;
        balanceOf[launchFactory_] = totalSupply;
        emit Transfer(address(0), launchFactory_, totalSupply);
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

/// @title LeverageXPermanentLiquidityLockerV65
/// @notice Holds both the launch-range and final full-range Uniswap V3 positions permanently.
/// @dev There is deliberately no NFT withdrawal, rescue, or creator-reward path.
contract LeverageXPermanentLiquidityLockerV65 {
    int24 public constant MIN_TICK = -887272;
    int24 public constant MAX_TICK = 887272;

    struct LockedLaunch {
        address token;
        address pool;
        uint256 launchPositionId;
        uint256 finalPositionId;
        uint24 poolFee;
        int24 terminalTick;
        bool tokenIsToken0;
        bool exists;
        bool graduated;
    }

    address public launchFactory;
    address public immutable deploymentController;
    address public immutable wrappedNative;
    INonfungiblePositionManagerV65 public immutable positionManager;
    IUniswapV3FactoryV65 public immutable dexFactory;

    mapping(address => LockedLaunch) private _lockedByToken;

    event LaunchPositionLocked(
        address indexed token,
        address indexed pool,
        uint256 indexed positionId,
        uint24 poolFee,
        int24 terminalTick,
        bool tokenIsToken0,
        uint256 reserveTokens
    );
    event FinalLiquidityLocked(
        address indexed token,
        address indexed pool,
        uint256 indexed finalPositionId,
        uint256 amountToken,
        uint256 amountWrappedNative
    );

    error OnlyFactory();
    error OnlyDeploymentController();
    error InvalidAddress();
    error InvalidPosition();
    error AlreadyRegistered();
    error AlreadyGraduated();
    error ImmediatePerpsNotConfigured();
    error ImmediatePerpsActivationFailed();
    error TransferFailed();

    modifier onlyFactory() {
        if (msg.sender != launchFactory) revert OnlyFactory();
        _;
    }

    constructor(address deploymentController_, address dexFactory_, address positionManager_, address wrappedNative_) {
        if (
            deploymentController_ == address(0)
                || dexFactory_ == address(0)
                || positionManager_ == address(0)
                || wrappedNative_ == address(0)
        ) revert InvalidAddress();
        deploymentController = deploymentController_;
        dexFactory = IUniswapV3FactoryV65(dexFactory_);
        positionManager = INonfungiblePositionManagerV65(positionManager_);
        wrappedNative = wrappedNative_;
    }


    function bindFactory(address launchFactory_) external {
        if (msg.sender != deploymentController) revert OnlyDeploymentController();
        if (launchFactory != address(0) || launchFactory_ == address(0) || launchFactory_.code.length == 0) revert InvalidAddress();
        launchFactory = launchFactory_;
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(positionManager)) revert InvalidPosition();
        return this.onERC721Received.selector;
    }

    function registerLaunch(
        address token,
        address pool,
        uint256 positionId,
        uint24 poolFee,
        int24 terminalTick,
        bool tokenIsToken0,
        uint256 reserveTokens
    ) external onlyFactory {
        if (token == address(0) || pool == address(0) || positionId == 0) revert InvalidAddress();
        if (_lockedByToken[token].exists) revert AlreadyRegistered();
        if (positionManager.ownerOf(positionId) != address(this)) revert InvalidPosition();
        IUniswapV3PoolV65 canonicalPool = IUniswapV3PoolV65(pool);
        address token0 = canonicalPool.token0();
        address token1 = canonicalPool.token1();
        if (
            canonicalPool.fee() != poolFee
                || !((token0 == token && token1 == wrappedNative) || (token1 == token && token0 == wrappedNative))
                || dexFactory.getPool(token0, token1, poolFee) != pool
        ) revert InvalidPosition();
        if (reserveTokens == 0 || IERC20V65(token).balanceOf(address(this)) < reserveTokens) revert InvalidPosition();
        _lockedByToken[token] = LockedLaunch({
            token: token,
            pool: pool,
            launchPositionId: positionId,
            finalPositionId: 0,
            poolFee: poolFee,
            terminalTick: terminalTick,
            tokenIsToken0: tokenIsToken0,
            exists: true,
            graduated: false
        });
        emit LaunchPositionLocked(token, pool, positionId, poolFee, terminalTick, tokenIsToken0, reserveTokens);
    }

    function getLockedLaunch(address token) external view returns (LockedLaunch memory) {
        return _lockedByToken[token];
    }

    function graduate(address token, uint256 amount0Min, uint256 amount1Min, uint256 deadline)
        external
        onlyFactory
        returns (uint256 finalPositionId, uint128 finalLiquidity, uint256 amount0, uint256 amount1)
    {
        LockedLaunch storage launch = _lockedByToken[token];
        if (!launch.exists) revert InvalidPosition();
        if (launch.graduated) revert AlreadyGraduated();

        (
            uint96 nonce_,
            address operator_,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower_,
            int24 tickUpper_,
            uint128 liquidity,
            uint256 feeGrowth0_,
            uint256 feeGrowth1_,
            uint128 tokensOwed0_,
            uint128 tokensOwed1_
        ) = positionManager.positions(launch.launchPositionId);
        nonce_; operator_; tickLower_; tickUpper_; feeGrowth0_; feeGrowth1_; tokensOwed0_; tokensOwed1_;
        if (liquidity == 0 || fee != launch.poolFee) revert InvalidPosition();

        positionManager.decreaseLiquidity(
            INonfungiblePositionManagerV65.DecreaseLiquidityParams({
                tokenId: launch.launchPositionId,
                liquidity: liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: deadline
            })
        );
        positionManager.collect(
            INonfungiblePositionManagerV65.CollectParams({
                tokenId: launch.launchPositionId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        positionManager.burn(launch.launchPositionId);

        uint256 balance0 = IERC20V65(token0).balanceOf(address(this));
        uint256 balance1 = IERC20V65(token1).balanceOf(address(this));
        if (balance0 == 0 || balance1 == 0) revert InvalidPosition();

        if (!IERC20V65(token0).approve(address(positionManager), balance0)) revert TransferFailed();
        if (!IERC20V65(token1).approve(address(positionManager), balance1)) revert TransferFailed();

        int24 spacing = dexFactory.feeAmountTickSpacing(fee);
        if (spacing <= 0) revert InvalidPosition();
        int24 tickLower = (MIN_TICK / spacing) * spacing;
        int24 tickUpper = (MAX_TICK / spacing) * spacing;

        (finalPositionId, finalLiquidity, amount0, amount1) = positionManager.mint(
            INonfungiblePositionManagerV65.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: balance0,
                amount1Desired: balance1,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                recipient: address(this),
                deadline: deadline
            })
        );
        if (positionManager.ownerOf(finalPositionId) != address(this) || finalLiquidity == 0) revert InvalidPosition();

        IERC20V65(token0).approve(address(positionManager), 0);
        IERC20V65(token1).approve(address(positionManager), 0);
        launch.finalPositionId = finalPositionId;
        launch.graduated = true;

        uint256 amountToken = token0 == token ? amount0 : amount1;
        uint256 amountWrapped = token0 == wrappedNative ? amount0 : amount1;
        emit FinalLiquidityLocked(token, launch.pool, finalPositionId, amountToken, amountWrapped);
    }
}

interface ILeverageXImmediatePerpsHookV88 {
    function onMarketMinted(
        address token,
        address pool,
        address creator,
        uint24 poolFee,
        uint16 maxLeverageX
    ) external;
}

/// @title LeverageXLaunchFactoryV88
/// @notice GMGN-first Robinhood Chain launch factory: each token opens in a canonical Uniswap V3 pool from block one.
/// @dev The launch-range NFT and final full-range NFT are permanently held by an immutable locker.
contract LeverageXLaunchFactoryV88 {
    enum LaunchMode { Closed, Allowlist, Public }

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant LAUNCH_RANGE_TOKEN_ALLOCATION = 800_000_000 ether;
    uint256 public constant FINAL_LIQUIDITY_TOKEN_RESERVE = 200_000_000 ether;
    uint256 public constant OPENING_FDV_ETH_WAD = 0.25 ether;
    uint256 public constant TARGET_FDV_MULTIPLIER = 90;
    uint256 public constant TARGET_FDV_ETH_WAD = OPENING_FDV_ETH_WAD * TARGET_FDV_MULTIPLIER;
    /// @dev The 0.001 ETH minimum is a total transaction budget inclusive of gas. It is
    /// enforced by the launch clients and operator scripts because a contract cannot observe
    /// the gas fee paid by the transaction sender; only the remaining msg.value reaches here.
    uint256 public constant MIN_TOTAL_CREATOR_LAUNCH_BUDGET_WEI = 0.001 ether;
    uint256 public constant MIN_CREATOR_GENESIS_BUY_WEI = 1_000_000_000_000;
    uint256 public constant DEFAULT_CANARY_MAX_INITIAL_BUY_WEI = 0.01 ether;
    uint24 public constant CANONICAL_POOL_FEE = 10_000;
    uint32 public constant GRADUATION_TWAP_SECONDS = 15 minutes;
    uint16 public constant MIN_OBSERVATION_CARDINALITY = 32;

    address public constant ROBINHOOD_WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address public constant ROBINHOOD_UNISWAP_V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address public constant ROBINHOOD_UNISWAP_V3_POSITION_MANAGER = 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3;
    address public constant ROBINHOOD_UNISWAP_SWAP_ROUTER_02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address public constant ROBINHOOD_UNISWAP_QUOTER_V2 = 0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7;

    // 0.25 ETH / 1B tokens with 18-decimal token/WETH ordering. The launch position starts one-sided.
    int24 public constant TOKEN0_LAUNCH_TICK_LOWER = -221000;
    int24 public constant TOKEN0_LAUNCH_TICK_UPPER = -176000;
    int24 public constant TOKEN1_LAUNCH_TICK_LOWER = 176000;
    int24 public constant TOKEN1_LAUNCH_TICK_UPPER = 221000;

    struct LaunchRecord {
        address token;
        address deployer;
        address pairToken;
        address pool;
        address dexFactory;
        address positionManager;
        address liquidityLocker;
        uint256 launchPositionId;
        uint256 finalPositionId;
        uint24 poolFee;
        int24 startTick;
        int24 terminalTick;
        uint64 launchedAt;
        uint256 initialBuyAmount;
        uint256 supply;
        bytes32 metadataHash;
        bool isToken0;
        bool exists;
        bool graduated;
    }

    address public owner;
    address public immediatePerpsHook;
    bool public requireImmediatePerps = true;
    address public pendingOwner;
    LaunchMode public launchMode;
    address public activeCanaryCreator;
    uint256 public maxInitialBuyWei = DEFAULT_CANARY_MAX_INITIAL_BUY_WEI;
    bool public launchCreationPaused = true;
    bool private _entered;

    IUniswapV3FactoryV65 public immutable dexFactory;
    INonfungiblePositionManagerV65 public immutable positionManager;
    ISwapRouter02V65 public immutable swapRouter;
    address public immutable wrappedNative;
    LeverageXPermanentLiquidityLockerV65 public immutable liquidityLocker;

    address[] public allTokens;
    mapping(address => LaunchRecord) private _launchByToken;
    mapping(address => address) public canonicalPoolForToken;
    mapping(address => bool) public canaryCreator;

    event TokenLaunched(
        address indexed token,
        address indexed deployer,
        address indexed dexFactory,
        address pairToken,
        address pool,
        address positionManager,
        address liquidityLocker,
        uint256 positionId,
        uint24 poolFee,
        bool isToken0,
        uint256 initialBuyAmount,
        uint256 initialTokensOut,
        uint256 supply,
        bytes32 metadataHash
    );
    event CanonicalPoolCreated(
        address indexed token,
        address indexed pool,
        address indexed pairToken,
        address dexFactory,
        address positionManager,
        address liquidityLocker,
        uint24 poolFee,
        uint256 launchPositionId,
        bool tokenIsToken0,
        int24 startTick,
        int24 terminalTick
    );
    event TokenGraduated(
        address indexed token,
        address indexed pool,
        uint256 indexed finalPositionId,
        address liquidityLocker,
        uint24 poolFee
    );
    event LaunchModeChanged(LaunchMode previousMode, LaunchMode nextMode);
    event CanaryCreatorChanged(address indexed creator, bool allowed);
    event FirstCanaryConfigured(address indexed creator, uint256 maxInitialBuyWei);
    event LaunchCreationPauseChanged(bool paused);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed nextOwner);
    event ImmediatePerpsHookSet(address indexed hook);
    event ImmediatePerpsRequirementSet(bool required);
    event ImmediatePerpsOpened(address indexed token, address indexed pool, uint16 maxLeverageX);

    error OnlyOwner();
    error OnlyPendingOwner();
    error InvalidAddress();
    error InvalidIdentity();
    error InvalidMetadata();
    error InvalidInitialBuy();
    error LaunchClosed();
    error CreatorNotAllowed();
    error UnsafeCanaryState();
    error Reentrancy();
    error PoolAlreadyExists();
    error PoolConfigurationInvalid();
    error TransferFailed();
    error UnknownToken();
    error NotReadyToGraduate();
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

    constructor(
        address owner_,
        address dexFactory_,
        address positionManager_,
        address swapRouter_,
        address wrappedNative_,
        address liquidityLocker_
    ) {
        if (
            owner_ == address(0)
                || dexFactory_ == address(0)
                || positionManager_ == address(0)
                || swapRouter_ == address(0)
                || wrappedNative_ == address(0)
                || liquidityLocker_ == address(0)
        ) revert InvalidAddress();
        owner = owner_;
        dexFactory = IUniswapV3FactoryV65(dexFactory_);
        positionManager = INonfungiblePositionManagerV65(positionManager_);
        swapRouter = ISwapRouter02V65(swapRouter_);
        wrappedNative = wrappedNative_;
        if (dexFactory.feeAmountTickSpacing(CANONICAL_POOL_FEE) != 200) revert PoolConfigurationInvalid();
        liquidityLocker = LeverageXPermanentLiquidityLockerV65(liquidityLocker_);
        launchMode = LaunchMode.Closed;
        emit OwnershipTransferred(address(0), owner_);
        emit LaunchCreationPauseChanged(true);
    }

    receive() external payable {}

    /// @notice Configures the atomic Spot × Perps hook. Launches revert if the hook fails.
    function setImmediatePerpsHook(address hook) external onlyOwner {
        if (hook == address(0)) revert InvalidAddress();
        immediatePerpsHook = hook;
        emit ImmediatePerpsHookSet(hook);
    }

    /// @notice Emergency deployment control. Production must keep this true.
    function setImmediatePerpsRequirement(bool required) external onlyOwner {
        requireImmediatePerps = required;
        emit ImmediatePerpsRequirementSet(required);
    }

    function configureFirstCanary(address creator, uint256 maxInitialBuyWei_) external onlyOwner {
        if (creator == address(0) || maxInitialBuyWei_ < MIN_CREATOR_GENESIS_BUY_WEI) revert InvalidAddress();
        if (launchMode != LaunchMode.Closed || !launchCreationPaused || allTokens.length != 0) revert UnsafeCanaryState();
        activeCanaryCreator = creator;
        canaryCreator[creator] = true;
        maxInitialBuyWei = maxInitialBuyWei_;
        launchMode = LaunchMode.Allowlist;
        launchCreationPaused = false;
        emit CanaryCreatorChanged(creator, true);
        emit LaunchModeChanged(LaunchMode.Closed, LaunchMode.Allowlist);
        emit LaunchCreationPauseChanged(false);
        emit FirstCanaryConfigured(creator, maxInitialBuyWei_);
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        bytes32 metadataHash
    ) external payable nonReentrant returns (LeverageXTokenV65 token, address pool, uint256 positionId, uint256 initialTokensOut) {
        if (launchCreationPaused || launchMode == LaunchMode.Closed) revert LaunchClosed();
        if (requireImmediatePerps && immediatePerpsHook == address(0)) revert ImmediatePerpsNotConfigured();
        if (liquidityLocker.launchFactory() != address(this)) revert PoolConfigurationInvalid();
        if (launchMode == LaunchMode.Allowlist) {
            if (msg.sender != activeCanaryCreator || !canaryCreator[msg.sender]) revert CreatorNotAllowed();
            if (allTokens.length != 0) revert UnsafeCanaryState();
        }
        bytes memory nameBytes = bytes(name);
        bytes memory symbolBytes = bytes(symbol);
        bytes memory uriBytes = bytes(metadataURI);
        if (nameBytes.length < 2 || nameBytes.length > 64 || symbolBytes.length < 1 || symbolBytes.length > 12) revert InvalidIdentity();
        if (metadataHash == bytes32(0) || uriBytes.length < 8 || uriBytes.length > 512) revert InvalidMetadata();
        if (msg.value < MIN_CREATOR_GENESIS_BUY_WEI || (maxInitialBuyWei != 0 && msg.value > maxInitialBuyWei)) {
            revert InvalidInitialBuy();
        }

        // Use a per-block CREATE2 salt so a public mempool observer cannot cheaply pre-create the
        // future token/WETH pool and permanently block the factory's next CREATE address.
        bytes32 launchSalt = keccak256(
            abi.encodePacked(msg.sender, metadataHash, allTokens.length, block.prevrandao, block.timestamp)
        );
        token = new LeverageXTokenV65{salt: launchSalt}(
            name, symbol, metadataURI, metadataHash, msg.sender, address(this)
        );
        address tokenAddress = address(token);
        bool isToken0 = tokenAddress < wrappedNative;
        address token0 = isToken0 ? tokenAddress : wrappedNative;
        address token1 = isToken0 ? wrappedNative : tokenAddress;
        if (dexFactory.getPool(token0, token1, CANONICAL_POOL_FEE) != address(0)) revert PoolAlreadyExists();

        uint160 sqrtPriceX96 = _openingSqrtPriceX96(isToken0);
        pool = positionManager.createAndInitializePoolIfNecessary(token0, token1, CANONICAL_POOL_FEE, sqrtPriceX96);
        if (
            pool == address(0)
                || pool != dexFactory.getPool(token0, token1, CANONICAL_POOL_FEE)
                || IUniswapV3PoolV65(pool).token0() != token0
                || IUniswapV3PoolV65(pool).token1() != token1
                || IUniswapV3PoolV65(pool).fee() != CANONICAL_POOL_FEE
        ) revert PoolConfigurationInvalid();

        IUniswapV3PoolV65 canonicalPool = IUniswapV3PoolV65(pool);
        canonicalPool.increaseObservationCardinalityNext(MIN_OBSERVATION_CARDINALITY);
        (uint160 initializedSqrtPriceX96, int24 startTick,,,,,) = canonicalPool.slot0();
        if (initializedSqrtPriceX96 == 0) revert PoolConfigurationInvalid();
        int24 tickLower = isToken0 ? TOKEN0_LAUNCH_TICK_LOWER : TOKEN1_LAUNCH_TICK_LOWER;
        int24 tickUpper = isToken0 ? TOKEN0_LAUNCH_TICK_UPPER : TOKEN1_LAUNCH_TICK_UPPER;
        if ((isToken0 && startTick >= tickLower) || (!isToken0 && startTick <= tickUpper)) revert PoolConfigurationInvalid();

        if (!token.approve(address(positionManager), LAUNCH_RANGE_TOKEN_ALLOCATION)) revert TransferFailed();
        uint256 amount0Desired = isToken0 ? LAUNCH_RANGE_TOKEN_ALLOCATION : 0;
        uint256 amount1Desired = isToken0 ? 0 : LAUNCH_RANGE_TOKEN_ALLOCATION;
        uint256 amount0;
        uint256 amount1;
        (positionId,, amount0, amount1) = positionManager.mint(
            INonfungiblePositionManagerV65.MintParams({
                token0: token0,
                token1: token1,
                fee: CANONICAL_POOL_FEE,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: amount0Desired == 0 ? 0 : amount0Desired - 1_000_000,
                amount1Min: amount1Desired == 0 ? 0 : amount1Desired - 1_000_000,
                recipient: address(liquidityLocker),
                deadline: block.timestamp
            })
        );
        uint256 launchTokensUsed = isToken0 ? amount0 : amount1;
        if (launchTokensUsed == 0 || launchTokensUsed > LAUNCH_RANGE_TOKEN_ALLOCATION) revert PoolConfigurationInvalid();
        token.approve(address(positionManager), 0);

        // Any one-sided mint rounding dust joins the final locked reserve. The factory retains no token inventory.
        uint256 remainingTokens = token.balanceOf(address(this));
        if (remainingTokens < FINAL_LIQUIDITY_TOKEN_RESERVE) revert PoolConfigurationInvalid();
        if (!token.transfer(address(liquidityLocker), remainingTokens)) revert TransferFailed();
        int24 terminalTick = isToken0 ? tickUpper : tickLower;
        liquidityLocker.registerLaunch(
            tokenAddress,
            pool,
            positionId,
            CANONICAL_POOL_FEE,
            terminalTick,
            isToken0,
            remainingTokens
        );

        initialTokensOut = swapRouter.exactInputSingle{value: msg.value}(
            ISwapRouter02V65.ExactInputSingleParams({
                tokenIn: wrappedNative,
                tokenOut: tokenAddress,
                fee: CANONICAL_POOL_FEE,
                recipient: msg.sender,
                amountIn: msg.value,
                amountOutMinimum: 1,
                sqrtPriceLimitX96: 0
            })
        );
        if (initialTokensOut == 0) revert InvalidInitialBuy();

        // Perps are born in the same transaction as the token and canonical spot pool.
        // Any registry or risk-engine failure reverts the complete mint, pool creation,
        // genesis buy, and perp activation so Spot can never exist without Perps.
        if (immediatePerpsHook != address(0)) {
            ILeverageXImmediatePerpsHookV88(immediatePerpsHook).onMarketMinted(
                tokenAddress, pool, msg.sender, CANONICAL_POOL_FEE, 20
            );
            emit ImmediatePerpsOpened(tokenAddress, pool, 20);
        } else if (requireImmediatePerps) {
            revert ImmediatePerpsActivationFailed();
        }

        allTokens.push(tokenAddress);
        canonicalPoolForToken[tokenAddress] = pool;
        _launchByToken[tokenAddress] = LaunchRecord({
            token: tokenAddress,
            deployer: msg.sender,
            pairToken: wrappedNative,
            pool: pool,
            dexFactory: address(dexFactory),
            positionManager: address(positionManager),
            liquidityLocker: address(liquidityLocker),
            launchPositionId: positionId,
            finalPositionId: 0,
            poolFee: CANONICAL_POOL_FEE,
            startTick: startTick,
            terminalTick: terminalTick,
            launchedAt: uint64(block.timestamp),
            initialBuyAmount: msg.value,
            supply: TOTAL_SUPPLY,
            metadataHash: metadataHash,
            isToken0: isToken0,
            exists: true,
            graduated: false
        });

        emit CanonicalPoolCreated(
            tokenAddress,
            pool,
            wrappedNative,
            address(dexFactory),
            address(positionManager),
            address(liquidityLocker),
            CANONICAL_POOL_FEE,
            positionId,
            isToken0,
            startTick,
            terminalTick
        );
        emit TokenLaunched(
            tokenAddress,
            msg.sender,
            address(dexFactory),
            wrappedNative,
            pool,
            address(positionManager),
            address(liquidityLocker),
            positionId,
            CANONICAL_POOL_FEE,
            isToken0,
            msg.value,
            initialTokensOut,
            TOTAL_SUPPLY,
            metadataHash
        );
    }

    function graduateToken(address token, uint256 amount0Min, uint256 amount1Min, uint256 deadline)
        external
        nonReentrant
        returns (uint256 finalPositionId)
    {
        LaunchRecord storage record = _launchByToken[token];
        if (!record.exists) revert UnknownToken();
        if (record.graduated) revert AlreadyGraduated();
        if (deadline < block.timestamp) revert PoolConfigurationInvalid();
        IUniswapV3PoolV65 pool = IUniswapV3PoolV65(record.pool);
        (, int24 currentTick,,,,,) = pool.slot0();
        bool currentReady = record.isToken0 ? currentTick >= record.terminalTick : currentTick <= record.terminalTick;
        if (!currentReady) revert NotReadyToGraduate();

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = GRADUATION_TWAP_SECONDS;
        secondsAgos[1] = 0;
        (int56[] memory tickCumulatives,) = pool.observe(secondsAgos);
        int56 tickDelta = tickCumulatives[1] - tickCumulatives[0];
        int56 interval = int56(uint56(GRADUATION_TWAP_SECONDS));
        int24 meanTick = int24(tickDelta / interval);
        if (tickDelta < 0 && (tickDelta % interval != 0)) meanTick--;
        bool twapReady = record.isToken0 ? meanTick >= record.terminalTick : meanTick <= record.terminalTick;
        if (!twapReady) revert NotReadyToGraduate();

        (finalPositionId,,,) = liquidityLocker.graduate(token, amount0Min, amount1Min, deadline);
        record.finalPositionId = finalPositionId;
        record.graduated = true;
        emit TokenGraduated(token, record.pool, finalPositionId, address(liquidityLocker), record.poolFee);
    }

    function getLaunchedToken(address tokenAddress)
        external
        view
        returns (
            address token,
            address deployer,
            address pairedToken,
            address pool,
            address positionManagerAddress,
            address locker,
            uint256 launchPositionId,
            uint256 finalPositionId,
            uint24 poolFee,
            int24 startTick,
            int24 terminalTick,
            uint256 supply,
            bool isToken0,
            bool exists,
            bool graduated,
            uint256 initialBuyAmount,
            bytes32 metadataHash
        )
    {
        LaunchRecord storage record = _launchByToken[tokenAddress];
        return (
            record.token,
            record.deployer,
            record.pairToken,
            record.pool,
            record.positionManager,
            record.liquidityLocker,
            record.launchPositionId,
            record.finalPositionId,
            record.poolFee,
            record.startTick,
            record.terminalTick,
            record.supply,
            record.isToken0,
            record.exists,
            record.graduated,
            record.initialBuyAmount,
            record.metadataHash
        );
    }

    /// @notice Stable integration alias used by external indexers and terminals.
    function marketForToken(address tokenAddress) external view returns (address) {
        return canonicalPoolForToken[tokenAddress];
    }

    function launchAt(uint256 index) external view returns (address token, address pool, address creator, uint64 launchedAt) {
        token = allTokens[index];
        LaunchRecord storage record = _launchByToken[token];
        return (token, record.pool, record.deployer, record.launchedAt);
    }

    function canonicalDexConfiguration()
        external
        view
        returns (
            address pairToken,
            address factoryAddress,
            address positionManagerAddress,
            address routerAddress,
            address quoterAddress,
            address lockerAddress,
            uint24 poolFee
        )
    {
        return (
            wrappedNative,
            address(dexFactory),
            address(positionManager),
            address(swapRouter),
            ROBINHOOD_UNISWAP_QUOTER_V2,
            address(liquidityLocker),
            CANONICAL_POOL_FEE
        );
    }

    function isCanonicalRobinhoodConfiguration() external view returns (bool) {
        return wrappedNative == ROBINHOOD_WETH
            && address(dexFactory) == ROBINHOOD_UNISWAP_V3_FACTORY
            && address(positionManager) == ROBINHOOD_UNISWAP_V3_POSITION_MANAGER
            && address(swapRouter) == ROBINHOOD_UNISWAP_SWAP_ROUTER_02;
    }

    function getLaunchTicks(address tokenAddress) external view returns (int24 startTick, int24 terminalTick, bool isToken0) {
        LaunchRecord storage record = _launchByToken[tokenAddress];
        if (!record.exists) revert UnknownToken();
        return (record.startTick, record.terminalTick, record.isToken0);
    }

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
        LeverageXTokenV65 tokenContract = LeverageXTokenV65(tokenAddress);
        return (
            tokenContract.name(),
            tokenContract.symbol(),
            tokenContract.metadataURI(),
            record.deployer,
            record.pool,
            record.pairToken,
            record.initialBuyAmount,
            record.launchedAt,
            record.graduated
        );
    }

    function graduationStatus(address tokenAddress) external view returns (uint256 current, uint256 threshold, bool graduated) {
        LaunchRecord storage record = _launchByToken[tokenAddress];
        if (!record.exists) revert UnknownToken();
        (, int24 currentTick,,,,,) = IUniswapV3PoolV65(record.pool).slot0();
        int256 start = int256(record.startTick);
        int256 terminal = int256(record.terminalTick);
        int256 nowTick = int256(currentTick);
        int256 distance = record.isToken0 ? terminal - start : start - terminal;
        int256 progress = record.isToken0 ? nowTick - start : start - nowTick;
        if (progress < 0) progress = 0;
        if (progress > distance) progress = distance;
        current = uint256(progress);
        threshold = uint256(distance);
        graduated = record.graduated;
    }

    function isLeverageXToken(address tokenAddress) external view returns (bool) {
        return _launchByToken[tokenAddress].exists;
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    function launchpadVersion() external pure returns (string memory) {
        return "LEVERAGE_X_V65_GMGN_LIVE_POOL";
    }

    /// @notice Deliberately opens public token creation after the canary has produced at least one canonical pool.
    /// @dev Existing Uniswap pools remain permissionless and cannot be paused by this factory.
    function openPublicLaunches() external onlyOwner {
        if (allTokens.length == 0 || launchMode != LaunchMode.Allowlist || launchCreationPaused) revert UnsafeCanaryState();
        LaunchMode previous = launchMode;
        launchMode = LaunchMode.Public;
        emit LaunchModeChanged(previous, LaunchMode.Public);
    }

    /// @notice Stops new token creation without pretending that already-created DEX pools are pausable.
    function closeNewLaunches() external onlyOwner {
        LaunchMode previous = launchMode;
        launchMode = LaunchMode.Closed;
        launchCreationPaused = true;
        address previousCanary = activeCanaryCreator;
        if (previousCanary != address(0)) {
            canaryCreator[previousCanary] = false;
            emit CanaryCreatorChanged(previousCanary, false);
        }
        activeCanaryCreator = address(0);
        emit LaunchModeChanged(previous, LaunchMode.Closed);
        emit LaunchCreationPauseChanged(true);
    }

    function setCanaryCreator(address creator, bool allowed) external onlyOwner {
        if (creator == address(0)) revert InvalidAddress();
        canaryCreator[creator] = allowed;
        emit CanaryCreatorChanged(creator, allowed);
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

    function _openingSqrtPriceX96(bool tokenIsToken0) internal pure returns (uint160) {
        uint256 priceWad = OPENING_FDV_ETH_WAD * 1e18 / TOTAL_SUPPLY;
        uint256 q192 = uint256(1) << 192;
        uint256 ratioX192 = tokenIsToken0
            ? BattleCurveMathV24.mulDivDown(priceWad, q192, 1e18)
            : BattleCurveMathV24.mulDivDown(1e18, q192, priceWad);
        uint256 sqrtPrice = BattleCurveMathV24.sqrtDown(ratioX192);
        if (sqrtPrice == 0 || sqrtPrice > type(uint160).max) revert PoolConfigurationInvalid();
        return uint160(sqrtPrice);
    }
}
