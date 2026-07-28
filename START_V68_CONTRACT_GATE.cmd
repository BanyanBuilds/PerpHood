@echo off
setlocal
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.foundry\bin;%PATH%"

echo ============================================================
echo  Leverage X V68 - Solidity Contract Gate
echo ============================================================
echo.

where node >nul 2>nul || (echo BLOCKED: Node.js was not found.& goto :failed)
where npm >nul 2>nul || (echo BLOCKED: npm was not found.& goto :failed)
where forge >nul 2>nul || (echo BLOCKED: Forge was not found at %USERPROFILE%\.foundry\bin.& goto :failed)

echo [1/4] Installing exact Node dependencies...
call npm ci || goto :failed

echo.
echo [2/4] Running TypeScript typecheck...
call npm run typecheck || goto :failed

echo.
echo [3/4] Building the production website...
call npm run build || goto :failed

echo.
echo [4/4] Compiling and testing the V65 launch contracts...
call npm run gate:v68:contracts || goto :failed

echo.
echo ============================================================
echo  PASS: V68 local contract gate completed successfully.
echo  No wallet key was requested. No transaction was broadcast.
echo ============================================================
pause
exit /b 0

:failed
echo.
echo ============================================================
echo  STOPPED: A gate failed. Take a screenshot of this window
 echo  and send it to ChatGPT. No transaction was broadcast.
echo ============================================================
pause
exit /b 1
