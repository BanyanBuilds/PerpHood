@echo off
where anvil >nul 2>nul
if errorlevel 1 (
  echo Foundry Anvil is not installed or not in PATH.
  echo Install Foundry, reopen the terminal, then run this file again.
  exit /b 1
)
echo Starting PERPHOOD local chain on http://127.0.0.1:8545 ...
echo Keep this window open.
anvil --chain-id 31337 --host 127.0.0.1
