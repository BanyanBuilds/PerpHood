@echo off
setlocal
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.foundry\bin;%PATH%"

echo.
echo ==============================================
echo  Leverage X V67 - Contract Compile Test
 echo ==============================================
echo.

where node >nul 2>nul || (
  echo ERROR: Node.js is not available.
  goto :fail
)
where npm >nul 2>nul || (
  echo ERROR: npm is not available.
  goto :fail
)
where forge >nul 2>nul || (
  echo ERROR: Foundry Forge was not found at %%USERPROFILE%%\.foundry\bin.
  goto :fail
)

if not exist node_modules (
  echo Installing project dependencies...
  call npm ci
  if errorlevel 1 goto :fail
)

echo Running TypeScript validation...
call npm run typecheck
if errorlevel 1 goto :fail

echo Running V65 smart-contract compile and tests...
call npm run chain:test:v65
if errorlevel 1 goto :fail

echo.
echo SUCCESS: The V67 TypeScript and V65 contract test gates passed.
echo No transaction was signed or broadcast.
goto :done

:fail
echo.
echo FAILED: Copy the complete error output and send it in the Leverage X 5 chat.
echo No transaction was signed or broadcast.

:done
echo.
pause
endlocal
