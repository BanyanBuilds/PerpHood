@echo off
setlocal
cd /d "%~dp0"
set "PATH=%PATH%;%USERPROFILE%\.foundry\bin"
echo.
echo ===============================================
echo   LEVERAGE X V72 - READ-ONLY MAINNET PREFLIGHT
echo ===============================================
echo.
where cast >nul 2>&1
if errorlevel 1 (
  echo Foundry cast was not found.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\v72-robinhood-preflight.ps1"
if errorlevel 1 (
  echo.
  echo V72 preflight failed. No transaction was sent.
  pause
  exit /b 1
)
echo.
echo V72 MAINNET PREFLIGHT PASSED.
echo No wallet or transaction was used.
pause
endlocal
