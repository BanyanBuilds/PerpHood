// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title BattleCurveMathV24
/// @notice Integer-only exponent-5 curve verifier for PERPHOOD V24.
/// @dev Token quantities use token-WAD and WETH/price values use WAD. The library
///      rounds protocol fees up while token output and trader payouts round down.
///      Fee-up rounding prevents dust fragmentation from reducing total fees.
library BattleCurveMathV24 {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant CURVE_EXPONENT = 5;

    struct Params {
        uint256 allocationWad;
        uint256 openingPriceWad;
        uint256 feeBps;
        uint256 maxSoldBps;
    }

    struct BuyQuote {
        uint256 soldBeforeWad;
        uint256 soldAfterWad;
        uint256 tokenOutWad;
        uint256 grossWethWad;
        uint256 feeWethWad;
        uint256 netCurveWethWad;
        uint256 marginalPriceBeforeWad;
        uint256 marginalPriceAfterWad;
    }

    struct SellQuote {
        uint256 soldBeforeWad;
        uint256 soldAfterWad;
        uint256 tokenInWad;
        uint256 grossCurveWethWad;
        uint256 feeWethWad;
        uint256 netWethWad;
        uint256 marginalPriceBeforeWad;
        uint256 marginalPriceAfterWad;
    }

    error InvalidCurveParameters();
    error InvalidCurveDomain();
    error InvalidTradeAmount();
    error ProtectedInventoryExceeded();

    function validate(Params memory params) internal pure {
        if (
            params.allocationWad == 0 ||
            params.openingPriceWad == 0 ||
            params.feeBps >= BPS ||
            params.maxSoldBps == 0 ||
            params.maxSoldBps >= BPS
        ) revert InvalidCurveParameters();
    }

    function mulDivDown(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        if (denominator == 0) revert InvalidCurveParameters();
        return a * b / denominator;
    }

    function mulDivUp(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256) {
        if (denominator == 0) revert InvalidCurveParameters();
        if (a == 0 || b == 0) return 0;
        return (a * b + denominator - 1) / denominator;
    }

    function feeUp(uint256 amountWad, uint256 feeBps) internal pure returns (uint256) {
        return mulDivUp(amountWad, feeBps, BPS);
    }

    function wadMulDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulDivDown(a, b, WAD);
    }

    function wadDivDown(uint256 a, uint256 b) internal pure returns (uint256) {
        return mulDivDown(a, WAD, b);
    }

    function wadPowDown(uint256 baseWad, uint256 exponent) internal pure returns (uint256 result) {
        result = WAD;
        uint256 base = baseWad;
        uint256 power = exponent;
        while (power > 0) {
            if ((power & 1) == 1) result = wadMulDown(result, base);
            power >>= 1;
            if (power > 0) base = wadMulDown(base, base);
        }
    }

    function log2(uint256 value) internal pure returns (uint256 result) {
        if (value >> 128 > 0) { value >>= 128; result += 128; }
        if (value >> 64 > 0) { value >>= 64; result += 64; }
        if (value >> 32 > 0) { value >>= 32; result += 32; }
        if (value >> 16 > 0) { value >>= 16; result += 16; }
        if (value >> 8 > 0) { value >>= 8; result += 8; }
        if (value >> 4 > 0) { value >>= 4; result += 4; }
        if (value >> 2 > 0) { value >>= 2; result += 2; }
        if (value >> 1 > 0) result += 1;
    }

    function sqrtDown(uint256 value) internal pure returns (uint256 result) {
        if (value == 0) return 0;
        result = uint256(1) << ((log2(value) + 1) >> 1);
        unchecked {
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            result = (result + value / result) >> 1;
            uint256 roundedDown = value / result;
            if (roundedDown < result) result = roundedDown;
        }
    }

    function wadSqrtDown(uint256 valueWad) internal pure returns (uint256) {
        return sqrtDown(valueWad * WAD);
    }

    function wadFourthRootDown(uint256 valueWad) internal pure returns (uint256) {
        return wadSqrtDown(wadSqrtDown(valueWad));
    }

    function maxSoldWad(Params memory params) internal pure returns (uint256) {
        validate(params);
        return mulDivDown(params.allocationWad, params.maxSoldBps, BPS);
    }

    function marginalPriceWad(uint256 soldWad, Params memory params) internal pure returns (uint256) {
        validate(params);
        if (soldWad >= params.allocationWad) revert InvalidCurveDomain();
        uint256 remainingWad = params.allocationWad - soldWad;
        uint256 reserveRatioWad = wadDivDown(params.allocationWad, remainingWad);
        return wadMulDown(params.openingPriceWad, wadPowDown(reserveRatioWad, CURVE_EXPONENT));
    }

    function cumulativeCostWad(uint256 soldWad, Params memory params) internal pure returns (uint256) {
        validate(params);
        if (soldWad >= params.allocationWad) revert InvalidCurveDomain();
        if (soldWad == 0) return 0;
        uint256 remainingWad = params.allocationWad - soldWad;
        uint256 reserveRatioWad = wadDivDown(params.allocationWad, remainingWad);
        uint256 ratioFourthWad = wadPowDown(reserveRatioWad, 4);
        uint256 baseWethWad = mulDivDown(params.openingPriceWad, params.allocationWad, WAD);
        return mulDivDown(baseWethWad, ratioFourthWad - WAD, 4 * WAD);
    }

    function soldAtCumulativeCostWad(uint256 targetCostWad, Params memory params) internal pure returns (uint256) {
        validate(params);
        uint256 maximumSold = maxSoldWad(params);
        if (targetCostWad > cumulativeCostWad(maximumSold, params)) revert ProtectedInventoryExceeded();
        if (targetCostWad == 0) return 0;
        uint256 baseWethWad = mulDivDown(params.openingPriceWad, params.allocationWad, WAD);
        uint256 ratioFourthWad = WAD + mulDivDown(targetCostWad, 4 * WAD, baseWethWad);
        uint256 reserveRatioWad = wadFourthRootDown(ratioFourthWad);
        uint256 remainingWad = (params.allocationWad * WAD + reserveRatioWad - 1) / reserveRatioWad;
        uint256 soldWad = params.allocationWad - remainingWad;
        if (soldWad > maximumSold || cumulativeCostWad(soldWad, params) > targetCostWad) revert ProtectedInventoryExceeded();
        return soldWad;
    }

    function quoteBuy(
        uint256 soldBeforeWad,
        uint256 grossWethWad,
        Params memory params
    ) internal pure returns (BuyQuote memory quote) {
        validate(params);
        if (grossWethWad == 0 || soldBeforeWad > maxSoldWad(params)) revert InvalidTradeAmount();
        uint256 feeWethWad = feeUp(grossWethWad, params.feeBps);
        uint256 netCurveWethWad = grossWethWad - feeWethWad;
        uint256 targetCostWad = cumulativeCostWad(soldBeforeWad, params) + netCurveWethWad;
        uint256 soldAfterWad = soldAtCumulativeCostWad(targetCostWad, params);
        if (soldAfterWad > maxSoldWad(params)) revert ProtectedInventoryExceeded();
        uint256 tokenOutWad = soldAfterWad - soldBeforeWad;
        if (tokenOutWad == 0) revert InvalidTradeAmount();
        quote = BuyQuote({
            soldBeforeWad: soldBeforeWad,
            soldAfterWad: soldAfterWad,
            tokenOutWad: tokenOutWad,
            grossWethWad: grossWethWad,
            feeWethWad: feeWethWad,
            netCurveWethWad: netCurveWethWad,
            marginalPriceBeforeWad: marginalPriceWad(soldBeforeWad, params),
            marginalPriceAfterWad: marginalPriceWad(soldAfterWad, params)
        });
    }


    function quoteBuyExactTokens(
        uint256 soldBeforeWad,
        uint256 tokenOutWad,
        Params memory params
    ) internal pure returns (BuyQuote memory quote) {
        validate(params);
        if (tokenOutWad == 0) revert InvalidTradeAmount();
        uint256 soldAfterWad = soldBeforeWad + tokenOutWad;
        if (soldAfterWad > maxSoldWad(params)) revert ProtectedInventoryExceeded();
        uint256 netCurveWethWad = cumulativeCostWad(soldAfterWad, params) - cumulativeCostWad(soldBeforeWad, params);
        uint256 grossWethWad = (netCurveWethWad * BPS + (BPS - params.feeBps) - 1) / (BPS - params.feeBps);
        uint256 feeWethWad = feeUp(grossWethWad, params.feeBps);
        while (grossWethWad > 0) {
            uint256 candidate = grossWethWad - 1;
            uint256 candidateFee = feeUp(candidate, params.feeBps);
            if (candidate - candidateFee < netCurveWethWad) break;
            grossWethWad = candidate;
            feeWethWad = candidateFee;
        }
        while (grossWethWad - feeWethWad < netCurveWethWad) {
            grossWethWad += 1;
            feeWethWad = feeUp(grossWethWad, params.feeBps);
        }
        quote = BuyQuote({
            soldBeforeWad: soldBeforeWad,
            soldAfterWad: soldAfterWad,
            tokenOutWad: tokenOutWad,
            grossWethWad: grossWethWad,
            feeWethWad: feeWethWad,
            netCurveWethWad: netCurveWethWad,
            marginalPriceBeforeWad: marginalPriceWad(soldBeforeWad, params),
            marginalPriceAfterWad: marginalPriceWad(soldAfterWad, params)
        });
    }

    function quoteSell(
        uint256 soldBeforeWad,
        uint256 tokenInWad,
        Params memory params
    ) internal pure returns (SellQuote memory quote) {
        validate(params);
        if (tokenInWad == 0 || tokenInWad > soldBeforeWad) revert InvalidTradeAmount();
        uint256 soldAfterWad = soldBeforeWad - tokenInWad;
        uint256 grossCurveWethWad = cumulativeCostWad(soldBeforeWad, params) - cumulativeCostWad(soldAfterWad, params);
        uint256 feeWethWad = feeUp(grossCurveWethWad, params.feeBps);
        quote = SellQuote({
            soldBeforeWad: soldBeforeWad,
            soldAfterWad: soldAfterWad,
            tokenInWad: tokenInWad,
            grossCurveWethWad: grossCurveWethWad,
            feeWethWad: feeWethWad,
            netWethWad: grossCurveWethWad - feeWethWad,
            marginalPriceBeforeWad: marginalPriceWad(soldBeforeWad, params),
            marginalPriceAfterWad: marginalPriceWad(soldAfterWad, params)
        });
    }
}
