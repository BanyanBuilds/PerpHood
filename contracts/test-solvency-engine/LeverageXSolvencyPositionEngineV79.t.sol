// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {LeverageXSolvencyPositionEngineV79,ILeverageXPerpsRegistryV79,ILeverageXMarkPriceOracleV79} from "../solvency-engine-src/LeverageXSolvencyPositionEngineV79.sol";
interface VmV79 { function deal(address,uint256) external; function prank(address) external; function expectRevert(bytes4) external; }
contract MockRegistryV79 is ILeverageXPerpsRegistryV79 { function requireTradable(address,address,uint16 leverage) external pure { require(leverage<=20,"LEV"); } }
contract MockOracleV79 is ILeverageXMarkPriceOracleV79 { uint256 public price=1e18; uint64 public updatedAt=uint64(block.timestamp); function setPrice(uint256 p) external { price=p; updatedAt=uint64(block.timestamp); } function markPriceWad(address) external view returns(uint256,uint64){ return(price,updatedAt); } }
contract LeverageXSolvencyPositionEngineV79Test {
 VmV79 constant vm=VmV79(address(uint160(uint256(keccak256("hevm cheat code"))))); address constant TRADER=address(0xBEEF); address constant TOKEN=address(0xCAFE);
 MockRegistryV79 registry; MockOracleV79 oracle; LeverageXSolvencyPositionEngineV79 engine;
 function setUp() public { registry=new MockRegistryV79(); oracle=new MockOracleV79(); engine=new LeverageXSolvencyPositionEngineV79(address(this),address(registry),address(oracle),address(this)); engine.setMarketRisk(TOKEN,LeverageXSolvencyPositionEngineV79.MarketRisk(500,10,10,5000,10000,60,10 ether,10 ether,15 ether,1 ether,true)); vm.deal(address(this),10 ether); engine.fundInsurance{value:2 ether}(TOKEN); vm.deal(TRADER,10 ether); }
 function _deposit() internal { vm.prank(TRADER); engine.depositCollateral{value:2 ether}(); }
 function testInsuranceAndOpenInterestAreEnforced() public { _deposit(); vm.prank(TRADER); engine.openPosition(TOKEN,LeverageXSolvencyPositionEngineV79.Side.LONG,5,1 ether); require(engine.longOpenInterestWei(TOKEN)==5 ether,"OI"); require(engine.marketInsuranceWei(TOKEN)>2 ether,"FEE_SPLIT"); }
 function testRejectsOpenInterestAboveCap() public { _deposit(); vm.expectRevert(LeverageXSolvencyPositionEngineV79.OpenInterestCap.selector); vm.prank(TRADER); engine.openPosition(TOKEN,LeverageXSolvencyPositionEngineV79.Side.LONG,20,1 ether); }
 function testProfitableCloseUsesBackedAssets() public { _deposit(); vm.prank(TRADER); engine.openPosition(TOKEN,LeverageXSolvencyPositionEngineV79.Side.LONG,5,1 ether); oracle.setPrice(1.1e18); vm.prank(TRADER); engine.closePosition(TOKEN); require(engine.freeCollateralWei(TRADER)>1.49 ether,"PROFIT"); require(engine.longOpenInterestWei(TOKEN)==0,"OI_CLEAR"); }
 function testCannotDrainInsuranceBelowFloor() public { vm.expectRevert(LeverageXSolvencyPositionEngineV79.InsuranceFloor.selector); engine.withdrawInsuranceSurplus(TOKEN,1.5 ether,payable(address(this))); }
}
