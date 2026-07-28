@echo off
setlocal
cd /d "%~dp0"
title Leverage X V80 - Vercel Secret Setup
where vercel >nul 2>nul || (echo Installing Vercel CLI... & call npm install -g vercel || goto :fail)
call vercel link || goto :fail
echo.
echo Add each value through a hidden Vercel prompt. Nothing is written to this project.
call vercel env add RH_RPC_URL production || goto :fail
call vercel env add LEVERAGEX_OWNER production || goto :fail
call vercel env add LEVERAGEX_DEPLOYER_PRIVATE_KEY production --sensitive || goto :fail
call vercel env add LEVERAGEX_DEPLOY_ADMIN_TOKEN production --sensitive || goto :fail
echo.
echo Secrets configured. Push V80, wait for Vercel, then open /admin/deploy-launch-contracts
pause
exit /b 0
:fail
echo.
echo Setup stopped. No secret was committed.
pause
exit /b 1
