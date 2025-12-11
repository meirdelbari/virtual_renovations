@echo off
REM ------------------------------------------------------------
REM Run Virtual Renovations (Local Development)
REM ------------------------------------------------------------

REM Move from Docs folder to project root
cd /d "%~dp0.."

echo Starting Virtual Renovations...
echo.

REM -------------------------------------------------------------------
REM Set environment variables (replace with your real keys or set in OS)
REM Uncomment and edit the lines below, or set them globally in Windows:
REM set "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_your_clerk_publishable_key"
REM set "OPENAI_API_KEY=sk_your_openai_key"
REM set "GOOGLE_GEMINI_API_KEY=AIza_your_gemini_key"
REM -------------------------------------------------------------------

REM Check if node_modules exists
if not exist "node_modules" (
  echo First time run detected. Installing dependencies...
  call npm install
)

REM Start the application (Frontend + Backend API)
echo Starting server on http://localhost:4000...
call npm start

pause
