@echo off
title F446 Motor PID - Dev Stopper
echo Stopping F446 dev services (by window title)...
taskkill /FI "WINDOWTITLE eq F446 Bridge*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq F446 Frontend*" /F >nul 2>&1
echo Done. If any window remains, close it manually.
pause
