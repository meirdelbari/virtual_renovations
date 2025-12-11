@echo off
REM ------------------------------------------------------------
REM Run Virtual Renovations (Local Development)
REM ------------------------------------------------------------

REM Move from Docs folder to project root
cd /d "%~dp0.."

echo Starting Virtual Renovations...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
  echo First time run detected. Installing dependencies...
  call npm install
)

REM Start the application (Frontend + Backend API)
echo Starting server on http://localhost:4000...
call npm start

pause
