@echo off
setlocal
cd /d "%~dp0"
title Leverage X V73 - First Canary Launch
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\v73-first-canary-launch.ps1"
echo.
if errorlevel 1 (
  echo V73 canary launch stopped before completion.
) else (
  echo V73 canary launch finished successfully.
)
echo.
pause
