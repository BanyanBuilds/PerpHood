// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "../src/BattleCurveMathV24.sol";
import {BattleTokenV45, LaunchpadFactoryV45, LaunchpadMarketV45} from "../src/LaunchpadFactoryV45.sol";

interface VmV51 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
}

contract V51ReentrantMarketActor {
    LaunchpadMarketV45 public immutable market;
    BattleTokenV45 public immutable token;
    bool public attack;
    bool public attempted;
    bool public reentryBlocked;

    constructor(LaunchpadMarketV45 market_, BattleTokenV45 token_) {
        market = market_;
        token = token_;
        token_.approve(address(market_), type(uint256).max);
    }

    receive() external payable {
        if (!attack || attempted) return;
        attempted = true;
        (bool ok,) = address(market).call(abi.encodeCall(LaunchpadMarketV45.sell, (uint256(1))));
        reentryBlocked = !ok;
    }

    function buyTokens() external payable {
        market.buyWithLimits{value: msg.value}(0, uint64(block.timestamp + 60));
    }

    function sellTokens(uint256 amountWad) external returns (uint256 payoutWei) {
        attack = true;
        payoutWei = market.sellWithLimits(amountWad, 0, uint64(block.timestamp + 60));
        attack = false;
    }
}

contract V51ReentrantRouterActor {
    LaunchpadFactoryV45 public immutable router;
    bool public attack;
    bool public attempted;
    bool public reentryBlocked;

    constructor(LaunchpadFactoryV45 router_) { router = router_; }

    receive() external payable {
        if (!attack || attempted) return;
        attempted = true;
        (bool ok,) = address(router).call(abi.encodeCall(LaunchpadFactoryV45.withdraw, (uint256(1))));
        reentryBlocked = !ok;
    }

    function depositAccount() external payable { router.deposit{value: msg.value}(); }

    function withdrawAccount(uint256 amountWei) external {
        attack = true;
        router.withdraw(amountWei);
        attack = false;
    }
}

contract V51RejectEtherActor {
    LaunchpadMarketV45 public immutable market;
    BattleTokenV45 public immutable token;

    constructor(LaunchpadMarketV45 market_, BattleTokenV45 token_) {
        market = market_;
        token = token_;
        token_.approve(address(market_), type(uint256).max);
    }

    receive() external payable { revert("REJECT_ETH"); }

    function buyTokens() external payable {
        market.buyWithLimits{value: msg.value}(0, uint64(block.timestamp + 60));
    }

    function trySell(uint256 amountWad) external returns (bool ok) {
        (ok,) = address(market).call(
            abi.encodeCall(LaunchpadMarketV45.sellWithLimits, (amountWad, uint256(0), uint64(block.timestamp + 60)))
        );
    }
}

contract V51ForceEther {
    constructor() payable {}
    function force(address payable target) external { selfdestruct(target); }
}

