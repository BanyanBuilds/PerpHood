// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BattleCurveMathV24} from "./BattleCurveMathV24.sol";

/// @title BattleTokenV24
/// @notice Minimal fixed-supply local token for the V24 contract verifier.
contract BattleTokenV24 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    address public immutable battlePool;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    error Unauthorized();
    error InsufficientBalance();
    error InsufficientAllowance();
    error InvalidReceiver();

    constructor(string memory name_, string memory symbol_, uint256 totalSupply_, address battlePool_) {
        if (battlePool_ == address(0)) revert InvalidReceiver();
        name = name_;
        symbol = symbol_;
        totalSupply = totalSupply_;
        battlePool = battlePool_;
        balanceOf[battlePool_] = totalSupply_;
        emit Transfer(address(0), battlePool_, totalSupply_);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function poolTransfer(address to, uint256 amount) external returns (bool) {
        if (msg.sender != battlePool) revert Unauthorized();
        _transfer(battlePool, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert InvalidReceiver();
        uint256 balance = balanceOf[from];
        if (balance < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = balance - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}

/// @title LocalBattlePoolV24
/// @notice Contract-verifiable local BattlePool with fixed-point curve math and gas-bounded liquidation continuation.
/// @dev V24 verifies every curve mutation on-chain. Position ownership and PNL remain committed through roots and
///      must still be independently audited before production custody.
contract LocalBattlePoolV24 {
    using BattleCurveMathV24 for BattleCurveMathV24.Params;

    uint256 public constant WAD = 1e18;
    uint256 public constant TOTAL_TOKEN_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_ALLOCATION = 800_000_000 ether;
    uint256 public constant INITIAL_PERP_INVENTORY = 100_000_000 ether;
    uint256 public constant INITIAL_SAFETY_INVENTORY = 100_000_000 ether;
    uint256 public constant OPENING_FDV_WAD = 0.25 ether;
    uint256 public constant OPENING_PRICE_WAD = OPENING_FDV_WAD * WAD / TOTAL_TOKEN_SUPPLY;
    uint256 public constant TRADE_FEE_BPS = 30;
    uint256 public constant MAX_SOLD_BPS = 9_400;
    uint256 public constant MAX_LIQUIDATIONS_PER_CHUNK = 16;
    uint64 public constant LIQUIDATION_BATCH_TIMEOUT = 10 minutes;

    enum ActionKind {
        Genesis,
        SpotBuy,
        SpotSell,
        OpenLong,
        CloseLong,
        OpenShort,
        CloseShort,
        LiquidateLong,
        LiquidateShort,
        Deposit,
        Withdraw,
        LiquidationBatch
    }

    struct AccountBalance {
        uint256 wethWad;
        uint256 tokenAmount;
    }

    struct SessionAuthorization {
        address owner;
        bytes32 publicKeyHash;
        uint64 validUntil;
        uint64 nextNonce;
        uint256 maxNotionalWad;
        uint256 actionBitmap;
        bool active;
    }

    struct FrameInput {
        bytes32 marketId;
        ActionKind action;
        uint256 marginalPriceWad;
        uint256 marketCapWad;
        uint256 reservedWethWad;
        uint256 openInterestLongWad;
        uint256 openInterestShortWad;
        bytes32 positionsRoot;
        bytes32 balancesRoot;
        bytes32 intentHash;
    }

    struct CurveActionProof {
        uint256 grossCurveWethWad;
        uint256 curveTokenAmountWad;
        uint256 curveFeeWad;
        uint256 externalWethAmountWad;
        uint256 nextLockedLongTokensWad;
        uint256 nextBorrowedShortTokensWad;
        uint256 nextPerpInventoryWad;
        uint256 nextSafetyInventoryWad;
        uint256 nextCirculatingSpotTokensWad;
    }

    struct RealtimeStateView {
        uint64 sequence;
        uint64 committedAt;
        bytes32 marketId;
        ActionKind action;
        uint256 marginalPriceWad;
        uint256 marketCapWad;
        uint256 poolWethWad;
        uint256 poolTokenAmount;
        uint256 reservedWethWad;
        uint256 curveSoldTokenWad;
        uint256 openInterestLongWad;
        uint256 openInterestShortWad;
        bytes32 positionsRoot;
        bytes32 balancesRoot;
        bytes32 stateHash;
    }

    struct LiquidationContinuation {
        bytes32 batchId;
        bytes32 startingStateHash;
        bytes32 positionsRoot;
        uint32 nextCursor;
        uint32 totalPositions;
        uint64 startedAt;
        uint64 lastProgressAt;
        bool active;
    }

    address public owner;
    address public sequencer;
    BattleTokenV24 public immutable token;
    bytes32 public immutable marketId;

    uint64 public stateSequence;
    bytes32 public stateHash;
    uint256 public poolWethWad;
    uint256 public poolTokenAmount;
    uint256 public totalUserWethWad;
    uint256 public totalUserTokenAmount;
    uint256 public reservedWethWad;
    uint256 public openInterestLongWad;
    uint256 public openInterestShortWad;

    uint256 public curveSoldTokenWad;
    uint256 public lockedLongTokensWad;
    uint256 public borrowedShortTokensWad;
    uint256 public perpInventoryWad = INITIAL_PERP_INVENTORY;
    uint256 public safetyInventoryWad = INITIAL_SAFETY_INVENTORY;
    uint256 public circulatingSpotTokensWad;

    RealtimeStateView private _realtimeState;
    LiquidationContinuation public liquidationContinuation;
    mapping(address => AccountBalance) private _balances;
    mapping(bytes32 => SessionAuthorization) private _sessions;
    mapping(bytes32 => bool) public consumedIntent;
    bool private _entered;

    event Deposited(address indexed account, uint256 amountWad);
    event TokenDeposited(address indexed account, uint256 tokenAmount);
    event WethWithdrawn(address indexed account, uint256 amountWad);
    event TokenWithdrawn(address indexed account, uint256 tokenAmount);
    event PoolSeeded(address indexed account, uint256 amountWad);
    event SessionAuthorized(bytes32 indexed sessionId, address indexed owner, bytes32 publicKeyHash, uint64 validUntil, uint256 maxNotionalWad, uint256 actionBitmap);
    event SessionRevoked(bytes32 indexed sessionId, address indexed owner);
    event SessionNonceConsumed(bytes32 indexed sessionId, uint64 indexed nonce, bytes32 indexed intentHash);
    event CurveActionVerified(uint64 indexed sequence, ActionKind indexed action, uint256 soldBeforeWad, uint256 soldAfterWad, uint256 curveTokenAmountWad, uint256 grossCurveWethWad, uint256 curveFeeWad);
    event StateFrameCommitted(uint64 indexed sequence, bytes32 indexed stateHash, bytes32 indexed marketId, ActionKind action, uint256 marginalPriceWad, uint256 marketCapWad, uint256 poolWethWad, uint256 poolTokenAmount, uint256 reservedWethWad, uint256 curveSoldTokenWad, bytes32 intentHash);
    event LiquidationBatchStarted(bytes32 indexed batchId, uint32 totalPositions, bytes32 positionsRoot, bytes32 startingStateHash);
    event LiquidationChunkCommitted(bytes32 indexed batchId, uint32 cursorBefore, uint32 cursorAfter, uint256 processedCount, bytes32 stateHash);
    event LiquidationBatchCompleted(bytes32 indexed batchId, uint32 totalPositions, bytes32 finalStateHash);
    event LiquidationBatchExpired(bytes32 indexed batchId, uint32 nextCursor, uint32 totalPositions, bytes32 stateHash);

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidMarket();
    error InvalidSequence();
    error InvalidDeltaConservation();
    error NegativeBalance();
    error InsufficientBalance();
    error InsolventCustody();
    error ReservedLiquidityExceeded();
    error IntentAlreadyConsumed();
    error InvalidSession();
    error SessionExpired();
    error SessionInactive();
    error SessionNonceMismatch();
    error SessionActionNotAllowed();
    error SessionLimitExceeded();
    error InvalidCurveProof();
    error LogicalTokenConservationFailed();
    error LiquidationBatchActive();
    error LiquidationBatchInactive();
    error InvalidLiquidationCursor();
    error InvalidLiquidationChunk();
    error LiquidationBatchNotExpired();
    error PoolAlreadyLive();
    error Reentrancy();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlySequencer() {
        if (msg.sender != sequencer) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(address owner_, address sequencer_, bytes32 marketId_, string memory tokenName_, string memory tokenSymbol_) {
        if (owner_ == address(0) || sequencer_ == address(0)) revert InvalidAddress();
        if (marketId_ == bytes32(0)) revert InvalidMarket();
        owner = owner_;
        sequencer = sequencer_;
        marketId = marketId_;
        token = new BattleTokenV24(tokenName_, tokenSymbol_, TOTAL_TOKEN_SUPPLY, address(this));
        poolTokenAmount = TOTAL_TOKEN_SUPPLY;
        uint256 openingMarketCap = OPENING_PRICE_WAD * TOTAL_TOKEN_SUPPLY / WAD;
        stateHash = keccak256(abi.encode(uint64(0), marketId_, uint8(ActionKind.Genesis), OPENING_PRICE_WAD, openingMarketCap, TOTAL_TOKEN_SUPPLY));
        _realtimeState = RealtimeStateView({
            sequence: 0,
            committedAt: uint64(block.timestamp),
            marketId: marketId_,
            action: ActionKind.Genesis,
            marginalPriceWad: OPENING_PRICE_WAD,
            marketCapWad: openingMarketCap,
            poolWethWad: 0,
            poolTokenAmount: TOTAL_TOKEN_SUPPLY,
            reservedWethWad: 0,
            curveSoldTokenWad: 0,
            openInterestLongWad: 0,
            openInterestShortWad: 0,
            positionsRoot: bytes32(0),
            balancesRoot: bytes32(0),
            stateHash: stateHash
        });
        _assertLogicalTokenConservation();
    }

    receive() external payable { _deposit(msg.sender, msg.value); }

    function curveParams() public pure returns (BattleCurveMathV24.Params memory) {
        return BattleCurveMathV24.Params({
            allocationWad: CURVE_ALLOCATION,
            openingPriceWad: OPENING_PRICE_WAD,
            feeBps: TRADE_FEE_BPS,
            maxSoldBps: MAX_SOLD_BPS
        });
    }

    function accountBalance(address account) external view returns (AccountBalance memory) { return _balances[account]; }
    function sessionState(bytes32 sessionId) external view returns (SessionAuthorization memory) { return _sessions[sessionId]; }
    function realtimeState() external view returns (RealtimeStateView memory) { return _currentRealtimeState(); }
    function availablePoolWethWad() public view returns (uint256) { return poolWethWad > reservedWethWad ? poolWethWad - reservedWethWad : 0; }
    function custodySolvent() public view returns (bool) { return address(this).balance >= poolWethWad + totalUserWethWad && token.balanceOf(address(this)) >= poolTokenAmount + totalUserTokenAmount; }
    function curveMarginalPriceWad() public view returns (uint256) { return BattleCurveMathV24.marginalPriceWad(curveSoldTokenWad, curveParams()); }
    function curveCumulativeCostWad() public view returns (uint256) { return BattleCurveMathV24.cumulativeCostWad(curveSoldTokenWad, curveParams()); }

    function runtimeState() external view returns (RealtimeStateView memory frame, uint256 availableWethWad, bool solvent) {
        return (_currentRealtimeState(), availablePoolWethWad(), custodySolvent());
    }

    function setSequencer(address nextSequencer) external onlyOwner {
        if (nextSequencer == address(0)) revert InvalidAddress();
        sequencer = nextSequencer;
    }

    function deposit() external payable { _deposit(msg.sender, msg.value); }

    function depositToken(uint256 tokenAmount) external nonReentrant {
        if (tokenAmount == 0) revert InvalidAmount();
        uint256 beforeBalance = token.balanceOf(address(this));
        if (!token.transferFrom(msg.sender, address(this), tokenAmount)) revert TransferFailed();
        if (token.balanceOf(address(this)) != beforeBalance + tokenAmount) revert TransferFailed();
        _balances[msg.sender].tokenAmount += tokenAmount;
        totalUserTokenAmount += tokenAmount;
        _assertCustody();
        emit TokenDeposited(msg.sender, tokenAmount);
    }

    function seedPool() external payable onlyOwner {
        if (msg.value == 0) revert InvalidAmount();
        if (stateSequence != 0) revert PoolAlreadyLive();
        poolWethWad += msg.value;
        _assertCustody();
        emit PoolSeeded(msg.sender, msg.value);
    }

    function withdrawWeth(uint256 amountWad) external nonReentrant {
        AccountBalance storage balance = _balances[msg.sender];
        if (amountWad == 0 || balance.wethWad < amountWad) revert InsufficientBalance();
        balance.wethWad -= amountWad;
        totalUserWethWad -= amountWad;
        (bool sent,) = payable(msg.sender).call{value: amountWad}("");
        if (!sent) revert TransferFailed();
        _assertCustody();
        emit WethWithdrawn(msg.sender, amountWad);
    }

    function withdrawToken(uint256 tokenAmount) external nonReentrant {
        AccountBalance storage balance = _balances[msg.sender];
        if (tokenAmount == 0 || balance.tokenAmount < tokenAmount) revert InsufficientBalance();
        balance.tokenAmount -= tokenAmount;
        totalUserTokenAmount -= tokenAmount;
        if (!token.poolTransfer(msg.sender, tokenAmount)) revert TransferFailed();
        _assertCustody();
        emit TokenWithdrawn(msg.sender, tokenAmount);
    }

    function authorizeSession(bytes32 sessionId, bytes32 publicKeyHash, uint64 validUntil, uint256 maxNotionalWad, uint256 actionBitmap) external {
        if (sessionId == bytes32(0) || publicKeyHash == bytes32(0) || validUntil <= block.timestamp || maxNotionalWad == 0 || actionBitmap == 0) revert InvalidSession();
        SessionAuthorization storage existing = _sessions[sessionId];
        if (existing.owner != address(0) && existing.owner != msg.sender) revert Unauthorized();
        uint64 preservedNonce = existing.nextNonce;
        _sessions[sessionId] = SessionAuthorization(msg.sender, publicKeyHash, validUntil, preservedNonce, maxNotionalWad, actionBitmap, true);
        emit SessionAuthorized(sessionId, msg.sender, publicKeyHash, validUntil, maxNotionalWad, actionBitmap);
    }

    function revokeSession(bytes32 sessionId) external {
        SessionAuthorization storage session = _sessions[sessionId];
        if (session.owner != msg.sender) revert Unauthorized();
        session.active = false;
        emit SessionRevoked(sessionId, msg.sender);
    }

    /// @notice Verifies and commits a user action using integer curve math and session limits.
    function commitVerifiedAuthorizedFrame(
        uint64 expectedSequence,
        bytes32 expectedPreviousStateHash,
        bytes32 sessionId,
        uint64 sessionNonce,
        uint256 intentNotionalWad,
        uint64 intentDeadline,
        FrameInput calldata frame,
        CurveActionProof calldata proof,
        address account,
        int256 accountWethDeltaWad,
        int256 accountTokenDelta,
        int256 poolWethDeltaWad,
        int256 poolTokenDelta
    ) external onlySequencer returns (bytes32 nextStateHash) {
        if (liquidationContinuation.active) revert LiquidationBatchActive();
        _validateAndConsumeSession(sessionId, sessionNonce, account, frame.action, intentNotionalWad, intentDeadline, frame.intentHash);
        _validateOrderedFrame(expectedSequence, expectedPreviousStateHash, frame);
        _verifyCurveAction(frame.action, proof);
        _verifyUserDeltas(frame.action, proof, accountWethDeltaWad, accountTokenDelta, poolWethDeltaWad, poolTokenDelta);
        _applyAccountDelta(expectedSequence, account, accountWethDeltaWad, accountTokenDelta);
        poolWethWad = _applySigned(poolWethWad, poolWethDeltaWad);
        poolTokenAmount = _applySigned(poolTokenAmount, poolTokenDelta);
        nextStateHash = _commitFrame(expectedSequence, frame);
    }

    function beginLiquidationBatch(bytes32 batchId, uint32 totalPositions, bytes32 positionsRoot) external onlySequencer {
        if (liquidationContinuation.active) revert LiquidationBatchActive();
        if (batchId == bytes32(0) || totalPositions == 0) revert InvalidLiquidationChunk();
        liquidationContinuation = LiquidationContinuation(batchId, stateHash, positionsRoot, 0, totalPositions, uint64(block.timestamp), uint64(block.timestamp), true);
        emit LiquidationBatchStarted(batchId, totalPositions, positionsRoot, stateHash);
    }

    /// @notice Processes a bounded number of liquidation curve mutations and can be resumed by the next keeper transaction.
    function commitVerifiedLiquidationChunk(
        bytes32 batchId,
        uint32 expectedCursor,
        FrameInput calldata frame,
        CurveActionProof[] calldata proofs
    ) external onlySequencer returns (bytes32 nextStateHash) {
        LiquidationContinuation storage continuation = liquidationContinuation;
        if (!continuation.active || continuation.batchId != batchId) revert LiquidationBatchInactive();
        if (continuation.nextCursor != expectedCursor) revert InvalidLiquidationCursor();
        if (proofs.length == 0 || proofs.length > MAX_LIQUIDATIONS_PER_CHUNK) revert InvalidLiquidationChunk();
        if (uint256(expectedCursor) + proofs.length > continuation.totalPositions) revert InvalidLiquidationChunk();
        if (frame.action != ActionKind.LiquidationBatch && frame.action != ActionKind.LiquidateLong && frame.action != ActionKind.LiquidateShort) revert InvalidLiquidationChunk();
        _validateOrderedFrame(stateSequence + 1, stateHash, frame);
        uint32 cursorBefore = continuation.nextCursor;
        for (uint256 index = 0; index < proofs.length; index++) {
            ActionKind liquidationAction = proofs[index].nextLockedLongTokensWad < lockedLongTokensWad ? ActionKind.LiquidateLong : ActionKind.LiquidateShort;
            _verifyCurveAction(liquidationAction, proofs[index]);
        }
        continuation.nextCursor = uint32(uint256(continuation.nextCursor) + proofs.length);
        continuation.lastProgressAt = uint64(block.timestamp);
        nextStateHash = _commitFrame(stateSequence + 1, frame);
        emit LiquidationChunkCommitted(batchId, cursorBefore, continuation.nextCursor, proofs.length, nextStateHash);
        if (continuation.nextCursor == continuation.totalPositions) {
            continuation.active = false;
            emit LiquidationBatchCompleted(batchId, continuation.totalPositions, nextStateHash);
        }
    }

    function expireLiquidationBatch() external {
        LiquidationContinuation storage continuation = liquidationContinuation;
        if (!continuation.active) revert LiquidationBatchInactive();
        if (block.timestamp <= uint256(continuation.lastProgressAt) + LIQUIDATION_BATCH_TIMEOUT) revert LiquidationBatchNotExpired();
        continuation.active = false;
        emit LiquidationBatchExpired(continuation.batchId, continuation.nextCursor, continuation.totalPositions, stateHash);
    }

    function _verifyCurveAction(ActionKind action, CurveActionProof calldata proof) internal {
        uint256 soldBefore = curveSoldTokenWad;
        uint256 soldAfter;
        uint256 expectedFee;
        uint256 expectedTokens;
        uint256 expectedGross;
        bool buyAction = action == ActionKind.SpotBuy || action == ActionKind.OpenLong || action == ActionKind.CloseShort || action == ActionKind.LiquidateShort;
        bool sellAction = action == ActionKind.SpotSell || action == ActionKind.OpenShort || action == ActionKind.CloseLong || action == ActionKind.LiquidateLong;
        if (!buyAction && !sellAction) revert InvalidCurveProof();

        if (buyAction) {
            BattleCurveMathV24.BuyQuote memory quote;
            if (action == ActionKind.CloseShort || action == ActionKind.LiquidateShort) {
                quote = BattleCurveMathV24.quoteBuyExactTokens(soldBefore, proof.curveTokenAmountWad, curveParams());
            } else {
                quote = BattleCurveMathV24.quoteBuy(soldBefore, proof.grossCurveWethWad, curveParams());
            }
            soldAfter = quote.soldAfterWad;
            expectedFee = quote.feeWethWad;
            expectedTokens = quote.tokenOutWad;
            expectedGross = quote.grossWethWad;
        } else {
            BattleCurveMathV24.SellQuote memory quote = BattleCurveMathV24.quoteSell(soldBefore, proof.curveTokenAmountWad, curveParams());
            soldAfter = quote.soldAfterWad;
            expectedFee = quote.feeWethWad;
            expectedTokens = quote.tokenInWad;
            expectedGross = quote.grossCurveWethWad;
        }
        if (proof.curveTokenAmountWad != expectedTokens || proof.curveFeeWad != expectedFee || proof.grossCurveWethWad != expectedGross) revert InvalidCurveProof();

        _verifyInventoryTransition(action, proof, expectedTokens);
        curveSoldTokenWad = soldAfter;
        lockedLongTokensWad = proof.nextLockedLongTokensWad;
        borrowedShortTokensWad = proof.nextBorrowedShortTokensWad;
        perpInventoryWad = proof.nextPerpInventoryWad;
        safetyInventoryWad = proof.nextSafetyInventoryWad;
        circulatingSpotTokensWad = proof.nextCirculatingSpotTokensWad;
        _assertLogicalTokenConservation();
        emit CurveActionVerified(stateSequence + 1, action, soldBefore, soldAfter, expectedTokens, expectedGross, expectedFee);
    }

    function _verifyInventoryTransition(ActionKind action, CurveActionProof calldata proof, uint256 tokens) internal view {
        uint256 nextLong = lockedLongTokensWad;
        uint256 nextBorrowed = borrowedShortTokensWad;
        uint256 nextPerp = perpInventoryWad;
        uint256 nextSafety = safetyInventoryWad;
        uint256 nextSpot = circulatingSpotTokensWad;

        if (action == ActionKind.SpotBuy) nextSpot += tokens;
        else if (action == ActionKind.SpotSell) {
            if (tokens > nextSpot) revert InvalidCurveProof();
            nextSpot -= tokens;
        } else if (action == ActionKind.OpenLong) nextLong += tokens;
        else if (action == ActionKind.CloseLong || action == ActionKind.LiquidateLong) {
            if (tokens > nextLong) revert InvalidCurveProof();
            nextLong -= tokens;
        } else if (action == ActionKind.OpenShort) {
            if (tokens > nextPerp + nextSafety) revert InvalidCurveProof();
            uint256 fromPerp = tokens > nextPerp ? nextPerp : tokens;
            nextPerp -= fromPerp;
            nextSafety -= tokens - fromPerp;
            nextBorrowed += tokens;
        } else if (action == ActionKind.CloseShort || action == ActionKind.LiquidateShort) {
            if (tokens > nextBorrowed) revert InvalidCurveProof();
            nextBorrowed -= tokens;
            nextPerp += tokens;
        }

        if (
            proof.nextLockedLongTokensWad != nextLong ||
            proof.nextBorrowedShortTokensWad != nextBorrowed ||
            proof.nextPerpInventoryWad != nextPerp ||
            proof.nextSafetyInventoryWad != nextSafety ||
            proof.nextCirculatingSpotTokensWad != nextSpot
        ) revert InvalidCurveProof();
    }

    function _verifyUserDeltas(
        ActionKind action,
        CurveActionProof calldata proof,
        int256 accountWethDeltaWad,
        int256 accountTokenDelta,
        int256 poolWethDeltaWad,
        int256 poolTokenDelta
    ) internal pure {
        if (accountWethDeltaWad + poolWethDeltaWad != 0 || accountTokenDelta + poolTokenDelta != 0) revert InvalidDeltaConservation();
        if (action == ActionKind.SpotBuy) {
            if (accountWethDeltaWad != -int256(proof.grossCurveWethWad) || accountTokenDelta != int256(proof.curveTokenAmountWad)) revert InvalidCurveProof();
        } else if (action == ActionKind.SpotSell) {
            uint256 netWeth = proof.grossCurveWethWad - proof.curveFeeWad;
            if (accountWethDeltaWad != int256(netWeth) || accountTokenDelta != -int256(proof.curveTokenAmountWad)) revert InvalidCurveProof();
        } else {
            if (accountTokenDelta != 0 || poolTokenDelta != 0) revert InvalidCurveProof();
            if (action == ActionKind.OpenLong || action == ActionKind.OpenShort) {
                if (accountWethDeltaWad != -int256(proof.externalWethAmountWad)) revert InvalidCurveProof();
            } else if (action == ActionKind.CloseLong || action == ActionKind.CloseShort) {
                if (accountWethDeltaWad != int256(proof.externalWethAmountWad)) revert InvalidCurveProof();
            }
        }
    }

    function _validateOrderedFrame(uint64 expectedSequence, bytes32 expectedPreviousStateHash, FrameInput calldata frame) internal {
        if (frame.marketId != marketId) revert InvalidMarket();
        if (expectedSequence != stateSequence + 1 || expectedPreviousStateHash != stateHash) revert InvalidSequence();
        if (frame.intentHash != bytes32(0)) {
            if (consumedIntent[frame.intentHash]) revert IntentAlreadyConsumed();
            consumedIntent[frame.intentHash] = true;
        }
    }

    function _commitFrame(uint64 expectedSequence, FrameInput calldata frame) internal returns (bytes32 nextStateHash) {
        uint256 verifiedPrice = curveMarginalPriceWad();
        uint256 verifiedMarketCap = verifiedPrice * TOTAL_TOKEN_SUPPLY / WAD;
        if (frame.marginalPriceWad != verifiedPrice || frame.marketCapWad != verifiedMarketCap) revert InvalidCurveProof();
        if (frame.reservedWethWad > poolWethWad) revert ReservedLiquidityExceeded();
        reservedWethWad = frame.reservedWethWad;
        openInterestLongWad = frame.openInterestLongWad;
        openInterestShortWad = frame.openInterestShortWad;
        nextStateHash = keccak256(abi.encode(expectedSequence, stateHash, frame.marketId, uint8(frame.action), verifiedPrice, verifiedMarketCap, poolWethWad, poolTokenAmount, reservedWethWad, curveSoldTokenWad, lockedLongTokensWad, borrowedShortTokensWad, frame.positionsRoot, frame.balancesRoot, frame.intentHash));
        stateSequence = expectedSequence;
        stateHash = nextStateHash;
        _realtimeState = RealtimeStateView(expectedSequence, uint64(block.timestamp), frame.marketId, frame.action, verifiedPrice, verifiedMarketCap, poolWethWad, poolTokenAmount, reservedWethWad, curveSoldTokenWad, frame.openInterestLongWad, frame.openInterestShortWad, frame.positionsRoot, frame.balancesRoot, nextStateHash);
        _assertCustody();
        emit StateFrameCommitted(expectedSequence, nextStateHash, frame.marketId, frame.action, verifiedPrice, verifiedMarketCap, poolWethWad, poolTokenAmount, reservedWethWad, curveSoldTokenWad, frame.intentHash);
    }

    function _validateAndConsumeSession(bytes32 sessionId, uint64 sessionNonce, address account, ActionKind action, uint256 intentNotionalWad, uint64 intentDeadline, bytes32 intentHash) internal {
        SessionAuthorization storage session = _sessions[sessionId];
        if (session.owner == address(0) || session.owner != account) revert InvalidSession();
        if (!session.active) revert SessionInactive();
        if (block.timestamp > session.validUntil || block.timestamp > intentDeadline) revert SessionExpired();
        if (session.nextNonce != sessionNonce) revert SessionNonceMismatch();
        if ((session.actionBitmap & (uint256(1) << uint8(action))) == 0) revert SessionActionNotAllowed();
        if (intentNotionalWad == 0 || intentNotionalWad > session.maxNotionalWad) revert SessionLimitExceeded();
        unchecked { session.nextNonce = sessionNonce + 1; }
        emit SessionNonceConsumed(sessionId, sessionNonce, intentHash);
    }

    function _deposit(address account, uint256 amountWad) internal {
        if (amountWad == 0) revert InvalidAmount();
        _balances[account].wethWad += amountWad;
        totalUserWethWad += amountWad;
        _assertCustody();
        emit Deposited(account, amountWad);
    }

    function _applyAccountDelta(uint64 sequence, address account, int256 wethDeltaWad, int256 tokenDelta) internal {
        if (account == address(0)) revert InvalidAddress();
        AccountBalance storage balance = _balances[account];
        balance.wethWad = _applySigned(balance.wethWad, wethDeltaWad);
        balance.tokenAmount = _applySigned(balance.tokenAmount, tokenDelta);
        totalUserWethWad = _applySigned(totalUserWethWad, wethDeltaWad);
        totalUserTokenAmount = _applySigned(totalUserTokenAmount, tokenDelta);
        sequence;
    }

    function _applySigned(uint256 current, int256 delta) internal pure returns (uint256) {
        if (delta >= 0) return current + uint256(delta);
        uint256 reduction = uint256(-(delta + 1)) + 1;
        if (reduction > current) revert NegativeBalance();
        return current - reduction;
    }

    function _assertLogicalTokenConservation() internal view {
        uint256 curveReserve = CURVE_ALLOCATION - curveSoldTokenWad;
        uint256 accounted = curveReserve + perpInventoryWad + safetyInventoryWad + lockedLongTokensWad + circulatingSpotTokensWad;
        if (accounted != TOTAL_TOKEN_SUPPLY) revert LogicalTokenConservationFailed();
    }

    function _assertCustody() internal view {
        if (reservedWethWad > poolWethWad) revert ReservedLiquidityExceeded();
        if (address(this).balance < poolWethWad + totalUserWethWad) revert InsolventCustody();
        if (token.balanceOf(address(this)) < poolTokenAmount + totalUserTokenAmount) revert InsolventCustody();
    }

    function _currentRealtimeState() internal view returns (RealtimeStateView memory frame) {
        frame = _realtimeState;
        frame.poolWethWad = poolWethWad;
        frame.poolTokenAmount = poolTokenAmount;
        frame.reservedWethWad = reservedWethWad;
        frame.curveSoldTokenWad = curveSoldTokenWad;
        frame.openInterestLongWad = openInterestLongWad;
        frame.openInterestShortWad = openInterestShortWad;
    }
}
