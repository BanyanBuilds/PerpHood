@echo off
setlocal
cd /d "%~dp0"
echo Leverage X V77 - Collateral and Position Engine Tests
forge test --profile perpsengine -vv
if errorlevel 1 (
  echo.
  echo FAILED - V77 contract tests found a blocker.
  pause
  exit /b 1
)
echo.
echo SUCCESS - V77 contract tests passed.
pause
