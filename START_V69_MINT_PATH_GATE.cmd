@echo off
setlocal
cd /d "%~dp0"
set "PATH=%PATH%;%USERPROFILE%\.foundry\bin"
set "LOG=%~dp0V69_MINT_PATH_GATE_LOG.txt"

echo Leverage X V69 Mint Path Gate > "%LOG%"
echo Started: %DATE% %TIME% >> "%LOG%"
echo. >> "%LOG%"

echo [1/4] TypeScript validation...
call npm run typecheck >> "%LOG%" 2>&1
if errorlevel 1 goto :failed

echo [2/4] Production build...
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 goto :failed

echo [3/4] Focused Solidity build...
set FOUNDRY_PROFILE=mintpath
forge build --sizes >> "%LOG%" 2>&1
if errorlevel 1 goto :failed

echo [4/4] Focused mint-path tests...
forge test -vvv >> "%LOG%" 2>&1
if errorlevel 1 goto :failed

echo. >> "%LOG%"
echo PASS: V69 mint path gate completed. >> "%LOG%"
echo PASS - V69 mint path gate completed.
echo Log: %LOG%
goto :done

:failed
echo. >> "%LOG%"
echo FAILED: See the last error above. >> "%LOG%"
echo FAILED - send V69_MINT_PATH_GATE_LOG.txt back to ChatGPT.
echo Log: %LOG%

:done
echo.
pause
endlocal
