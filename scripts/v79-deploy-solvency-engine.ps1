$ErrorActionPreference = "Stop"
function Need($name){ $v=[Environment]::GetEnvironmentVariable($name); if([string]::IsNullOrWhiteSpace($v)){ throw "Missing environment variable: $name" }; return $v }
$rpc=Need "ROBINHOOD_RPC_URL"; $registry=Need "V76_PERPS_REGISTRY_ADDRESS"; $oracle=Need "V78_TWAP_ORACLE_ADDRESS"; $owner=Need "LEVERAGEX_OWNER_ADDRESS"; $fees=Need "LEVERAGEX_FEE_RECIPIENT"
Write-Host "Running V79 tests before deployment..."
$env:FOUNDRY_PROFILE="solvencyengine"; forge test -q; if($LASTEXITCODE -ne 0){ throw "V79 tests failed" }
Write-Host "Deploying V79 to Robinhood Chain (4663)..."
forge create contracts/solvency-engine-src/LeverageXSolvencyPositionEngineV79.sol:LeverageXSolvencyPositionEngineV79 --rpc-url $rpc --interactive --broadcast --constructor-args $owner $registry $oracle $fees
if($LASTEXITCODE -ne 0){ throw "Deployment failed" }
Write-Host "Deployment broadcast complete. Save the deployed address as V79_SOLVENCY_ENGINE_ADDRESS."
