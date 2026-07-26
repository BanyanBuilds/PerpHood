@echo off
setlocal
cd /d "%~dp0"
title PERPHOOD Local App

echo.
echo ========================================
echo   PERPHOOD - Local Development
echo ========================================
echo.

echo Node version:
node -v
if errorlevel 1 goto :node_missing

echo npm version:
npm -v
if errorlevel 1 goto :node_missing

echo.
if not exist node_modules\next\package.json (
  echo Installing dependencies from the public npm registry...
  echo This can take several minutes on the first run. Do not close this window.
  call npm install --registry=https://registry.npmjs.org/
  if errorlevel 1 goto :install_failed
)

echo.
echo Starting PERPHOOD at http://localhost:3000
echo Press Ctrl+C to stop the app.
start "" http://localhost:3000
call npm run dev
goto :end

:node_missing
echo.
echo Node.js or npm was not found. Install the current Node.js LTS release,
echo reopen Command Prompt, and run this file again.
goto :failed

:install_failed
echo.
echo Dependency installation failed.
echo Run install-clean.bat, then try start-local.bat again.
goto :failed

:failed
echo.
pause
exit /b 1

:end
endlocal
