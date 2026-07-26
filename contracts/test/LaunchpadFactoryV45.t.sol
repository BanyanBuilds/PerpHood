// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleTokenV45, LaunchpadFactoryV45, LaunchpadMarketV45} from "../src/LaunchpadFactoryV45.sol";

interface VmLaunchpadV45 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
}

contract LaunchpadFactoryV45Test {
    VmLaunchpadV45 internal constant vm = VmLaunchpadV45(address(uint160(uint256(keccak256("hevm cheat code")))));
    LaunchpadFactoryV45 internal factory;
    address internal sequencer = address(0x5151);
    address internal creator = address(0xC0FFEE);
    address internal trader = address(0xB0B);

    function setUp() public {
        factory = new LaunchpadFactoryV45(address(this), sequencer);
        vm.deal(address(this), 100 ether);
        vm.deal(creator, 10 ether);
        vm.deal(trader, 10 ether);
        vm.deal(sequencer, 10 ether);
    }

    function _launch() internal returns (LaunchpadMarketV45 market, BattleTokenV45 token) {
        vm.prank(creator);
        (market, token) = factory.createSandboxMarket{value: 0.00082 ether}(
            "PerpHood Authorized", "HOOD", keccak256("v45-metadata"), 45_000 ether
        );
        factory.seedRiskReserve{value: 3 ether}(market);
    }

    function testDepositSpotBuyTokenCustodyAndWithdrawalStaySolvent() public {
        (LaunchpadMarketV45 market, BattleTokenV45 token) = _launch();
        vm.prank(trader);
        factory.deposit{value: 2 ether}();
        require(factory.wethBalanceWei(trader) == 2 ether, "DEPOSIT_LEDGER");
        require(factory.totalWethLiabilityWei() == 2 ether, "WETH_LIABILITY");

        vm.prank(trader);
        uint256 tokens = factory.spotBuyFromBalance(market, 0.5 ether, 0);
        require(tokens > 0, "NO_TOKENS");
        require(factory.tokenBalanceWad(trader, address(market)) == tokens, "TOKEN_LEDGER");
        require(token.balanceOf(address(factory)) == factory.totalTokenLiabilityWad(address(market)), "TOKEN_CUSTODY");

        vm.prank(trader);
        factory.withdraw(0.25 ether);
        require(address(factory).balance == factory.totalWethLiabilityWei(), "WETH_CUSTODY");
        (, , , , , , bool solvent) = factory.accountState(trader, market);
        require(solvent, "INSOLVENT");
    }

    function testAuthorizedLongConsumesNonceAndClosesWithoutSpendingCapAgain() public {
        (LaunchpadMarketV45 market,) = _launch();
        vm.prank(trader);
        factory.deposit{value: 2 ether}();
        bytes32 sessionId = keccak256("v45-session");
        bytes32 keyHash = keccak256("p256-key");
        uint256 bitmap = (uint256(1) << uint8(LaunchpadFactoryV45.SessionAction.OpenLong))
            | (uint256(1) << uint8(LaunchpadFactoryV45.SessionAction.CloseLong));
        vm.prank(trader);
        factory.authorizeSession(sessionId, keyHash, uint64(block.timestamp + 1 days), 1 ether, 2 ether, bitmap);

        bytes32 openHash = keccak256("open-long-intent");
        vm.prank(sequencer);
        uint256 positionId = factory.executeAuthorizedOpenLong(
            sessionId, 0, trader, market, 5, 200, 0.1 ether, uint64(block.timestamp + 30), openHash
        );
        LaunchpadFactoryV45.SessionAuthorization memory afterOpen = factory.sessionState(sessionId);
        require(afterOpen.nextNonce == 1, "NONCE");
        require(afterOpen.spentNotionalWei == 0.5 ether, "SPENT_CAP");
        require(market.positionOwner(positionId) == trader, "POSITION_OWNER");

        vm.prank(sequencer);
        factory.executeAuthorizedClosePosition(
            sessionId, 1, trader, market, positionId, LaunchpadFactoryV45.SessionAction.CloseLong,
            uint64(block.timestamp + 30), keccak256("close-long-intent")
        );
        LaunchpadFactoryV45.SessionAuthorization memory afterClose = factory.sessionState(sessionId);
        require(afterClose.nextNonce == 2, "CLOSE_NONCE");
        require(afterClose.spentNotionalWei == 0.5 ether, "CLOSE_COUNTED_AGAINST_CAP");
        LaunchpadMarketV45.Position memory closedPosition = market.position(positionId);
        require(!closedPosition.active, "POSITION_ACTIVE");
        require(factory.consumedIntent(openHash), "INTENT_NOT_CONSUMED");
    }

    function testCreatorRestrictionAndCloseOnlyModeAreEnforcedInRouter() public {
        (LaunchpadMarketV45 market,) = _launch();
        vm.prank(creator);
        factory.deposit{value: 1 ether}();
        vm.expectRevert(LaunchpadMarketV45.PerpsForbidden.selector);
        vm.prank(creator);
        factory.openLongFromBalance(market, 2, 200, 0.05 ether);

        factory.setExecutionMode(LaunchpadFactoryV45.ExecutionMode.CloseOnly);
        vm.expectRevert(LaunchpadFactoryV45.OpeningDisabled.selector);
        vm.prank(trader);
        factory.spotBuyFromBalance(market, 0.01 ether, 0);
    }

    function testSessionCanBeRevokedAndReplayCannotExecute() public {
        (LaunchpadMarketV45 market,) = _launch();
        vm.prank(trader);
        factory.deposit{value: 1 ether}();
        bytes32 sessionId = keccak256("revocable");
        uint256 bitmap = uint256(1) << uint8(LaunchpadFactoryV45.SessionAction.SpotBuy);
        vm.prank(trader);
        factory.authorizeSession(sessionId, keccak256("key"), uint64(block.timestamp + 1 days), 1 ether, 1 ether, bitmap);
        vm.prank(trader);
        factory.revokeSession(sessionId);
        vm.expectRevert(LaunchpadFactoryV45.SessionInactive.selector);
        vm.prank(sequencer);
        factory.executeAuthorizedSpotBuy(sessionId, 0, trader, market, 0.1 ether, 0, uint64(block.timestamp + 30), keccak256("buy"));
    }
    function testV49ShortFloorProfitIsExactReservedAndPayable() public {
        (LaunchpadMarketV45 market,) = _launch();
        vm.prank(trader);
        factory.deposit{value: 3 ether}();

        vm.prank(trader);
        factory.spotBuyFromBalance(market, 1 ether, 0);
        vm.prank(trader);
        uint256 positionId = factory.openShortFromBalance(market, 5, 200, 0.01 ether);

        LaunchpadMarketV45.Position memory opened = market.position(positionId);
        uint256 maximumPayoutWei = market.quoteMaximumShortPayoutWei(positionId);
        LaunchpadMarketV45.SettlementQuote memory immediate = market.quotePositionSettlement(positionId);
        uint256 fullyReservedFunds = opened.collateralWei + opened.lockedProceedsWei;

        require(maximumPayoutWei >= immediate.payoutWei, "SHORT_PAYOUT_NOT_MONOTONIC_TO_FLOOR");
        require(maximumPayoutWei <= fullyReservedFunds, "SHORT_PAYOUT_EXCEEDS_FUNDS");
        require(market.positionObligationsWei() >= fullyReservedFunds, "SHORT_MAX_NOT_RESERVED");
        require(immediate.payableNow, "IMMEDIATE_CLOSE_NOT_PAYABLE");
        require(immediate.pnlWei == int256(immediate.payoutWei) - int256(opened.collateralWei), "PNL_MISMATCH");
    }

    function testV49LongSettlementQuotePreservesRemainingGuaranteedLiabilities() public {
        (LaunchpadMarketV45 market,) = _launch();
        vm.prank(trader);
        factory.deposit{value: 4 ether}();
        vm.prank(trader);
        factory.spotBuyFromBalance(market, 1 ether, 0);
        vm.prank(trader);
        uint256 longId = factory.openLongFromBalance(market, 3, 200, 0.02 ether);
        vm.prank(trader);
        factory.openShortFromBalance(market, 2, 200, 0.01 ether);

        LaunchpadMarketV45.SettlementQuote memory quote = market.quotePositionSettlement(longId);
        require(quote.payableNow, "LONG_CLOSE_NOT_PAYABLE");
        require(quote.projectedBalanceWei >= quote.postCloseObligationsWei, "POST_CLOSE_UNDER_RESERVED");
    }

}
