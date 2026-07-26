param(
  [Parameter(Mandatory=$true)][string]$BattlePool,
  [string]$RpcUrl = "http://127.0.0.1:8545",
  [string]$SequencerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  [string]$TraderKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
)

$ErrorActionPreference = "Stop"
$Trader = (& cast wallet address --private-key $TraderKey).Trim()
$MarketId = (& cast call --rpc-url $RpcUrl $BattlePool "marketId()(bytes32)").Trim()
$PreviousHash = (& cast call --rpc-url $RpcUrl $BattlePool "stateHash()(bytes32)").Trim()
$PositionsRoot = (& cast keccak "v22-demo-positions").Trim()
$BalancesRoot = (& cast keccak "v22-demo-balances").Trim()
$IntentHash = (& cast keccak "v22-demo-spot-buy").Trim()

Write-Host "Depositing 2 test ETH for trader $Trader" -ForegroundColor Cyan
& cast send --rpc-url $RpcUrl --private-key $TraderKey $BattlePool "deposit()" --value 2ether | Out-Host

$TokenOut = "100000000000000000000000000" # 100,000,000 tokens with 18 decimals
$Frame = "($MarketId,1,250000000,2500000000000000000,0,0,0,$PositionsRoot,$BalancesRoot,$IntentHash)"
$Signature = "commitSingleAccountFrame(uint64,bytes32,(bytes32,uint8,uint256,uint256,uint256,uint256,uint256,bytes32,bytes32,bytes32),address,int256,int256,int256,int256)"

Write-Host "Committing a balanced one-ETH spot buy frame..." -ForegroundColor Cyan
& cast send --rpc-url $RpcUrl --private-key $SequencerKey $BattlePool $Signature 1 $PreviousHash $Frame $Trader "-1000000000000000000" $TokenOut "1000000000000000000" "-$TokenOut" | Out-Host

Write-Host "Trader internal balance:" -ForegroundColor Green
& cast call --rpc-url $RpcUrl $BattlePool "accountBalance(address)((uint256,uint256))" $Trader | Out-Host
Write-Host "Realtime state:" -ForegroundColor Green
& cast call --rpc-url $RpcUrl $BattlePool "realtimeState()((uint64,uint64,bytes32,uint8,uint256,uint256,uint256,uint256,uint256,uint256,uint256,bytes32,bytes32,bytes32))" | Out-Host
