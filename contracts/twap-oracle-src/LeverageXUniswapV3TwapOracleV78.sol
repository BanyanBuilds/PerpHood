// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20MetadataV78 { function decimals() external view returns (uint8); }
interface ILeverageXPerpsRegistryV78 {
    function market(address token) external view returns (
        address tokenAddress,address pool,address creator,uint24 poolFee,uint16 maxLeverageX,
        uint64 activatedAt,uint64 activatedBlock,bool active,bool exists
    );
}
interface IUniswapV3PoolV78 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function liquidity() external view returns (uint128);
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    function slot0() external view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked);
}

library FullMathV78 {
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            uint256 prod0; uint256 prod1;
            assembly { let mm := mulmod(a,b,not(0)) prod0 := mul(a,b) prod1 := sub(sub(mm,prod0),lt(mm,prod0)) }
            if (prod1 == 0) return prod0 / denominator;
            require(denominator > prod1);
            uint256 remainder;
            assembly { remainder := mulmod(a,b,denominator) prod1 := sub(prod1,gt(remainder,prod0)) prod0 := sub(prod0,remainder) }
            uint256 twos = denominator & (~denominator + 1);
            assembly { denominator := div(denominator,twos) prod0 := div(prod0,twos) twos := add(div(sub(0,twos),twos),1) }
            prod0 |= prod1 * twos;
            uint256 inverse = (3 * denominator) ^ 2;
            inverse *= 2 - denominator * inverse; inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse; inverse *= 2 - denominator * inverse;
            inverse *= 2 - denominator * inverse; inverse *= 2 - denominator * inverse;
            result = prod0 * inverse;
        }
    }
}

library TickMathV78 {
    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = 887272;
    function getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = uint256(int256(tick < 0 ? -tick : tick));
        require(absTick <= uint256(uint24(MAX_TICK)));
        uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;
        if (tick > 0) ratio = type(uint256).max / ratio;
        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }
}

