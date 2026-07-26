// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LocalBattlePoolV23, BattleTokenV23} from "../src/LocalBattlePoolV23.sol";

interface VmV23Invariant {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
}

contract LocalBattlePoolV23InvariantTest {
    VmV23Invariant internal constant vm = VmV23Invariant(address(uint160(uint256(keccak256("hevm cheat code")))));
    LocalBattlePoolV23 internal pool;
    BattleTokenV23 internal token;
    address internal trader = address(0xCAFE);

    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 1_000 ether);
        vm.deal(trader, 100 ether);
        pool = new LocalBattlePoolV23(address(this), address(this), keccak256("V23_INVARIANT"), "Invariant V23", "INV23");
        token = BattleTokenV23(address(pool.token()));
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
