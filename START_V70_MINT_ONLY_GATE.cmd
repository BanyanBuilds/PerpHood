@echo off
setlocal
cd /d "%~dp0"
set "PATH=%PATH%;%USERPROFILE%\.foundry\bin"
set "FOUNDRY_PROFILE=mintpath"
set "LOG=%~dp0V70_MINT_ONLY_GATE_LOG.txt"

echo Leverage X V70 Mint-Only Contract Gate > "%LOG%"
echo Started: %DATE% %TIME% >> "%LOG%"
echo. >> "%LOG%"

where forge >nul 2>&1
if errorlevel 1 (
  echo FAILED: Forge not found. >> "%LOG%"
  echo FAILED - Forge not found.
  goto :done
)

echo [1/2] Compiling isolated launch contract...
forge build --sizes >> "%LOG%" 2>&1
if errorlevel 1 goto :failed

echo [2/2] Running isolated mint-path tests...
forge test -vvv >> "%LOG%" 2>&1
if errorlevel 1 goto :failed

echo. >> "%LOG%"
echo PASS: V70 isolated mint path compiled and tested. >> "%LOG%"
echo PASS - V70 mint path is green.
goto :done

:failed
echo. >> "%LOG%"
echo FAILED: See compiler/test output above. >> "%LOG%"
echo FAILED - V70 found a mint-path blocker.

:done
echo.
echo Log saved to:
echo %LOG%
echo.
pause
endlocal
