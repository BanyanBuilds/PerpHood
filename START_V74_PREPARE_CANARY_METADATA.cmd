@echo off
cd /d "%~dp0"
title Leverage X V74 - Prepare Canary Metadata
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\v74-prepare-canary-metadata.ps1"
echo.
pause
