// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LocalBattlePoolV21, BattleTokenV21} from "../src/LocalBattlePoolV21.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
    function warp(uint256 newTimestamp) external;
}

contract LocalBattlePoolV21Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    LocalBattlePoolV21 internal pool;
    BattleTokenV21 internal token;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    bytes32 internal constant MARKET_ID = keccak256("PERPHOOD_LOCAL_TEST");

    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 100 ether);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        pool = new LocalBattlePoolV21(address(this), address(this), MARKET_ID, "PerpHood Local", "PHLOCAL");
        token = BattleTokenV21(address(pool.token()));
        pool.seedPool{value: 5 ether}();
        vm.prank(alice);
        pool.deposit{value: 2 ether}();
    }

    function testGenesisCustodyIsConserved() public view {
        require(pool.poolWethWad() == 5 ether, "pool WETH");
        require(pool.totalUserWethWad() == 2 ether, "user WETH");
        require(pool.poolTokenAmount() == 1_000_000_000 ether, "pool tokens");
        require(pool.totalUserTokenAmount() == 0, "user tokens");
        require(address(pool).balance == 7 ether, "physical WETH");
        require(token.balanceOf(address(pool)) == 1_000_000_000 ether, "physical tokens");
        require(pool.custodySolvent(), "custody insolvent");
    }

    function testSpotBuyFrameMovesBothAssetsAgainstOnePool() public {
        uint256 tokenOut = 100_000_000 ether;
        LocalBattlePoolV21.AccountDelta[] memory deltas = new LocalBattlePoolV21.AccountDelta[](1);
        deltas[0] = LocalBattlePoolV21.AccountDelta({
            account: alice,
            wethDeltaWad: -int256(1 ether),
            tokenDelta: int256(tokenOut)
        });
        LocalBattlePoolV21.FrameInput memory frame = _frame(
            LocalBattlePoolV21.ActionKind.SpotBuy,
            2_500_000_000,
            2.5 ether,
            0,
            keccak256("buy-one")
        );
        pool.commitFrame(1, pool.stateHash(), frame, deltas, int256(1 ether), -int256(tokenOut));

        LocalBattlePoolV21.AccountBalance memory aliceBalance = pool.accountBalance(alice);
        require(aliceBalance.wethWad == 1 ether, "alice WETH");
        require(aliceBalance.tokenAmount == tokenOut, "alice tokens");
        require(pool.poolWethWad() == 6 ether, "pool WETH after buy");
        require(pool.poolTokenAmount() == 900_000_000 ether, "pool token after buy");
        require(pool.stateSequence() == 1, "sequence");
        require(pool.custodySolvent(), "custody insolvent");
    }

    function testWinningShortPayoutCanMoveWethFromPoolInstantly() public {
        LocalBattlePoolV21.FrameInput memory frame = _frame(
            LocalBattlePoolV21.ActionKind.CloseShort,
            200_000_000,
            0.2 ether,
            0.5 ether,
            keccak256("short-win")
        );
        pool.commitSingleAccountFrame(
            1,
            pool.stateHash(),
            frame,
            alice,
            int256(0.75 ether),
            0,
            -int256(0.75 ether),
            0
        );

        LocalBattlePoolV21.AccountBalance memory aliceBalance = pool.accountBalance(alice);
        require(aliceBalance.wethWad == 2.75 ether, "instant internal payout");
        require(pool.poolWethWad() == 4.25 ether, "pool paid trader");
        require(pool.reservedWethWad() == 0.5 ether, "reserved liquidity");
        require(pool.availablePoolWethWad() == 3.75 ether, "available liquidity");
        require(pool.custodySolvent(), "custody insolvent");
    }

    function testLiquidatedTraderEquityRemainsInPool() public {
        LocalBattlePoolV21.FrameInput memory frame = _frame(
            LocalBattlePoolV21.ActionKind.LiquidateLong,
            150_000_000,
            0.15 ether,
            0,
            keccak256("long-liquidation")
        );
        pool.commitSingleAccountFrame(
            1,
            pool.stateHash(),
            frame,
            alice,
            -int256(0.4 ether),
            0,
            int256(0.4 ether),
            0
        );

        LocalBattlePoolV21.AccountBalance memory aliceBalance = pool.accountBalance(alice);
        require(aliceBalance.wethWad == 1.6 ether, "trader equity reduced");
        require(pool.poolWethWad() == 5.4 ether, "liquidation strengthened pool");
        require(pool.custodySolvent(), "custody insolvent");
    }

    function testUnbalancedFrameReverts() public {
        LocalBattlePoolV21.AccountDelta[] memory deltas = new LocalBattlePoolV21.AccountDelta[](1);
        deltas[0] = LocalBattlePoolV21.AccountDelta({account: alice, wethDeltaWad: -int256(1 ether), tokenDelta: 0});
        LocalBattlePoolV21.FrameInput memory frame = _frame(
            LocalBattlePoolV21.ActionKind.SpotBuy,
            1,
            1,
            0,
            keccak256("unbalanced")
        );
        vm.expectRevert(LocalBattlePoolV21.InvalidDeltaConservation.selector);
        pool.commitFrame(1, pool.stateHash(), frame, deltas, 0, 0);
    }

    function testStaleFrameReverts() public {
        LocalBattlePoolV21.FrameInput memory frame = _frame(
            LocalBattlePoolV21.ActionKind.SpotBuy,
            1,
            1,
            0,
            keccak256("stale")
        );
        vm.expectRevert(LocalBattlePoolV21.InvalidSequence.selector);
        pool.commitSingleAccountFrame(2, pool.stateHash(), frame, alice, 0, 0, 0, 0);
    }

    function testUserCanWithdrawInternalPayoutAndTokens() public {
        uint256 tokenOut = 10_000_000 ether;
        LocalBattlePoolV21.FrameInput memory frame = _frame(
            LocalBattlePoolV21.ActionKind.SpotBuy,
            1,
            1,
            0,
            keccak256("withdraw-fixture")
        );
        pool.commitSingleAccountFrame(
            1,
            pool.stateHash(),
            frame,
            alice,
            -int256(0.5 ether),
            int256(tokenOut),
            int256(0.5 ether),
            -int256(tokenOut)
        );

        uint256 ethBefore = alice.balance;
        vm.startPrank(alice);
        pool.withdrawWeth(1 ether);
        pool.withdrawToken(tokenOut);
        vm.stopPrank();

        require(alice.balance == ethBefore + 1 ether, "ETH withdrawal");
        require(token.balanceOf(alice) == tokenOut, "token withdrawal");
        require(pool.custodySolvent(), "custody insolvent");
    }

    function _frame(
        LocalBattlePoolV21.ActionKind action,
        uint256 priceWad,
        uint256 marketCapWad,
        uint256 reserved,
        bytes32 intentHash
    ) internal pure returns (LocalBattlePoolV21.FrameInput memory) {
        return LocalBattlePoolV21.FrameInput({
            marketId: MARKET_ID,
            action: action,
            marginalPriceWad: priceWad,
            marketCapWad: marketCapWad,
            reservedWethWad: reserved,
            openInterestLongWad: 0,
            openInterestShortWad: 0,
            positionsRoot: keccak256("positions"),
            balancesRoot: keccak256("balances"),
            intentHash: intentHash
        });
    }
}
