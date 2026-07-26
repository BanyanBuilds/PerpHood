// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title BattleTokenV21
/// @notice Minimal one-billion-supply token used by the V21 local-chain BattlePool.
/// @dev This contract is intentionally dependency-free so the local prototype can be deployed
///      with only Foundry. It is not a production token implementation.
contract BattleTokenV21 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;
    address public immutable battlePool;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

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

    /// @dev The BattlePool moves tokens from its physical balance only when users withdraw.
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

/// @title LocalBattlePoolV21
/// @notice V21 local-chain custody and ordered settlement spine for PERPHOOD.
/// @dev The deterministic TypeScript engine remains the pricing and liquidation oracle in V21.
///      This contract proves real custody, one-pool conservation, monotonic frames, instant internal
///      payouts, and user withdrawals. It MUST NOT custody production funds before independent audits.
contract LocalBattlePoolV21 {
    uint256 public constant WAD = 1e18;
    uint256 public constant TOTAL_TOKEN_SUPPLY = 1_000_000_000 ether;

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
        Withdraw
    }

    struct AccountBalance {
        uint256 wethWad;
        uint256 tokenAmount;
    }

    struct AccountDelta {
        address account;
        int256 wethDeltaWad;
        int256 tokenDelta;
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
        uint256 openInterestLongWad;
        uint256 openInterestShortWad;
        bytes32 positionsRoot;
        bytes32 balancesRoot;
        bytes32 stateHash;
    }

    address public owner;
    address public sequencer;
    BattleTokenV21 public immutable token;

    uint64 public stateSequence;
    bytes32 public stateHash;
    bytes32 public immutable marketId;

    uint256 public poolWethWad;
    uint256 public poolTokenAmount;
    uint256 public totalUserWethWad;
    uint256 public totalUserTokenAmount;
    uint256 public reservedWethWad;
    uint256 public openInterestLongWad;
    uint256 public openInterestShortWad;

    RealtimeStateView private _realtimeState;
    mapping(address => AccountBalance) private _balances;
    mapping(bytes32 => bool) public consumedIntent;

    bool private _entered;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SequencerChanged(address indexed previousSequencer, address indexed newSequencer);
    event Deposited(address indexed account, uint256 amountWad);
    event WethWithdrawn(address indexed account, uint256 amountWad);
    event TokenWithdrawn(address indexed account, uint256 tokenAmount);
    event PoolSeeded(address indexed account, uint256 amountWad);
    event AccountBalanceChanged(
        uint64 indexed sequence,
        address indexed account,
        int256 wethDeltaWad,
        int256 tokenDelta,
        uint256 wethAfterWad,
        uint256 tokenAfter
    );
    event StateFrameCommitted(
        uint64 indexed sequence,
        bytes32 indexed stateHash,
        bytes32 indexed marketId,
        ActionKind action,
        uint256 marginalPriceWad,
        uint256 marketCapWad,
        uint256 poolWethWad,
        uint256 poolTokenAmount,
        uint256 reservedWethWad,
        bytes32 intentHash
    );

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidMarket();
    error InvalidSequence();
    error InvalidDeltaConservation();
    error NegativeBalance();
    error InsufficientBalance();
    error InsufficientPoolLiquidity();
    error InsolventCustody();
    error ReservedLiquidityExceeded();
    error IntentAlreadyConsumed();
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
        token = new BattleTokenV21(tokenName_, tokenSymbol_, TOTAL_TOKEN_SUPPLY, address(this));
        poolTokenAmount = TOTAL_TOKEN_SUPPLY;
        stateHash = keccak256(
            abi.encode(
                uint64(0),
                marketId_,
                uint8(ActionKind.Genesis),
                uint256(0),
                uint256(0),
                uint256(0),
                TOTAL_TOKEN_SUPPLY,
                uint256(0),
                bytes32(0),
                bytes32(0),
                bytes32(0)
            )
        );
        _realtimeState = RealtimeStateView({
            sequence: 0,
            committedAt: uint64(block.timestamp),
            marketId: marketId_,
            action: ActionKind.Genesis,
            marginalPriceWad: 0,
            marketCapWad: 0,
            poolWethWad: 0,
            poolTokenAmount: TOTAL_TOKEN_SUPPLY,
            reservedWethWad: 0,
            openInterestLongWad: 0,
            openInterestShortWad: 0,
            positionsRoot: bytes32(0),
            balancesRoot: bytes32(0),
            stateHash: stateHash
        });
        emit OwnershipTransferred(address(0), owner_);
        emit SequencerChanged(address(0), sequencer_);
    }

    receive() external payable {
        _deposit(msg.sender, msg.value);
    }

    function accountBalance(address account) external view returns (AccountBalance memory) {
        return _balances[account];
    }

    function realtimeState() external view returns (RealtimeStateView memory) {
        return _realtimeState;
    }

    /// @notice One-call browser snapshot for the fastest local polling path.
    function runtimeState() external view returns (RealtimeStateView memory frame, uint256 availableWethWad, bool solvent) {
        return (_realtimeState, availablePoolWethWad(), custodySolvent());
    }

    function availablePoolWethWad() public view returns (uint256) {
        if (reservedWethWad >= poolWethWad) return 0;
        return poolWethWad - reservedWethWad;
    }

    function custodySolvent() public view returns (bool) {
        return address(this).balance >= poolWethWad + totalUserWethWad
            && token.balanceOf(address(this)) >= poolTokenAmount + totalUserTokenAmount;
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidAddress();
        address previous = owner;
        owner = nextOwner;
        emit OwnershipTransferred(previous, nextOwner);
    }

    function setSequencer(address nextSequencer) external onlyOwner {
        if (nextSequencer == address(0)) revert InvalidAddress();
        address previous = sequencer;
        sequencer = nextSequencer;
        emit SequencerChanged(previous, nextSequencer);
    }

    function deposit() external payable {
        _deposit(msg.sender, msg.value);
    }

    function seedPool() external payable onlyOwner {
        if (msg.value == 0) revert InvalidAmount();
        poolWethWad += msg.value;
        _assertCustody();
        emit PoolSeeded(msg.sender, msg.value);
    }

    function withdrawWeth(uint256 amountWad) external nonReentrant {
        if (amountWad == 0) revert InvalidAmount();
        AccountBalance storage balance = _balances[msg.sender];
        if (balance.wethWad < amountWad) revert InsufficientBalance();
        balance.wethWad -= amountWad;
        totalUserWethWad -= amountWad;
        (bool sent,) = payable(msg.sender).call{value: amountWad}("");
        if (!sent) revert TransferFailed();
        _assertCustody();
        emit WethWithdrawn(msg.sender, amountWad);
    }

    function withdrawToken(uint256 tokenAmount) external nonReentrant {
        if (tokenAmount == 0) revert InvalidAmount();
        AccountBalance storage balance = _balances[msg.sender];
        if (balance.tokenAmount < tokenAmount) revert InsufficientBalance();
        balance.tokenAmount -= tokenAmount;
        totalUserTokenAmount -= tokenAmount;
        if (!token.poolTransfer(msg.sender, tokenAmount)) revert TransferFailed();
        _assertCustody();
        emit TokenWithdrawn(msg.sender, tokenAmount);
    }

    /// @notice Applies a fully balanced ordered settlement frame.
    /// @dev Sum(account WETH deltas) + poolWethDelta MUST equal zero, and the same is true for tokens.
    ///      Deltas are internal ledger movements; no asset is minted during settlement.
    function commitFrame(
        uint64 expectedSequence,
        bytes32 expectedPreviousStateHash,
        FrameInput calldata frame,
        AccountDelta[] calldata deltas,
        int256 poolWethDeltaWad,
        int256 poolTokenDelta
    ) external onlySequencer returns (bytes32 nextStateHash) {
        if (frame.marketId != marketId) revert InvalidMarket();
        if (expectedSequence != stateSequence + 1) revert InvalidSequence();
        if (expectedPreviousStateHash != stateHash) revert InvalidSequence();
        if (frame.intentHash != bytes32(0)) {
            if (consumedIntent[frame.intentHash]) revert IntentAlreadyConsumed();
            consumedIntent[frame.intentHash] = true;
        }

        int256 wethConservation = poolWethDeltaWad;
        int256 tokenConservation = poolTokenDelta;
        for (uint256 index = 0; index < deltas.length; index++) {
            AccountDelta calldata delta = deltas[index];
            if (delta.account == address(0)) revert InvalidAddress();
            wethConservation += delta.wethDeltaWad;
            tokenConservation += delta.tokenDelta;
            _applyAccountDelta(expectedSequence, delta);
        }
        if (wethConservation != 0 || tokenConservation != 0) revert InvalidDeltaConservation();

        poolWethWad = _applySigned(poolWethWad, poolWethDeltaWad);
        poolTokenAmount = _applySigned(poolTokenAmount, poolTokenDelta);
        if (frame.reservedWethWad > poolWethWad) revert ReservedLiquidityExceeded();
        reservedWethWad = frame.reservedWethWad;
        openInterestLongWad = frame.openInterestLongWad;
        openInterestShortWad = frame.openInterestShortWad;

        nextStateHash = keccak256(
            abi.encode(
                expectedSequence,
                stateHash,
                frame.marketId,
                uint8(frame.action),
                frame.marginalPriceWad,
                frame.marketCapWad,
                poolWethWad,
                poolTokenAmount,
                frame.reservedWethWad,
                frame.openInterestLongWad,
                frame.openInterestShortWad,
                frame.positionsRoot,
                frame.balancesRoot,
                frame.intentHash
            )
        );
        stateSequence = expectedSequence;
        stateHash = nextStateHash;
        _realtimeState = RealtimeStateView({
            sequence: expectedSequence,
            committedAt: uint64(block.timestamp),
            marketId: frame.marketId,
            action: frame.action,
            marginalPriceWad: frame.marginalPriceWad,
            marketCapWad: frame.marketCapWad,
            poolWethWad: poolWethWad,
            poolTokenAmount: poolTokenAmount,
            reservedWethWad: frame.reservedWethWad,
            openInterestLongWad: frame.openInterestLongWad,
            openInterestShortWad: frame.openInterestShortWad,
            positionsRoot: frame.positionsRoot,
            balancesRoot: frame.balancesRoot,
            stateHash: nextStateHash
        });
        _assertCustody();
        emit StateFrameCommitted(
            expectedSequence,
            nextStateHash,
            frame.marketId,
            frame.action,
            frame.marginalPriceWad,
            frame.marketCapWad,
            poolWethWad,
            poolTokenAmount,
            frame.reservedWethWad,
            frame.intentHash
        );
    }

    /// @notice Convenience settlement path used by local demos and wallet tests.
    /// @dev It keeps the same conservation rules while avoiding dynamic-array CLI encoding.
    function commitSingleAccountFrame(
        uint64 expectedSequence,
        bytes32 expectedPreviousStateHash,
        FrameInput calldata frame,
        address account,
        int256 accountWethDeltaWad,
        int256 accountTokenDelta,
        int256 poolWethDeltaWad,
        int256 poolTokenDelta
    ) external onlySequencer returns (bytes32 nextStateHash) {
        AccountDelta[] memory deltas = new AccountDelta[](1);
        deltas[0] = AccountDelta({
            account: account,
            wethDeltaWad: accountWethDeltaWad,
            tokenDelta: accountTokenDelta
        });
        return _commitMemoryFrame(
            expectedSequence,
            expectedPreviousStateHash,
            frame,
            deltas,
            poolWethDeltaWad,
            poolTokenDelta
        );
    }

    function _commitMemoryFrame(
        uint64 expectedSequence,
        bytes32 expectedPreviousStateHash,
        FrameInput calldata frame,
        AccountDelta[] memory deltas,
        int256 poolWethDeltaWad,
        int256 poolTokenDelta
    ) internal returns (bytes32 nextStateHash) {
        if (frame.marketId != marketId) revert InvalidMarket();
        if (expectedSequence != stateSequence + 1) revert InvalidSequence();
        if (expectedPreviousStateHash != stateHash) revert InvalidSequence();
        if (frame.intentHash != bytes32(0)) {
            if (consumedIntent[frame.intentHash]) revert IntentAlreadyConsumed();
            consumedIntent[frame.intentHash] = true;
        }
        if (deltas.length != 1 || deltas[0].account == address(0)) revert InvalidAddress();
        if (deltas[0].wethDeltaWad + poolWethDeltaWad != 0 || deltas[0].tokenDelta + poolTokenDelta != 0) {
            revert InvalidDeltaConservation();
        }
        _applyMemoryAccountDelta(expectedSequence, deltas[0]);
        poolWethWad = _applySigned(poolWethWad, poolWethDeltaWad);
        poolTokenAmount = _applySigned(poolTokenAmount, poolTokenDelta);
        if (frame.reservedWethWad > poolWethWad) revert ReservedLiquidityExceeded();
        reservedWethWad = frame.reservedWethWad;
        openInterestLongWad = frame.openInterestLongWad;
        openInterestShortWad = frame.openInterestShortWad;
        nextStateHash = keccak256(
            abi.encode(
                expectedSequence,
                stateHash,
                frame.marketId,
                uint8(frame.action),
                frame.marginalPriceWad,
                frame.marketCapWad,
                poolWethWad,
                poolTokenAmount,
                frame.reservedWethWad,
                frame.openInterestLongWad,
                frame.openInterestShortWad,
                frame.positionsRoot,
                frame.balancesRoot,
                frame.intentHash
            )
        );
        stateSequence = expectedSequence;
        stateHash = nextStateHash;
        _realtimeState = RealtimeStateView({
            sequence: expectedSequence,
            committedAt: uint64(block.timestamp),
            marketId: frame.marketId,
            action: frame.action,
            marginalPriceWad: frame.marginalPriceWad,
            marketCapWad: frame.marketCapWad,
            poolWethWad: poolWethWad,
            poolTokenAmount: poolTokenAmount,
            reservedWethWad: frame.reservedWethWad,
            openInterestLongWad: frame.openInterestLongWad,
            openInterestShortWad: frame.openInterestShortWad,
            positionsRoot: frame.positionsRoot,
            balancesRoot: frame.balancesRoot,
            stateHash: nextStateHash
        });
        _assertCustody();
        emit StateFrameCommitted(
            expectedSequence,
            nextStateHash,
            frame.marketId,
            frame.action,
            frame.marginalPriceWad,
            frame.marketCapWad,
            poolWethWad,
            poolTokenAmount,
            frame.reservedWethWad,
            frame.intentHash
        );
    }

    function _deposit(address account, uint256 amountWad) internal {
        if (amountWad == 0) revert InvalidAmount();
        _balances[account].wethWad += amountWad;
        totalUserWethWad += amountWad;
        _assertCustody();
        emit Deposited(account, amountWad);
    }

    function _applyAccountDelta(uint64 sequence, AccountDelta calldata delta) internal {
        AccountBalance storage balance = _balances[delta.account];
        uint256 wethBefore = balance.wethWad;
        uint256 tokenBefore = balance.tokenAmount;
        balance.wethWad = _applySigned(wethBefore, delta.wethDeltaWad);
        balance.tokenAmount = _applySigned(tokenBefore, delta.tokenDelta);
        totalUserWethWad = _applySigned(totalUserWethWad, delta.wethDeltaWad);
        totalUserTokenAmount = _applySigned(totalUserTokenAmount, delta.tokenDelta);
        emit AccountBalanceChanged(
            sequence,
            delta.account,
            delta.wethDeltaWad,
            delta.tokenDelta,
            balance.wethWad,
            balance.tokenAmount
        );
    }

    function _applyMemoryAccountDelta(uint64 sequence, AccountDelta memory delta) internal {
        AccountBalance storage balance = _balances[delta.account];
        balance.wethWad = _applySigned(balance.wethWad, delta.wethDeltaWad);
        balance.tokenAmount = _applySigned(balance.tokenAmount, delta.tokenDelta);
        totalUserWethWad = _applySigned(totalUserWethWad, delta.wethDeltaWad);
        totalUserTokenAmount = _applySigned(totalUserTokenAmount, delta.tokenDelta);
        emit AccountBalanceChanged(
            sequence,
            delta.account,
            delta.wethDeltaWad,
            delta.tokenDelta,
            balance.wethWad,
            balance.tokenAmount
        );
    }

    function _applySigned(uint256 current, int256 delta) internal pure returns (uint256) {
        if (delta >= 0) return current + uint256(delta);
        uint256 reduction = uint256(-(delta + 1)) + 1;
        if (reduction > current) revert NegativeBalance();
        return current - reduction;
    }

    function _assertCustody() internal view {
        if (reservedWethWad > poolWethWad) revert ReservedLiquidityExceeded();
        if (address(this).balance < poolWethWad + totalUserWethWad) revert InsolventCustody();
        if (token.balanceOf(address(this)) < poolTokenAmount + totalUserTokenAmount) revert InsolventCustody();
    }
}
