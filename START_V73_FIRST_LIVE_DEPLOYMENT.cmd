@echo off
setlocal
cd /d "%~dp0"
title Leverage X V73 - First Live Deployment
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\v73-first-live-deployment.ps1"
echo.
if errorlevel 1 (
  echo V73 deployment stopped before completion.
) else (
  echo V73 deployment finished successfully.
)
echo.
pause
