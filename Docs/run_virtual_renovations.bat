@echo off
setlocal EnableExtensions

set "LOG=%~dp0run_virtual_renovations.log"
REM This script installs deps if needed, starts the backend, and opens http://localhost:4000
echo ============================================================ > "%LOG%"
echo Virtual Renovations Launcher Log - %DATE% %TIME%             >> "%LOG%"
echo Script: %~f0                                                >> "%LOG%"
echo ============================================================ >> "%LOG%"
echo Log file: "%LOG%"

REM Move from Docs folder to project root
cd /d "%~dp0.."
echo CWD: %CD%>> "%LOG%"

echo Starting Virtual Renovations (Local)...
echo.

REM -------------------------------------------------------------------
REM Set environment variables (replace with your real keys or set in OS)
REM Uncomment and edit the lines below, or set them globally in Windows:
REM set "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_your_clerk_publishable_key"
REM set "OPENAI_API_KEY=sk_your_openai_key"
REM set "GOOGLE_GEMINI_API_KEY=AIza_your_gemini_key"
REM
REM Tip: You can also create a ".env" file in the project root and put:
REM   GOOGLE_GEMINI_API_KEY=...
REM   OPENAI_API_KEY=...
REM -------------------------------------------------------------------

REM Basic checks
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not on PATH.
  echo Install from https://nodejs.org/ and try again.
  echo ERROR: node not found on PATH >> "%LOG%"
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found on PATH.
  echo Reinstall Node.js ^(it includes npm^) and try again.
  echo ERROR: npm not found on PATH >> "%LOG%"
  pause
  exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
  echo First time run detected. Installing dependencies...
  call npm install >> "%LOG%" 2>&1
)

REM Start the application (Frontend + Backend API) in a separate window
echo Starting server on http://localhost:4000...
echo Starting server window...>> "%LOG%"
start "Virtual Renovations Server" cmd /k "cd /d "%CD%" && npm start"

REM Wait for server to be reachable, then open browser.
echo Waiting for server to become ready...
set "URL=http://localhost:4000/api/health"
set "APP=http://localhost:4000"

REM Try for ~30 seconds (30 * 1s)
set /a tries=0
:wait_loop
set /a tries+=1
call :http_ok "%URL%"
if %errorlevel%==0 goto ready
if %tries% GEQ 30 goto timeout
timeout /t 1 /nobreak >nul
goto wait_loop

:ready
echo Server is up. Opening %APP% ...
echo Ready. Opening %APP%>> "%LOG%"
call :open_url "%APP%"
echo.
echo IMPORTANT: Use %APP% (not file://index.html) so the /api endpoints work.
echo.
goto done

:timeout
echo.
echo WARNING: Server did not respond at %URL% yet.
echo - Check the "Virtual Renovations Server" window for errors.
echo - If port 4000 is in use, close the other process and re-run.
echo.
echo You can still try opening: %APP%
echo Timeout waiting for %URL%>> "%LOG%"
call :open_url "%APP%"

:done

pause

REM ------------------------------------------------------------
REM Helpers
REM ------------------------------------------------------------

:open_url
set "TARGET=%~1"
echo Opening in browser: %TARGET%
echo open_url %TARGET%>> "%LOG%"
REM Open exactly once (avoid multiple tabs)
set "CHROME_64=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "CHROME_32=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if exist "%CHROME_64%" (
  start "" "%CHROME_64%" "%TARGET%" 1>nul 2>nul
) else if exist "%CHROME_32%" (
  start "" "%CHROME_32%" "%TARGET%" 1>nul 2>nul
) else (
  rundll32.exe url.dll,FileProtocolHandler "%TARGET%" 1>nul 2>nul
)
exit /b 0

:http_ok
set "CHECK_URL=%~1"
echo http_ok %CHECK_URL%>> "%LOG%"
REM Try pwsh first (PowerShell 7), then fall back to Windows PowerShell (powershell.exe)
where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%CHECK_URL%').StatusCode | Out-Null; exit 0 } catch { exit 1 }" 1>nul 2>nul
  exit /b %errorlevel%
)
where powershell >nul 2>nul
if %errorlevel%==0 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%CHECK_URL%').StatusCode | Out-Null; exit 0 } catch { exit 1 }" 1>nul 2>nul
  exit /b %errorlevel%
)
REM If neither PowerShell exists, consider it not ready.
exit /b 1
