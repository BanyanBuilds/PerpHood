// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {PerpHoodLaunchFactoryV54, PerpHoodSpotMarketV54, PerpHoodTokenV54} from "../src/PerpHoodLaunchFactoryV54.sol";

interface VmV54 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
}

contract PerpHoodLaunchFactoryV54Test {
    VmV54 internal constant vm = VmV54(address(uint160(uint256(keccak256("hevm cheat code")))));
    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xB0B);
    PerpHoodLaunchFactoryV54 internal factory;

    function setUp() public {
        factory = new PerpHoodLaunchFactoryV54(address(this));
        vm.deal(creator, 10 ether);
        vm.deal(trader, 10 ether);
    }

    function _launch() internal returns (PerpHoodSpotMarketV54 market, PerpHoodTokenV54 token) {
        vm.prank(creator);
        (market, token) = factory.createMarket{value: 0.00082 ether}(
            "Real Hood Coin",
            "RHOOD",
            "https://example.com/metadata/rhood.json",
            keccak256("rhood-metadata"),
            45_000 ether
        );
    }

    function testCreatesRealFixedSupplyTokenAndRegistersMarket() public {
        (PerpHoodSpotMarketV54 market, PerpHoodTokenV54 token) = _launch();
        require(token.totalSupply() == 1_000_000_000 ether, "SUPPLY");
        require(token.creator() == creator, "CREATOR");
        require(token.launchMarket() == address(market), "MARKET");
        require(factory.marketForToken(address(token)) == address(market), "REGISTRY");
        require(factory.isMarket(address(market)), "MARKET_FLAG");
        require(factory.marketCount() == 1, "COUNT");
        require(token.balanceOf(creator) == market.creatorGenesisTokensWad(), "NO_FREE_ALLOCATION");
        require(token.balanceOf(address(market)) + token.balanceOf(creator) == token.totalSupply(), "CUSTODY");
    }

    function testSecondWalletCanBuyApproveAndSell() public {
        (PerpHoodSpotMarketV54 market, PerpHoodTokenV54 token) = _launch();
        uint256 beforeBalance = trader.balance;
        vm.prank(trader);
        uint256 bought = market.buy{value: 0.02 ether}(0);
        require(bought > 0, "NO_BUY");
        require(token.balanceOf(trader) == bought, "BUY_BALANCE");
        vm.startPrank(trader);
        token.approve(address(market), bought / 2);
        uint256 payout = market.sell(bought / 2, 0);
        vm.stopPrank();
        require(payout > 0, "NO_PAYOUT");
        require(token.balanceOf(trader) == bought - bought / 2, "SELL_BALANCE");
        require(trader.balance > beforeBalance - 0.02 ether, "NO_ETH_RETURN");
    }

    function testCreatorIsPermanentlyMarkedPerpsRestricted() public {
        (PerpHoodSpotMarketV54 market,) = _launch();
        require(market.isPerpsRestricted(creator), "CREATOR_NOT_RESTRICTED");
        require(!market.isPerpsRestricted(trader), "TRADER_RESTRICTED");
    }

    function testZeroGenesisBuyAndEmptyMetadataRevert() public {
        vm.expectRevert(PerpHoodLaunchFactoryV54.InvalidGenesisBuy.selector);
        vm.prank(creator);
        factory.createMarket("No Buy", "NOBUY", "https://example.com/nobuy.json", keccak256("nobuy"), 45_000 ether);

        vm.expectRevert(PerpHoodLaunchFactoryV54.InvalidMetadata.selector);
        vm.prank(creator);
        factory.createMarket{value: 0.001 ether}("No Meta", "NOMETA", "", bytes32(0), 45_000 ether);
    }

    function testOnlyFactoryOwnerCanPauseMarket() public {
        (PerpHoodSpotMarketV54 market,) = _launch();
        vm.expectRevert(PerpHoodLaunchFactoryV54.OnlyOwner.selector);
        vm.prank(trader);
        factory.setMarketPaused(market, true);
        factory.setMarketPaused(market, true);
        require(market.paused(), "NOT_PAUSED");
        vm.expectRevert(PerpHoodSpotMarketV54.MarketPaused.selector);
        vm.prank(trader);
        market.buy{value: 0.01 ether}(0);
    }

    function testRejectsCreatorBuyAtOrAboveTotalBudget() public {
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        vm.expectRevert(PerpHoodLaunchFactoryV54.InvalidGenesisBuy.selector);
        factory.createMarket{value: 0.001 ether}(
            "Too Much",
            "TOOMUCH",
            "https://metadata.example/token.json",
            keccak256("too-much"),
            45_000 ether
        );
    }

    function testRejectsDustCreatorBuy() public {
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        vm.expectRevert(PerpHoodLaunchFactoryV54.InvalidGenesisBuy.selector);
        factory.createMarket{value: 999_999_999_999}(
            "Too Small",
            "SMALL",
            "https://metadata.example/token.json",
            keccak256("too-small"),
            45_000 ether
        );
    }
}
