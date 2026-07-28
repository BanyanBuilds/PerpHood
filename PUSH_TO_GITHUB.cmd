@echo off
setlocal
cd /d "%~dp0"
echo Running V89 tests...
call npm run test:v89
if errorlevel 1 exit /b 1
git add .
git commit -m "V89 immediate perps at mint"
git push
endlocal
