@echo off
cd /d "%~dp0"
title Leverage X V74 - Verify Canary Launch
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\v74-verify-canary-launch.ps1"
echo.
pause
