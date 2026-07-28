// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {LeverageXUniswapV3TwapOracleV78, ILeverageXPerpsRegistryV78, IUniswapV3PoolV78} from "../twap-oracle-src/LeverageXUniswapV3TwapOracleV78.sol";

interface VmV78 { function expectRevert(bytes4) external; }
contract MockTokenV78 { function decimals() external pure returns(uint8){return 18;} }
contract MockRegistryV78 is ILeverageXPerpsRegistryV78 {
    address public token; address public pool; bool public active=true;
    function set(address t,address p) external {token=t;pool=p;}
    function setActive(bool v) external {active=v;}
    function market(address t) external view returns(address,address,address,uint24,uint16,uint64,uint64,bool,bool){return(t,pool,address(0xC0FFEE),3000,20,1,1,active,t==token);}
}
contract MockPoolV78 is IUniswapV3PoolV78 {
    address public override token0; address public override token1; uint128 public override liquidity=1_000_000;
    int24 public spotTick; int24 public twapTick; bool public unlocked=true; bool public observeFails;
    constructor(address a,address b){token0=a;token1=b;}
    function setTicks(int24 spot,int24 twap) external {spotTick=spot;twapTick=twap;}
    function setLiquidity(uint128 v) external {liquidity=v;}
    function setObserveFails(bool v) external {observeFails=v;}
    function observe(uint32[] calldata secondsAgos) external view returns(int56[] memory ticks,uint160[] memory spl){
        require(!observeFails,"NO_HISTORY"); ticks=new int56[](2); spl=new uint160[](2); ticks[0]=0; ticks[1]=int56(twapTick)*int56(uint56(secondsAgos[0]));
    }
    function slot0() external view returns(uint160,int24,uint16,uint16,uint16,uint8,bool){return(79228162514264337593543950336,spotTick,0,2,2,0,unlocked);}
}
contract LeverageXUniswapV3TwapOracleV78Test {
    VmV78 constant vm=VmV78(address(uint160(uint256(keccak256("hevm cheat code")))));
    MockTokenV78 token; MockTokenV78 weth; MockRegistryV78 registry; MockPoolV78 pool; LeverageXUniswapV3TwapOracleV78 oracle;
    function setUp() public { token=new MockTokenV78(); weth=new MockTokenV78(); registry=new MockRegistryV78(); pool=new MockPoolV78(address(token),address(weth)); registry.set(address(token),address(pool)); oracle=new LeverageXUniswapV3TwapOracleV78(address(this),address(registry),address(weth)); oracle.setConfig(address(token),LeverageXUniswapV3TwapOracleV78.OracleConfig(300,500,100,true)); }
    function testTickZeroReturnsOneWrappedNativePerToken() public { (uint256 price,uint64 updated)=oracle.markPriceWad(address(token)); require(price==1e18,"PRICE"); require(updated==block.timestamp,"TIME"); }
    function testRejectsLowLiquidity() public {pool.setLiquidity(99);vm.expectRevert(LeverageXUniswapV3TwapOracleV78.LiquidityTooLow.selector);oracle.markPriceWad(address(token));}
    function testRejectsMissingObservationHistory() public {pool.setObserveFails(true);vm.expectRevert(LeverageXUniswapV3TwapOracleV78.ObservationUnavailable.selector);oracle.markPriceWad(address(token));}
    function testRejectsLargeSpotTwapDeviation() public {pool.setTicks(10000,0);vm.expectRevert(LeverageXUniswapV3TwapOracleV78.SpotDeviationTooHigh.selector);oracle.markPriceWad(address(token));}
    function testDisabledMarketRejected() public {registry.setActive(false);vm.expectRevert(LeverageXUniswapV3TwapOracleV78.MarketUnavailable.selector);oracle.markPriceWad(address(token));}
}
