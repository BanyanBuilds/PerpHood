$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$project = Split-Path -Parent $PSScriptRoot
Set-Location $project

$proofPath = Join-Path $project "deployments/v74-canary-onchain-proof.json"
$deploymentPath = Join-Path $project "deployments/v73-robinhood-mainnet.json"
if (-not (Test-Path $proofPath)) { throw "Missing V74 on-chain proof. Launch and verify the canary first." }
if (-not (Test-Path $deploymentPath)) { throw "Missing V73 mainnet deployment evidence." }

$proof = Get-Content $proofPath -Raw | ConvertFrom-Json
$deployment = Get-Content $deploymentPath -Raw | ConvertFrom-Json
if (-not $proof.allChecksPassed) { throw "V74 proof did not pass every launch check." }

$rpc = if ($env:RH_RPC_URL) { $env:RH_RPC_URL } else { $deployment.rpc }
if ([string]::IsNullOrWhiteSpace($rpc)) { throw "Robinhood Chain RPC URL is missing." }

$token = [string]$proof.token
$pool = [string]$proof.pool
$creator = [string]$proof.creator
$factory = [string]$proof.factory
$wrappedNative = [string]$deployment.wrappedNative

function Invoke-Cast([string[]]$Arguments) {
  $result = & cast @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "cast failed: $($Arguments -join ' ')`n$result" }
  return (($result | Out-String).Trim())
}

function First-Scalar([string]$Value) {
  return (($Value -split "`r?`n")[0] -split '\s+')[0].Trim()
}

function To-BigInteger([string]$Value) {
  $clean = (First-Scalar $Value)
  if ($clean.StartsWith("0x")) {
    return [System.Numerics.BigInteger]::Parse("0" + $clean.Substring(2), [System.Globalization.NumberStyles]::AllowHexSpecifier)
  }
  return [System.Numerics.BigInteger]::Parse($clean)
}

Write-Host "LEVERAGE X V75 - FIRST SPOT PRICE TO PERPS MARKET" -ForegroundColor Cyan
Write-Host "Token: $token"
Write-Host "Pool:  $pool"

$chainId = To-BigInteger (Invoke-Cast @("chain-id", "--rpc-url", $rpc))
if ($chainId -ne 4663) { throw "Wrong network. Expected Robinhood Chain 4663, received $chainId." }

$poolCode = Invoke-Cast @("code", "--rpc-url", $rpc, $pool)
if ($poolCode.Length -le 2) { throw "Canonical pool has no bytecode." }

$liquidity = To-BigInteger (Invoke-Cast @("call", "--rpc-url", $rpc, $pool, "liquidity()(uint128)"))
$slot0Raw = Invoke-Cast @("call", "--rpc-url", $rpc, $pool, "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)")
$slot0Lines = $slot0Raw -split "`r?`n"
if ($slot0Lines.Count -lt 7) { throw "Could not decode canonical pool slot0." }
$sqrtPriceX96 = To-BigInteger $slot0Lines[0]
$tick = [int64](First-Scalar $slot0Lines[1])
$observationCardinality = [int](First-Scalar $slot0Lines[3])
$observationCardinalityNext = [int](First-Scalar $slot0Lines[4])
$unlocked = (First-Scalar $slot0Lines[6]).ToLowerInvariant() -eq "true"

$token0 = (First-Scalar (Invoke-Cast @("call", "--rpc-url", $rpc, $pool, "token0()(address)"))).ToLowerInvariant()
$token1 = (First-Scalar (Invoke-Cast @("call", "--rpc-url", $rpc, $pool, "token1()(address)"))).ToLowerInvariant()
$tokenLower = $token.ToLowerInvariant()
$wrappedLower = $wrappedNative.ToLowerInvariant()
$pairMatches = (($token0 -eq $tokenLower -and $token1 -eq $wrappedLower) -or ($token1 -eq $tokenLower -and $token0 -eq $wrappedLower))

$tokenCreator = (First-Scalar (Invoke-Cast @("call", "--rpc-url", $rpc, $token, "creator()(address)"))).ToLowerInvariant()
$creatorMatches = $tokenCreator -eq $creator.ToLowerInvariant()
$spotPriceValid = ($sqrtPriceX96 -gt 0 -and $liquidity -gt 0 -and $unlocked -and $pairMatches)

$checks = [ordered]@{
  robinhoodChain = ($chainId -eq 4663)
  v74LaunchProofPassed = [bool]$proof.allChecksPassed
  canonicalPoolHasBytecode = ($poolCode.Length -gt 2)
  canonicalPairMatchesTokenAndWETH = $pairMatches
  poolLiquidityPositive = ($liquidity -gt 0)
  initializedSpotPricePositive = ($sqrtPriceX96 -gt 0)
  poolUnlocked = $unlocked
  creatorIdentityConfirmed = $creatorMatches
}
$eligible = -not ($checks.Values -contains $false)

$marketId = "rh4663:" + $tokenLower
$activation = [ordered]@{
  version = 75
  generatedAt = (Get-Date).ToUniversalTime().ToString('o')
  chainId = 4663
  marketId = $marketId
  status = $(if ($eligible) { "eligible-for-perps-engine" } else { "blocked" })
  token = $token
  pool = $pool
  launchFactory = $factory
  wrappedNative = $wrappedNative
  quoteAsset = "WETH"
  priceSource = [ordered]@{
    type = "canonical-uniswap-v3-slot0"
    sqrtPriceX96 = $sqrtPriceX96.ToString()
    tick = $tick
    liquidity = $liquidity.ToString()
    observationCardinality = $observationCardinality
    observationCardinalityNext = $observationCardinalityNext
    validFirstSpotPrice = $spotPriceValid
  }
  riskControls = [ordered]@{
    maximumLeverage = 20
    creatorWalletPermanentlyBlocked = $true
    blockedWallets = @($creator)
    linkedCreatorWalletPolicy = "block only cryptographically or operationally proven links"
    weakHeuristicAccusationsAllowed = $false
    tradingActivationMode = "engine-consumes-signed-activation-manifest"
  }
  checks = $checks
  eligible = $eligible
  evidence = [ordered]@{
    launchTransactionHash = $proof.transactionHash
    launchBlockNumber = $proof.blockNumber
    v74Proof = "deployments/v74-canary-onchain-proof.json"
  }
}

$out = Join-Path $project "deployments/v75-perps-market-activation.json"
$activation | ConvertTo-Json -Depth 16 | Set-Content $out -Encoding UTF8

$runtimeDir = Join-Path $project "runtime/perps/markets"
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$runtimePath = Join-Path $runtimeDir (($tokenLower.Substring(2)) + ".json")
$activation | ConvertTo-Json -Depth 16 | Set-Content $runtimePath -Encoding UTF8

if (-not $eligible) { throw "The first token is not yet eligible for perps. Review deployments/v75-perps-market-activation.json." }

Write-Host "READY: first valid canonical spot price confirmed." -ForegroundColor Green
Write-Host "READY: creator wallet permanently blocked in the activation manifest." -ForegroundColor Green
Write-Host "READY: market may be consumed by the Leverage X perps engine at up to 20x." -ForegroundColor Green
Write-Host "Saved: deployments/v75-perps-market-activation.json" -ForegroundColor Green
