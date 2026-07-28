$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project

function Fail([string]$Message) { throw $Message }
function Secure-To-Plain([Security.SecureString]$Secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Invoke-Cast([string[]]$Arguments) {
  $result = & cast @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { Fail "cast failed: $($Arguments -join ' ')`n$result" }
  return (($result | Out-String).Trim())
}
function First-Scalar([string]$Value) { return (($Value -split "`r?`n")[0] -split '\s+')[0].Trim() }

$activationPath = Join-Path $project "deployments/v75-perps-market-activation.json"
$registryPath = Join-Path $project "deployments/v76-perps-registry.json"
$launchPath = Join-Path $project "deployments/v73-robinhood-mainnet.json"
if (-not (Test-Path $activationPath)) { Fail "Missing V75 activation proof." }
if (-not (Test-Path $registryPath)) { Fail "Missing V76 registry deployment evidence." }
if (-not (Test-Path $launchPath)) { Fail "Missing V73 launch deployment evidence." }
$activation = Get-Content $activationPath -Raw | ConvertFrom-Json
$registryEvidence = Get-Content $registryPath -Raw | ConvertFrom-Json
$launchEvidence = Get-Content $launchPath -Raw | ConvertFrom-Json
if (-not [bool]$activation.eligible) { Fail "V75 did not mark this market eligible." }

$rpc = if ($env:RH_RPC_URL) { $env:RH_RPC_URL } else { [string]$launchEvidence.rpc }
$registry = [string]$registryEvidence.perpsMarketRegistry
$token = [string]$activation.token
$pool = [string]$activation.pool
$creator = [string]$activation.riskControls.blockedWallets[0]

Write-Host "LEVERAGE X V76 - ACTIVATE FIRST ON-CHAIN PERPS MARKET" -ForegroundColor Cyan
$chainId = [int](Invoke-Cast @("chain-id", "--rpc-url", $rpc))
if ($chainId -ne 4663) { Fail "Wrong network." }
foreach ($address in @($registry, $token, $pool)) {
  if ((Invoke-Cast @("code", "--rpc-url", $rpc, $address)).Length -le 2) { Fail "No bytecode at $address" }
}
$existing = First-Scalar (Invoke-Cast @("call", "--rpc-url", $rpc, $registry, "tokenByPool(address)(address)", $pool))
if ($existing.ToLowerInvariant() -ne "0x0000000000000000000000000000000000000000") { Fail "This pool is already registered." }

$secureKey = Read-Host "Paste registry owner/activator private key (hidden; never saved)" -AsSecureString
$privateKey = Secure-To-Plain $secureKey
try {
  $sender = (Invoke-Cast @("wallet", "address", "--private-key", $privateKey)).Trim()
  $owner = First-Scalar (Invoke-Cast @("call", "--rpc-url", $rpc, $registry, "owner()(address)"))
  $isActivator = (First-Scalar (Invoke-Cast @("call", "--rpc-url", $rpc, $registry, "activator(address)(bool)", $sender))).ToLowerInvariant() -eq "true"
  if ($sender.ToLowerInvariant() -ne $owner.ToLowerInvariant() -and -not $isActivator) { Fail "Wallet is not authorized to activate markets." }

  Write-Host "Token:   $token"
  Write-Host "Pool:    $pool"
  Write-Host "Creator permanently blocked: $creator" -ForegroundColor Yellow
  $approval = Read-Host "Type ACTIVATE to register this real market at 20x maximum leverage"
  if ($approval -cne "ACTIVATE") { Fail "Activation cancelled." }

  $tx = First-Scalar (Invoke-Cast @("send", "--rpc-url", $rpc, "--private-key", $privateKey, $registry, "activateMarket(address,address,uint16)", $token, $pool, "20", "--json"))
  # cast --json output differs by version; query registry state rather than trusting presentation.
  $marketRaw = Invoke-Cast @("call", "--rpc-url", $rpc, $registry, "market(address)((address,address,address,uint24,uint16,uint64,uint64,bool,bool))", $token)
  $blocked = (First-Scalar (Invoke-Cast @("call", "--rpc-url", $rpc, $registry, "isPermanentlyBlocked(address,address)(bool)", $token, $creator))).ToLowerInvariant() -eq "true"
  $tradableCreator = (First-Scalar (Invoke-Cast @("call", "--rpc-url", $rpc, $registry, "isTradable(address,address,uint16)(bool)", $token, $creator, "1"))).ToLowerInvariant() -eq "true"
  if (-not $blocked -or $tradableCreator) { Fail "Creator-wallet enforcement did not verify after activation." }

  $proof = [ordered]@{
    version = 76
    activatedAt = (Get-Date).ToUniversalTime().ToString('o')
    chainId = 4663
    registry = $registry
    token = $token
    pool = $pool
    creator = $creator
    maximumLeverage = 20
    creatorPermanentlyBlocked = $blocked
    creatorTradable = $tradableCreator
    marketStateRaw = $marketRaw
    sendOutput = $tx
    enforcement = "Perps execution must call requireTradable or isTradable before accepting every order."
  }
  $proof | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $project "deployments/v76-first-market-onchain-activation.json") -Encoding UTF8
  Write-Host "ACTIVE: first Leverage X perps market is now protocol registry state." -ForegroundColor Green
  Write-Host "VERIFIED: creator wallet is permanently blocked." -ForegroundColor Green
  Write-Host "Saved: deployments/v76-first-market-onchain-activation.json" -ForegroundColor Green
}
finally {
  $privateKey = $null
  $secureKey = $null
  [GC]::Collect()
}
