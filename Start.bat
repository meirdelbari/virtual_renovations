@echo off
echo Starting Virtual Renovations Local Servers...

REM --- 1. Start YOLO-Seg floor segmentation server (Python) ---
cd /d %~dp0segmentation
call .venv\Scripts\activate
start "Floor Segmentation Service (Python)" cmd /k "uvicorn segmentation_server:app --host 0.0.0.0 --port 5001"

REM --- 2. Start Node backend (Express) ---
cd /d %~dp0backend
start "Renovations Backend (Node)" cmd /k "npm start"

echo Servers launched in separate windows.
echo You can now open index.html in your browser.
pause

