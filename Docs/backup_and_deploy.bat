@echo off
setlocal

:: Get current date and time for backup folder name
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

:: Create backup directory
if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: Copy Files
:: /XD - Exclude DIRECTORIES (Matches .gitignore + system folders)
:: /XF - Exclude FILES (Matches .gitignore + system files)

xcopy "%SOURCE_DIR%\*" "%BACKUP_DIR%\" /E /I /Y ^
/XD "%SOURCE_DIR%\node_modules" ^
    "%SOURCE_DIR%\.git" ^
    "%SOURCE_DIR%\.cursor" ^
    "%SOURCE_DIR%\Backups" ^
    "%SOURCE_DIR%\__pycache__" ^
    "%SOURCE_DIR%\segmentation\__pycache__" ^
    "%SOURCE_DIR%\raw_photos" ^
    "%SOURCE_DIR%\Renovated Photos" ^
    "%SOURCE_DIR%\Enhanched_Photos" ^
    "%SOURCE_DIR%\floor_plans" ^
/XF "%SOURCE_DIR%\.env" ^
    "%SOURCE_DIR%\.DS_Store" ^
    "%SOURCE_DIR%\*.log" ^
    "%SOURCE_DIR%\segmentation\yolov8n-seg.pt"

echo.
echo [Local Backup Completed at %BACKUP_DIR%]
echo.

echo ========================================================
echo  Step 2: Syncing with GitHub (Cloud Backup & Deploy)
echo ========================================================

:: Ask for commit message
set /p CommitMessage="Enter a description for this update (e.g. 'Updated styles'): "

:: Git Commands
cd "%SOURCE_DIR%"
echo.
echo Staging files...
git add .
echo.
echo Committing changes...
git commit -m "%CommitMessage% [Backup %TIMESTAMP%]"
echo.
echo Pushing to GitHub...
git push origin main

echo.
echo ========================================================
echo  All Done!
echo  1. Local Copy: Saved in Backups folder
echo  2. Cloud Copy: Pushed to GitHub
echo  3. Vercel: Deployment triggered automatically
echo ========================================================
echo.

pause