/// @title LeverageXUniswapV3TwapOracleV78
/// @notice Manipulation-resistant mark price derived from each V76-approved canonical token/WETH pool.
/// @dev Reports wei of wrapped native asset per one whole token. The returned uint64 timestamp is block.timestamp.
contract LeverageXUniswapV3TwapOracleV78 {
    uint256 public constant BPS = 10_000;
    uint32 public constant MIN_TWAP_WINDOW = 30;
    uint32 public constant MAX_TWAP_WINDOW = 1 days;

    struct OracleConfig { uint32 twapWindowSeconds; uint16 maxSpotDeviationBps; uint128 minPoolLiquidity; bool enabled; }

    address public owner;
    address public pendingOwner;
    address public immutable wrappedNative;
    ILeverageXPerpsRegistryV78 public immutable registry;
    mapping(address => OracleConfig) public config;

    event OwnershipTransferStarted(address indexed owner,address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner,address indexed newOwner);
    event OracleConfigSet(address indexed token,uint32 twapWindowSeconds,uint16 maxSpotDeviationBps,uint128 minPoolLiquidity,bool enabled);

    error OnlyOwner(); error InvalidAddress(); error InvalidConfig(); error MarketUnavailable(); error PoolMismatch();
    error PoolLocked(); error LiquidityTooLow(); error ObservationUnavailable(); error PriceInvalid(); error SpotDeviationTooHigh(); error UnsupportedDecimals();

    modifier onlyOwner(){ if(msg.sender!=owner) revert OnlyOwner(); _; }
    constructor(address owner_,address registry_,address wrappedNative_){
        if(owner_==address(0)||registry_==address(0)||wrappedNative_==address(0)) revert InvalidAddress();
        owner=owner_; registry=ILeverageXPerpsRegistryV78(registry_); wrappedNative=wrappedNative_;
        emit OwnershipTransferred(address(0),owner_);
    }
    function beginOwnershipTransfer(address nextOwner) external onlyOwner { if(nextOwner==address(0)) revert InvalidAddress(); pendingOwner=nextOwner; emit OwnershipTransferStarted(owner,nextOwner); }
    function acceptOwnership() external { if(msg.sender!=pendingOwner) revert OnlyOwner(); address previous=owner; owner=msg.sender; pendingOwner=address(0); emit OwnershipTransferred(previous,msg.sender); }
    function setConfig(address token,OracleConfig calldata next) external onlyOwner {
        if(token==address(0)||next.twapWindowSeconds<MIN_TWAP_WINDOW||next.twapWindowSeconds>MAX_TWAP_WINDOW||next.maxSpotDeviationBps==0||next.maxSpotDeviationBps>5000||next.minPoolLiquidity==0) revert InvalidConfig();
        config[token]=next; emit OracleConfigSet(token,next.twapWindowSeconds,next.maxSpotDeviationBps,next.minPoolLiquidity,next.enabled);
    }

    function markPriceWad(address token) external view returns(uint256 priceWad,uint64 updatedAt){
        OracleConfig memory cfg=config[token]; if(!cfg.enabled) revert MarketUnavailable();
        (address registeredToken,address pool,address creator,uint24 poolFee,uint16 maxLeverage,uint64 activatedAt,uint64 activatedBlock,bool active,bool exists)=registry.market(token); registeredToken; creator; poolFee; maxLeverage; activatedAt; activatedBlock; if(!exists||!active||pool==address(0)||registeredToken!=token) revert MarketUnavailable();
        IUniswapV3PoolV78 p=IUniswapV3PoolV78(pool);
        address t0=p.token0(); address t1=p.token1(); if(!((t0==token&&t1==wrappedNative)||(t1==token&&t0==wrappedNative))) revert PoolMismatch();
        if(p.liquidity()<cfg.minPoolLiquidity) revert LiquidityTooLow();
        (,int24 spotTick,,,,,bool unlocked)=p.slot0(); if(!unlocked) revert PoolLocked();
        int24 twapTick=_consult(p,cfg.twapWindowSeconds);
        uint8 decimals=IERC20MetadataV78(token).decimals(); if(decimals>38) revert UnsupportedDecimals();
        uint128 baseAmount=uint128(10 ** uint256(decimals));
        priceWad=_quoteAtTick(twapTick,baseAmount,token,wrappedNative); if(priceWad==0) revert PriceInvalid();
        uint256 spotPrice=_quoteAtTick(spotTick,baseAmount,token,wrappedNative); if(spotPrice==0) revert PriceInvalid();
        uint256 delta=spotPrice>priceWad?spotPrice-priceWad:priceWad-spotPrice;
        if(FullMathV78.mulDiv(delta,BPS,priceWad)>cfg.maxSpotDeviationBps) revert SpotDeviationTooHigh();
        updatedAt=uint64(block.timestamp);
    }

    function consultTick(address token) external view returns(int24 twapTick,int24 spotTick,uint128 poolLiquidity){
        OracleConfig memory cfg=config[token]; if(!cfg.enabled) revert MarketUnavailable();
        (address registeredToken,address pool,address creator,uint24 poolFee,uint16 maxLeverage,uint64 activatedAt,uint64 activatedBlock,bool active,bool exists)=registry.market(token); registeredToken; creator; poolFee; maxLeverage; activatedAt; activatedBlock; if(!exists||!active||pool==address(0)||registeredToken!=token) revert MarketUnavailable();
        IUniswapV3PoolV78 p=IUniswapV3PoolV78(pool); poolLiquidity=p.liquidity(); (,spotTick,,,,,)=p.slot0(); twapTick=_consult(p,cfg.twapWindowSeconds);
    }

    function _consult(IUniswapV3PoolV78 pool,uint32 secondsAgo) internal view returns(int24 arithmeticMeanTick){
        uint32[] memory secondsAgos=new uint32[](2); secondsAgos[0]=secondsAgo; secondsAgos[1]=0;
        try pool.observe(secondsAgos) returns(int56[] memory ticks,uint160[] memory){
            if(ticks.length!=2) revert ObservationUnavailable(); int56 delta=ticks[1]-ticks[0]; int56 divisor=int56(uint56(secondsAgo));
            arithmeticMeanTick=int24(delta/divisor); if(delta<0&&(delta%divisor!=0)) arithmeticMeanTick--;
        } catch { revert ObservationUnavailable(); }
    }

    function _quoteAtTick(int24 tick,uint128 baseAmount,address baseToken,address quoteToken) internal pure returns(uint256 quoteAmount){
        uint160 sqrtRatioX96=TickMathV78.getSqrtRatioAtTick(tick);
        if(sqrtRatioX96<=type(uint128).max){
            uint256 ratioX192=uint256(sqrtRatioX96)*sqrtRatioX96;
            quoteAmount=baseToken<quoteToken?FullMathV78.mulDiv(ratioX192,baseAmount,1<<192):FullMathV78.mulDiv(1<<192,baseAmount,ratioX192);
        } else {
            uint256 ratioX128=FullMathV78.mulDiv(sqrtRatioX96,sqrtRatioX96,1<<64);
            quoteAmount=baseToken<quoteToken?FullMathV78.mulDiv(ratioX128,baseAmount,1<<128):FullMathV78.mulDiv(1<<128,baseAmount,ratioX128);
        }
    }
}
