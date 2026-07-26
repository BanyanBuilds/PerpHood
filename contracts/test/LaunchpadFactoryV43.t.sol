// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleTokenV43, LaunchpadFactoryV43, LaunchpadMarketV43} from "../src/LaunchpadFactoryV43.sol";

interface VmLaunchpadV43 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
}

contract LaunchpadFactoryV43Test {
    VmLaunchpadV43 internal constant vm = VmLaunchpadV43(address(uint160(uint256(keccak256("hevm cheat code")))));

    LaunchpadFactoryV43 internal factory;
    address internal creator = address(0xC0FFEE);
    address internal spotTrader = address(0xB0B);
    address internal longTrader = address(0xA11CE);
    address internal shortTrader = address(0x5A07);
    address internal keeper = address(0xBEEF);
    address internal linkedCreator = address(0xC0DE);

    function setUp() public {
        factory = new LaunchpadFactoryV43(address(this), address(0x5151));
        vm.deal(address(this), 100 ether);
        vm.deal(creator, 10 ether);
        vm.deal(spotTrader, 10 ether);
        vm.deal(longTrader, 10 ether);
        vm.deal(shortTrader, 10 ether);
        vm.deal(keeper, 10 ether);
        vm.deal(linkedCreator, 10 ether);
    }

    function _launch() internal returns (LaunchpadMarketV43 market, BattleTokenV43 token) {
        vm.prank(creator);
        (market, token) = factory.createSandboxMarket{value: 0.00082 ether}(
            "PerpHood Unified", "HOOD", keccak256("v43-metadata"), 45_000 ether
        );
        factory.seedRiskReserve{value: 3 ether}(market);
    }

    function _spotSeed(LaunchpadMarketV43 market, uint256 amountWei) internal returns (uint256 tokens) {
        vm.prank(spotTrader);
        tokens = market.buy{value: amountWei}();
    }

    function _openLong(LaunchpadMarketV43 market, uint16 leverage, uint256 collateralWei) internal returns (uint256 id) {
        (, , uint256 totalRequired,) = market.quoteOpenLong(collateralWei, leverage);
        vm.prank(longTrader);
        id = market.openLong{value: totalRequired}(leverage, 200, collateralWei);
    }

    function _openShort(LaunchpadMarketV43 market, uint16 leverage, uint256 collateralWei) internal returns (uint256 id) {
        (, , uint256 totalRequired,,) = market.quoteOpenShort(collateralWei, leverage);
        vm.prank(shortTrader);
        id = market.openShort{value: totalRequired}(leverage, 200, collateralWei);
    }

    function testGenesisCreatesOneBillionAndSharedReserveState() public {
        (LaunchpadMarketV43 market, BattleTokenV43 token) = _launch();
        uint256 creatorBalance = token.balanceOf(creator);
        require(token.totalSupply() == 1_000_000_000 ether, "SUPPLY");
        require(creatorBalance > 0, "NO_GENESIS_BUY");
        require(creatorBalance < token.totalSupply(), "FREE_CREATOR_ALLOCATION");
        require(market.creatorGenesisBuyWei() == 0.00082 ether, "GENESIS_SPEND");
        require(market.perpsRestricted(creator), "CREATOR_NOT_BLOCKED");
        require(market.stateSequence() >= 2, "GENESIS_AND_RESERVE_NOT_ORDERED");
        require(market.assertInvariants(), "INVARIANTS");
    }

    function testSpotLongAndShortMutateOneOrderedBattlePool() public {
        (LaunchpadMarketV43 market,) = _launch();
        _spotSeed(market, 0.75 ether);
        uint256 soldAfterSpot = market.curveSoldTokenWad();
        uint64 sequenceAfterSpot = market.stateSequence();

        uint256 longId = _openLong(market, 3, 0.04 ether);
        uint256 soldAfterLong = market.curveSoldTokenWad();
        require(soldAfterLong > soldAfterSpot, "LONG_DID_NOT_BUY_CURVE");

        uint256 shortId = _openShort(market, 2, 0.02 ether);
        uint256 soldAfterShort = market.curveSoldTokenWad();
        require(soldAfterShort < soldAfterLong, "SHORT_DID_NOT_SELL_CURVE");
        require(market.stateSequence() > sequenceAfterSpot + 1, "UNORDERED_ACTIONS");
        require(market.activePositionCount() == 2, "POSITIONS");
        require(market.openInterestLongWei() > 0 && market.openInterestShortWei() > 0, "OPEN_INTEREST");

        LaunchpadMarketV43.Position memory longPosition = market.position(longId);
        LaunchpadMarketV43.Position memory shortPosition = market.position(shortId);
        require(longPosition.active && shortPosition.active, "ACTIVE");
        require(longPosition.tokenAmountWad > 0, "LONG_INVENTORY");
        require(shortPosition.borrowedTokensWad > 0, "SHORT_INVENTORY");
        require(market.assertInvariants(), "INVARIANTS");
    }

    function testCreatorAndExplicitHardLinkedWalletCannotOpenPerps() public {
        (LaunchpadMarketV43 market,) = _launch();
        _spotSeed(market, 0.5 ether);

        vm.expectRevert(LaunchpadMarketV43.PerpsForbidden.selector);
        vm.prank(creator);
        market.openLong{value: 0.01006 ether}(2, 200, 0.01 ether);

        factory.setPerpsRestricted(market, linkedCreator, true);
        vm.expectRevert(LaunchpadMarketV43.PerpsForbidden.selector);
        vm.prank(linkedCreator);
        market.openShort{value: 0.01006 ether}(2, 200, 0.01 ether);

        market.assertPerpsAllowed(spotTrader);
    }

    function testManualLongAndShortCloseReconcilePool() public {
        (LaunchpadMarketV43 market,) = _launch();
        _spotSeed(market, 1 ether);
        uint256 longId = _openLong(market, 2, 0.03 ether);
        uint256 shortId = _openShort(market, 2, 0.015 ether);

        uint256 longBalanceBefore = longTrader.balance;
        vm.prank(longTrader);
        market.closePosition(longId);
        require(longTrader.balance >= longBalanceBefore, "LONG_NOT_PAID");

        uint256 shortBalanceBefore = shortTrader.balance;
        vm.prank(shortTrader);
        market.closePosition(shortId);
        require(shortTrader.balance >= shortBalanceBefore, "SHORT_NOT_PAID");

        require(market.activePositionCount() == 0, "POSITIONS_REMAIN");
        require(market.openInterestLongWei() == 0 && market.openInterestShortWei() == 0, "OI_REMAINS");
        require(market.badDebtWei() == 0, "BAD_DEBT");
        require(market.assertInvariants(), "INVARIANTS");
    }

    function testSpotBuyCanTriggerRealShortLiquidationBuyPressure() public {
        (LaunchpadMarketV43 market,) = _launch();
        _spotSeed(market, 0.8 ether);
        uint256 shortId = _openShort(market, 20, 0.006 ether);
        uint256 soldBeforeSqueeze = market.curveSoldTokenWad();

        vm.prank(keeper);
        market.buy{value: 1.5 ether}();

        LaunchpadMarketV43.Position memory shortPosition = market.position(shortId);
        require(!shortPosition.active, "SHORT_NOT_LIQUIDATED");
        require(market.curveSoldTokenWad() > soldBeforeSqueeze, "NO_FORCED_BUY_PRESSURE");
        require(market.badDebtWei() == 0, "BAD_DEBT");
        require(market.assertInvariants(), "INVARIANTS");
    }

    function testOpenShortReservesExactCurveHeadroomForRepayment() public {
        (LaunchpadMarketV43 market,) = _launch();
        _spotSeed(market, 1 ether);
        uint256 maximumSold = market.CURVE_ALLOCATION() * market.MAX_SOLD_BPS() / market.BPS();
        uint256 beforeReservation = market.maxCurveSoldWithShortReservationWad();
        _openShort(market, 3, 0.02 ether);
        uint256 borrowed = market.borrowedShortTokensWad();
        uint256 afterReservation = market.maxCurveSoldWithShortReservationWad();
        require(beforeReservation == maximumSold, "INITIAL_HEADROOM");
        require(afterReservation + borrowed == maximumSold, "SHORT_REPAYMENT_HEADROOM");
        require(market.curveSoldTokenWad() <= afterReservation, "UNSAFE_CURVE_SOLD");
        require(market.assertInvariants(), "INVARIANTS");
    }

    function testMigrationCannotStrandOpenPositions() public {
        (LaunchpadMarketV43 market,) = _launch();
        _spotSeed(market, 0.6 ether);
        uint256 longId = _openLong(market, 2, 0.02 ether);
        bytes32 digest = keccak256("all-v43-gates-pass");

        vm.expectRevert(LaunchpadMarketV43.MigrationGateFailed.selector);
        factory.beginMigration(market, digest);

        vm.prank(longTrader);
        market.closePosition(longId);
        factory.beginMigration(market, digest);
        factory.commitMigration(market, digest);
        require(uint256(market.phase()) == uint256(LaunchpadMarketV43.Phase.Migrated), "PHASE");
    }
}
