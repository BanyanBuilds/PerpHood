@echo off
setlocal
cd /d "%~dp0"
echo Leverage X V79 - Solvency Engine Tests
node --experimental-strip-types scripts\v79-solvency-engine-static-smoke.mts
if errorlevel 1 goto fail
set FOUNDRY_PROFILE=solvencyengine
forge build --sizes
if errorlevel 1 goto fail
forge test -vvv
if errorlevel 1 goto fail
echo.
echo SUCCESS - V79 passed static, compile, and contract tests.
pause
exit /b 0
:fail
echo.
echo FAILED - V79 stopped safely before deployment.
pause
exit /b 1
