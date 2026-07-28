$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Leverage X V66 - Mainnet Execution Gate" -ForegroundColor Cyan
Write-Host "This script never deploys or signs a transaction." -ForegroundColor Yellow

node --version
npm --version

if (-not (Test-Path ".env.mainnet.local")) {
  Write-Host "Missing .env.mainnet.local" -ForegroundColor Yellow
  Write-Host "Copy .env.mainnet.example to .env.mainnet.local and add only your private RPC plus local keystore settings."
}

if (-not (Get-Command forge -ErrorAction SilentlyContinue)) {
  Write-Host "Foundry Forge is missing. On Windows, install Foundry through Git Bash or WSL, then reopen this terminal." -ForegroundColor Yellow
}
if (-not (Get-Command cast -ErrorAction SilentlyContinue)) {
  Write-Host "Foundry Cast is missing. It is installed with Foundry." -ForegroundColor Yellow
}

Write-Host "Installing exact Node dependencies..." -ForegroundColor Cyan
npm ci

Write-Host "Running the strict zero-transaction gate..." -ForegroundColor Cyan
npm run gate:v66:strict
