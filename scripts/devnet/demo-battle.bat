@echo off
if "%~1"=="" (
  echo Usage: demo-battle.bat 0xDEPLOYED_BATTLE_POOL_ADDRESS
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0demo-battle.ps1" -BattlePool "%~1"
