// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LeverageXLaunchFactoryV63, LeverageXSpotMarketV63, LeverageXTokenV63} from "../src/LeverageXLaunchFactoryV63.sol";

interface VmV63 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
}

contract LeverageXLaunchFactoryV63Test {
    VmV63 internal constant vm = VmV63(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xB0B);
    address internal outsider = address(0xBAD);
    address internal nextOwner = address(0xABCD);
    LeverageXLaunchFactoryV63 internal factory;

    function setUp() public {
        factory = new LeverageXLaunchFactoryV63(address(this));
        vm.deal(creator, 10 ether);
        vm.deal(trader, 10 ether);
        vm.deal(outsider, 10 ether);
    }

    function _configureCanary() internal {
        factory.configureFirstCanary(creator, 0.01 ether, 5_000_000 ether);
    }

    function _launch() internal returns (LeverageXSpotMarketV63 market, LeverageXTokenV63 token) {
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
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV63.LaunchMode.Closed), "MODE");
        require(factory.globalTradingPaused(), "GLOBAL_NOT_PAUSED");
        require(factory.newMarketsPaused(), "MARKETS_NOT_PAUSED");
        require(factory.marketCount() == 0, "MARKETS");
    }

    function testAtomicCanaryConfiguration() public {
        _configureCanary();
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV63.LaunchMode.Allowlist), "MODE");
        require(factory.activeCanaryCreator() == creator, "ACTIVE_CREATOR");
        require(factory.canaryCreator(creator), "ALLOWLIST");
        require(factory.globalTradingPaused(), "GLOBAL_OPEN");
        require(factory.newMarketsPaused(), "NEW_MARKETS_OPEN");
        require(factory.defaultMaxBuyWei() == 0.01 ether, "BUY_CAP");
        require(factory.defaultMaxSellTokenWad() == 5_000_000 ether, "SELL_CAP");
    }

    function testCanaryConfigurationRequiresPristineState() public {
        _configureCanary();
        vm.expectRevert(LeverageXLaunchFactoryV63.UnsafeCanaryState.selector);
        factory.configureFirstCanary(outsider, 0.01 ether, 5_000_000 ether);
    }

    function testClosedAndAllowlistModesProtectLaunches() public {
        vm.expectRevert(LeverageXLaunchFactoryV63.LaunchClosed.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}("Closed", "CLOSE", "https://example.com/closed.json", keccak256("closed"), 0);

        _configureCanary();
        vm.expectRevert(LeverageXLaunchFactoryV63.CreatorNotAllowed.selector);
        vm.prank(outsider);
        factory.createMarket{value: 0.00082 ether}("Blocked", "BLOCK", "https://example.com/blocked.json", keccak256("blocked"), 0);
    }

    function testRejectsCustomMigrationTarget() public {
        _configureCanary();
        vm.expectRevert(LeverageXLaunchFactoryV63.InvalidMigrationTarget.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}(
            "Custom Target",
            "CUSTOM",
            "https://example.com/metadata/custom.json",
            keccak256("custom-target"),
            69_000 ether
        );
    }

    function testCreatorChoosesInitialBuyWithinCanaryCap() public {
        _configureCanary();
        vm.prank(creator);
        (LeverageXSpotMarketV63 market,) = factory.createMarket{value: 0.005 ether}(
            "Chosen Buy",
            "CHOOSE",
            "https://example.com/metadata/chosen.json",
            keccak256("chosen-buy"),
            0
        );
        require(market.creatorGenesisBuyWei() == 0.005 ether, "CREATOR_BUY");
    }

    function testRejectsCreatorBuyAboveConfiguredCap() public {
        _configureCanary();
        vm.expectRevert(LeverageXLaunchFactoryV63.InvalidGenesisBuy.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.010000000000000001 ether}(
            "Too Large",
            "LARGE",
            "https://example.com/metadata/large.json",
            keccak256("large-buy"),
            0
        );
    }

    function testZeroMigrationTargetResolvesToProtocolDefault() public {
        _configureCanary();
        vm.prank(creator);
        (LeverageXSpotMarketV63 market,) = factory.createMarket{value: 0.00082 ether}(
            "Protocol Target",
            "FIXED",
            "https://example.com/metadata/fixed.json",
            keccak256("fixed-target"),
            0
        );
        require(market.migrationTargetUsdWad() == factory.DEFAULT_MIGRATION_TARGET_USD_WAD(), "TARGET");
    }

    function testCanaryMarketStartsPausedCappedAndFixedSupply() public {
        (LeverageXSpotMarketV63 market, LeverageXTokenV63 token) = _launch();
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
        vm.expectRevert(LeverageXLaunchFactoryV63.UnsafeCanaryState.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}(
            "Second Canary", "LXC2", "https://example.com/metadata/lxc2.json", keccak256("lxc2-metadata"), 45_000 ether
        );
    }

    function testAtomicFirstMarketOpenAndCaps() public {
        (LeverageXSpotMarketV63 market, LeverageXTokenV63 token) = _launch();
        factory.openFirstCanaryMarket(market);
        require(!factory.globalTradingPaused(), "GLOBAL_PAUSED");
        require(!market.paused(), "MARKET_PAUSED");
        require(factory.newMarketsPaused(), "FUTURE_MARKETS_OPEN");
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV63.LaunchMode.Allowlist), "PUBLIC_MODE");

        vm.expectRevert(LeverageXSpotMarketV63.BuyCapExceeded.selector);
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
        vm.expectRevert(LeverageXLaunchFactoryV63.InvalidCanaryMarket.selector);
        factory.openFirstCanaryMarket(LeverageXSpotMarketV63(payable(address(0))));
    }

    function testEmergencyLockdownClosesEverything() public {
        (LeverageXSpotMarketV63 market,) = _launch();
        factory.openFirstCanaryMarket(market);
        factory.emergencyLockdown(market);

        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV63.LaunchMode.Closed), "NOT_CLOSED");
        require(factory.globalTradingPaused(), "GLOBAL_OPEN");
        require(factory.newMarketsPaused(), "NEW_MARKETS_OPEN");
        require(market.paused(), "MARKET_OPEN");
        require(factory.activeCanaryCreator() == address(0), "ACTIVE_CREATOR");
        require(!factory.canaryCreator(creator), "CREATOR_STILL_ALLOWED");

        vm.expectRevert(LeverageXSpotMarketV63.MarketPaused.selector);
        vm.prank(trader);
        market.buy{value: 0.001 ether}(0);

        vm.expectRevert(LeverageXLaunchFactoryV63.LaunchClosed.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}("Second", "TWO", "https://example.com/two.json", keccak256("two"), 0);
    }

    function testPublicModeStillRequiresDeliberateOwnerAction() public {
        factory.setLaunchMode(LeverageXLaunchFactoryV63.LaunchMode.Public);
        vm.prank(outsider);
        (LeverageXSpotMarketV63 market,) = factory.createMarket{value: 0.00082 ether}(
            "Public Coin", "PUB", "https://example.com/pub.json", keccak256("pub"), 0
        );
        require(address(market) != address(0), "NO_MARKET");
        require(market.paused(), "PUBLIC_MARKET_NOT_PAUSED");
    }

    function testOwnershipTransferIsTwoStep() public {
        factory.beginOwnershipTransfer(nextOwner);
        require(factory.pendingOwner() == nextOwner, "PENDING");
        vm.expectRevert(LeverageXLaunchFactoryV63.OnlyPendingOwner.selector);
        vm.prank(outsider);
        factory.acceptOwnership();
        vm.prank(nextOwner);
        factory.acceptOwnership();
        require(factory.owner() == nextOwner, "OWNER");
    }


    function testHumanReadableTokenInfo() public {
        (LeverageXSpotMarketV63 market, LeverageXTokenV63 token) = _launch();
        (
            string memory name,
            string memory symbol,
            string memory metadataURI,
            address deployer,
            address pool,
            address pairedToken,
            uint256 initialBuyAmount,
            uint64 launchedAt,
            bool graduated
        ) = factory.getTokenInfo(address(token));
        require(keccak256(bytes(name)) == keccak256(bytes("Leverage X Canary")), "NAME");
        require(keccak256(bytes(symbol)) == keccak256(bytes("LXC")), "SYMBOL");
        require(keccak256(bytes(metadataURI)) == keccak256(bytes("https://example.com/metadata/lxc.json")), "URI");
        require(deployer == creator, "DEPLOYER");
        require(pool == address(market), "POOL");
        require(pairedToken == factory.CANONICAL_WETH(), "PAIR");
        require(initialBuyAmount == 0.00082 ether, "INITIAL_BUY");
        require(launchedAt > 0, "LAUNCHED_AT");
        require(!graduated, "GRADUATED");
    }

    function testIndexerStableLaunchSurface() public {
        (LeverageXSpotMarketV63 market, LeverageXTokenV63 token) = _launch();
        require(factory.tokenCount() == 1, "TOKEN_COUNT");
        require(factory.allTokens(0) == address(token), "ALL_TOKENS");
        require(factory.isLeverageXToken(address(token)), "ATTRIBUTION");
        (
            address tokenAddress,
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
        ) = factory.getLaunchedToken(address(token));
        require(tokenAddress == address(token), "TOKEN");
        require(deployer == creator, "DEPLOYER");
        require(pairedToken == factory.CANONICAL_WETH(), "PAIR");
        require(pool == address(market) && bondingMarket == address(market), "POOL");
        require(dexFactory == address(factory), "DEX_FACTORY");
        require(poolFee == 30, "POOL_FEE");
        require(supply == 1_000_000_000 ether, "SUPPLY");
        require(exists && !graduated, "STATE");
        require(initialBuyAmount == 0.00082 ether, "INITIAL_BUY");
        require(metadataHash == keccak256("lxc-metadata"), "HASH");
        (uint256 current, uint256 threshold, bool didGraduate) = factory.graduationStatus(address(token));
        require(current == market.curveSoldTokenWad(), "CURRENT");
        require(threshold == factory.GRADUATION_SOLD_TOKEN_WAD(), "THRESHOLD");
        require(!didGraduate, "GRADUATED");
        require(keccak256(bytes(factory.launchpadVersion())) == keccak256(bytes("LEVERAGE_X_V63")), "VERSION");
    }
}
