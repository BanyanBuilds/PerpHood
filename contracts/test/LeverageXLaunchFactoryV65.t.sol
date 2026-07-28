// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    IERC20V65,
    IWrappedNativeV65,
    IUniswapV3FactoryV65,
    IUniswapV3PoolV65,
    INonfungiblePositionManagerV65,
    ISwapRouter02V65,
    LeverageXTokenV65,
    LeverageXPermanentLiquidityLockerV65,
    LeverageXLaunchFactoryV65
} from "../src/LeverageXLaunchFactoryV65.sol";

interface VmV65 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
    function warp(uint256 timestamp) external;
}

contract MockERC20V65 is IERC20V65 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 value) external { balanceOf[to] += value; }
    function approve(address spender, uint256 value) external returns (bool) { allowance[msg.sender][spender] = value; return true; }
    function transfer(address to, uint256 value) external returns (bool) { _transfer(msg.sender, to, value); return true; }
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= value, "ALLOWANCE");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - value;
        _transfer(from, to, value);
        return true;
    }
    function _transfer(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "BALANCE");
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}

contract MockWETHV65 is MockERC20V65, IWrappedNativeV65 {
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
    receive() external payable { balanceOf[msg.sender] += msg.value; }
}

contract MockPoolV65 is IUniswapV3PoolV65 {
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    uint160 private _sqrtPriceX96;
    int24 private _tick;
    int24 private _twapTick;
    uint16 private _observationCardinalityNext = 1;

    constructor(address token0_, address token1_, uint24 fee_, uint160 sqrtPriceX96_, int24 tick_) {
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
        _sqrtPriceX96 = sqrtPriceX96_;
        _tick = tick_;
        _twapTick = tick_;
    }

    function setTick(int24 nextTick) external { _tick = nextTick; }
    function setTwapTick(int24 nextTick) external { _twapTick = nextTick; }
    function increaseObservationCardinalityNext(uint16 next) external {
        if (next > _observationCardinalityNext) _observationCardinalityNext = next;
    }
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory ticks, uint160[] memory secondsPerLiquidity) {
        ticks = new int56[](secondsAgos.length);
        secondsPerLiquidity = new uint160[](secondsAgos.length);
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            ticks[i] = -int56(_twapTick) * int56(uint56(secondsAgos[i]));
        }
    }
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (_sqrtPriceX96, _tick, 0, 1, _observationCardinalityNext, 0, true);
    }
}

contract MockFactoryV65 is IUniswapV3FactoryV65 {
    mapping(bytes32 => address) private _pool;
    address public immutable wrappedNative;

    constructor(address wrappedNative_) { wrappedNative = wrappedNative_; }
    function feeAmountTickSpacing(uint24 fee) external pure returns (int24) { return fee == 10_000 ? int24(200) : int24(0); }
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return _pool[keccak256(abi.encode(token0, token1, fee))];
    }
    function createPool(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external returns (address pool) {
        bytes32 key = keccak256(abi.encode(token0, token1, fee));
        require(_pool[key] == address(0), "POOL_EXISTS");
        int24 tick = token0 == wrappedNative ? int24(221_100) : int24(-221_100);
        pool = address(new MockPoolV65(token0, token1, fee, sqrtPriceX96, tick));
        _pool[key] = pool;
    }
}

interface IERC721ReceiverV65 {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}

