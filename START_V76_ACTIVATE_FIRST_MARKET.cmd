@echo off
setlocal
cd /d "%~dp0"
title Leverage X V76 - Activate First Market
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\v76-activate-first-market.ps1"
if errorlevel 1 (
  echo.
  echo V76 market activation stopped safely.
  pause
  exit /b 1
)
echo.
echo V76 first market activation complete.
pause
