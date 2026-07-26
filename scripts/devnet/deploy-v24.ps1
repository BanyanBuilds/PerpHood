param(
  [string]$RpcUrl = "http://127.0.0.1:8545",
  [string]$PrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  [decimal]$SeedEth = 2.0
)

$ErrorActionPreference = "Stop"
if (-not (Get-Command forge -ErrorAction SilentlyContinue)) { throw "forge is required. Install Foundry and reopen PowerShell." }
if (-not (Get-Command cast -ErrorAction SilentlyContinue)) { throw "cast is required. Install Foundry and reopen PowerShell." }

$Owner = (& cast wallet address --private-key $PrivateKey).Trim()
$MarketId = (& cast keccak "PERPHOOD_V24_FIXED_POINT_POOL").Trim()
Write-Host "Deploying V24 fixed-point verifier with owner/sequencer $Owner" -ForegroundColor Cyan

$Output = & forge create `
  --broadcast `
  --rpc-url $RpcUrl `
  --private-key $PrivateKey `
  "contracts/src/LocalBattlePoolV24.sol:LocalBattlePoolV24" `
  --constructor-args $Owner $Owner $MarketId "PerpHood V24" "PH24" 2>&1

$Output | ForEach-Object { Write-Host $_ }
$Match = $Output | Select-String -Pattern "Deployed to:\s+(0x[a-fA-F0-9]{40})" | Select-Object -Last 1
if (-not $Match) { throw "Could not parse the deployed V24 BattlePool address." }
$Address = $Match.Matches[0].Groups[1].Value

Write-Host "Seeding $SeedEth ETH into V24 custody..." -ForegroundColor Cyan
& cast send --rpc-url $RpcUrl --private-key $PrivateKey $Address "seedPool()" --value "${SeedEth}ether" | Out-Host

$EnvPath = Join-Path (Get-Location) ".env.local"
$Existing = if (Test-Path $EnvPath) { Get-Content $EnvPath | Where-Object { $_ -notmatch '^(NEXT_PUBLIC_V24_BATTLE_POOL_ADDRESS|V24_SEQUENCER_ACCOUNT)=' } } else { @() }
$Lines = @(
  $Existing
  "NEXT_PUBLIC_LOCAL_CHAIN_RPC=$RpcUrl"
  "NEXT_PUBLIC_LOCAL_CHAIN_POLL_MS=120"
  "NEXT_PUBLIC_V24_BATTLE_POOL_ADDRESS=$Address"
  "V24_SEQUENCER_ACCOUNT=$Owner"
)
$Lines | Set-Content $EnvPath

Write-Host ""
Write-Host "V24 LocalBattlePool deployed: $Address" -ForegroundColor Green
Write-Host "Updated .env.local. Restart npm run dev, then open /admin/v24-verification." -ForegroundColor Green