contract MockPositionManagerV65 is INonfungiblePositionManagerV65 {
    struct Position {
        address owner;
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
        uint128 owed0;
        uint128 owed1;
    }

    MockFactoryV65 public immutable factory;
    uint256 public nextTokenId = 1;
    mapping(uint256 => Position) public position;
    mapping(address => uint256) public launchPositionForPool;

    constructor(MockFactoryV65 factory_) { factory = factory_; }

    function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96)
        external
        payable
        returns (address pool)
    {
        pool = factory.getPool(token0, token1, fee);
        if (pool == address(0)) pool = factory.createPool(token0, token1, fee, sqrtPriceX96);
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;
        if (amount0 > 0) require(IERC20V65(params.token0).transferFrom(msg.sender, address(this), amount0), "TRANSFER0");
        if (amount1 > 0) require(IERC20V65(params.token1).transferFrom(msg.sender, address(this), amount1), "TRANSFER1");
        require(amount0 >= params.amount0Min && amount1 >= params.amount1Min, "MIN");
        tokenId = nextTokenId++;
        liquidity = uint128(1_000_000 + tokenId);
        position[tokenId] = Position({
            owner: params.recipient,
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            amount0: amount0,
            amount1: amount1,
            owed0: 0,
            owed1: 0
        });
        address pool = factory.getPool(params.token0, params.token1, params.fee);
        if (launchPositionForPool[pool] == 0) launchPositionForPool[pool] = tokenId;
        if (params.recipient.code.length > 0) {
            bytes4 response = IERC721ReceiverV65(params.recipient).onERC721Received(msg.sender, address(0), tokenId, "");
            require(response == IERC721ReceiverV65.onERC721Received.selector, "RECEIVER");
        }
    }

    function ownerOf(uint256 tokenId) external view returns (address owner) { return position[tokenId].owner; }

    function positions(uint256 tokenId)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128)
    {
        Position storage p = position[tokenId];
        return (0, address(0), p.token0, p.token1, p.fee, p.tickLower, p.tickUpper, p.liquidity, 0, 0, p.owed0, p.owed1);
    }

    function recordSwap(address pool, address tokenOut, uint256 tokenOutAmount, address weth, uint256 wethIn) external {
        uint256 tokenId = launchPositionForPool[pool];
        Position storage p = position[tokenId];
        if (p.token0 == tokenOut) {
            require(p.amount0 >= tokenOutAmount, "LIQ0");
            p.amount0 -= tokenOutAmount;
            p.amount1 += wethIn;
        } else {
            require(p.amount1 >= tokenOutAmount, "LIQ1");
            p.amount1 -= tokenOutAmount;
            p.amount0 += wethIn;
        }
        require(IERC20V65(tokenOut).transfer(msg.sender, tokenOutAmount), "TOKEN_OUT");
        require(IERC20V65(weth).transferFrom(msg.sender, address(this), wethIn), "WETH_IN");
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        Position storage p = position[params.tokenId];
        require(msg.sender == p.owner && p.liquidity == params.liquidity, "OWNER_OR_LIQ");
        p.liquidity = 0;
        amount0 = p.amount0;
        amount1 = p.amount1;
        p.owed0 = uint128(amount0);
        p.owed1 = uint128(amount1);
    }

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        Position storage p = position[params.tokenId];
        require(msg.sender == p.owner, "OWNER");
        amount0 = p.owed0;
        amount1 = p.owed1;
        p.owed0 = 0;
        p.owed1 = 0;
        p.amount0 = 0;
        p.amount1 = 0;
        if (amount0 > 0) require(IERC20V65(p.token0).transfer(params.recipient, amount0), "COLLECT0");
        if (amount1 > 0) require(IERC20V65(p.token1).transfer(params.recipient, amount1), "COLLECT1");
    }

    function burn(uint256 tokenId) external payable {
        Position storage p = position[tokenId];
        require(msg.sender == p.owner && p.liquidity == 0 && p.owed0 == 0 && p.owed1 == 0, "BURN");
        delete position[tokenId];
    }
}

contract MockRouterV65 is ISwapRouter02V65 {
    MockFactoryV65 public immutable factory;
    MockPositionManagerV65 public immutable positionManager;
    MockWETHV65 public immutable weth;

    constructor(MockFactoryV65 factory_, MockPositionManagerV65 positionManager_, MockWETHV65 weth_) {
        factory = factory_;
        positionManager = positionManager_;
        weth = weth_;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        require(msg.value == params.amountIn && params.tokenIn == address(weth), "INPUT");
        address pool = factory.getPool(params.tokenIn, params.tokenOut, params.fee);
        require(pool != address(0), "NO_POOL");
        amountOut = params.amountIn * 4_000_000_000;
        require(amountOut >= params.amountOutMinimum, "MIN_OUT");
        weth.deposit{value: params.amountIn}();
        weth.approve(address(positionManager), params.amountIn);
        positionManager.recordSwap(pool, params.tokenOut, amountOut, address(weth), params.amountIn);
        require(IERC20V65(params.tokenOut).transfer(params.recipient, amountOut), "RECIPIENT");
    }
}

