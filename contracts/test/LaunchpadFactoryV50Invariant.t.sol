// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleTokenV45, LaunchpadFactoryV45, LaunchpadMarketV45} from "../src/LaunchpadFactoryV45.sol";

interface VmV50Invariant {
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
}

/// @dev Minimal local equivalent of forge-std's StdInvariant target registry.
///      Forge discovers the public `targetContracts()` getter automatically.
abstract contract V50StdInvariant {
    address[] private _targetedContracts;

    function targetContract(address target) internal {
        _targetedContracts.push(target);
    }

    function targetContracts() public view returns (address[] memory) {
        return _targetedContracts;
    }
}

contract V50BattlePoolHandler {
    LaunchpadMarketV45 public immutable market;
    BattleTokenV45 public immutable token;
    uint256[] public openedPositionIds;

    constructor(LaunchpadMarketV45 market_, BattleTokenV45 token_) {
        market = market_;
        token = token_;
        token_.approve(address(market_), type(uint256).max);
    }

    receive() external payable {}

    function spotBuy(uint96 seed) external {
        uint256 available = address(this).balance;
        if (available < 1e12) return;
        uint256 amount = 1e12 + uint256(seed) % _min(0.05 ether, available - 1e12 + 1);
        try market.buy{value: amount}() returns (uint256) {} catch {}
    }

    function spotSell(uint96 seed) external {
        uint256 balance = token.balanceOf(address(this));
        uint256 maximum = market.maxSpotSellTokensWad();
        uint256 sellable = _min(balance, maximum);
        if (sellable == 0) return;
        uint256 amount = 1 + uint256(seed) % sellable;
        try market.sell(amount) returns (uint256) {} catch {}
    }

    function openLong(uint96 seed, uint8 leverageSeed, uint16 maintenanceSeed) external {
        uint16 leverage = uint16(2 + leverageSeed % 19);
        uint16 maintenance = uint16(150 + maintenanceSeed % 351);
        uint256 collateral = 1e12 + uint256(seed) % 0.02 ether;
        try market.quoteOpenLong(collateral, leverage) returns (uint256, uint256, uint256 totalRequired, uint256) {
            if (totalRequired > address(this).balance) return;
            try market.openLong{value: totalRequired}(leverage, maintenance, collateral) returns (uint256 positionId) {
                openedPositionIds.push(positionId);
            } catch {}
        } catch {}
    }

    function openShort(uint96 seed, uint8 leverageSeed, uint16 maintenanceSeed) external {
        uint16 leverage = uint16(2 + leverageSeed % 19);
        uint16 maintenance = uint16(150 + maintenanceSeed % 351);
        uint256 collateral = 1e12 + uint256(seed) % 0.015 ether;
        try market.quoteOpenShort(collateral, leverage) returns (uint256, uint256, uint256 totalRequired, uint256, uint256) {
            if (totalRequired > address(this).balance) return;
            try market.openShort{value: totalRequired}(leverage, maintenance, collateral) returns (uint256 positionId) {
                openedPositionIds.push(positionId);
            } catch {}
        } catch {}
    }

    function closePosition(uint256 seed) external {
        uint256[] memory active = market.activePositionIds();
        if (active.length == 0) return;
        uint256 positionId = active[seed % active.length];
        LaunchpadMarketV45.Position memory position = market.position(positionId);
        if (!position.active || position.owner != address(this)) return;
        try market.closePosition(positionId) returns (uint256) {} catch {}
    }

    function liquidatePosition(uint256 seed) external {
        uint256[] memory active = market.activePositionIds();
        if (active.length == 0) return;
        uint256 positionId = active[seed % active.length];
        try market.liquidate(positionId) returns (bool) {} catch {}
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

contract LaunchpadFactoryV50InvariantTest is V50StdInvariant {
    VmV50Invariant internal constant vm = VmV50Invariant(address(uint160(uint256(keccak256("hevm cheat code")))));
    LaunchpadFactoryV45 internal factory;
    LaunchpadMarketV45 internal market;
    BattleTokenV45 internal token;
    V50BattlePoolHandler internal handler;
    address internal creator = address(0xC0FFEE);

    function setUp() public {
        vm.deal(address(this), 1_000 ether);
        vm.deal(creator, 10 ether);
        factory = new LaunchpadFactoryV45(address(this), address(0x5151));
        vm.prank(creator);
        (market, token) = factory.createSandboxMarket{value: 0.00082 ether}(
            "PERPHOOD V50 Invariant", "V50", keccak256("v50-invariant"), 45_000 ether
        );
        factory.seedRiskReserve{value: 50 ether}(market);
        handler = new V50BattlePoolHandler(market, token);
        vm.deal(address(handler), 100 ether);
        targetContract(address(handler));
    }

    function invariantCoreMarketAssertionsNeverFail() public view {
        require(market.assertInvariants(), "CORE_INVARIANT");
    }

    function invariantDiagnosticSnapshotRemainsGreen() public view {
        LaunchpadMarketV45.InvariantSnapshot memory state = market.invariantSnapshot();
        require(state.logicalTokenConservation, "LOGICAL_TOKEN_CONSERVATION");
        require(state.tokenCustodyMatches, "TOKEN_CUSTODY");
        require(state.collateralLedgerMatches, "COLLATERAL_LEDGER");
        require(state.shortInventoryMatches, "SHORT_INVENTORY");
        require(state.solvent, "WETH_SOLVENCY");
    }

    function invariantActivePositionBookMatchesAggregateLedgers() public view {
        uint256[] memory active = market.activePositionIds();
        uint256 longTokens;
        uint256 longCollateral;
        uint256 shortCollateral;
        uint256 shortBorrowed;
        uint256 shortProceeds;
        uint256 longDebt;
        for (uint256 index; index < active.length; index++) {
            LaunchpadMarketV45.Position memory position = market.position(active[index]);
            require(position.active, "INACTIVE_ID_IN_ACTIVE_BOOK");
            if (position.direction == LaunchpadMarketV45.Direction.Long) {
                longTokens += position.tokenAmountWad;
                longCollateral += position.collateralWei;
                longDebt += position.debtWei;
            } else {
                shortCollateral += position.collateralWei;
                shortBorrowed += position.borrowedTokensWad;
                shortProceeds += position.lockedProceedsWei;
            }
        }
        require(longTokens == market.lockedLongTokensWad(), "LONG_TOKEN_BOOK");
        require(longCollateral == market.lockedLongCollateralWei(), "LONG_COLLATERAL_BOOK");
        require(shortCollateral == market.lockedShortCollateralWei(), "SHORT_COLLATERAL_BOOK");
        require(shortBorrowed == market.borrowedShortTokensWad(), "SHORT_BORROW_BOOK");
        require(shortProceeds == market.lockedShortProceedsWei(), "SHORT_PROCEEDS_BOOK");
        require(longDebt == market.syntheticLongCreditWei(), "LONG_DEBT_BOOK");
        require(active.length == market.activePositionCount(), "ACTIVE_POSITION_COUNT");
    }
}
