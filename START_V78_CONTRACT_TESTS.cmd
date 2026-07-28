@echo off
setlocal
cd /d "%~dp0"
echo Leverage X V78 - TWAP Oracle Tests
node --experimental-strip-types scripts\v78-twap-oracle-static-smoke.mts
if errorlevel 1 goto fail
set FOUNDRY_PROFILE=twaporacle
forge build --sizes
if errorlevel 1 goto fail
forge test -vvv
if errorlevel 1 goto fail
echo.
echo SUCCESS - V78 TWAP oracle passed static, compile, and contract tests.
pause
exit /b 0
:fail
echo.
echo FAILED - V78 stopped safely before deployment.
pause
exit /b 1
