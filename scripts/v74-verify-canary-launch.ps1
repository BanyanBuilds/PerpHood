$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project
$deploymentPath = Join-Path $project "deployments/v73-robinhood-mainnet.json"
$evidencePath = Join-Path $project "deployments/v73-first-canary.json"
if (-not (Test-Path $deploymentPath)) { throw "Missing V73 deployment evidence." }
if (-not (Test-Path $evidencePath)) { throw "Missing V73 canary launch evidence." }
$d = Get-Content $deploymentPath -Raw | ConvertFrom-Json
$e = Get-Content $evidencePath -Raw | ConvertFrom-Json
$rpc = if ($env:RH_RPC_URL) { $env:RH_RPC_URL } else { $d.rpc }
$factory = $d.launchFactory
$tx = $e.transactionHash

Write-Host "LEVERAGE X V74 - AUTOMATIC ON-CHAIN LAUNCH PROOF" -ForegroundColor Cyan
$receipt = (& cast receipt --json --rpc-url $rpc $tx) | ConvertFrom-Json
if ([string]$receipt.status -notin @('0x1','1')) { throw "Launch transaction is not successful." }
$token = (& cast call --rpc-url $rpc $factory "allTokens(uint256)(address)" 0).Trim()
$pool = (& cast call --rpc-url $rpc $factory "canonicalPoolForToken(address)(address)" $token).Trim()
$name = (& cast call --rpc-url $rpc $token "name()(string)").Trim('"')
$symbol = (& cast call --rpc-url $rpc $token "symbol()(string)").Trim('"')
$uri = (& cast call --rpc-url $rpc $token "metadataURI()(string)").Trim('"')
$supply = (& cast call --rpc-url $rpc $token "totalSupply()(uint256)").Trim()
$creator = (& cast call --rpc-url $rpc $token "creator()(address)").Trim()
$token0 = (& cast call --rpc-url $rpc $pool "token0()(address)").Trim()
$token1 = (& cast call --rpc-url $rpc $pool "token1()(address)").Trim()
$fee = (& cast call --rpc-url $rpc $pool "fee()(uint24)").Trim()
$factoryPool = (& cast call --rpc-url $rpc $d.dexFactory "getPool(address,address,uint24)(address)" $token0 $token1 $fee).Trim()
$lockerRecord = (& cast call --rpc-url $rpc $d.liquidityLocker "getLockedLaunch(address)((address,address,uint256,uint256,uint24,int24,bool,bool,bool))" $token).Trim()
$codeToken = (& cast code --rpc-url $rpc $token).Trim()
$codePool = (& cast code --rpc-url $rpc $pool).Trim()

$checks = [ordered]@{
  transactionSuccessful = $true
  tokenHasBytecode = ($codeToken.Length -gt 2)
  poolHasBytecode = ($codePool.Length -gt 2)
  canonicalFactoryPoolMatches = ($factoryPool.ToLowerInvariant() -eq $pool.ToLowerInvariant())
  metadataMatchesLaunch = ($uri -eq $e.metadataURI)
  creatorMatchesLaunch = ($creator.ToLowerInvariant() -eq $e.creator.ToLowerInvariant())
  symbolMatchesLaunch = ($symbol -eq $e.symbol)
  lockerRecordPresent = ($lockerRecord -match $token.Substring(2,8))
}
$passed = -not ($checks.Values -contains $false)
$proof = [ordered]@{
  version = 74; chainId = 4663; verifiedAt = (Get-Date).ToUniversalTime().ToString('o')
  transactionHash = $tx; blockNumber = $receipt.blockNumber
  factory = $factory; token = $token; pool = $pool; creator = $creator
  tokenName = $name; symbol = $symbol; metadataURI = $uri; totalSupply = $supply
  token0 = $token0; token1 = $token1; poolFee = $fee; liquidityLocker = $d.liquidityLocker
  checks = $checks; allChecksPassed = $passed
  discovery = [ordered]@{ status = "pending-external-indexer"; gmgnGuaranteed = $false; note = "This proof confirms the canonical on-chain token and pool. External indexing is independently controlled." }
}
$out = Join-Path $project "deployments/v74-canary-onchain-proof.json"
$proof | ConvertTo-Json -Depth 12 | Set-Content $out -Encoding UTF8
if (-not $passed) { throw "One or more launch proof checks failed. Review deployments/v74-canary-onchain-proof.json." }
Write-Host "VERIFIED: token $token" -ForegroundColor Green
Write-Host "VERIFIED: canonical pool $pool" -ForegroundColor Green
Write-Host "Proof saved to deployments/v74-canary-onchain-proof.json" -ForegroundColor Green
