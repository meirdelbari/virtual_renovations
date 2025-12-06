@echo off
REM ------------------------------------------------------------
REM Run Virtual Renovations (segmentation + backend + frontend)
REM ------------------------------------------------------------

REM Move from Docs folder to project root
cd /d "%~dp0.."

REM Optionally echo where we are
echo Running Virtual Renovations from:
echo   %cd%
echo.

REM Make sure Start.bat exists
if not exist Start.bat (
  echo ERROR: Could not find Start.bat in:
  echo   %cd%
  echo Make sure you run this script from the Virtual Renovations project.
  pause
  exit /b 1
)

REM Start Python segmentation + Node backend in separate windows
call Start.bat

REM Open the frontend in your default browser
echo.
echo Opening index.html in your default browser...
start "" "%cd%\index.html"

echo.
echo All services have been started (in separate windows).
echo If you didn't enable auto-open above, open index.html in your browser.
pause


