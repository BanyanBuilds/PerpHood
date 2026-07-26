// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "../src/BattleCurveMathV24.sol";
import {LocalBattlePoolV24} from "../src/LocalBattlePoolV24.sol";

interface VmV24 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function expectRevert(bytes4 revertData) external;
    function warp(uint256 newTimestamp) external;
}

contract LocalBattlePoolV24Test {
    VmV24 internal constant vm = VmV24(address(uint160(uint256(keccak256("hevm cheat code")))));
    LocalBattlePoolV24 internal pool;
    address internal alice = address(0xA11CE);
    bytes32 internal constant MARKET_ID = keccak256("PERPHOOD_V24_TEST");
    bytes32 internal constant SESSION_ID = keccak256("alice-v24-session");

    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 100 ether);
        vm.deal(alice, 10 ether);
        pool = new LocalBattlePoolV24(address(this), address(this), MARKET_ID, "PerpHood V24", "PH24");
        pool.seedPool{value: 2 ether}();
        vm.prank(alice);
        pool.deposit{value: 2 ether}();
        vm.prank(alice);
        pool.authorizeSession(SESSION_ID, keccak256("p256-key"), uint64(block.timestamp + 1 days), 2 ether, type(uint256).max);
    }

    function testVerifiedSpotBuyRecomputesCurveOnChain() public {
        BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuy(0, 0.1 ether, pool.curveParams());
        LocalBattlePoolV24.CurveActionProof memory proof = LocalBattlePoolV24.CurveActionProof({
            grossCurveWethWad: quote.grossWethWad,
            curveTokenAmountWad: quote.tokenOutWad,
            curveFeeWad: quote.feeWethWad,
            externalWethAmountWad: quote.grossWethWad,
            nextLockedLongTokensWad: 0,
            nextBorrowedShortTokensWad: 0,
            nextPerpInventoryWad: pool.INITIAL_PERP_INVENTORY(),
            nextSafetyInventoryWad: pool.INITIAL_SAFETY_INVENTORY(),
            nextCirculatingSpotTokensWad: quote.tokenOutWad
        });
        LocalBattlePoolV24.FrameInput memory frame = _frame(LocalBattlePoolV24.ActionKind.SpotBuy, quote.marginalPriceAfterWad, keccak256("spot-buy"));
        pool.commitVerifiedAuthorizedFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp + 60), frame, proof, alice,
            -int256(0.1 ether), int256(quote.tokenOutWad), int256(0.1 ether), -int256(quote.tokenOutWad)
        );
        require(pool.curveSoldTokenWad() == quote.soldAfterWad, "curve sold mismatch");
        require(pool.circulatingSpotTokensWad() == quote.tokenOutWad, "spot bucket mismatch");
        require(pool.curveMarginalPriceWad() == quote.marginalPriceAfterWad, "price mismatch");
        require(pool.custodySolvent(), "custody insolvent");
    }

    function testSequencerCannotCommitFakePrice() public {
        BattleCurveMathV24.BuyQuote memory quote = BattleCurveMathV24.quoteBuy(0, 0.1 ether, pool.curveParams());
        LocalBattlePoolV24.CurveActionProof memory proof = _spotBuyProof(quote);
        LocalBattlePoolV24.FrameInput memory frame = _frame(LocalBattlePoolV24.ActionKind.SpotBuy, quote.marginalPriceAfterWad + 1, keccak256("fake-price"));
        vm.expectRevert(LocalBattlePoolV24.InvalidCurveProof.selector);
        pool.commitVerifiedAuthorizedFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp + 60), frame, proof, alice,
            -int256(0.1 ether), int256(quote.tokenOutWad), int256(0.1 ether), -int256(quote.tokenOutWad)
        );
    }

    function testLiquidationContinuationCompletesFromExactCursor() public {
        BattleCurveMathV24.BuyQuote memory openQuote = BattleCurveMathV24.quoteBuy(0, 0.1 ether, pool.curveParams());
        LocalBattlePoolV24.CurveActionProof memory openProof = LocalBattlePoolV24.CurveActionProof({
            grossCurveWethWad: openQuote.grossWethWad,
            curveTokenAmountWad: openQuote.tokenOutWad,
            curveFeeWad: openQuote.feeWethWad,
            externalWethAmountWad: 0.02 ether,
            nextLockedLongTokensWad: openQuote.tokenOutWad,
            nextBorrowedShortTokensWad: 0,
            nextPerpInventoryWad: pool.INITIAL_PERP_INVENTORY(),
            nextSafetyInventoryWad: pool.INITIAL_SAFETY_INVENTORY(),
            nextCirculatingSpotTokensWad: 0
        });
        LocalBattlePoolV24.FrameInput memory openFrame = _frame(LocalBattlePoolV24.ActionKind.OpenLong, openQuote.marginalPriceAfterWad, keccak256("open-long"));
        pool.commitVerifiedAuthorizedFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp + 60), openFrame, openProof, alice,
            -int256(0.02 ether), 0, int256(0.02 ether), 0
        );

        bytes32 batchId = keccak256("one-long-liquidation");
        pool.beginLiquidationBatch(batchId, 1, keccak256("positions-before"));
        BattleCurveMathV24.SellQuote memory sellQuote = BattleCurveMathV24.quoteSell(openQuote.soldAfterWad, openQuote.tokenOutWad, pool.curveParams());
        LocalBattlePoolV24.CurveActionProof[] memory proofs = new LocalBattlePoolV24.CurveActionProof[](1);
        proofs[0] = LocalBattlePoolV24.CurveActionProof({
            grossCurveWethWad: sellQuote.grossCurveWethWad,
            curveTokenAmountWad: sellQuote.tokenInWad,
            curveFeeWad: sellQuote.feeWethWad,
            externalWethAmountWad: 0,
            nextLockedLongTokensWad: 0,
            nextBorrowedShortTokensWad: 0,
            nextPerpInventoryWad: pool.INITIAL_PERP_INVENTORY(),
            nextSafetyInventoryWad: pool.INITIAL_SAFETY_INVENTORY(),
            nextCirculatingSpotTokensWad: 0
        });
        LocalBattlePoolV24.FrameInput memory liquidationFrame = _frame(LocalBattlePoolV24.ActionKind.LiquidateLong, sellQuote.marginalPriceAfterWad, keccak256("liquidate-long"));
        pool.commitVerifiedLiquidationChunk(batchId, 0, liquidationFrame, proofs);
        (,,,,,,, bool active) = pool.liquidationContinuation();
        require(!active, "batch still active");
        require(pool.lockedLongTokensWad() == 0, "long tokens not released");
        require(pool.curveSoldTokenWad() == 0, "curve did not return to genesis");
    }

    function _spotBuyProof(BattleCurveMathV24.BuyQuote memory quote) internal view returns (LocalBattlePoolV24.CurveActionProof memory) {
        return LocalBattlePoolV24.CurveActionProof({
            grossCurveWethWad: quote.grossWethWad,
            curveTokenAmountWad: quote.tokenOutWad,
            curveFeeWad: quote.feeWethWad,
            externalWethAmountWad: quote.grossWethWad,
            nextLockedLongTokensWad: 0,
            nextBorrowedShortTokensWad: 0,
            nextPerpInventoryWad: pool.INITIAL_PERP_INVENTORY(),
            nextSafetyInventoryWad: pool.INITIAL_SAFETY_INVENTORY(),
            nextCirculatingSpotTokensWad: quote.tokenOutWad
        });
    }

    function _frame(LocalBattlePoolV24.ActionKind action, uint256 priceWad, bytes32 intentHash) internal view returns (LocalBattlePoolV24.FrameInput memory) {
        return LocalBattlePoolV24.FrameInput({
            marketId: MARKET_ID,
            action: action,
            marginalPriceWad: priceWad,
            marketCapWad: priceWad * pool.TOTAL_TOKEN_SUPPLY() / 1e18,
            reservedWethWad: 0,
            openInterestLongWad: action == LocalBattlePoolV24.ActionKind.OpenLong ? 0.1 ether : 0,
            openInterestShortWad: 0,
            positionsRoot: keccak256(abi.encode(action, "positions")),
            balancesRoot: keccak256(abi.encode(action, "balances")),
            intentHash: intentHash
        });
    }
}
