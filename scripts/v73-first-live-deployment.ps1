$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project

function Fail([string]$Message) { throw $Message }
function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { Fail "$Name is required but was not found in PATH." }
}
function Secure-To-Plain([Security.SecureString]$Secure) {
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}
function Rpc([string]$Method, [object[]]$Params = @()) {
  $payload = @{ jsonrpc = "2.0"; id = 1; method = $Method; params = $Params } | ConvertTo-Json -Depth 12 -Compress
  $reply = Invoke-RestMethod -Method Post -Uri $script:RpcUrl -ContentType "application/json" -Body $payload
  if ($reply.error) { Fail "RPC $Method failed: $($reply.error.message)" }
  return $reply.result
}

Write-Host "" 
Write-Host "LEVERAGE X V73 - FIRST LIVE DEPLOYMENT" -ForegroundColor Cyan
Write-Host "This deploys only the permanent liquidity locker and launch factory." -ForegroundColor DarkGray
Write-Host "No key is written to disk." -ForegroundColor DarkGray
Write-Host ""

Require-Command "forge"
Require-Command "cast"

$script:RpcUrl = if ($env:RH_RPC_URL) { $env:RH_RPC_URL } else { "https://rpc.mainnet.chain.robinhood.com" }
$chainHex = Rpc "eth_chainId"
$chainId = [Convert]::ToInt64(($chainHex -replace '^0x',''), 16)
if ($chainId -ne 4663) { Fail "Wrong network. Expected Robinhood Chain 4663, received $chainId." }
Write-Host "[PASS] Robinhood Chain mainnet (4663)" -ForegroundColor Green

$canonical = [ordered]@{
  WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
  UniswapV3Factory = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA"
  PositionManager = "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3"
  SwapRouter02 = "0xCaf681a66D020601342297493863E78C959E5cb2"
}
foreach ($entry in $canonical.GetEnumerator()) {
  $code = Rpc "eth_getCode" @($entry.Value, "latest")
  if (-not $code -or $code -eq "0x") { Fail "$($entry.Key) has no bytecode at $($entry.Value)." }
  Write-Host "[PASS] $($entry.Key)" -ForegroundColor Green
}

Write-Host "[BUILD] Compiling isolated mint path..." -ForegroundColor Yellow
$env:FOUNDRY_PROFILE = "mintpath"
& forge build --root $project
if ($LASTEXITCODE -ne 0) { Fail "Mint-path compilation failed." }
Write-Host "[PASS] Mint path compiled" -ForegroundColor Green

$secureKey = Read-Host "Paste deployment wallet private key (hidden; never saved)" -AsSecureString
$privateKey = Secure-To-Plain $secureKey
try {
  if ([string]::IsNullOrWhiteSpace($privateKey)) { Fail "No private key entered." }
  $deployer = (& cast wallet address --private-key $privateKey).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $deployer.StartsWith("0x")) { Fail "The private key could not be read by cast." }
  $owner = if ($env:LEVERAGEX_OWNER) { $env:LEVERAGEX_OWNER } else { $deployer }
  Write-Host "Deployer: $deployer" -ForegroundColor Cyan
  Write-Host "Owner:    $owner" -ForegroundColor Cyan

  $balanceHex = Rpc "eth_getBalance" @($deployer, "latest")
  $balanceWei = [Convert]::ToUInt64(($balanceHex -replace '^0x',''), 16)
  $balanceEth = [decimal]$balanceWei / 1000000000000000000
  Write-Host ("Wallet balance: {0:N6} ETH" -f $balanceEth) -ForegroundColor Cyan
  if ($balanceWei -eq 0) { Fail "Deployment wallet has no ETH for gas." }

  Write-Host ""
  Write-Host "This next transaction deploys real mainnet contracts." -ForegroundColor Yellow
  $approval = Read-Host "Type DEPLOY to continue"
  if ($approval -cne "DEPLOY") { Fail "Deployment cancelled." }

  $env:DEPLOYER_PRIVATE_KEY = $privateKey
  $env:LEVERAGEX_OWNER = $owner
  $env:RH_RPC_URL = $script:RpcUrl
  & forge script contracts/script/DeployLeverageXMintPathV72.s.sol:DeployLeverageXMintPathV72 --rpc-url $script:RpcUrl --broadcast --slow -vvvv
  if ($LASTEXITCODE -ne 0) { Fail "Mainnet deployment failed." }

  $broadcastRoot = Join-Path $project "broadcast/DeployLeverageXMintPathV72.s.sol/4663"
  $runFile = Join-Path $broadcastRoot "run-latest.json"
  if (-not (Test-Path $runFile)) { Fail "Deployment broadcast completed, but run-latest.json was not found." }
  $run = Get-Content $runFile -Raw | ConvertFrom-Json
  $creates = @($run.transactions | Where-Object { $_.transactionType -eq "CREATE" })
  if ($creates.Count -lt 2) { Fail "Could not identify both deployed contracts in the broadcast output." }
  $locker = $creates[0].contractAddress
  $factory = $creates[1].contractAddress
  if (-not $locker -or -not $factory) { Fail "Deployment addresses were missing." }

  foreach ($address in @($locker, $factory)) {
    $code = Rpc "eth_getCode" @($address, "latest")
    if (-not $code -or $code -eq "0x") { Fail "No deployed bytecode found at $address." }
  }

  $deployment = [ordered]@{
    version = "73.0.0"
    chainId = 4663
    rpc = $script:RpcUrl
    deployedAt = (Get-Date).ToUniversalTime().ToString("o")
    deployer = $deployer
    owner = $owner
    liquidityLocker = $locker
    launchFactory = $factory
    launchesOpen = $false
    canaryConfigured = $false
  }
  $deployDir = Join-Path $project "deployments"
  New-Item -ItemType Directory -Force -Path $deployDir | Out-Null
  $deployment | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $deployDir "v73-robinhood-mainnet.json") -Encoding UTF8

  Write-Host ""
  Write-Host "DEPLOYMENT COMPLETE" -ForegroundColor Green
  Write-Host "Locker:  $locker" -ForegroundColor Green
  Write-Host "Factory: $factory" -ForegroundColor Green
  Write-Host "Launches remain CLOSED until the controlled canary setup." -ForegroundColor Yellow
  Write-Host "Saved: deployments/v73-robinhood-mainnet.json" -ForegroundColor Cyan
}
finally {
  Remove-Item Env:DEPLOYER_PRIVATE_KEY -ErrorAction SilentlyContinue
  $privateKey = $null
  $secureKey = $null
  [GC]::Collect()
}
