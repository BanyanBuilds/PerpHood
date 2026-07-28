// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    LeverageXPerpsMarketRegistryV76,
    IUniswapV3FactoryV76,
    IUniswapV3PoolV76
} from "../perps-registry-src/LeverageXPerpsMarketRegistryV76.sol";

interface VmV76 {
    function prank(address sender) external;
    function expectRevert(bytes4 revertData) external;
}

contract MockLaunchTokenV76 {
    address public immutable creator;
    address public immutable launchFactory;
    constructor(address creator_, address launchFactory_) { creator = creator_; launchFactory = launchFactory_; }
}

contract MockPoolV76 is IUniswapV3PoolV76 {
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;
    uint128 public liquidity = 1_000_000;
    uint160 public price = uint160(1 << 96);
    bool public unlocked = true;
    constructor(address token0_, address token1_, uint24 fee_) { token0 = token0_; token1 = token1_; fee = fee_; }
    function setReady(uint128 liquidity_, uint160 price_, bool unlocked_) external { liquidity = liquidity_; price = price_; unlocked = unlocked_; }
    function slot0() external view returns (uint160,int24,uint16,uint16,uint16,uint8,bool) {
        return (price, 0, 0, 1, 1, 0, unlocked);
    }
}

contract MockFactoryV76 is IUniswapV3FactoryV76 {
    mapping(bytes32 => address) public pools;
    function key(address a, address b, uint24 fee) public pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a,b,fee)) : keccak256(abi.encode(b,a,fee));
    }
    function setPool(address a, address b, uint24 fee, address pool) external { pools[key(a,b,fee)] = pool; }
    function getPool(address a, address b, uint24 fee) external view returns (address) { return pools[key(a,b,fee)]; }
}

contract LeverageXPerpsMarketRegistryV76Test {
    VmV76 private constant vm = VmV76(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant CREATOR = address(0xC0FFEE);
    address private constant TRADER = address(0xBEEF);
    address private constant LAUNCH_FACTORY = address(0x1234);
    address private constant WETH = address(0x5678);

    MockFactoryV76 factory;
    LeverageXPerpsMarketRegistryV76 registry;
    MockLaunchTokenV76 token;
    MockPoolV76 pool;

    function setUp() public {
        factory = new MockFactoryV76();
        registry = new LeverageXPerpsMarketRegistryV76(address(this), LAUNCH_FACTORY, address(factory), WETH);
        token = new MockLaunchTokenV76(CREATOR, LAUNCH_FACTORY);
        (address token0, address token1) = address(token) < WETH ? (address(token), WETH) : (WETH, address(token));
        pool = new MockPoolV76(token0, token1, 10_000);
        factory.setPool(address(token), WETH, 10_000, address(pool));
    }

    function testActivationCreatesTradableMarketAndBlocksCreator() public {
        registry.activateMarket(address(token), address(pool), 20);
        require(registry.marketCount() == 1, "COUNT");
        require(registry.isPermanentlyBlocked(address(token), CREATOR), "CREATOR_NOT_BLOCKED");
        require(!registry.isTradable(address(token), CREATOR, 1), "CREATOR_TRADABLE");
        require(registry.isTradable(address(token), TRADER, 20), "TRADER_NOT_TRADABLE");
        require(!registry.isTradable(address(token), TRADER, 21), "LEVERAGE_BYPASS");
    }

    function testRejectsNonLaunchFactoryToken() public {
        MockLaunchTokenV76 bad = new MockLaunchTokenV76(CREATOR, address(0x9999));
        (address token0, address token1) = address(bad) < WETH ? (address(bad), WETH) : (WETH, address(bad));
        MockPoolV76 badPool = new MockPoolV76(token0, token1, 10_000);
        factory.setPool(address(bad), WETH, 10_000, address(badPool));
        vm.expectRevert(LeverageXPerpsMarketRegistryV76.TokenNotFromLaunchFactory.selector);
        registry.activateMarket(address(bad), address(badPool), 20);
    }

    function testRejectsPoolWithoutPriceOrLiquidity() public {
        pool.setReady(0, 0, true);
        vm.expectRevert(LeverageXPerpsMarketRegistryV76.PoolNotReady.selector);
        registry.activateMarket(address(token), address(pool), 20);
    }

    function testPausePreservesPermanentCreatorBlock() public {
        registry.activateMarket(address(token), address(pool), 20);
        registry.setMarketActive(address(token), false);
        require(!registry.isTradable(address(token), TRADER, 1), "PAUSE_FAILED");
        require(registry.isPermanentlyBlocked(address(token), CREATOR), "BLOCK_REMOVED");
        registry.setMarketActive(address(token), true);
        require(registry.isTradable(address(token), TRADER, 1), "RESUME_FAILED");
        require(!registry.isTradable(address(token), CREATOR, 1), "CREATOR_REENABLED");
    }

    function testOnlyOwnerCanAddProvenLinkedWallet() public {
        registry.activateMarket(address(token), address(pool), 20);
        vm.expectRevert(LeverageXPerpsMarketRegistryV76.OnlyOwner.selector);
        vm.prank(TRADER);
        registry.permanentlyBlockProvenLinkedWallet(address(token), TRADER, keccak256("proof"));
        registry.permanentlyBlockProvenLinkedWallet(address(token), TRADER, keccak256("proof"));
        require(!registry.isTradable(address(token), TRADER, 1), "LINKED_WALLET_NOT_BLOCKED");
    }
}
