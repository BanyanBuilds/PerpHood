// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleTokenV42, LaunchpadFactoryV42, LaunchpadMarketV42} from "../src/LaunchpadFactoryV42.sol";

interface VmLaunchpadV42 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
}

contract LaunchpadFactoryV42Test {
    VmLaunchpadV42 internal constant vm = VmLaunchpadV42(address(uint160(uint256(keccak256("hevm cheat code")))));
    LaunchpadFactoryV42 internal factory;
    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xB0B);

    function setUp() public {
        factory = new LaunchpadFactoryV42(address(this), address(0x5151));
        vm.deal(creator, 2 ether);
        vm.deal(trader, 2 ether);
    }

    function _launch() internal returns (LaunchpadMarketV42 market, BattleTokenV42 token) {
        vm.prank(creator);
        return factory.createSandboxMarket{value: 0.00082 ether}(
            "PerpHood Local", "HOOD", keccak256("metadata"), 45_000 ether
        );
    }

    function testGenesisBuyMintsOneBillionAndGivesCreatorNoFreeAllocation() public {
        (LaunchpadMarketV42 market, BattleTokenV42 token) = _launch();
        uint256 creatorBalance = token.balanceOf(creator);
        require(token.totalSupply() == 1_000_000_000 ether, "SUPPLY");
        require(creatorBalance > 0, "NO_GENESIS_TOKENS");
        require(creatorBalance < token.totalSupply(), "FREE_ALLOCATION");
        require(token.balanceOf(address(market)) + creatorBalance == token.totalSupply(), "PHYSICAL_CONSERVATION");
        require(market.creatorGenesisBuyWei() == 0.00082 ether, "GENESIS_BUY");
        require(address(market).balance == 0.00082 ether, "REAL_LIQUIDITY");
    }

    function testSpotBuyAndSellMutateSameCurve() public {
        (LaunchpadMarketV42 market, BattleTokenV42 token) = _launch();
        uint256 soldBefore = market.curveSoldTokenWad();
        vm.prank(trader);
        uint256 tokenOut = market.buy{value: 0.05 ether}();
        require(tokenOut > 0, "NO_TOKEN_OUT");
        require(market.curveSoldTokenWad() > soldBefore, "BUY_DID_NOT_MOVE_CURVE");
        uint256 ethBefore = trader.balance;
        vm.startPrank(trader);
        token.approve(address(market), tokenOut / 2);
        uint256 payout = market.sell(tokenOut / 2);
        vm.stopPrank();
        require(payout > 0, "NO_SELL_PAYOUT");
        require(trader.balance > ethBefore, "SELL_NOT_PAID");
        require(market.tradeCount() == 3, "TRADE_COUNT"); // genesis + buy + sell
    }

    function testCreatorPerpsRemainForbidden() public {
        (LaunchpadMarketV42 market,) = _launch();
        vm.expectRevert(LaunchpadMarketV42.CreatorPerpsForbidden.selector);
        market.assertPerpsAllowed(creator);
        market.assertPerpsAllowed(trader);
    }

    function testMigrationCommitPreservesTokenAndMarket() public {
        (LaunchpadMarketV42 market, BattleTokenV42 token) = _launch();
        bytes32 digest = keccak256("all-local-gates-pass");
        factory.beginMigration(market, digest);
        factory.commitMigration(market, digest);
        require(uint256(market.phase()) == uint256(LaunchpadMarketV42.Phase.Migrated), "PHASE");
        require(factory.marketForToken(address(token)) == address(market), "TOKEN_CHANGED");
    }
}
