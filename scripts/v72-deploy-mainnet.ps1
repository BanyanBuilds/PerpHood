$ErrorActionPreference = "Stop"
$project = Split-Path -Parent $PSScriptRoot
Set-Location $project
$env:FOUNDRY_PROFILE = "mintpath"
if (-not $env:RH_RPC_URL) { $env:RH_RPC_URL = "https://rpc.mainnet.chain.robinhood.com" }
if (-not $env:LEVERAGEX_OWNER) { throw "LEVERAGEX_OWNER is required." }
if (-not $env:DEPLOYER_PRIVATE_KEY) { throw "DEPLOYER_PRIVATE_KEY is required in this PowerShell process only." }

forge script contracts/script/DeployLeverageXMintPathV72.s.sol:DeployLeverageXMintPathV72 `
  --rpc-url $env:RH_RPC_URL `
  --broadcast `
  --slow `
  -vvvv
