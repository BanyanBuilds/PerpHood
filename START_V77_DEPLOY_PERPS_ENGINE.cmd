@echo off
setlocal
cd /d "%~dp0"
echo Leverage X V77 - Deploy Collateral and Position Engine
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\v77-deploy-perps-engine.ps1"
if errorlevel 1 (
  echo.
  echo FAILED - V77 deployment stopped safely.
  pause
  exit /b 1
)
echo.
echo SUCCESS - V77 deployment broadcast completed.
pause
