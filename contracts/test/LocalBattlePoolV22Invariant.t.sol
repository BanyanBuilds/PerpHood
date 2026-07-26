// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LocalBattlePoolV22, BattleTokenV22} from "../src/LocalBattlePoolV22.sol";

interface VmV22Invariant {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
}

contract LocalBattlePoolV22InvariantTest {
    VmV22Invariant internal constant vm = VmV22Invariant(address(uint160(uint256(keccak256("hevm cheat code")))));
    LocalBattlePoolV22 internal pool;
    BattleTokenV22 internal token;
    address internal trader = address(0xCAFE);

    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 1_000 ether);
        vm.deal(trader, 100 ether);
        pool = new LocalBattlePoolV22(address(this), address(this), keccak256("V22_INVARIANT"), "Invariant V22", "INV22");
        token = BattleTokenV22(address(pool.token()));
        pool.seedPool{value: 100 ether}();
        vm.prank(trader);
        pool.deposit{value: 50 ether}();
    }

    function invariantWethCustodyAlwaysCoversInternalClaims() public view {
        require(address(pool).balance >= pool.poolWethWad() + pool.totalUserWethWad(), "WETH claims exceed custody");
    }

    function invariantTokenCustodyAlwaysCoversInternalClaims() public view {
        require(token.balanceOf(address(pool)) >= pool.poolTokenAmount() + pool.totalUserTokenAmount(), "token claims exceed custody");
    }

    function invariantPoolReservationNeverExceedsPoolWeth() public view {
        require(pool.reservedWethWad() <= pool.poolWethWad(), "over-reserved");
    }

    function invariantSupplyIsNeverCreatedBySettlement() public view {
        require(pool.poolTokenAmount() + pool.totalUserTokenAmount() <= token.totalSupply(), "internal token inflation");
    }
}
