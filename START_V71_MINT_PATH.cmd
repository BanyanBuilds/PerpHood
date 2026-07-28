@echo off
setlocal
cd /d "%~dp0"
set "PATH=%PATH%;%USERPROFILE%\.foundry\bin"
set "FOUNDRY_PROFILE=mintpath"

echo.
echo ===============================================
echo   LEVERAGE X V71 - MINT PATH
 echo ===============================================
echo.
where forge >nul 2>&1
if errorlevel 1 (
  echo Forge is not available on PATH.
  echo Expected location: %USERPROFILE%\.foundry\bin
  echo.
  pause
  exit /b 1
)

echo Compiling the isolated token launcher...
forge build --sizes
if errorlevel 1 (
  echo.
  echo V71 compile did not pass. The full error is shown above.
  echo.
  pause
  exit /b 1
)

echo.
echo Running the isolated mint-path tests...
forge test -vvv
if errorlevel 1 (
  echo.
  echo V71 tests did not pass. The full error is shown above.
  echo.
  pause
  exit /b 1
)

echo.
echo ===============================================
echo   V71 MINT PATH PASSED
 echo ===============================================
echo.
echo No wallet or transaction was used.
pause
endlocal
