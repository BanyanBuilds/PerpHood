// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LeverageXCollateralPositionEngineV77, ILeverageXPerpsRegistryV77, ILeverageXMarkPriceOracleV77} from "../perps-engine-src/LeverageXCollateralPositionEngineV77.sol";

interface VmV77 {
    function deal(address account, uint256 balance) external;
    function prank(address sender) external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert() external;
    function warp(uint256 timestamp) external;
}

contract MockRegistryV77 is ILeverageXPerpsRegistryV77 {
    mapping(address => bool) public blocked;
    bool public active = true;
    function setBlocked(address wallet, bool value) external { blocked[wallet] = value; }
    function setActive(bool value) external { active = value; }
    function requireTradable(address, address wallet, uint16 leverageX) external view {
        require(active, "INACTIVE");
        require(!blocked[wallet], "BLOCKED");
        require(leverageX > 0 && leverageX <= 20, "LEV");
    }
    function market(address token) external view returns (address,address,address,uint24,uint16,uint64,uint64,bool,bool) {
        return (token, address(2), address(3), 10_000, 20, 1, 1, active, true);
    }
}

contract MockOracleV77 is ILeverageXMarkPriceOracleV77 {
    uint256 public price = 1e18;
    uint64 public updatedAt;
    constructor() { updatedAt = uint64(block.timestamp); }
    function setPrice(uint256 price_) external { price = price_; updatedAt = uint64(block.timestamp); }
    function setTimestamp(uint64 timestamp_) external { updatedAt = timestamp_; }
    function markPriceWad(address) external view returns (uint256, uint64) { return (price, updatedAt); }
}

contract LeverageXCollateralPositionEngineV77Test {
    VmV77 private constant vm = VmV77(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant TRADER = address(0xBEEF);
    address private constant CREATOR = address(0xC0FFEE);
    address private constant TOKEN = address(0xCAFE);

    MockRegistryV77 registry;
    MockOracleV77 oracle;
    LeverageXCollateralPositionEngineV77 engine;

    function setUp() public {
        registry = new MockRegistryV77();
        oracle = new MockOracleV77();
        engine = new LeverageXCollateralPositionEngineV77(address(this), address(registry), address(oracle), address(this));
        engine.setRiskConfig(TOKEN, LeverageXCollateralPositionEngineV77.RiskConfig({
            maintenanceMarginBps: 500,
            openFeeBps: 10,
            closeFeeBps: 10,
            maxOracleAgeSeconds: 60,
            maxPositionNotionalWei: 100 ether,
            enabled: true
        }));
        engine.setLiquidator(address(this), true);
        vm.deal(TRADER, 10 ether);
    }

    function _deposit(uint256 amount) internal {
        vm.prank(TRADER);
        engine.depositCollateral{value: amount}();
    }

    function testDepositOpenLongAndProfitClose() public {
        _deposit(2 ether);
        vm.prank(TRADER);
        engine.openPosition(TOKEN, LeverageXCollateralPositionEngineV77.Side.LONG, 5, 1 ether);
        oracle.setPrice(1.1e18);
        vm.prank(TRADER);
        engine.closePosition(TOKEN);
        require(engine.freeCollateralWei(TRADER) > 1.49 ether, "PROFIT_NOT_CREDITED");
        require(engine.longOpenInterestWei(TOKEN) == 0, "OI_NOT_CLEARED");
    }

    function testShortProfitsWhenPriceFalls() public {
        _deposit(2 ether);
        vm.prank(TRADER);
        engine.openPosition(TOKEN, LeverageXCollateralPositionEngineV77.Side.SHORT, 4, 1 ether);
        oracle.setPrice(0.8e18);
        vm.prank(TRADER);
        engine.closePosition(TOKEN);
        require(engine.freeCollateralWei(TRADER) > 1.79 ether, "SHORT_PROFIT_MISSING");
    }

    function testCreatorBlockFlowsThroughRegistry() public {
        registry.setBlocked(CREATOR, true);
        vm.deal(CREATOR, 2 ether);
        vm.prank(CREATOR);
        engine.depositCollateral{value: 1 ether}();
        vm.expectRevert();
        vm.prank(CREATOR);
        engine.openPosition(TOKEN, LeverageXCollateralPositionEngineV77.Side.LONG, 2, 0.5 ether);
    }

    function testLiquidatesAtMaintenanceThreshold() public {
        _deposit(2 ether);
        vm.prank(TRADER);
        engine.openPosition(TOKEN, LeverageXCollateralPositionEngineV77.Side.LONG, 10, 1 ether);
        oracle.setPrice(0.905e18);
        require(engine.isLiquidatable(TRADER, TOKEN), "NOT_LIQUIDATABLE");
        engine.liquidate(TRADER, TOKEN);
        LeverageXCollateralPositionEngineV77.Position memory p = engine.position(TRADER, TOKEN);
        require(p.side == LeverageXCollateralPositionEngineV77.Side.NONE, "POSITION_REMAINS");
    }

    function testRejectsStaleOracle() public {
        _deposit(2 ether);
        vm.warp(block.timestamp + 120);
        vm.expectRevert(LeverageXCollateralPositionEngineV77.OracleStale.selector);
        vm.prank(TRADER);
        engine.openPosition(TOKEN, LeverageXCollateralPositionEngineV77.Side.LONG, 2, 1 ether);
    }

    function testCannotWithdrawLockedCollateral() public {
        _deposit(2 ether);
        vm.prank(TRADER);
        engine.openPosition(TOKEN, LeverageXCollateralPositionEngineV77.Side.LONG, 2, 1 ether);
        vm.expectRevert(LeverageXCollateralPositionEngineV77.InsufficientCollateral.selector);
        vm.prank(TRADER);
        engine.withdrawCollateral(1.5 ether);
    }
}
