@echo off
:: ========== Anti-Crash Guard Shell ==========
if /i not "%~1"=="--guarded" (
    start "DragonBoat Launcher" cmd /k ""%~f0" --guarded"
    exit /b 0
)
:: ========== End Guard ==========

setlocal enabledelayedexpansion
title DragonBoat Festival - Launcher

echo.
echo   ========================================
echo     Dragon Boat Festival - Game Launcher
echo   ========================================
echo.

set "SCRIPT_DIR=%~dp0"
set "PORT=8331"

:: 1. Clean port
echo [1/3] Checking port %PORT% ...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo   Port in use ^(PID: %%a^), killing...
    taskkill /F /PID %%a >nul 2>&1
)
echo   Port ready
echo.

:: 2. Check python
echo [2/3] Checking Python ...
where python >nul 2>&1
if errorlevel 1 (
    echo   ERROR: Python not found in PATH.
    echo   Install Python, or just open index.html in a browser instead.
    goto :hold
)
echo   Python found
echo.

:: 3. Start static server + open browser
echo [3/3] Starting server on http://localhost:%PORT% ...
cd /d "%SCRIPT_DIR%"
if errorlevel 1 (
    echo   ERROR: cannot cd into game folder.
    goto :hold
)
start "DragonBoat Server" cmd /k "python -m http.server %PORT%"
timeout /t 2 /nobreak >nul

echo   Opening browser...
start "" "http://localhost:%PORT%/index.html"
echo.
echo   ========================================
echo     Running! Game: http://localhost:%PORT%/index.html
echo     Close the "DragonBoat Server" window or run stop.bat to quit.
echo   ========================================
echo.

:hold
echo.
echo Press any key to close this launcher window...
pause >nul
endlocal
