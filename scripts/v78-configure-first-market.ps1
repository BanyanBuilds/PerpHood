$ErrorActionPreference="Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
function Need($name){$v=[Environment]::GetEnvironmentVariable($name);if([string]::IsNullOrWhiteSpace($v)){throw "Missing required environment variable: $name"};return $v}
$rpc=Need "ROBINHOOD_RPC_URL"; $oracle=Need "LEVERAGEX_MARK_ORACLE_ADDRESS"; $token=Need "LEVERAGEX_FIRST_TOKEN_ADDRESS"; $key=Need "LEVERAGEX_DEPLOYER_PRIVATE_KEY"
$window=if($env:LEVERAGEX_TWAP_WINDOW_SECONDS){$env:LEVERAGEX_TWAP_WINDOW_SECONDS}else{"300"}
$deviation=if($env:LEVERAGEX_MAX_SPOT_DEVIATION_BPS){$env:LEVERAGEX_MAX_SPOT_DEVIATION_BPS}else{"1000"}
$minLiquidity=if($env:LEVERAGEX_MIN_POOL_LIQUIDITY){$env:LEVERAGEX_MIN_POOL_LIQUIDITY}else{"1"}
$chainId=cast chain-id --rpc-url $rpc; if($chainId -ne "4663"){throw "Wrong chain: $chainId"}
cast send $oracle "setConfig(address,(uint32,uint16,uint128,bool))" $token "($window,$deviation,$minLiquidity,true)" --rpc-url $rpc --private-key $key
if($LASTEXITCODE -ne 0){throw "V78 market configuration failed."}
$quote=cast call $oracle "markPriceWad(address)(uint256,uint64)" $token --rpc-url $rpc
if($LASTEXITCODE -ne 0){throw "V78 quote validation failed. The pool may not yet have enough TWAP observation history."}
Write-Host "V78 first market quote validated: $quote"
