/** Local V22 custody + session-key ABI. This is an unaudited development boundary. */
export const LOCAL_BATTLE_POOL_V22_ABI = [
  "function runtimeState() view returns ((uint64 sequence,uint64 committedAt,bytes32 marketId,uint8 action,uint256 marginalPriceWad,uint256 marketCapWad,uint256 poolWethWad,uint256 poolTokenAmount,uint256 reservedWethWad,uint256 openInterestLongWad,uint256 openInterestShortWad,bytes32 positionsRoot,bytes32 balancesRoot,bytes32 stateHash),uint256 availableWethWad,bool solvent)",
  "function accountBalance(address account) view returns ((uint256 wethWad,uint256 tokenAmount))",
  "function sessionState(bytes32 sessionId) view returns ((address owner,bytes32 publicKeyHash,uint64 validUntil,uint64 nextNonce,uint256 maxNotionalWad,uint256 actionBitmap,bool active))",
  "function authorizeSession(bytes32 sessionId,bytes32 publicKeyHash,uint64 validUntil,uint256 maxNotionalWad,uint256 actionBitmap)",
  "function revokeSession(bytes32 sessionId)",
  "function deposit() payable",
  "function withdrawWeth(uint256 amountWad)",
  "function withdrawToken(uint256 tokenAmount)",
  "function commitAuthorizedSingleAccountFrame(uint64 expectedSequence,bytes32 expectedPreviousStateHash,bytes32 sessionId,uint64 sessionNonce,uint256 intentNotionalWad,uint64 intentDeadline,(bytes32 marketId,uint8 action,uint256 marginalPriceWad,uint256 marketCapWad,uint256 reservedWethWad,uint256 openInterestLongWad,uint256 openInterestShortWad,bytes32 positionsRoot,bytes32 balancesRoot,bytes32 intentHash) frame,address account,int256 accountWethDeltaWad,int256 accountTokenDelta,int256 poolWethDeltaWad,int256 poolTokenDelta) returns (bytes32 nextStateHash)",
  "event SessionAuthorized(bytes32 indexed sessionId,address indexed owner,bytes32 indexed publicKeyHash,uint64 validUntil,uint256 maxNotionalWad,uint256 actionBitmap)",
  "event SessionRevoked(bytes32 indexed sessionId,address indexed owner)",
  "event SessionNonceConsumed(bytes32 indexed sessionId,uint64 indexed nonce,bytes32 indexed intentHash)",
] as const;
