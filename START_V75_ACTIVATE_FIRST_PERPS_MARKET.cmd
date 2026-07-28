@echo off
setlocal
cd /d "%~dp0"
title Leverage X V75 - Activate First Perps Market
where cast >nul 2>nul
if errorlevel 1 (
  echo Foundry cast is required but was not found.
  echo Install Foundry once, then run this file again.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\v75-activate-first-perps-market.ps1"
if errorlevel 1 (
  echo.
  echo V75 did not activate the market. No unsafe override was applied.
  pause
  exit /b 1
)
echo.
echo V75 FIRST PERPS MARKET IS ENGINE-READY.
pause
