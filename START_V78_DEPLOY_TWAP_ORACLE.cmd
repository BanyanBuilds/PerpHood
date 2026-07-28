@echo off
setlocal
cd /d "%~dp0"
echo Leverage X V78 - Deploy Uniswap V3 TWAP Oracle
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\v78-deploy-twap-oracle.ps1"
if errorlevel 1 (echo.&echo FAILED - deployment stopped safely.&pause&exit /b 1)
echo.&echo SUCCESS - deployment broadcast completed.&pause