contract LeverageXLaunchFactoryV65Test {
    VmV65 internal constant vm = VmV65(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal creator = address(0xC0FFEE);
    address internal outsider = address(0xBAD);
    address internal nextOwner = address(0xABCD);

    MockWETHV65 internal weth;
    MockFactoryV65 internal dexFactory;
    MockPositionManagerV65 internal positionManager;
    MockRouterV65 internal router;
    LeverageXPermanentLiquidityLockerV65 internal locker;
    LeverageXLaunchFactoryV65 internal factory;

    function setUp() public {
        weth = new MockWETHV65();
        dexFactory = new MockFactoryV65(address(weth));
        positionManager = new MockPositionManagerV65(dexFactory);
        router = new MockRouterV65(dexFactory, positionManager, weth);
        locker = new LeverageXPermanentLiquidityLockerV65(address(this), address(dexFactory), address(positionManager), address(weth));
        factory = new LeverageXLaunchFactoryV65(
            address(this), address(dexFactory), address(positionManager), address(router), address(weth), address(locker)
        );
        locker.bindFactory(address(factory));
        vm.deal(creator, 10 ether);
        vm.deal(outsider, 10 ether);
    }

    function _configure() internal { factory.configureFirstCanary(creator, 0.01 ether); }

    function _launch()
        internal
        returns (LeverageXTokenV65 token, address pool, uint256 positionId, uint256 initialTokensOut)
    {
        _configure();
        vm.prank(creator);
        (token, pool, positionId, initialTokensOut) = factory.createToken{value: 0.001 ether}(
            "Leverage X Canary", "LXC", "https://example.com/metadata/lxc.json", keccak256("lxc-v65")
        );
    }

    function testDeploysClosedAndOnlyLaunchCreationIsPausable() public view {
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV65.LaunchMode.Closed), "MODE");
        require(factory.launchCreationPaused(), "CREATION_OPEN");
        require(factory.tokenCount() == 0, "TOKENS");
        require(address(factory.dexFactory()) == address(dexFactory), "DEX");
        require(address(factory.liquidityLocker()) == address(locker), "LOCKER");
    }

    function testCanaryLaunchCreatesCanonicalPoolAndPermanentPosition() public {
        (LeverageXTokenV65 token, address pool, uint256 positionId, uint256 initialTokensOut) = _launch();
        require(pool == dexFactory.getPool(address(token), address(weth), 10_000), "CANONICAL_POOL");
        require(positionManager.ownerOf(positionId) == address(locker), "NFT_NOT_LOCKED");
        require(token.totalSupply() == 1_000_000_000 ether, "SUPPLY");
        require(token.balanceOf(address(factory)) == 0, "FACTORY_INVENTORY");
        require(token.balanceOf(creator) == initialTokensOut && initialTokensOut > 0, "GENESIS_BUY");
        require(token.balanceOf(address(locker)) >= 200_000_000 ether, "FINAL_RESERVE");
        require(factory.isLeverageXToken(address(token)), "ATTRIBUTION");
        require(factory.allTokens(0) == address(token), "REGISTRY");
        require(factory.canonicalPoolForToken(address(token)) == pool, "POOL_MAPPING");
        require(factory.marketForToken(address(token)) == pool, "MARKET_ALIAS");
        (address listedToken, address listedPool, address listedCreator,) = factory.launchAt(0);
        require(listedToken == address(token) && listedPool == pool && listedCreator == creator, "LAUNCH_AT");
    }

    function testAllowlistBlocksOtherCreatorsAndSecondCanary() public {
        _configure();
        vm.expectRevert(LeverageXLaunchFactoryV65.CreatorNotAllowed.selector);
        vm.prank(outsider);
        factory.createToken{value: 0.001 ether}("Blocked", "BLOCK", "https://example.com/b.json", keccak256("blocked"));
        vm.prank(creator);
        factory.createToken{value: 0.001 ether}("First", "ONE", "https://example.com/one.json", keccak256("one"));
        vm.expectRevert(LeverageXLaunchFactoryV65.UnsafeCanaryState.selector);
        vm.prank(creator);
        factory.createToken{value: 0.001 ether}("Second", "TWO", "https://example.com/two.json", keccak256("two"));
    }

    function testPublicOpeningRequiresSuccessfulCanaryAndCanBeClosed() public {
        vm.expectRevert(LeverageXLaunchFactoryV65.UnsafeCanaryState.selector);
        factory.openPublicLaunches();
        _launch();
        factory.openPublicLaunches();
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV65.LaunchMode.Public), "NOT_PUBLIC");
        factory.closeNewLaunches();
        require(factory.launchCreationPaused(), "NOT_PAUSED");
        require(!factory.canaryCreator(creator), "CANARY_NOT_REVOKED");
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV65.LaunchMode.Closed), "NOT_CLOSED");
    }

    function testGraduationReplacesLaunchNftWithPermanentFullRangeNft() public {
        (LeverageXTokenV65 token, address pool, uint256 launchPositionId,) = _launch();
        (, int24 terminalTick,) = factory.getLaunchTicks(address(token));
        MockPoolV65(pool).setTick(terminalTick);
        MockPoolV65(pool).setTwapTick(terminalTick);
        vm.warp(block.timestamp + factory.GRADUATION_TWAP_SECONDS());
        uint256 finalPositionId = factory.graduateToken(address(token), 0, 0, block.timestamp + 1);
        require(finalPositionId != 0 && finalPositionId != launchPositionId, "FINAL_NFT");
        require(positionManager.ownerOf(finalPositionId) == address(locker), "FINAL_NOT_LOCKED");
        LeverageXPermanentLiquidityLockerV65.LockedLaunch memory locked = locker.getLockedLaunch(address(token));
        (,, bool graduated) = factory.graduationStatus(address(token));
        require(graduated && locked.finalPositionId == finalPositionId && locked.graduated, "GRADUATION_RECORD");
    }


    function testCannotGraduateFromOneBlockTerminalTickManipulation() public {
        (LeverageXTokenV65 token, address pool,,) = _launch();
        (, int24 terminalTick,) = factory.getLaunchTicks(address(token));
        MockPoolV65(pool).setTick(terminalTick);
        vm.expectRevert(LeverageXLaunchFactoryV65.NotReadyToGraduate.selector);
        factory.graduateToken(address(token), 0, 0, block.timestamp + 1);
    }

    function testCannotGraduateBeforeTerminalTick() public {
        (LeverageXTokenV65 token,,,) = _launch();
        vm.expectRevert(LeverageXLaunchFactoryV65.NotReadyToGraduate.selector);
        factory.graduateToken(address(token), 0, 0, block.timestamp + 1);
    }

    function testLockerHasNoGenericWithdrawalSurface() public {
        (bool success,) = address(locker).call(abi.encodeWithSignature("withdraw(address,uint256)"));
        require(!success, "WITHDRAW_SURFACE");
        (success,) = address(locker).call(abi.encodeWithSignature("rescue(address,address,uint256)", address(weth), address(this), 1));
        require(!success, "RESCUE_SURFACE");
    }

    function testProtocolEconomicsAreFixedAndNotCreatorSelectable() public view {
        require(factory.CANONICAL_POOL_FEE() == 10_000, "POOL_FEE");
        require(factory.OPENING_FDV_ETH_WAD() == 0.25 ether, "OPENING_FDV");
        require(factory.TARGET_FDV_MULTIPLIER() == 90, "TARGET_MULTIPLIER");
        require(factory.TOTAL_SUPPLY() == 1_000_000_000 ether, "TOTAL_SUPPLY");
        require(factory.LAUNCH_RANGE_TOKEN_ALLOCATION() + factory.FINAL_LIQUIDITY_TOKEN_RESERVE() == factory.TOTAL_SUPPLY(), "ALLOCATIONS");
        require(factory.GRADUATION_TWAP_SECONDS() == 15 minutes, "TWAP");
        require(factory.MIN_OBSERVATION_CARDINALITY() == 32, "OBSERVATIONS");
    }

    function testCanonicalDexConfigurationReadSurface() public view {
        (address pairToken, address factoryAddress, address manager, address routerAddress, address quoter, address lockerAddress, uint24 fee) = factory.canonicalDexConfiguration();
        require(pairToken == address(weth), "PAIR");
        require(factoryAddress == address(dexFactory), "FACTORY");
        require(manager == address(positionManager), "MANAGER");
        require(routerAddress == address(router), "ROUTER");
        require(quoter == factory.ROBINHOOD_UNISWAP_QUOTER_V2(), "QUOTER");
        require(lockerAddress == address(locker), "LOCKER");
        require(fee == 10_000, "FEE");
        require(!factory.isCanonicalRobinhoodConfiguration(), "MOCKS_ARE_NOT_MAINNET");
    }

    function testOwnershipTransferIsTwoStep() public {
        factory.beginOwnershipTransfer(nextOwner);
        vm.expectRevert(LeverageXLaunchFactoryV65.OnlyPendingOwner.selector);
        vm.prank(outsider);
        factory.acceptOwnership();
        vm.prank(nextOwner);
        factory.acceptOwnership();
        require(factory.owner() == nextOwner, "OWNER");
    }
}