contract LaunchpadFactoryV51AssaultTest {
    VmV51 internal constant vm = VmV51(address(uint160(uint256(keccak256("hevm cheat code")))));

    LaunchpadFactoryV45 internal factory;
    LaunchpadMarketV45 internal market;
    BattleTokenV45 internal token;

    address internal creator = address(0xC0FFEE);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 2_000 ether);
        vm.deal(creator, 20 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);

        factory = new LaunchpadFactoryV45(address(this), address(0x5151));
        vm.prank(creator);
        (market, token) = factory.createSandboxMarket{value: 0.00082 ether}(
            "PERPHOOD V51 Assault", "V51", keccak256("v51-assault"), 45_000 ether
        );
        factory.seedRiskReserve{value: 100 ether}(market);
    }

    function testDirectBuyRejectsStaleQuoteWithoutMutation() public {
        uint256 amountWei = 0.2 ether;
        BattleCurveMathV24.BuyQuote memory quoted = BattleCurveMathV24.quoteBuy(
            market.curveSoldTokenWad(), amountWei, market.curveParams(market.TRADE_FEE_BPS())
        );

        vm.prank(bob);
        market.buyWithLimits{value: 1 ether}(0, uint64(block.timestamp + 60));
        uint64 sequenceBefore = market.stateSequence();
        uint256 soldBefore = market.curveSoldTokenWad();

        vm.prank(alice);
        (bool ok,) = address(market).call{value: amountWei}(
            abi.encodeCall(LaunchpadMarketV45.buyWithLimits, (quoted.tokenOutWad, uint64(block.timestamp + 60)))
        );
        require(!ok, "STALE_BUY_ACCEPTED");
        require(market.stateSequence() == sequenceBefore, "FAILED_BUY_MUTATED_SEQUENCE");
        require(market.curveSoldTokenWad() == soldBefore, "FAILED_BUY_MUTATED_CURVE");
    }

    function testDirectLongRejectsStaleQuoteWithoutOpeningPosition() public {
        uint256 collateralWei = 0.1 ether;
        (, , uint256 totalRequiredWei, uint256 tokenAmountWad) = market.quoteOpenLong(collateralWei, 10);

        vm.prank(bob);
        market.buyWithLimits{value: 1 ether}(0, uint64(block.timestamp + 60));
        uint256 countBefore = market.activePositionCount();
        uint64 sequenceBefore = market.stateSequence();

        vm.prank(alice);
        (bool ok,) = address(market).call{value: totalRequiredWei}(
            abi.encodeCall(
                LaunchpadMarketV45.openLongWithLimits,
                (uint16(10), uint16(200), collateralWei, tokenAmountWad, uint64(block.timestamp + 60))
            )
        );
        require(!ok, "STALE_LONG_ACCEPTED");
        require(market.activePositionCount() == countBefore, "FAILED_LONG_OPENED_POSITION");
        require(market.stateSequence() == sequenceBefore, "FAILED_LONG_MUTATED_SEQUENCE");
    }

    function testDirectShortRejectsWorseBorrowRequirement() public {
        vm.prank(bob);
        uint256 bought = market.buyWithLimits{value: 2 ether}(0, uint64(block.timestamp + 60));
        vm.prank(bob);
        token.approve(address(market), type(uint256).max);

        uint256 collateralWei = 0.005 ether;
        (, , uint256 totalRequiredWei, uint256 borrowedTokensWad, uint256 lockedProceedsWei) = market.quoteOpenShort(collateralWei, 10);

        vm.prank(bob);
        market.sellWithLimits(bought / 2, 0, uint64(block.timestamp + 60));
        uint256 countBefore = market.activePositionCount();

        vm.prank(alice);
        (bool ok,) = address(market).call{value: totalRequiredWei}(
            abi.encodeCall(
                LaunchpadMarketV45.openShortWithLimits,
                (
                    uint16(10), uint16(200), collateralWei, borrowedTokensWad,
                    lockedProceedsWei * 9_900 / 10_000, uint64(block.timestamp + 60)
                )
            )
        );
        require(!ok, "STALE_SHORT_ACCEPTED");
        require(market.activePositionCount() == countBefore, "FAILED_SHORT_OPENED_POSITION");
    }

    function testCloseRejectsStalePayoutAndKeepsPositionActive() public {
        vm.prank(bob);
        uint256 bought = market.buyWithLimits{value: 2 ether}(0, uint64(block.timestamp + 60));
        vm.prank(bob);
        token.approve(address(market), type(uint256).max);

        uint256 collateralWei = 0.1 ether;
        (, , uint256 totalRequiredWei,) = market.quoteOpenLong(collateralWei, 5);
        vm.prank(alice);
        uint256 positionId = market.openLongWithLimits{value: totalRequiredWei}(
            5, 200, collateralWei, 0, uint64(block.timestamp + 60)
        );
        uint256 quotedPayout = market.quotePositionEquityWei(positionId);

        vm.prank(bob);
        market.sellWithLimits(bought / 2, 0, uint64(block.timestamp + 60));
        uint64 sequenceBefore = market.stateSequence();

        vm.prank(alice);
        (bool ok,) = address(market).call(
            abi.encodeCall(
                LaunchpadMarketV45.closePositionWithLimits,
                (positionId, quotedPayout, uint64(block.timestamp + 60))
            )
        );
        require(!ok, "STALE_CLOSE_ACCEPTED");
        LaunchpadMarketV45.Position memory remaining = market.position(positionId);
        require(remaining.active, "FAILED_CLOSE_REMOVED_POSITION");
        require(market.stateSequence() == sequenceBefore, "FAILED_CLOSE_MUTATED_SEQUENCE");
    }

    function testExpiredDeadlineCannotMutateMarket() public {
        uint64 expired = uint64(block.timestamp);
        vm.warp(block.timestamp + 1);
        uint64 sequenceBefore = market.stateSequence();
        vm.prank(alice);
        (bool ok,) = address(market).call{value: 0.1 ether}(
            abi.encodeCall(LaunchpadMarketV45.buyWithLimits, (uint256(0), expired))
        );
        require(!ok, "EXPIRED_ORDER_ACCEPTED");
        require(market.stateSequence() == sequenceBefore, "EXPIRED_ORDER_MUTATED_STATE");
    }

    function testMarketSellReentrancyIsBlockedAndOuterSettlementCompletes() public {
        V51ReentrantMarketActor actor = new V51ReentrantMarketActor(market, token);
        vm.deal(address(actor), 10 ether);
        actor.buyTokens{value: 1 ether}();
        uint256 tokenBalance = token.balanceOf(address(actor));
        uint256 payout = actor.sellTokens(tokenBalance / 4);
        require(payout > 0, "OUTER_SELL_FAILED");
        require(actor.attempted(), "REENTRY_NOT_ATTEMPTED");
        require(actor.reentryBlocked(), "MARKET_REENTRY_SUCCEEDED");
        require(market.assertInvariants(), "MARKET_INVARIANTS_FAILED");
    }

    function testRouterWithdrawalReentrancyIsBlockedAndDebitedOnce() public {
        V51ReentrantRouterActor actor = new V51ReentrantRouterActor(factory);
        vm.deal(address(actor), 10 ether);
        actor.depositAccount{value: 2 ether}();
        actor.withdrawAccount(0.5 ether);
        require(actor.attempted(), "ROUTER_REENTRY_NOT_ATTEMPTED");
        require(actor.reentryBlocked(), "ROUTER_REENTRY_SUCCEEDED");
        require(factory.wethBalanceWei(address(actor)) == 1.5 ether, "ROUTER_DOUBLE_DEBIT_OR_CREDIT");
        require(address(factory).balance >= factory.totalWethLiabilityWei(), "ROUTER_INSOLVENT");
    }

    function testRejectingReceiverRollsBackSellCompletely() public {
        V51RejectEtherActor actor = new V51RejectEtherActor(market, token);
        vm.deal(address(actor), 10 ether);
        actor.buyTokens{value: 1 ether}();
        uint256 actorTokensBefore = token.balanceOf(address(actor));
        uint256 marketTokensBefore = token.balanceOf(address(market));
        uint256 soldBefore = market.curveSoldTokenWad();
        uint64 sequenceBefore = market.stateSequence();

        bool ok = actor.trySell(actorTokensBefore / 4);
        require(!ok, "REJECTING_RECEIVER_SELL_SUCCEEDED");
        require(token.balanceOf(address(actor)) == actorTokensBefore, "ACTOR_TOKENS_NOT_ROLLED_BACK");
        require(token.balanceOf(address(market)) == marketTokensBefore, "MARKET_TOKENS_NOT_ROLLED_BACK");
        require(market.curveSoldTokenWad() == soldBefore, "CURVE_NOT_ROLLED_BACK");
        require(market.stateSequence() == sequenceBefore, "SEQUENCE_NOT_ROLLED_BACK");
    }

    function testForcedEtherCreatesSurplusWithoutInventingLiability() public {
        uint256 routerLiabilityBefore = factory.totalWethLiabilityWei();
        V51ForceEther forceRouter = new V51ForceEther{value: 1 ether}();
        forceRouter.force(payable(address(factory)));
        require(factory.totalWethLiabilityWei() == routerLiabilityBefore, "FORCED_ETH_CREATED_ROUTER_LIABILITY");
        require(address(factory).balance >= factory.totalWethLiabilityWei(), "FORCED_ETH_BROKE_ROUTER_SOLVENCY");

        V51ForceEther forceMarket = new V51ForceEther{value: 1 ether}();
        forceMarket.force(payable(address(market)));
        require(market.assertInvariants(), "FORCED_ETH_BROKE_MARKET_SOLVENCY");
    }

    function testCreatorStillCannotOpenPerpsThroughProtectedEntry() public {
        uint256 collateralWei = 0.01 ether;
        (, , uint256 totalRequiredWei, uint256 tokenAmountWad) = market.quoteOpenLong(collateralWei, 2);
        vm.prank(creator);
        (bool ok,) = address(market).call{value: totalRequiredWei}(
            abi.encodeCall(
                LaunchpadMarketV45.openLongWithLimits,
                (uint16(2), uint16(200), collateralWei, tokenAmountWad, uint64(block.timestamp + 60))
            )
        );
        require(!ok, "CREATOR_PERPS_RESTRICTION_BYPASSED");
    }

    function testGasCeilingsForCoreAcceptedActions() public {
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        market.buyWithLimits{value: 0.1 ether}(0, uint64(block.timestamp + 60));
        uint256 buyGas = gasBefore - gasleft();
        require(buyGas < 1_500_000, "BUY_GAS_CEILING");

        uint256 collateralWei = 0.01 ether;
        (, , uint256 totalRequiredWei, uint256 tokenAmountWad) = market.quoteOpenLong(collateralWei, 2);
        vm.prank(bob);
        gasBefore = gasleft();
        market.openLongWithLimits{value: totalRequiredWei}(
            2, 200, collateralWei, tokenAmountWad * 9_800 / 10_000, uint64(block.timestamp + 60)
        );
        uint256 longGas = gasBefore - gasleft();
        require(longGas < 2_500_000, "LONG_GAS_CEILING");
    }
}
