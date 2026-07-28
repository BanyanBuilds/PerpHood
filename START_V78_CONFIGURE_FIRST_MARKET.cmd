@echo off
setlocal
cd /d "%~dp0"
echo Leverage X V78 - Configure First TWAP Market
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\v78-configure-first-market.ps1"
if errorlevel 1 (echo.&echo FAILED - configuration stopped safely.&pause&exit /b 1)
echo.&echo SUCCESS - first TWAP market configured and quoted.&pause
