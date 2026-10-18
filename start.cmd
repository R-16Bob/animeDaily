@echo off
setlocal
cd /d "%~dp0"
title AnimeDaily

where node >nul 2>nul
if errorlevel 1 goto no_node

if exist "web\dist\index.html" goto run

call :build
if errorlevel 1 goto build_fail

:run
node scripts\msg.mjs starting
node scripts\msg.mjs help_phone
echo.
start "" "http://127.0.0.1:8787"
node server\index.mjs
pause
exit /b 0

:build
node scripts\msg.mjs build_start
pushd web
if not exist "node_modules" call :install
call npm run build
set BUILD_RESULT=%errorlevel%
popd
exit /b %BUILD_RESULT%

:install
node scripts\msg.mjs install_start
call npm install
exit /b 0

:no_node
echo.
echo   [X] Node.js not found.
echo       Please install Node.js 20 or newer: https://nodejs.org
echo.
pause
exit /b 1

:build_fail
node scripts\msg.mjs build_fail
pause
exit /b 1
