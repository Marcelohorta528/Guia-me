@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% equ 0 (
  echo API em http://localhost:3333 (Ctrl+C para parar)
  node server\index.mjs
  exit /b %errorlevel%
)

if exist "%ProgramFiles%\nodejs\node.exe" (
  echo Usando: %ProgramFiles%\nodejs\node.exe
  echo API em http://localhost:3333 (Ctrl+C para parar)
  "%ProgramFiles%\nodejs\node.exe" server\index.mjs
  exit /b %errorlevel%
)

if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
  echo Usando: %ProgramFiles(x86)%\nodejs\node.exe
  echo API em http://localhost:3333 (Ctrl+C para parar)
  "%ProgramFiles(x86)%\nodejs\node.exe" server\index.mjs
  exit /b %errorlevel%
)

echo Node.js nao encontrado. Instale Node 18+ de https://nodejs.org
pause
exit /b 1
