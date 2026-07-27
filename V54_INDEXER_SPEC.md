# LEVERAGE X V54 Indexer Interface

## Discovery endpoint

`GET /api/v54/discovery`

Optional query parameters:

- `chainId=46630` or `chainId=4663`
- `token=0x...`
- `limit=1..500`

The response contains factory, market, token, creator, transaction, block, metadata, fixed supply, launch economics, status, and canonical event signatures.

## Factory event

```solidity
MarketCreated(
  address indexed market,
  address indexed token,
  address indexed creator,
  uint256 creatorGenesisBuyWei,
  uint256 creatorTokensOutWad,
  uint256 marketCapEthWad,
  uint256 migrationTargetUsdWad,
  bytes32 metadataHash
)
```

## Market event

```solidity
Trade(
  address indexed trader,
  bool indexed isBuy,
  uint256 grossEthWei,
  uint256 tokenAmountWad,
  uint256 feeEthWei,
  uint256 soldAfterWad,
  uint256 marginalPriceWad,
  uint256 marketCapEthWad
)
```

## ERC-20 event

```solidity
Transfer(address indexed from, address indexed to, uint256 value)
```

Third-party visibility is not assumed. An indexer must recognize both the standard ERC-20 and the LEVERAGE X factory/market events to display accurate custom-curve prices and liquidity.
