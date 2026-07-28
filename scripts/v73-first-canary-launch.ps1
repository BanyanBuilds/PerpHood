$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project
$deploymentFile = Join-Path $project "deployments/v73-robinhood-mainnet.json"
if (-not (Test-Path $deploymentFile)) { throw "Deploy the V73 factory first. Missing deployments/v73-robinhood-mainnet.json." }
$deployment = Get-Content $deploymentFile -Raw | ConvertFrom-Json
$rpc = if ($env:RH_RPC_URL) { $env:RH_RPC_URL } else { $deployment.rpc }
$factory = $deployment.launchFactory

function Secure-To-Plain([Security.SecureString]$Secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host "LEVERAGE X V73 - FIRST CONTROLLED CANARY" -ForegroundColor Cyan
Write-Host "Factory: $factory" -ForegroundColor DarkGray
$name = Read-Host "Token name"
$symbol = Read-Host "Ticker (1-12 characters)"
$metadataUri = Read-Host "Metadata URI (IPFS/HTTPS)"
$imageUri = Read-Host "Image/GIF URI used in that metadata (for the saved evidence file)"
$totalBudgetEthInput = Read-Host "Total launch budget in ETH, including gas [0.001]"
$totalBudgetEth = if ([string]::IsNullOrWhiteSpace($totalBudgetEthInput)) { "0.001" } else { $totalBudgetEthInput }

if ($name.Length -lt 2 -or $name.Length -gt 64) { throw "Token name must be 2-64 characters." }
if ($symbol.Length -lt 1 -or $symbol.Length -gt 12) { throw "Ticker must be 1-12 characters." }
if ($metadataUri.Length -lt 8) { throw "Metadata URI is required." }

$secureKey = Read-Host "Paste canary wallet private key (hidden; never saved)" -AsSecureString
$privateKey = Secure-To-Plain $secureKey
try {
  $creator = (& cast wallet address --private-key $privateKey).Trim()
  if ($deployment.owner.ToLowerInvariant() -ne $creator.ToLowerInvariant()) {
    throw "For the first canary, this streamlined runner expects the deployment owner and creator to be the same wallet."
  }

  $metadataHash = (& cast keccak $metadataUri).Trim()
  $totalBudgetWei = [System.Numerics.BigInteger]::Parse((& cast to-wei $totalBudgetEth ether).Trim())
  $gasPrice = [System.Numerics.BigInteger]::Parse((& cast gas-price --rpc-url $rpc).Trim())

  Write-Host "Configuring the only allowed canary creator..." -ForegroundColor Yellow
  & cast send --rpc-url $rpc --private-key $privateKey $factory `
    "configureFirstCanary(address,uint256)" $creator "10000000000000000"
  if ($LASTEXITCODE -ne 0) { throw "Canary configuration transaction failed." }

  # Start with a conservative reserve, estimate, then recompute the buy so gas + buy stays inside the user's total budget.
  $candidateBuyWei = $totalBudgetWei - [System.Numerics.BigInteger]::Parse("250000000000000")
  if ($candidateBuyWei -lt [System.Numerics.BigInteger]::Parse("1000000000000")) { throw "Total budget is too small after reserving gas." }
  $estimateText = (& cast estimate --rpc-url $rpc --from $creator --value $candidateBuyWei $factory `
    "createToken(string,string,string,bytes32)" $name $symbol $metadataUri $metadataHash).Trim()
  $gasEstimate = [System.Numerics.BigInteger]::Parse($estimateText)
  $gasReserve = ($gasEstimate * $gasPrice * 13) / 10
  $buyWei = $totalBudgetWei - $gasReserve
  if ($buyWei -lt [System.Numerics.BigInteger]::Parse("1000000000000")) {
    throw "The selected total budget cannot cover estimated gas plus the minimum genesis buy. Increase the total budget slightly."
  }

  Write-Host "Total budget cap: $totalBudgetEth ETH" -ForegroundColor Cyan
  Write-Host "Genesis buy value: $buyWei wei" -ForegroundColor Cyan
  $approval = Read-Host "Type LAUNCH to mint the real canary token"
  if ($approval -cne "LAUNCH") { throw "Canary launch cancelled." }

  $sendOutput = & cast send --json --rpc-url $rpc --private-key $privateKey --value $buyWei $factory `
    "createToken(string,string,string,bytes32)" $name $symbol $metadataUri $metadataHash
  if ($LASTEXITCODE -ne 0) { throw "Canary launch transaction failed." }
  $receipt = $sendOutput | ConvertFrom-Json
  $txHash = $receipt.transactionHash

  $evidence = [ordered]@{
    chainId = 4663
    factory = $factory
    creator = $creator
    tokenName = $name
    symbol = $symbol
    metadataURI = $metadataUri
    metadataHash = $metadataHash
    imageURI = $imageUri
    totalBudgetEth = $totalBudgetEth
    genesisBuyWei = $buyWei.ToString()
    transactionHash = $txHash
    launchedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  $evidence | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $project "deployments/v73-first-canary.json") -Encoding UTF8
  Write-Host "CANARY TRANSACTION CONFIRMED: $txHash" -ForegroundColor Green
  Write-Host "Evidence saved to deployments/v73-first-canary.json" -ForegroundColor Green
}
finally {
  $privateKey = $null
  $secureKey = $null
  [GC]::Collect()
}
