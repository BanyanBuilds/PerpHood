@echo off
setlocal
cd /d "%~dp0"
echo Leverage X V79 - Deploy Solvency Engine
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\v79-deploy-solvency-engine.ps1
if errorlevel 1 goto fail
echo.
echo SUCCESS - V79 deployment command completed.
pause
exit /b 0
:fail
echo.
echo FAILED - no unsafe follow-up action was attempted.
pause
exit /b 1
