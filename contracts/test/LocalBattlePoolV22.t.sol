// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LocalBattlePoolV22, BattleTokenV22} from "../src/LocalBattlePoolV22.sol";

interface VmV22 {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes4 revertData) external;
    function warp(uint256 newTimestamp) external;
}

contract LocalBattlePoolV22Test {
    VmV22 internal constant vm = VmV22(address(uint160(uint256(keccak256("hevm cheat code")))));

    LocalBattlePoolV22 internal pool;
    BattleTokenV22 internal token;
    address internal alice = address(0xA11CE);
    bytes32 internal constant MARKET_ID = keccak256("PERPHOOD_V22_TEST");
    bytes32 internal constant SESSION_ID = keccak256("alice-session");
    bytes32 internal constant PUBLIC_KEY_HASH = keccak256("alice-p256");

    receive() external payable {}

    function setUp() public {
        vm.deal(address(this), 100 ether);
        vm.deal(alice, 10 ether);
        pool = new LocalBattlePoolV22(address(this), address(this), MARKET_ID, "PerpHood V22", "PH22");
        token = BattleTokenV22(address(pool.token()));
        pool.seedPool{value: 1 ether}();
        vm.prank(alice);
        pool.deposit{value: 2 ether}();
    }

    function testRuntimeStateReflectsSeedBeforeFirstTrade() public view {
        (LocalBattlePoolV22.RealtimeStateView memory frame, uint256 available, bool solvent) = pool.runtimeState();
        require(frame.sequence == 0, "genesis sequence");
        require(frame.poolWethWad == 1 ether, "seeded WETH missing from runtime state");
        require(frame.poolTokenAmount == 1_000_000_000 ether, "token reserve missing");
        require(available == 1 ether, "available WETH");
        require(solvent, "runtime custody insolvent");
    }

    function testWalletAuthorizesAndSequencerConsumesScopedSession() public {
        _authorize(alice, 2 ether, _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy));
        uint256 tokenOut = 10_000_000 ether;
        LocalBattlePoolV22.FrameInput memory frame = _frame(LocalBattlePoolV22.ActionKind.SpotBuy, keccak256("intent-1"));
        pool.commitAuthorizedSingleAccountFrame(
            1,
            pool.stateHash(),
            SESSION_ID,
            0,
            1 ether,
            uint64(block.timestamp + 60),
            frame,
            alice,
            -int256(1 ether),
            int256(tokenOut),
            int256(1 ether),
            -int256(tokenOut)
        );

        LocalBattlePoolV22.SessionAuthorization memory session = pool.sessionState(SESSION_ID);
        LocalBattlePoolV22.AccountBalance memory balance = pool.accountBalance(alice);
        require(session.nextNonce == 1, "nonce not consumed");
        require(session.active, "session inactive");
        require(balance.wethWad == 1 ether, "alice WETH");
        require(balance.tokenAmount == tokenOut, "alice tokens");
        require(pool.custodySolvent(), "custody insolvent");
    }

    function testReplayNonceReverts() public {
        _authorize(alice, 2 ether, _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy));
        LocalBattlePoolV22.FrameInput memory first = _frame(LocalBattlePoolV22.ActionKind.SpotBuy, keccak256("intent-first"));
        pool.commitAuthorizedSingleAccountFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp + 60), first,
            alice, -int256(0.1 ether), int256(1 ether), int256(0.1 ether), -int256(1 ether)
        );
        LocalBattlePoolV22.FrameInput memory replay = _frame(LocalBattlePoolV22.ActionKind.SpotBuy, keccak256("intent-replay"));
        vm.expectRevert(LocalBattlePoolV22.SessionNonceMismatch.selector);
        pool.commitAuthorizedSingleAccountFrame(
            2, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp + 60), replay,
            alice, -int256(0.1 ether), int256(1 ether), int256(0.1 ether), -int256(1 ether)
        );
    }

    function testOversizedIntentReverts() public {
        _authorize(alice, 0.25 ether, _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy));
        LocalBattlePoolV22.FrameInput memory frame = _frame(LocalBattlePoolV22.ActionKind.SpotBuy, keccak256("too-large"));
        vm.expectRevert(LocalBattlePoolV22.SessionLimitExceeded.selector);
        pool.commitAuthorizedSingleAccountFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.5 ether, uint64(block.timestamp + 60), frame,
            alice, -int256(0.5 ether), int256(1 ether), int256(0.5 ether), -int256(1 ether)
        );
    }

    function testUnauthorizedActionReverts() public {
        _authorize(alice, 1 ether, _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy));
        LocalBattlePoolV22.FrameInput memory frame = _frame(LocalBattlePoolV22.ActionKind.OpenShort, keccak256("short-not-allowed"));
        vm.expectRevert(LocalBattlePoolV22.SessionActionNotAllowed.selector);
        pool.commitAuthorizedSingleAccountFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp + 60), frame,
            alice, -int256(0.1 ether), 0, int256(0.1 ether), 0
        );
    }

    function testExpiredIntentReverts() public {
        _authorize(alice, 1 ether, _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy));
        LocalBattlePoolV22.FrameInput memory frame = _frame(LocalBattlePoolV22.ActionKind.SpotBuy, keccak256("expired"));
        vm.warp(block.timestamp + 120);
        vm.expectRevert(LocalBattlePoolV22.SessionExpired.selector);
        pool.commitAuthorizedSingleAccountFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp - 1), frame,
            alice, -int256(0.1 ether), int256(1 ether), int256(0.1 ether), -int256(1 ether)
        );
    }

    function testRevokedSessionReverts() public {
        _authorize(alice, 1 ether, _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy));
        vm.prank(alice);
        pool.revokeSession(SESSION_ID);
        LocalBattlePoolV22.FrameInput memory frame = _frame(LocalBattlePoolV22.ActionKind.SpotBuy, keccak256("revoked"));
        vm.expectRevert(LocalBattlePoolV22.SessionInactive.selector);
        pool.commitAuthorizedSingleAccountFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp + 60), frame,
            alice, -int256(0.1 ether), int256(1 ether), int256(0.1 ether), -int256(1 ether)
        );
    }

    function testDifferentWalletCannotOverwriteSession() public {
        _authorize(alice, 1 ether, _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy));
        address attacker = address(0xBAD);
        vm.prank(attacker);
        vm.expectRevert(LocalBattlePoolV22.Unauthorized.selector);
        pool.authorizeSession(SESSION_ID, keccak256("attacker"), uint64(block.timestamp + 1 hours), 1 ether, 2);
    }

    function testReauthorizationPreservesConsumedNonce() public {
        _authorize(alice, 2 ether, _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy));
        LocalBattlePoolV22.FrameInput memory frame = _frame(LocalBattlePoolV22.ActionKind.SpotBuy, keccak256("nonce-preserve"));
        pool.commitAuthorizedSingleAccountFrame(
            1, pool.stateHash(), SESSION_ID, 0, 0.1 ether, uint64(block.timestamp + 60), frame,
            alice, -int256(0.1 ether), int256(1 ether), int256(0.1 ether), -int256(1 ether)
        );
        vm.prank(alice);
        pool.authorizeSession(
            SESSION_ID, PUBLIC_KEY_HASH, uint64(block.timestamp + 2 days), 3 ether,
            _actionBit(LocalBattlePoolV22.ActionKind.SpotBuy)
        );
        LocalBattlePoolV22.SessionAuthorization memory session = pool.sessionState(SESSION_ID);
        require(session.nextNonce == 1, "reauthorization reset nonce");
    }

    function testPoolCannotBeReseededAfterFirstFrame() public {
        LocalBattlePoolV22.FrameInput memory frame = _frame(LocalBattlePoolV22.ActionKind.SpotBuy, keccak256("live-before-reseed"));
        pool.commitSingleAccountFrame(
            1, pool.stateHash(), frame, alice, -int256(0.1 ether), int256(1 ether), int256(0.1 ether), -int256(1 ether)
        );
        vm.expectRevert(LocalBattlePoolV22.PoolAlreadyLive.selector);
        pool.seedPool{value: 0.1 ether}();
    }

    function testTokenAndWethCustodyRemainConserved() public view {
        require(address(pool).balance == pool.poolWethWad() + pool.totalUserWethWad(), "WETH conservation");
        require(token.balanceOf(address(pool)) == pool.poolTokenAmount() + pool.totalUserTokenAmount(), "token conservation");
        require(pool.custodySolvent(), "custody insolvent");
    }

    function _authorize(address owner, uint256 maxNotional, uint256 bitmap) internal {
        vm.prank(owner);
        pool.authorizeSession(
            SESSION_ID,
            PUBLIC_KEY_HASH,
            uint64(block.timestamp + 1 days),
            maxNotional,
            bitmap
        );
    }

    function _actionBit(LocalBattlePoolV22.ActionKind action) internal pure returns (uint256) {
        return uint256(1) << uint8(action);
    }

    function _frame(LocalBattlePoolV22.ActionKind action, bytes32 intentHash)
        internal
        view
        returns (LocalBattlePoolV22.FrameInput memory)
    {
        return LocalBattlePoolV22.FrameInput({
            marketId: MARKET_ID,
            action: action,
            marginalPriceWad: 1,
            marketCapWad: 1,
            reservedWethWad: 0,
            openInterestLongWad: 0,
            openInterestShortWad: 0,
            positionsRoot: keccak256("positions"),
            balancesRoot: keccak256("balances"),
            intentHash: intentHash
        });
    }
}
