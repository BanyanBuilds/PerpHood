$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Need($name) {
  $value = [Environment]::GetEnvironmentVariable($name)
  if ([string]::IsNullOrWhiteSpace($value)) { throw "Missing required environment variable: $name" }
  return $value
}

$rpc = Need "ROBINHOOD_RPC_URL"
$registry = Need "LEVERAGEX_PERPS_REGISTRY_ADDRESS"
$oracle = Need "LEVERAGEX_MARK_ORACLE_ADDRESS"
$owner = Need "LEVERAGEX_PROTOCOL_OWNER"
$fees = Need "LEVERAGEX_FEE_RECIPIENT"

$chainId = cast chain-id --rpc-url $rpc
if ($chainId -ne "4663") { throw "Wrong chain. Expected Robinhood Chain 4663, received $chainId" }

forge build --profile perpsengine
if ($LASTEXITCODE -ne 0) { throw "V77 perps engine compile failed." }

Write-Host "Deploying V77 collateral and position engine to Robinhood Chain..."
forge create contracts/perps-engine-src/LeverageXCollateralPositionEngineV77.sol:LeverageXCollateralPositionEngineV77 `
  --rpc-url $rpc `
  --private-key $env:LEVERAGEX_DEPLOYER_PRIVATE_KEY `
  --constructor-args $owner $registry $oracle $fees `
  --broadcast
if ($LASTEXITCODE -ne 0) { throw "V77 deployment failed." }

Write-Host "Deployment broadcast complete. Save the deployed address as LEVERAGEX_PERPS_ENGINE_ADDRESS."
