$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
function Need($name) { $value=[Environment]::GetEnvironmentVariable($name); if([string]::IsNullOrWhiteSpace($value)){throw "Missing required environment variable: $name"}; return $value }
$rpc=Need "ROBINHOOD_RPC_URL"
$registry=Need "LEVERAGEX_PERPS_REGISTRY_ADDRESS"
$weth=Need "ROBINHOOD_WETH_ADDRESS"
$owner=Need "LEVERAGEX_PROTOCOL_OWNER"
$key=Need "LEVERAGEX_DEPLOYER_PRIVATE_KEY"
$chainId=cast chain-id --rpc-url $rpc
if($chainId -ne "4663"){throw "Wrong chain. Expected Robinhood Chain 4663, received $chainId"}
foreach($address in @($registry,$weth)){ $code=cast code $address --rpc-url $rpc; if($code -eq "0x"){throw "No contract bytecode at $address"} }
forge build --profile twaporacle
if($LASTEXITCODE -ne 0){throw "V78 TWAP oracle compile failed."}
Write-Host "Deploying V78 Uniswap V3 TWAP oracle..."
forge create contracts/twap-oracle-src/LeverageXUniswapV3TwapOracleV78.sol:LeverageXUniswapV3TwapOracleV78 `
  --rpc-url $rpc --private-key $key --constructor-args $owner $registry $weth --broadcast
if($LASTEXITCODE -ne 0){throw "V78 oracle deployment failed."}
Write-Host "Save the deployed address as LEVERAGEX_MARK_ORACLE_ADDRESS, configure the first market, then point V77 at this oracle."
