$ErrorActionPreference = "Stop"
$rpc = if ($env:RH_RPC_URL) { $env:RH_RPC_URL } else { "https://rpc.mainnet.chain.robinhood.com" }
$expectedChainId = 4663
$contracts = [ordered]@{
  WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
  UniswapV3Factory = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA"
  PositionManager = "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3"
  SwapRouter02 = "0xCaf681a66D020601342297493863E78C959E5cb2"
}

Write-Host "Leverage X V72 Robinhood Chain preflight" -ForegroundColor Cyan
$chainHex = cast rpc --rpc-url $rpc eth_chainId | ForEach-Object { $_.Trim('"') }
$chainId = [Convert]::ToInt64($chainHex, 16)
if ($chainId -ne $expectedChainId) { throw "Wrong chain: expected 4663, received $chainId" }
Write-Host "[PASS] Chain ID 4663" -ForegroundColor Green

foreach ($item in $contracts.GetEnumerator()) {
  $code = cast code --rpc-url $rpc $item.Value
  if (-not $code -or $code -eq "0x") { throw "$($item.Key) has no bytecode at $($item.Value)" }
  Write-Host "[PASS] $($item.Key) bytecode found" -ForegroundColor Green
}

$spacing = cast call --rpc-url $rpc $contracts.UniswapV3Factory "feeAmountTickSpacing(uint24)(int24)" 10000
if ([int]$spacing -ne 200) { throw "Unexpected 1% pool tick spacing: $spacing" }
Write-Host "[PASS] Uniswap V3 1% fee tier uses tick spacing 200" -ForegroundColor Green
Write-Host "V72 preflight passed. No wallet or transaction was used." -ForegroundColor Cyan
