// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleTokenV41, LaunchpadFactoryV41, LaunchpadMarketV41} from "../src/LaunchpadFactoryV41.sol";

interface VmLaunchpadV41 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function expectRevert(bytes4 revertData) external;
}

contract LaunchpadFactoryV41Test {
    VmLaunchpadV41 internal constant vm = VmLaunchpadV41(address(uint160(uint256(keccak256("hevm cheat code")))));
    LaunchpadFactoryV41 internal factory;
    address internal creator = address(0xC0FFEE);

    function setUp() public {
        factory = new LaunchpadFactoryV41(address(this));
        vm.deal(creator, 1 ether);
    }

    function testCreatesOneBillionSupplyInsideMarket() public {
        vm.prank(creator);
        (LaunchpadMarketV41 market, BattleTokenV41 token) = factory.createTestMarket{value: 0.00082 ether}(
            "PerpHood Test", "PHT", keccak256("metadata"), 45_000 ether
        );
        require(token.totalSupply() == 1_000_000_000 ether, "SUPPLY");
        require(token.balanceOf(address(market)) == token.totalSupply(), "MARKET_INVENTORY");
        require(market.creator() == creator, "CREATOR");
        require(market.creatorGenesisBuyWei() == 0.00082 ether, "GENESIS_BUY");
    }

    function testCreatorIsPermanentlyBlockedFromPerps() public {
        vm.prank(creator);
        (LaunchpadMarketV41 market,) = factory.createTestMarket{value: 0.00082 ether}(
            "PerpHood Test", "PHT", keccak256("metadata"), 45_000 ether
        );
        vm.expectRevert(LaunchpadMarketV41.CreatorPerpsForbidden.selector);
        market.assertPerpsAllowed(creator);
    }

    function testMigrationRequiresEveryGate() public {
        vm.prank(creator);
        (LaunchpadMarketV41 market,) = factory.createTestMarket{value: 0.00082 ether}(
            "PerpHood Test", "PHT", keccak256("metadata"), 45_000 ether
        );
        vm.expectRevert(LaunchpadMarketV41.MigrationGateFailed.selector);
        factory.beginMigration(
            market, 44_999 ether, 1.2 ether, 1.05 ether, 1 ether, 0.12 ether,
            0.1 ether, 0.08 ether, 0, 25, 25, false, keccak256("gates")
        );
    }

    function testSafeMigrationCommitsWithoutChangingTokenAddress() public {
        vm.prank(creator);
        (LaunchpadMarketV41 market, BattleTokenV41 token) = factory.createTestMarket{value: 0.00082 ether}(
            "PerpHood Test", "PHT", keccak256("metadata"), 45_000 ether
        );
        bytes32 digest = keccak256("all-gates-pass");
        factory.beginMigration(
            market, 45_000 ether, 1.2 ether, 1.05 ether, 1 ether, 0.12 ether,
            0.1 ether, 0.08 ether, 0, 25, 25, false, digest
        );
        factory.commitMigration(market, digest);
        require(uint256(market.phase()) == uint256(LaunchpadMarketV41.Phase.Migrated), "PHASE");
        require(factory.marketForToken(address(token)) == address(market), "TOKEN_CHANGED");
    }
}
