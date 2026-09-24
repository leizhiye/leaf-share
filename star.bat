@echo off
chcp 65001 >nul
cd /d "%~dp0"
title LAN Transfer Tool

where node >nul 2>nul
if errorlevel 1 goto :no_node

if not exist "node_modules" (
  echo Installing dependencies, please wait...
  call npm install
  if errorlevel 1 goto :install_failed
)

set "LANG=zh"
if exist "lang.txt" set /p LANG=<"lang.txt"

echo.
echo ==========================================
echo      LAN Transfer - Select Language
echo ==========================================
echo    [1] Chinese
echo    [2] English
echo.
set /p "c=   Current: %LANG% - Enter 1/2, or press Enter to keep: "

if "%c%"=="1" set "LANG=zh"
if "%c%"=="2" set "LANG=en"

echo %LANG%> "lang.txt"

echo.
echo Starting LAN Transfer Tool...
start "" "http://localhost:3000/?lang=%LANG%"
node server.js

echo.
echo Server stopped.
pause
exit /b 0

:no_node
echo [ERROR] Node.js was not found. Please install Node.js first.
echo Download: https://nodejs.org/
pause
exit /b 1

:install_failed
echo [ERROR] Failed to install dependencies.
pause
exit /b 1