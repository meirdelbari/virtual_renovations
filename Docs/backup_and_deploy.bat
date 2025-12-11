@echo off
setlocal EnableDelayedExpansion

:: Get current date and time
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set "TIMESTAMP=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%_%datetime:~8,2%-%datetime:~10,2%"

:: Define source and destination
set "SOURCE_DIR=%~dp0.."
set "BACKUP_ROOT=%SOURCE_DIR%\Backups"
set "BACKUP_DIR=%BACKUP_ROOT%\Backup_%TIMESTAMP%"

echo ========================================================
echo  Step 1: Creating Local Backup (Filesystem)
echo  Date: %TIMESTAMP%
echo ========================================================

if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: Use Robocopy with strict exclusions to prevent loops
:: /XD node_modules Backups -> Excludes ANY folder with these names
:: /XF .env -> Excludes sensitive files

robocopy "%SOURCE_DIR%" "%BACKUP_DIR%" /E ^
    /XD node_modules .git .cursor Backups __pycache__ raw_photos "Renovated Photos" Enhanched_Photos floor_plans ^
    /XF .env .DS_Store *.log "segmentation\yolov8n-seg.pt" ^
    /R:0 /W:0

:: Check exit code (anything < 8 is success)
if %errorlevel% gtr 7 (
    echo [ERROR] Local backup failed with code %errorlevel%!
    pause
    exit /b %errorlevel%
)

echo.
echo [Local Backup Completed at %BACKUP_DIR%]
echo.

echo ========================================================
echo  Step 2: Syncing with GitHub (Cloud Backup & Deploy)
echo ========================================================

:: Check git
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed or not in PATH.
    pause
    exit /b 1
)

:: Ask for commit message
set /p CommitMessage="Enter a description for this update (e.g. 'Updated styles'): "

:: Git Commands
cd /d "%SOURCE_DIR%"
echo.
echo [DEBUG] Current Directory: %CD%
echo.

echo Staging files...
git add .
if %errorlevel% neq 0 (
    echo [ERROR] Git Add failed.
    pause
    exit /b %errorlevel%
)

echo.
echo Committing changes...
git commit -m "%CommitMessage% [Backup %TIMESTAMP%]"
if %errorlevel% neq 0 (
    echo [INFO] Git Commit returned code %errorlevel%. (Maybe nothing to commit?)
)

echo.
echo Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Git Push failed!
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo  All Done!
echo ========================================================
echo.

pause
