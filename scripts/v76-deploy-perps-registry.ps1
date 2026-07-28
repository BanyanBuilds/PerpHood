$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project

function Fail([string]$Message) { throw $Message }
function Require-Command([string]$Name) { if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { Fail "$Name is required but was not found in PATH." } }
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

$deploymentPath = Join-Path $project "deployments/v73-robinhood-mainnet.json"
if (-not (Test-Path $deploymentPath)) { Fail "Missing V73 deployment evidence. Deploy the launch factory first." }
$launchDeployment = Get-Content $deploymentPath -Raw | ConvertFrom-Json
$rpc = if ($env:RH_RPC_URL) { $env:RH_RPC_URL } else { [string]$launchDeployment.rpc }
$launchFactory = [string]$launchDeployment.launchFactory
$owner = if ($env:LEVERAGEX_OWNER) { $env:LEVERAGEX_OWNER } else { [string]$launchDeployment.owner }

Write-Host "LEVERAGE X V76 - DEPLOY ON-CHAIN PERPS REGISTRY" -ForegroundColor Cyan
Require-Command "forge"
Require-Command "cast"
$chainId = [int](Invoke-Cast @("chain-id", "--rpc-url", $rpc))
if ($chainId -ne 4663) { Fail "Wrong network. Expected Robinhood Chain 4663, received $chainId." }
foreach ($address in @($launchFactory, "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA", "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73")) {
  $code = Invoke-Cast @("code", "--rpc-url", $rpc, $address)
  if ($code.Length -le 2) { Fail "Required contract has no bytecode: $address" }
}

$env:FOUNDRY_PROFILE = "perpsregistry"
& forge build --root $project --sizes
if ($LASTEXITCODE -ne 0) { Fail "V76 perps registry compilation failed." }
& forge test --root $project -vvv
if ($LASTEXITCODE -ne 0) { Fail "V76 perps registry tests failed." }

$secureKey = Read-Host "Paste deployment wallet private key (hidden; never saved)" -AsSecureString
$privateKey = Secure-To-Plain $secureKey
try {
  $deployer = (Invoke-Cast @("wallet", "address", "--private-key", $privateKey)).Trim()
  Write-Host "Deployer:      $deployer"
  Write-Host "Registry owner: $owner"
  Write-Host "Launch factory: $launchFactory"
  $approval = Read-Host "Type DEPLOY to create the V76 registry on Robinhood Chain"
  if ($approval -cne "DEPLOY") { Fail "Deployment cancelled." }

  $env:DEPLOYER_PRIVATE_KEY = $privateKey
  $env:LEVERAGEX_OWNER = $owner
  $env:LEVERAGEX_LAUNCH_FACTORY = $launchFactory
  & forge script contracts/script/DeployLeverageXPerpsRegistryV76.s.sol:DeployLeverageXPerpsRegistryV76 --rpc-url $rpc --broadcast --slow -vvvv
  if ($LASTEXITCODE -ne 0) { Fail "V76 registry deployment failed." }

  $runFile = Join-Path $project "broadcast/DeployLeverageXPerpsRegistryV76.s.sol/4663/run-latest.json"
  if (-not (Test-Path $runFile)) { Fail "Broadcast evidence was not found." }
  $run = Get-Content $runFile -Raw | ConvertFrom-Json
  $create = @($run.transactions | Where-Object { $_.transactionType -eq "CREATE" }) | Select-Object -First 1
  $registry = [string]$create.contractAddress
  if ([string]::IsNullOrWhiteSpace($registry)) { Fail "Registry address could not be decoded." }
  $code = Invoke-Cast @("code", "--rpc-url", $rpc, $registry)
  if ($code.Length -le 2) { Fail "Registry deployment has no bytecode." }

  $evidence = [ordered]@{
    version = 76
    chainId = 4663
    deployedAt = (Get-Date).ToUniversalTime().ToString('o')
    deployer = $deployer
    owner = $owner
    launchFactory = $launchFactory
    dexFactory = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA"
    wrappedNative = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
    perpsMarketRegistry = $registry
    maximumProtocolLeverage = 20
  }
  New-Item -ItemType Directory -Force -Path (Join-Path $project "deployments") | Out-Null
  $evidence | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $project "deployments/v76-perps-registry.json") -Encoding UTF8
  Write-Host "DEPLOYED: $registry" -ForegroundColor Green
  Write-Host "Saved: deployments/v76-perps-registry.json" -ForegroundColor Green
}
finally {
  Remove-Item Env:DEPLOYER_PRIVATE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:LEVERAGEX_LAUNCH_FACTORY -ErrorAction SilentlyContinue
  $privateKey = $null
  $secureKey = $null
  [GC]::Collect()
}
