// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LeverageXLaunchFactoryV60, LeverageXSpotMarketV60, LeverageXTokenV60} from "../src/LeverageXLaunchFactoryV60.sol";

interface VmV60 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
}

contract LeverageXLaunchFactoryV60Test {
    VmV60 internal constant vm = VmV60(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xB0B);
    address internal outsider = address(0xBAD);
    address internal nextOwner = address(0xABCD);
    LeverageXLaunchFactoryV60 internal factory;

    function setUp() public {
        factory = new LeverageXLaunchFactoryV60(address(this));
        vm.deal(creator, 10 ether);
        vm.deal(trader, 10 ether);
        vm.deal(outsider, 10 ether);
    }

    function _configureCanary() internal {
        factory.configureFirstCanary(creator, 0.01 ether, 5_000_000 ether);
    }

    function _launch() internal returns (LeverageXSpotMarketV60 market, LeverageXTokenV60 token) {
        _configureCanary();
        vm.prank(creator);
        (market, token) = factory.createMarket{value: 0.00082 ether}(
            "Leverage X Canary",
            "LXC",
            "https://example.com/metadata/lxc.json",
            keccak256("lxc-metadata"),
            45_000 ether
        );
    }

    function testDeploysClosedAndGloballyPaused() public view {
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV60.LaunchMode.Closed), "MODE");
        require(factory.globalTradingPaused(), "GLOBAL_NOT_PAUSED");
        require(factory.newMarketsPaused(), "MARKETS_NOT_PAUSED");
        require(factory.marketCount() == 0, "MARKETS");
    }

    function testAtomicCanaryConfiguration() public {
        _configureCanary();
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV60.LaunchMode.Allowlist), "MODE");
        require(factory.activeCanaryCreator() == creator, "ACTIVE_CREATOR");
        require(factory.canaryCreator(creator), "ALLOWLIST");
        require(factory.globalTradingPaused(), "GLOBAL_OPEN");
        require(factory.newMarketsPaused(), "NEW_MARKETS_OPEN");
        require(factory.defaultMaxBuyWei() == 0.01 ether, "BUY_CAP");
        require(factory.defaultMaxSellTokenWad() == 5_000_000 ether, "SELL_CAP");
    }

    function testCanaryConfigurationRequiresPristineState() public {
        _configureCanary();
        vm.expectRevert(LeverageXLaunchFactoryV60.UnsafeCanaryState.selector);
        factory.configureFirstCanary(outsider, 0.01 ether, 5_000_000 ether);
    }

    function testClosedAndAllowlistModesProtectLaunches() public {
        vm.expectRevert(LeverageXLaunchFactoryV60.LaunchClosed.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}("Closed", "CLOSE", "https://example.com/closed.json", keccak256("closed"), 0);

        _configureCanary();
        vm.expectRevert(LeverageXLaunchFactoryV60.CreatorNotAllowed.selector);
        vm.prank(outsider);
        factory.createMarket{value: 0.00082 ether}("Blocked", "BLOCK", "https://example.com/blocked.json", keccak256("blocked"), 0);
    }

    function testRejectsCustomMigrationTarget() public {
        _configureCanary();
        vm.expectRevert(LeverageXLaunchFactoryV60.InvalidMigrationTarget.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}(
            "Custom Target",
            "CUSTOM",
            "https://example.com/metadata/custom.json",
            keccak256("custom-target"),
            69_000 ether
        );
    }

    function testZeroMigrationTargetResolvesToProtocolDefault() public {
        _configureCanary();
        vm.prank(creator);
        (LeverageXSpotMarketV60 market,) = factory.createMarket{value: 0.00082 ether}(
            "Protocol Target",
            "FIXED",
            "https://example.com/metadata/fixed.json",
            keccak256("fixed-target"),
            0
        );
        require(market.migrationTargetUsdWad() == factory.DEFAULT_MIGRATION_TARGET_USD_WAD(), "TARGET");
    }

    function testCanaryMarketStartsPausedCappedAndFixedSupply() public {
        (LeverageXSpotMarketV60 market, LeverageXTokenV60 token) = _launch();
        require(market.paused(), "LOCAL_NOT_PAUSED");
        require(market.maxBuyWei() == 0.01 ether, "BUY_CAP");
        require(market.maxSellTokenWad() == 5_000_000 ether, "SELL_CAP");
        require(market.tradeCount() == 1, "GENESIS_ONLY");
        require(token.totalSupply() == 1_000_000_000 ether, "SUPPLY");
        require(factory.marketForToken(address(token)) == address(market), "REGISTRY");
        require(market.isPerpsRestricted(creator), "CREATOR_PERPS");
    }

    function testAllowlistCanCreateExactlyOneCanaryMarket() public {
        _launch();
        vm.expectRevert(LeverageXLaunchFactoryV60.UnsafeCanaryState.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}(
            "Second Canary", "LXC2", "https://example.com/metadata/lxc2.json", keccak256("lxc2-metadata"), 45_000 ether
        );
    }

    function testAtomicFirstMarketOpenAndCaps() public {
        (LeverageXSpotMarketV60 market, LeverageXTokenV60 token) = _launch();
        factory.openFirstCanaryMarket(market);
        require(!factory.globalTradingPaused(), "GLOBAL_PAUSED");
        require(!market.paused(), "MARKET_PAUSED");
        require(factory.newMarketsPaused(), "FUTURE_MARKETS_OPEN");
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV60.LaunchMode.Allowlist), "PUBLIC_MODE");

        vm.expectRevert(LeverageXSpotMarketV60.BuyCapExceeded.selector);
        vm.prank(trader);
        market.buy{value: 0.011 ether}(0);

        vm.prank(trader);
        uint256 bought = market.buy{value: 0.01 ether}(0);
        uint256 sellAmount = bought < 5_000_000 ether ? bought : 5_000_000 ether;
        vm.startPrank(trader);
        token.approve(address(market), sellAmount);
        uint256 payout = market.sell(sellAmount, 0);
        vm.stopPrank();
        require(payout > 0, "NO_PAYOUT");
    }

    function testOpenRejectsWrongState() public {
        vm.expectRevert(LeverageXLaunchFactoryV60.InvalidCanaryMarket.selector);
        factory.openFirstCanaryMarket(LeverageXSpotMarketV60(payable(address(0))));
    }

    function testEmergencyLockdownClosesEverything() public {
        (LeverageXSpotMarketV60 market,) = _launch();
        factory.openFirstCanaryMarket(market);
        factory.emergencyLockdown(market);

        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV60.LaunchMode.Closed), "NOT_CLOSED");
        require(factory.globalTradingPaused(), "GLOBAL_OPEN");
        require(factory.newMarketsPaused(), "NEW_MARKETS_OPEN");
        require(market.paused(), "MARKET_OPEN");
        require(factory.activeCanaryCreator() == address(0), "ACTIVE_CREATOR");
        require(!factory.canaryCreator(creator), "CREATOR_STILL_ALLOWED");

        vm.expectRevert(LeverageXSpotMarketV60.MarketPaused.selector);
        vm.prank(trader);
        market.buy{value: 0.001 ether}(0);

        vm.expectRevert(LeverageXLaunchFactoryV60.LaunchClosed.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}("Second", "TWO", "https://example.com/two.json", keccak256("two"), 0);
    }

    function testPublicModeStillRequiresDeliberateOwnerAction() public {
        factory.setLaunchMode(LeverageXLaunchFactoryV60.LaunchMode.Public);
        vm.prank(outsider);
        (LeverageXSpotMarketV60 market,) = factory.createMarket{value: 0.00082 ether}(
            "Public Coin", "PUB", "https://example.com/pub.json", keccak256("pub"), 0
        );
        require(address(market) != address(0), "NO_MARKET");
        require(market.paused(), "PUBLIC_MARKET_NOT_PAUSED");
    }

    function testOwnershipTransferIsTwoStep() public {
        factory.beginOwnershipTransfer(nextOwner);
        require(factory.pendingOwner() == nextOwner, "PENDING");
        vm.expectRevert(LeverageXLaunchFactoryV60.OnlyPendingOwner.selector);
        vm.prank(outsider);
        factory.acceptOwnership();
        vm.prank(nextOwner);
        factory.acceptOwnership();
        require(factory.owner() == nextOwner, "OWNER");
    }
}
