@echo off
setlocal
cd /d "%~dp0"
title LEVERAGE X Clean Install

echo.
echo ========================================
echo   LEVERAGE X - Clean npm Install
echo ========================================
echo.

echo Removing old dependency folders...
if exist node_modules rmdir /s /q node_modules
if exist .next rmdir /s /q .next

echo Setting the public npm registry...
call npm config set registry https://registry.npmjs.org/
if errorlevel 1 goto :failed

echo Verifying npm cache...
call npm cache verify
if errorlevel 1 goto :failed

echo.
echo Installing dependencies. Do not press Ctrl+C while this runs...
call npm install --registry=https://registry.npmjs.org/
if errorlevel 1 goto :failed

echo.
echo Installation completed successfully.
echo Now run start-local.bat or npm run dev.
pause
exit /b 0

:failed
echo.
echo Installation failed. Check the npm log shown above.
pause
exit /b 1
