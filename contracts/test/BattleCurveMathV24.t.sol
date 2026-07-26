// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "../src/BattleCurveMathV24.sol";

contract BattleCurveMathV24Harness {
    function params() public pure returns (BattleCurveMathV24.Params memory) {
        return BattleCurveMathV24.Params({
            allocationWad: 800_000_000 ether,
            openingPriceWad: 250_000_000,
            feeBps: 30,
            maxSoldBps: 9_400
        });
    }

    function price(uint256 soldWad) external pure returns (uint256) {
        return BattleCurveMathV24.marginalPriceWad(soldWad, params());
    }

    function cost(uint256 soldWad) external pure returns (uint256) {
        return BattleCurveMathV24.cumulativeCostWad(soldWad, params());
    }

    function buy(uint256 soldWad, uint256 grossWethWad) external pure returns (BattleCurveMathV24.BuyQuote memory) {
        return BattleCurveMathV24.quoteBuy(soldWad, grossWethWad, params());
    }

    function buyExact(uint256 soldWad, uint256 tokenOutWad) external pure returns (BattleCurveMathV24.BuyQuote memory) {
        return BattleCurveMathV24.quoteBuyExactTokens(soldWad, tokenOutWad, params());
    }

    function sell(uint256 soldWad, uint256 tokenInWad) external pure returns (BattleCurveMathV24.SellQuote memory) {
        return BattleCurveMathV24.quoteSell(soldWad, tokenInWad, params());
    }
}

contract BattleCurveMathV24Test {
    BattleCurveMathV24Harness internal harness = new BattleCurveMathV24Harness();

    function testOpeningPriceAndCost() public view {
        require(harness.price(0) == 250_000_000, "opening price");
        require(harness.cost(0) == 0, "opening cost");
    }

    function testBuyAndExactRepaymentUseSameCurve() public view {
        BattleCurveMathV24.BuyQuote memory buyQuote = harness.buy(0, 0.1 ether);
        require(buyQuote.tokenOutWad > 0, "token output");
        require(buyQuote.marginalPriceAfterWad > buyQuote.marginalPriceBeforeWad, "price did not rise");
        BattleCurveMathV24.BuyQuote memory exactQuote = harness.buyExact(0, buyQuote.tokenOutWad);
        require(exactQuote.grossWethWad <= buyQuote.grossWethWad, "exact quote exceeds input quote");
        require(buyQuote.grossWethWad - exactQuote.grossWethWad <= 3, "rounding gap");
    }

    function testSellReversesTokenMovementWithDownRoundedPayout() public view {
        BattleCurveMathV24.BuyQuote memory buyQuote = harness.buy(0, 0.1 ether);
        BattleCurveMathV24.SellQuote memory sellQuote = harness.sell(buyQuote.soldAfterWad, buyQuote.tokenOutWad);
        require(sellQuote.soldAfterWad == 0, "sold inventory did not return");
        require(sellQuote.netWethWad < buyQuote.grossWethWad, "fees not retained");
    }
}
