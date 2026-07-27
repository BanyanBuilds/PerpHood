// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LeverageXLaunchFactoryV56, LeverageXSpotMarketV56, LeverageXTokenV56} from "../src/LeverageXLaunchFactoryV56.sol";

interface VmV56 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
}

contract LeverageXLaunchFactoryV56Test {
    VmV56 internal constant vm = VmV56(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xB0B);
    address internal outsider = address(0xBAD);
    address internal nextOwner = address(0xABCD);
    LeverageXLaunchFactoryV56 internal factory;

    function setUp() public {
        factory = new LeverageXLaunchFactoryV56(address(this));
        vm.deal(creator, 10 ether);
        vm.deal(trader, 10 ether);
        vm.deal(outsider, 10 ether);
    }

    function _enableCanary() internal {
        factory.setCanaryCreator(creator, true);
        factory.setLaunchMode(LeverageXLaunchFactoryV56.LaunchMode.Allowlist);
    }

    function _launch() internal returns (LeverageXSpotMarketV56 market, LeverageXTokenV56 token) {
        _enableCanary();
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
        require(uint8(factory.launchMode()) == uint8(LeverageXLaunchFactoryV56.LaunchMode.Closed), "MODE");
        require(factory.globalTradingPaused(), "GLOBAL_NOT_PAUSED");
        require(factory.newMarketsPaused(), "MARKETS_NOT_PAUSED");
    }

    function testClosedAndAllowlistModesProtectLaunches() public {
        vm.expectRevert(LeverageXLaunchFactoryV56.LaunchClosed.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.00082 ether}("Closed", "CLOSE", "https://example.com/closed.json", keccak256("closed"), 0);

        factory.setLaunchMode(LeverageXLaunchFactoryV56.LaunchMode.Allowlist);
        vm.expectRevert(LeverageXLaunchFactoryV56.CreatorNotAllowed.selector);
        vm.prank(outsider);
        factory.createMarket{value: 0.00082 ether}("Blocked", "BLOCK", "https://example.com/blocked.json", keccak256("blocked"), 0);
    }

    function testCanaryMarketStartsPausedAndCapped() public {
        (LeverageXSpotMarketV56 market, LeverageXTokenV56 token) = _launch();
        require(market.paused(), "LOCAL_NOT_PAUSED");
        require(market.maxBuyWei() == 0.01 ether, "BUY_CAP");
        require(market.maxSellTokenWad() == 5_000_000 ether, "SELL_CAP");
        require(token.totalSupply() == 1_000_000_000 ether, "SUPPLY");
        require(factory.marketForToken(address(token)) == address(market), "REGISTRY");
    }

    function testOwnerMustUnpauseGlobalAndMarketBeforeTrading() public {
        (LeverageXSpotMarketV56 market,) = _launch();
        vm.expectRevert(LeverageXSpotMarketV56.MarketPaused.selector);
        vm.prank(trader);
        market.buy{value: 0.005 ether}(0);

        factory.setMarketSafety(market, false, 0.01 ether, 5_000_000 ether);
        vm.expectRevert(LeverageXSpotMarketV56.MarketPaused.selector);
        vm.prank(trader);
        market.buy{value: 0.005 ether}(0);

        factory.setGlobalTradingPaused(false);
        vm.prank(trader);
        uint256 bought = market.buy{value: 0.005 ether}(0);
        require(bought > 0, "NO_BUY");
    }

    function testCanaryBuyAndSellCapsAreEnforced() public {
        (LeverageXSpotMarketV56 market, LeverageXTokenV56 token) = _launch();
        factory.setMarketSafety(market, false, 0.01 ether, 1_000_000 ether);
        factory.setGlobalTradingPaused(false);

        vm.expectRevert(LeverageXSpotMarketV56.BuyCapExceeded.selector);
        vm.prank(trader);
        market.buy{value: 0.011 ether}(0);

        vm.prank(trader);
        uint256 bought = market.buy{value: 0.01 ether}(0);
        vm.startPrank(trader);
        token.approve(address(market), bought);
        vm.expectRevert(LeverageXSpotMarketV56.SellCapExceeded.selector);
        market.sell(1_000_001 ether, 0);
        uint256 sellAmount = bought < 1_000_000 ether ? bought : 1_000_000 ether;
        uint256 payout = market.sell(sellAmount, 0);
        vm.stopPrank();
        require(payout > 0, "NO_PAYOUT");
    }

    function testPublicModeAllowsAnyCreator() public {
        factory.setLaunchMode(LeverageXLaunchFactoryV56.LaunchMode.Public);
        vm.prank(outsider);
        (LeverageXSpotMarketV56 market,) = factory.createMarket{value: 0.00082 ether}(
            "Public Coin", "PUB", "https://example.com/pub.json", keccak256("pub"), 0
        );
        require(address(market) != address(0), "NO_MARKET");
    }

    function testOwnershipTransferIsTwoStep() public {
        factory.beginOwnershipTransfer(nextOwner);
        require(factory.pendingOwner() == nextOwner, "PENDING");
        vm.expectRevert(LeverageXLaunchFactoryV56.OnlyPendingOwner.selector);
        vm.prank(outsider);
        factory.acceptOwnership();
        vm.prank(nextOwner);
        factory.acceptOwnership();
        require(factory.owner() == nextOwner, "OWNER");
    }
}
