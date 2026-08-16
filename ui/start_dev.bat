@echo off
title F446 Motor PID - Dev Launcher
echo ============================================
echo   F446 Motor PID Control - Dev Launcher
echo ============================================
echo.
echo [1/2] Starting Bridge (motor simulator)...
start "F446 Bridge" cmd /k "cd /d %~dp0bridge && node server.js --mode sim"
timeout /t 1 /nobreak >nul
echo [2/2] Starting Frontend (Vite dev server)...
start "F446 Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 127.0.0.1 --port 5173"
echo.
echo Two windows should now open:
echo   [F446 Bridge]    ws://localhost:8080
echo   [F446 Frontend]  http://127.0.0.1:5173
echo.
echo To stop: close the windows, or run stop_dev.bat
echo.
pause
