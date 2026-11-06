@echo off
title The Render - local preview
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed to preview the site locally. Get it from https://nodejs.org
  pause
  exit /b 1
)
node tools\serve.mjs 5200 --open
pause
