@echo off
setlocal
cd /d "%~dp0"
title Leverage X V76 - Deploy Perps Registry
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\v76-deploy-perps-registry.ps1"
if errorlevel 1 (
  echo.
  echo V76 registry deployment stopped safely.
  pause
  exit /b 1
)
echo.
echo V76 registry deployment complete.
pause
